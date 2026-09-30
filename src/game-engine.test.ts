import { describe, expect, it } from "vitest";
import {
  createInitialState,
  dispatch,
  serializeState,
  deserializeState,
  tick,
  DISHES,
  RESTAURANTS,
  GIFT_CONFIG,
  PILL_REWARDS,
} from "./game-engine";

describe("game engine core loop", () => {
  it("moves an arriving guest through cooking, serving and checkout", () => {
    let state = createInitialState({ rng: () => 0 });
    state = tick(state);
    expect(state.runtime.seats.filter((seat) => seat.guestId)).toHaveLength(1);
    expect(state.runtime.stoves[0].status).toBe("cooking");
    state = tick(state, 7);
    expect(state.runtime.readyOrders).toHaveLength(1);
    state = dispatch(state, { type: "SERVE" });
    expect(state.runtime.readyOrders).toHaveLength(0);
    state = tick(state);
    expect(state.resources.cash).toBeGreaterThan(0);
    expect(state.stats.todayGuests).toBe(1);
  });

  it("does not let gifts exceed their caps", () => {
    let state = createInitialState({ rng: () => 0 });
    state = dispatch(state, { type: "GIFT_MIRROR" });
    state = dispatch(state, { type: "GIFT_MIRROR" });
    state = dispatch(state, { type: "GIFT_MIRROR" });
    state = dispatch(state, { type: "GIFT_MIRROR" });
    expect(state.effects.mirror.layers).toBe(3);
    for (let index = 0; index < 5; index += 1) state = dispatch(state, { type: "GIFT_DONUT" });
    expect(state.effects.donutRemaining).toBe(180);
  });

  it("persists growth but rebuilds live runtime", () => {
    let state = createInitialState({ resources: { cash: 300, badges: 2 } });
    state = dispatch(state, { type: "UPGRADE_RESTAURANT" });
    state = tick(state);
    const restored = deserializeState(serializeState(state));
    expect(restored.progress.restaurantLevel).toBe(2);
    expect(restored.resources.cash).toBe(0);
    expect(restored.runtime.queue).toHaveLength(0);
    expect(restored.runtime.seats.every((seat) => seat.status === "empty")).toBe(true);
  });

  it("enforces queue capacity before seating and records capacity loss", () => {
    let state = createInitialState({ rng: () => 0 });
    for (let index = 0; index < RESTAURANTS[0].queue; index += 1) {
      const guest = { id: `queued-${index}`, kind: "student", name: "排队客", tier: 1 as const, status: "waiting" as const, patience: 99, patienceRemaining: 99, preferredTiers: [1], premium: 1, dropIndex: 0, materialDropRate: 0, badgeDropRate: 0 };
      state.runtime.queue.push(guest); state.runtime.guests.push(guest);
    }
    state.runtime.seats.forEach((seat) => { seat.status = "occupied"; });
    state.runtime.nextGuestIn = 0;
    state = tick(state);
    expect(state.runtime.queue).toHaveLength(RESTAURANTS[0].queue);
    expect(state.stats.logs.some((log) => log.kind === "capacity")).toBe(true);
  });

  it("expires waiting guests and ready orders without paying", () => {
    let state = createInitialState({ rng: () => 0 });
    state = tick(state);
    state.runtime.queue = [];
    state = tick(state, 7);
    expect(state.runtime.readyOrders).toHaveLength(1);
    state = tick(state, 10);
    expect(state.runtime.readyOrders).toHaveLength(0);
    expect(state.stats.todayRevenue).toBe(0);
    expect(state.runtime.guests).toHaveLength(0);
  });

  it("keeps research separate from menu publishing and respects level locks", () => {
    let state = createInitialState({ resources: { cash: 480, red: 3, green: 1, badges: 2 } });
    state = dispatch(state, { type: "UPGRADE_RESTAURANT" });
    state = dispatch(state, { type: "RESEARCH_DISH", dishId: "D0201" });
    expect(state.progress.activeDishIds).toContain("D0201");
    expect(state.progress.publishedDishIds).not.toContain("D0201");
    state = dispatch(state, { type: "PUBLISH_DISH", dishId: "D0201" });
    expect(state.progress.publishedDishIds).toContain("D0201");
  });

  it("uses per-order wand caps and never raises remaining cooking time", () => {
    let state = createInitialState({ rng: () => 0 });
    state = tick(state);
    const orderId = state.runtime.stoves[0].orderId!;
    for (let index = 0; index < 5; index += 1) state = dispatch(state, { type: "GIFT_WAND" });
    const order = state.runtime.orders.find((item) => item.id === orderId)!;
    expect(order.wandUses).toBe(GIFT_CONFIG.redWand.maxUses);
    expect(order.remaining).toBeGreaterThanOrEqual(order.baseSeconds * GIFT_CONFIG.redWand.minRemainingRatio);
  });

  it("applies pill pity and converts an unavailable new-dish roll to materials", () => {
    let state = createInitialState({ rng: () => 0 });
    state.progress.pillDrawCount = 9;
    state = dispatch(state, { type: "GIFT_PILL" });
    expect(state.progress.activeDishIds).toContain("D0104");

    state = createInitialState({ rng: () => 0.85 });
    state.progress.activeDishIds = DISHES.filter((item) => item.tier === 1).map((item) => item.id);
    state.progress.pillDrawCount = 9;
    const before = { ...state.resources };
    state = dispatch(state, { type: "GIFT_PILL" });
    expect(state.resources.red - before.red).toBe(2);
    expect(state.resources.green - before.green).toBe(2);
    expect(state.resources.blue - before.blue).toBe(2);
  });

  it("caps mirror, donut and bomb effects while respecting bomb capacity", () => {
    let state = createInitialState({ rng: () => 0 });
    for (let index = 0; index < 4; index += 1) state = dispatch(state, { type: "GIFT_MIRROR" });
    expect(state.effects.mirror.layers).toBe(GIFT_CONFIG.magicMirror.maxLayers);
    for (let index = 0; index < 5; index += 1) state = dispatch(state, { type: "GIFT_DONUT" });
    expect(state.effects.donutRemaining).toBe(GIFT_CONFIG.donut.maxStoredSeconds);
    const before = state.runtime.guests.length;
    state = dispatch(state, { type: "GIFT_BOMB" });
    expect(state.runtime.guests.length - before).toBe(4);
    const after = state.runtime.guests.length;
    state = dispatch(state, { type: "GIFT_BOMB" });
    expect(state.runtime.guests.length).toBe(after);
  });

  it("uses configured pill probabilities that sum to 100%", () => {
    expect(PILL_REWARDS.reduce((sum, reward) => sum + reward.probability, 0)).toBeCloseTo(1);
  });

  it("sanitizes malformed persisted growth and never restores unknown dishes", () => {
    const malformed = JSON.stringify({ version: 1, configVersion: "h5-v1", resources: { cash: "oops", red: -4, green: NaN }, progress: { restaurantLevel: 99, chefLevel: 99, activeDishIds: "D0101", publishedDishIds: ["UNKNOWN"], pillDrawCount: -1 } });
    const state = deserializeState(malformed);
    expect(state.resources.cash).toBe(0);
    expect(state.resources.red).toBe(0);
    expect(state.progress.restaurantLevel).toBe(1);
    expect(state.progress.chefLevel).toBe(1);
    expect(state.progress.activeDishIds).toEqual(["D0101", "D0102", "D0103"]);
    expect(state.progress.publishedDishIds).toEqual([]);
    expect(state.runtime.queue).toHaveLength(0);
  });
});
