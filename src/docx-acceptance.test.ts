import { describe, expect, it } from "vitest";
import {
  CHEFS,
  DISHES,
  GIFT_CONFIG,
  PILL_REWARDS,
  RESTAURANTS,
  createInitialState,
  deserializeState,
  dispatch,
  getCookableDishes,
  serializeState,
  tick,
} from "./game-engine";
import type { GameState, Guest } from "./game-engine";

/**
 * Executable acceptance checks for the T01-T14 cases in the supplied brief.
 *
 * These tests intentionally exercise the public pure-state API.  They do not
 * depend on React or wall-clock timers, so every check can be reproduced with
 * `npm test` on a clean checkout.
 */

function waitingGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "manual-guest",
    kind: "student",
    name: "测试客人",
    tier: 1,
    status: "waiting",
    patience: 30,
    patienceRemaining: 30,
    preferredTiers: [1],
    premium: 1,
    dropIndex: 0,
    materialDropRate: 0,
    badgeDropRate: 0,
    ...overrides,
  };
}

function readyFirstOrder(input = createInitialState({ rng: () => 0 })) {
  let state = tick(input);
  state = tick(state, 7);
  expect(state.runtime.readyOrders).toHaveLength(1);
  return state;
}

function levelThreeServiceState(): GameState {
  const state = createInitialState({ rng: () => 0.4 });
  state.progress.restaurantLevel = 3;
  state.progress.chefLevel = 3;
  state.progress.activeDishIds = DISHES.map((item) => item.id);
  state.progress.publishedDishIds = DISHES.map((item) => item.id);
  // The runtime starts at level 1; extend the fixed node-backed collections so
  // the level-3 gift capacity is represented in this isolated test fixture.
  state.runtime.seats.push(
    { id: "seat-4", status: "empty" },
    { id: "seat-5", status: "empty" },
  );
  state.runtime.stoves.push(
    { id: "stove-2", status: "idle", remaining: 0 },
    { id: "stove-3", status: "idle", remaining: 0 },
  );
  return state;
}

describe("《百味饭馆》文档验收 T01-T14", () => {
  it("T01 到店、入队，以及队列满时流失", () => {
    let state = createInitialState({ rng: () => 0 });
    state = tick(state);
    expect(state.stats.logs.some((log) => log.kind === "arrival")).toBe(true);
    expect(state.runtime.guests).toHaveLength(1);

    const full = createInitialState({ rng: () => 0 });
    full.runtime.seats.forEach((seat) => { seat.status = "occupied"; });
    for (let index = 0; index < RESTAURANTS[0].queue; index += 1) {
      const guest = waitingGuest({ id: `queued-${index}` });
      full.runtime.queue.push(guest);
      full.runtime.guests.push(guest);
    }
    const after = tick(full);
    expect(after.runtime.queue).toHaveLength(RESTAURANTS[0].queue);
    expect(after.stats.logs.some((log) => log.kind === "capacity")).toBe(true);
  });

  it("T02 入座客人只选择已上架且厨师可做的菜，并占用灶台", () => {
    let state = createInitialState({ rng: () => 0 });
    state.progress.activeDishIds.push("D0104");
    // D0104 is researched but intentionally left unpublished.
    state.runtime.nextGuestIn = 999;
    const guest = waitingGuest({ id: "queued-dish" });
    state.runtime.queue.push(guest);
    state.runtime.guests.push(guest);

    state = tick(state);
    const order = state.runtime.orders[0];
    expect(order).toBeDefined();
    expect(state.progress.publishedDishIds).toContain(order.dishId);
    expect(state.progress.activeDishIds).toContain(order.dishId);
    expect(order.dishId).not.toBe("D0104");
    expect(order.status).toBe("cooking");
    expect(state.runtime.stoves.some((stove) => stove.orderId === order.id)).toBe(true);
  });

  it("T03 支持手动出餐和‘出餐’指令，并在用餐后结账", () => {
    let state = readyFirstOrder();
    const orderId = state.runtime.readyOrders[0].id;
    state = dispatch(state, "出餐");
    expect(state.runtime.readyOrders).toHaveLength(0);
    expect(state.runtime.orders.find((order) => order.id === orderId)?.status).toBe("served");

    state = tick(state);
    expect(state.stats.todayGuests).toBe(1);
    expect(state.stats.todayRevenue).toBeGreaterThan(0);
    expect(state.resources.cash).toBeGreaterThan(0);
    expect(state.stats.logs.some((log) => log.kind === "checkout")).toBe(true);
  });

  it("T04 待出餐超时离开且不产生收入或掉落", () => {
    let state = readyFirstOrder();
    state = tick(state, 10);
    expect(state.runtime.readyOrders).toHaveLength(0);
    expect(state.stats.todayRevenue).toBe(0);
    expect(state.stats.todayGuests).toBe(0);
    expect(state.resources.cash).toBe(0);
    expect(state.stats.logs.some((log) => log.kind === "leave")).toBe(true);
  });

  it("T05 排队客人的耐心耗尽后离开且不占用座位", () => {
    let state = createInitialState({ rng: () => 0 });
    state.runtime.nextGuestIn = 999;
    state.runtime.seats.forEach((seat) => { seat.status = "occupied"; });
    const guest = waitingGuest({ id: "impatient", patience: 1, patienceRemaining: 1 });
    state.runtime.queue.push(guest);
    state.runtime.guests.push(guest);

    state = tick(state);
    expect(state.runtime.queue).toHaveLength(0);
    expect(state.runtime.seats.every((seat) => !seat.guestId)).toBe(true);
    expect(state.runtime.guests).toHaveLength(0);
    expect(state.stats.logs.some((log) => log.kind === "leave")).toBe(true);
  });

  it("T06 研发扣除成本；研发菜未上架，满槽位时必须先下架", () => {
    let insufficient = createInitialState();
    insufficient = dispatch(insufficient, { type: "RESEARCH_DISH", dishId: "D0104" });
    expect(insufficient.progress.activeDishIds).not.toContain("D0104");

    let state = createInitialState({
      resources: { cash: 1000, red: 10, green: 10, blue: 10, badges: 2 },
    });
    state = dispatch(state, "饭馆升级");
    state = dispatch(state, { type: "RESEARCH_DISH", dishId: "D0201" });
    state = dispatch(state, { type: "RESEARCH_DISH", dishId: "D0202" });
    state = dispatch(state, { type: "RESEARCH_DISH", dishId: "D0203" });
    expect(state.progress.activeDishIds).toEqual(expect.arrayContaining(["D0201", "D0202", "D0203"]));

    state = dispatch(state, { type: "PUBLISH_DISH", dishId: "D0201" });
    state = dispatch(state, { type: "PUBLISH_DISH", dishId: "D0202" });
    expect(state.progress.publishedDishIds).toHaveLength(RESTAURANTS[1].dishSlots);
    const before = [...state.progress.publishedDishIds];
    state = dispatch(state, { type: "PUBLISH_DISH", dishId: "D0203" });
    expect(state.progress.publishedDishIds).toEqual(before);

    state = dispatch(state, { type: "UNPUBLISH_DISH", dishId: "D0101" });
    state = dispatch(state, { type: "PUBLISH_DISH", dishId: "D0203" });
    expect(state.progress.publishedDishIds).toContain("D0203");
  });

  it("T07 饭馆升级同步改变座位、队列、灶台、菜槽和客流，并解锁对应等级研发", () => {
    let state = createInitialState({
      resources: { cash: 2200, red: 10, green: 10, blue: 10, badges: 8 },
    });
    state = dispatch(state, "饭馆升级");
    state = dispatch(state, "饭馆升级");
    expect(state.progress.restaurantLevel).toBe(3);
    expect(state.runtime.seats).toHaveLength(RESTAURANTS[2].seats);
    expect(state.runtime.stoves).toHaveLength(RESTAURANTS[2].stoves);
    expect(RESTAURANTS[2].queue).toBe(8);
    expect(RESTAURANTS[2].dishSlots).toBe(7);
    expect(state.runtime.nextGuestIn).toBe(Math.round(60 / RESTAURANTS[2].guestsPerMinute));

    state = dispatch(state, { type: "RESEARCH_DISH", dishId: "D0301" });
    expect(state.progress.activeDishIds).toContain("D0301");
  });

  it("T08 厨师升级提高烹饪速度，并在升级前锁住更高阶菜品", () => {
    let state = createInitialState({
      resources: { cash: 680, red: 3, green: 1, blue: 0, badges: 2 },
    });
    state = dispatch(state, "饭馆升级");
    state = dispatch(state, { type: "RESEARCH_DISH", dishId: "D0201" });
    state = dispatch(state, { type: "PUBLISH_DISH", dishId: "D0201" });
    expect(getCookableDishes(state).some((item) => item.id === "D0201")).toBe(false);

    state = dispatch(state, "厨师升级");
    expect(state.progress.chefLevel).toBe(2);
    expect(getCookableDishes(state).some((item) => item.id === "D0201")).toBe(true);

    state.runtime.nextGuestIn = 999;
    const guest = waitingGuest({ id: "tier-two", kind: "office", tier: 2, preferredTiers: [2] });
    state.runtime.queue.push(guest);
    state.runtime.guests.push(guest);
    state = tick(state);
    expect(state.runtime.orders[0].dishId).toBe("D0201");
    expect(state.runtime.orders[0].remaining).toBeCloseTo(DISHES.find((item) => item.id === "D0201")!.cookSeconds - CHEFS[1].speed);
  });

  it("T09 仙女棒只作用于烹饪订单，单订单最多4次且不低于20%", () => {
    let empty = createInitialState({ rng: () => 0 });
    empty = dispatch(empty, "仙女棒");
    expect(empty.runtime.orders).toHaveLength(0);
    expect(empty.stats.logs.some((log) => log.kind === "invalid")).toBe(true);

    let state = tick(createInitialState({ rng: () => 0 }));
    const orderId = state.runtime.stoves[0].orderId!;
    const baseSeconds = state.runtime.orders.find((order) => order.id === orderId)!.baseSeconds;
    for (let index = 0; index < 5; index += 1) state = dispatch(state, "仙女棒");
    const order = state.runtime.orders.find((item) => item.id === orderId)!;
    expect(order.wandUses).toBe(GIFT_CONFIG.redWand.maxUses);
    expect(order.remaining).toBeGreaterThanOrEqual(baseSeconds * GIFT_CONFIG.redWand.minRemainingRatio);
  });

  it("T10 能量药丸按配置发奖，十抽保底，且无可激活新菜时转食材", () => {
    expect(PILL_REWARDS.map((reward) => reward.probability).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);

    let red = dispatch(createInitialState({ rng: () => 0 }), "能量药丸");
    expect(red.resources.red).toBe(2);
    let cash = dispatch(createInitialState({ rng: () => 0.95 }), "能量药丸");
    expect(cash.resources.cash).toBe(GIFT_CONFIG.energyPill.cashAmount);

    let pity = createInitialState({ rng: () => 0 });
    pity.progress.pillDrawCount = GIFT_CONFIG.energyPill.pityDraws - 1;
    pity = dispatch(pity, "能量药丸");
    expect(pity.progress.activeDishIds).toContain("D0104");

    let converted = createInitialState({ rng: () => 0 });
    converted.progress.activeDishIds = DISHES.filter((item) => item.tier === 1).map((item) => item.id);
    converted.progress.pillDrawCount = GIFT_CONFIG.energyPill.pityDraws - 1;
    converted = dispatch(converted, "能量药丸");
    expect(converted.resources.red).toBe(GIFT_CONFIG.energyPill.materialAmount);
    expect(converted.resources.green).toBe(GIFT_CONFIG.energyPill.materialAmount);
    expect(converted.resources.blue).toBe(GIFT_CONFIG.energyPill.materialAmount);
  });

  it("T11 魔法镜提高客流和高阶客概率，最多3层并在30秒后失效", () => {
    let baseline = levelThreeServiceState();
    baseline.runtime.nextGuestIn = 0;
    baseline = tick(baseline);
    expect(baseline.runtime.guests.at(-1)?.tier).toBe(1);

    let mirrored = levelThreeServiceState();
    mirrored = dispatch(mirrored, "魔法镜");
    mirrored = dispatch(mirrored, "魔法镜");
    mirrored = dispatch(mirrored, "魔法镜");
    mirrored = dispatch(mirrored, "魔法镜");
    expect(mirrored.effects.mirror.layers).toBe(GIFT_CONFIG.magicMirror.maxLayers);
    mirrored.runtime.nextGuestIn = 0;
    mirrored = tick(mirrored);
    expect(mirrored.runtime.guests.at(-1)?.tier).toBeGreaterThan(1);
    expect(mirrored.runtime.nextGuestIn).toBe(Math.round(60 / (RESTAURANTS[2].guestsPerMinute * 2.5)));

    mirrored.runtime.nextGuestIn = 999;
    mirrored = tick(mirrored, GIFT_CONFIG.magicMirror.durationSeconds);
    expect(mirrored.effects.mirror.layers).toBe(0);
    expect(mirrored.effects.mirror.remaining).toBe(0);
  });

  it("T12 甜甜圈自动出餐，持续时间可叠加但不超过180秒", () => {
    let state = readyFirstOrder();
    state = dispatch(state, "甜甜圈");
    expect(state.runtime.readyOrders).toHaveLength(0);
    expect(state.runtime.orders[0].status).toBe("served");
    expect(state.effects.donutRemaining).toBe(GIFT_CONFIG.donut.durationPerGiftSeconds);
    for (let index = 0; index < 4; index += 1) state = dispatch(state, "甜甜圈");
    expect(state.effects.donutRemaining).toBe(GIFT_CONFIG.donut.maxStoredSeconds);
  });

  it("T13 炸弹按容量招揽、含高阶客、受冷却限制且无可做菜时不生效", () => {
    let state = createInitialState({ rng: () => 0 });
    state = dispatch(state, "炸弹");
    expect(state.runtime.guests).toHaveLength(GIFT_CONFIG.bomb.baseGuests + 1);
    const afterFirst = state.runtime.guests.length;
    state = dispatch(state, "炸弹");
    expect(state.runtime.guests).toHaveLength(afterFirst);
    expect(state.effects.bombCooldown).toBe(GIFT_CONFIG.bomb.cooldownSeconds);

    const highTier = levelThreeServiceState();
    const highTierAfter = dispatch(highTier, "炸弹");
    expect(highTierAfter.runtime.guests).toHaveLength(Math.min(GIFT_CONFIG.bomb.baseGuests + RESTAURANTS[2].level, RESTAURANTS[2].queue + RESTAURANTS[2].seats));
    expect(highTierAfter.runtime.guests.some((guest) => guest.tier === 3)).toBe(true);

    const noDish = createInitialState({ rng: () => 0 });
    noDish.progress.activeDishIds = [];
    noDish.progress.publishedDishIds = [];
    const noDishAfter = dispatch(noDish, "炸弹");
    expect(noDishAfter.runtime.guests).toHaveLength(0);
    expect(noDishAfter.stats.logs.some((log) => log.kind === "invalid")).toBe(true);

    const full = createInitialState({ rng: () => 0 });
    full.runtime.seats.forEach((seat) => { seat.status = "occupied"; });
    for (let index = 0; index < RESTAURANTS[0].queue - 1; index += 1) {
      const guest = waitingGuest({ id: `full-${index}` });
      full.runtime.queue.push(guest);
      full.runtime.guests.push(guest);
    }
    const fullAfter = dispatch(full, "炸弹");
    expect(fullAfter.runtime.guests).toHaveLength(RESTAURANTS[0].queue - 1);
    expect(fullAfter.stats.logs.some((log) => log.kind === "invalid")).toBe(true);
  });

  it("T14 刷新/重新加载保留成长进度，但清空运行时状态", () => {
    let state = createInitialState({
      resources: { cash: 480, red: 3, green: 1, blue: 0, badges: 2 },
    });
    state = dispatch(state, "饭馆升级");
    state = dispatch(state, { type: "RESEARCH_DISH", dishId: "D0201" });
    state = dispatch(state, { type: "PUBLISH_DISH", dishId: "D0201" });
    state = dispatch(state, "炸弹");
    expect(state.runtime.guests.length).toBeGreaterThan(0);
    const saved = serializeState(state);
    const restored = deserializeState(saved);

    expect(restored.progress).toEqual(state.progress);
    expect(restored.resources).toEqual(state.resources);
    expect(restored.runtime.queue).toHaveLength(0);
    expect(restored.runtime.guests).toHaveLength(0);
    expect(restored.runtime.readyOrders).toHaveLength(0);
    expect(restored.runtime.seats.every((seat) => seat.status === "empty")).toBe(true);
    expect(restored.runtime.stoves.every((stove) => stove.status === "idle")).toBe(true);
    expect(restored.effects.mirror.layers).toBe(0);
    expect(restored.effects.donutRemaining).toBe(0);
    expect(restored.clock.tick).toBe(0);
  });
});
