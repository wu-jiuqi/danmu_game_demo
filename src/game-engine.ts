/*
 * Pure state machine for the Bawei Restaurant H5 demo.
 *
 * The UI should only render GameState and send Command values to dispatch.
 * There are no timers in this module: tick is the single source of time.
 */

export type Speed = 1 | 2 | 5;
export type RestaurantLevel = 1 | 2 | 3;
export type ChefLevel = 1 | 2 | 3;
export type GuestStatus = "waiting" | "seated" | "dining";
export type SeatStatus = "empty" | "occupied";
export type StoveStatus = "idle" | "cooking";
export type OrderStatus = "queued" | "cooking" | "ready" | "served" | "completed" | "cancelled";

export type ResourceBag = {
  cash: number;
  red: number;
  green: number;
  blue: number;
  badges: number;
};

export type Guest = {
  id: string;
  kind: string;
  name: string;
  tier: 1 | 2 | 3;
  status: GuestStatus;
  patience: number;
  patienceRemaining: number;
  mealRemaining: number;
  preferredTiers: number[];
  premium: number;
  dropIndex: number;
  seatId?: string;
  orderId?: string;
};

export type Seat = {
  id: string;
  status: SeatStatus;
  guestId?: string;
  orderId?: string;
};

export type Stove = {
  id: string;
  status: StoveStatus;
  orderId?: string;
  remaining: number;
};

export type Order = {
  id: string;
  guestId: string;
  seatId: string;
  dishId: string;
  status: OrderStatus;
  baseSeconds: number;
  remaining: number;
  waitingRemaining: number;
  diningRemaining: number;
  stoveId?: string;
  servedAtTick?: number;
};

export type LogEntry = {
  id: string;
  tick: number;
  message: string;
  kind?: string;
};

export type GameState = {
  version: 1;
  configVersion: string;
  clock: { tick: number; paused: boolean; speed: Speed };
  resources: ResourceBag;
  progress: {
    restaurantLevel: RestaurantLevel;
    chefLevel: ChefLevel;
    activeDishIds: string[];
    publishedDishIds: string[];
    pillDrawCount: number;
  };
  runtime: {
    queue: Guest[];
    seats: Seat[];
    stoves: Stove[];
    readyOrders: Order[];
    nextGuestIn: number;
    sequence: number;
    /** Runtime-only indexes; they are reset on load and may be ignored by UI. */
    orders: Order[];
    guests: Guest[];
  };
  effects: {
    mirror: { layers: 0 | 1 | 2 | 3; remaining: number };
    donutRemaining: number;
    wizardCooldown: number;
    bombCooldown: number;
    wizardUses: number;
    wizardOrderId?: string;
  };
  stats: { todayGuests: number; todayRevenue: number; logs: LogEntry[] };
  /** Optional test hook. Persistence deliberately omits this function. */
  rng?: () => number;
  rngSeed?: number;
};

export type Command = {
  type: string;
  dishId?: string;
  orderId?: string;
  speed?: Speed;
  position?: number;
  value?: number;
  payload?: unknown;
};

export type CreateStateOptions = {
  resources?: Partial<ResourceBag>;
  rng?: () => number;
  rngSeed?: number;
};

export type Dish = {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  price: number;
  cookSeconds: number;
  research: Partial<ResourceBag>;
};

export type RestaurantConfig = {
  level: RestaurantLevel;
  seats: number;
  queue: number;
  stoves: number;
  dishSlots: number;
  guestsPerMinute: number;
  upgrade?: Partial<ResourceBag>;
};

export type GuestConfig = {
  kind: string;
  name: string;
  tier: 1 | 2 | 3;
  patience: number;
  readyWait: number;
  premium: number;
  preferredTiers: number[];
  weights: Partial<Record<RestaurantLevel, number>>;
};

const CONFIG_VERSION = "h5-v1";
export const SAVE_KEY = "bawei-restaurant-save-v1";

export const RESTAURANTS: readonly RestaurantConfig[] = [
  { level: 1, seats: 3, queue: 5, stoves: 1, dishSlots: 3, guestsPerMinute: 2 },
  { level: 2, seats: 4, queue: 6, stoves: 2, dishSlots: 5, guestsPerMinute: 2.4, upgrade: { cash: 300, badges: 2 } },
  { level: 3, seats: 5, queue: 8, stoves: 3, dishSlots: 7, guestsPerMinute: 2.8, upgrade: { cash: 900, badges: 6 } },
];

export const CHEFS = [
  { level: 1 as ChefLevel, maxTier: 1, speed: 1, restaurant: 1 as RestaurantLevel, upgrade: {} as Partial<ResourceBag> },
  { level: 2 as ChefLevel, maxTier: 2, speed: 1.25, restaurant: 2 as RestaurantLevel, upgrade: { cash: 200 } },
  { level: 3 as ChefLevel, maxTier: 3, speed: 1.5, restaurant: 3 as RestaurantLevel, upgrade: { cash: 600 } },
] as const;

export const DISHES: readonly Dish[] = [
  { id: "D0101", name: "阳春面", tier: 1, price: 8, cookSeconds: 8, research: {} },
  { id: "D0102", name: "青菜汤面", tier: 1, price: 8, cookSeconds: 9, research: {} },
  { id: "D0103", name: "葱油拌面", tier: 1, price: 9, cookSeconds: 10, research: {} },
  { id: "D0104", name: "香煎葱油饼", tier: 1, price: 10, cookSeconds: 12, research: { cash: 60, red: 1, green: 3 } },
  { id: "D0201", name: "红烧牛肉面", tier: 2, price: 18, cookSeconds: 18, research: { cash: 180, red: 3, green: 1 } },
  { id: "D0202", name: "番茄鸡蛋饭", tier: 2, price: 16, cookSeconds: 16, research: { cash: 160, red: 2, green: 2 } },
  { id: "D0203", name: "香菇滑鸡饭", tier: 2, price: 20, cookSeconds: 22, research: { cash: 220, red: 2, green: 2, blue: 1 } },
  { id: "D0204", name: "鲜肉小馄饨", tier: 2, price: 18, cookSeconds: 20, research: { cash: 180, red: 2, green: 3 } },
  { id: "D0301", name: "猪肉白菜水饺", tier: 3, price: 32, cookSeconds: 30, research: { cash: 420, red: 3, green: 3, blue: 1 } },
  { id: "D0302", name: "宫保鸡丁套餐", tier: 3, price: 38, cookSeconds: 36, research: { cash: 520, red: 4, green: 2, blue: 1 } },
  { id: "D0303", name: "鱼香肉丝饭", tier: 3, price: 36, cookSeconds: 34, research: { cash: 500, red: 4, green: 3, blue: 1 } },
  { id: "D0304", name: "酱爆猪肝饭", tier: 3, price: 34, cookSeconds: 32, research: { cash: 460, red: 5, green: 2, blue: 1 } },
];

export const GUESTS: readonly GuestConfig[] = [
  { kind: "student", name: "放学学生", tier: 1, patience: 45, readyWait: 10, premium: 1, preferredTiers: [1], weights: { 1: 55, 2: 35, 3: 25 } },
  { kind: "worker", name: "工地工人", tier: 1, patience: 50, readyWait: 12, premium: 1, preferredTiers: [1], weights: { 1: 45, 2: 30, 3: 20 } },
  { kind: "office", name: "赶时间上班族", tier: 2, patience: 40, readyWait: 10, premium: 1, preferredTiers: [1, 2], weights: { 2: 25, 3: 22 } },
  { kind: "blogger", name: "探店博主", tier: 2, patience: 35, readyWait: 8, premium: 1.2, preferredTiers: [2, 1], weights: { 2: 10, 3: 13 } },
  { kind: "owner", name: "小企业主", tier: 3, patience: 30, readyWait: 10, premium: 1.25, preferredTiers: [3, 2], weights: { 3: 13 } },
  { kind: "critic", name: "美食评论家", tier: 3, patience: 25, readyWait: 8, premium: 1.4, preferredTiers: [3, 2], weights: { 3: 7 } },
];

function restaurant(level: RestaurantLevel): RestaurantConfig { return RESTAURANTS[level - 1]; }
function chef(level: ChefLevel) { return CHEFS[level - 1]; }
function dish(id: string | undefined): Dish | undefined { return DISHES.find((item) => item.id === id); }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function cloneState(input: GameState): GameState {
  const state = clone(input);
  state.rng = input.rng;
  // Queue/readyOrders are indexes into the canonical runtime arrays. JSON cloning
  // breaks those object references, so restore them after every state transition.
  const guests = new Map(state.runtime.guests.map((guest) => [guest.id, guest]));
  state.runtime.queue = state.runtime.queue.map((guest) => {
    const canonical = guests.get(guest.id);
    if (canonical) return canonical;
    state.runtime.guests.push(guest); guests.set(guest.id, guest); return guest;
  });
  const orders = new Map(state.runtime.orders.map((order) => [order.id, order]));
  state.runtime.readyOrders = state.runtime.readyOrders.map((order) => {
    const canonical = orders.get(order.id);
    if (canonical) return canonical;
    state.runtime.orders.push(order); orders.set(order.id, order); return order;
  });
  return state;
}
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }

function nextRandom(state: GameState): number {
  if (state.rng) return clamp(Number(state.rng()), 0, 0.999999999);
  const seed = (state.rngSeed ?? 0x6d2b79f5) >>> 0;
  const next = (seed * 1664525 + 1013904223) >>> 0;
  state.rngSeed = next;
  return next / 0x100000000;
}

function addLog(state: GameState, message: string, kind = "system"): void {
  const id = `log-${state.clock.tick}-${state.stats.logs.length + 1}`;
  state.stats.logs.push({ id, tick: state.clock.tick, message, kind });
  if (state.stats.logs.length > 200) state.stats.logs.splice(0, state.stats.logs.length - 200);
}

function sequenceId(state: GameState, prefix: string): string {
  state.runtime.sequence += 1;
  return `${prefix}-${state.runtime.sequence}`;
}

function weighted<T>(items: readonly T[], weights: readonly number[], rng: number): T | undefined {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (total <= 0) return undefined;
  let point = rng * total;
  for (let index = 0; index < items.length; index += 1) {
    point -= Math.max(0, weights[index] ?? 0);
    if (point < 0) return items[index];
  }
  return items[items.length - 1];
}

function activeDishes(state: GameState): Dish[] {
  const maxTier = chef(state.progress.chefLevel).maxTier;
  const visible = new Set(state.progress.publishedDishIds);
  return state.progress.activeDishIds.map((id) => dish(id)).filter((item): item is Dish => Boolean(item && visible.has(item.id) && item.tier <= maxTier));
}

function canServeGuest(state: GameState, guest: GuestConfig): boolean {
  return activeDishes(state).some((item) => guest.preferredTiers.includes(item.tier));
}

function guestFromConfig(state: GameState, config: GuestConfig, tierOverride?: 1 | 2 | 3): Guest {
  const tier = tierOverride ?? config.tier;
  return {
    id: sequenceId(state, "guest"), kind: config.kind, name: config.name, tier,
    status: "waiting", patience: config.patience, patienceRemaining: config.patience,
    mealRemaining: 0, preferredTiers: [...config.preferredTiers], premium: config.premium,
    dropIndex: GUESTS.indexOf(config),
  };
}

function pickGuest(state: GameState, forcedTier?: 1 | 2 | 3): Guest | undefined {
  const level = state.progress.restaurantLevel;
  let candidates = GUESTS.filter((item) => (item.weights[level] ?? 0) > 0 && canServeGuest(state, item));
  if (forcedTier) {
    const forced = candidates.filter((item) => item.tier === forcedTier);
    if (forced.length) candidates = forced;
  }
  if (!candidates.length) return undefined;
  const mirrorLayers = state.effects.mirror.layers;
  const weights = candidates.map((item) => {
    const base = item.weights[level] ?? 0;
    return item.tier >= 2 ? base * Math.pow(1.5, mirrorLayers) : base;
  });
  const selected = weighted(candidates, weights, nextRandom(state));
  return selected ? guestFromConfig(state, selected, forcedTier) : undefined;
}

function availableDishForGuest(state: GameState, guest: Guest): Dish | undefined {
  const choices = activeDishes(state).filter((item) => guest.preferredTiers.includes(item.tier));
  if (!choices.length) return undefined;
  // Preferred tier first; choosing the first also makes a fixed RNG run reproducible.
  const preferred = guest.preferredTiers.find((tier) => choices.some((item) => item.tier === tier));
  const sameTier = choices.filter((item) => item.tier === preferred);
  return sameTier[Math.floor(nextRandom(state) * sameTier.length)] ?? choices[0];
}

function emptySeat(state: GameState): Seat | undefined { return state.runtime.seats.find((seat) => seat.status === "empty"); }
function freeStove(state: GameState): Stove | undefined { return state.runtime.stoves.find((stove) => stove.status === "idle"); }
function orderById(state: GameState, orderId: string | undefined): Order | undefined {
  if (!orderId) return undefined;
  for (const order of state.runtime.readyOrders) if (order.id === orderId) return order;
  for (const stove of state.runtime.stoves) if (stove.orderId === orderId) {
    const order = findOrder(state, orderId); if (order) return order;
  }
  return findOrder(state, orderId);
}
function findOrder(state: GameState, id: string): Order | undefined {
  return state.runtime.orders.find((item) => item.id === id);
}

/** Create a new level-1 restaurant. */
export function createInitialState(options: CreateStateOptions = {}): GameState {
  const cfg = restaurant(1);
  const seats = Array.from({ length: cfg.seats }, (_, index) => ({ id: `seat-${index + 1}`, status: "empty" as SeatStatus }));
  const stoves = Array.from({ length: cfg.stoves }, (_, index) => ({ id: `stove-${index + 1}`, status: "idle" as StoveStatus, remaining: 0 }));
  return {
    version: 1, configVersion: CONFIG_VERSION,
    clock: { tick: 0, paused: false, speed: 1 },
    resources: { cash: 120, red: 4, green: 4, blue: 2, badges: 0, ...options.resources },
    progress: { restaurantLevel: 1, chefLevel: 1, activeDishIds: ["D0101", "D0102", "D0103"], publishedDishIds: ["D0101", "D0102", "D0103"], pillDrawCount: 0 },
    runtime: { queue: [], seats, stoves, readyOrders: [], nextGuestIn: 0, sequence: 0, orders: [], guests: [] },
    effects: { mirror: { layers: 0, remaining: 0 }, donutRemaining: 0, wizardCooldown: 0, bombCooldown: 0, wizardUses: 0 },
    stats: { todayGuests: 0, todayRevenue: 0, logs: [] }, rng: options.rng, rngSeed: options.rngSeed ?? 0x6d2b79f5,
  } as GameState;
}

function runtimeOrders(state: GameState): Order[] {
  return state.runtime.orders;
}

function removeOrder(state: GameState, orderId: string): void {
  const orders = runtimeOrders(state);
  const index = orders.findIndex((order) => order.id === orderId);
  if (index >= 0) orders.splice(index, 1);
  const readyIndex = state.runtime.readyOrders.findIndex((order) => order.id === orderId);
  if (readyIndex >= 0) state.runtime.readyOrders.splice(readyIndex, 1);
  for (const stove of state.runtime.stoves) if (stove.orderId === orderId) { stove.status = "idle"; stove.orderId = undefined; stove.remaining = 0; }
}

function clearGuestSeat(state: GameState, guestId: string): void {
  const seat = state.runtime.seats.find((item) => item.guestId === guestId);
  if (seat) { seat.status = "empty"; seat.guestId = undefined; seat.orderId = undefined; }
}

function seatGuests(state: GameState): void {
  while (state.runtime.queue.length && emptySeat(state)) {
    const guest = state.runtime.queue[0];
    const selectedDish = availableDishForGuest(state, guest);
    if (!selectedDish) {
      state.runtime.queue.shift();
      addLog(state, `${guest.name} 找不到可做菜，离开了`, "leave");
      continue;
    }
    state.runtime.queue.shift();
    const seat = emptySeat(state);
    if (!seat) break;
    seat.status = "occupied"; seat.guestId = guest.id;
    guest.status = "seated"; guest.seatId = seat.id;
    const order: Order = {
      id: sequenceId(state, "order"), guestId: guest.id, seatId: seat.id, dishId: selectedDish.id,
      status: "queued", baseSeconds: selectedDish.cookSeconds, remaining: selectedDish.cookSeconds,
      waitingRemaining: 0, diningRemaining: 0,
    };
    guest.orderId = order.id; seat.orderId = order.id;
    runtimeOrders(state).push(order);
    addLog(state, `${guest.name} 落座并点了${selectedDish.name}`, "order");
  }
}

function assignStoves(state: GameState): void {
  for (const order of runtimeOrders(state)) {
    if (order.status !== "queued") continue;
    const stove = freeStove(state);
    if (!stove) break;
    stove.status = "cooking"; stove.orderId = order.id;
    stove.remaining = order.remaining; order.stoveId = stove.id; order.status = "cooking";
  }
}

function finishCooking(state: GameState): void {
  for (const stove of state.runtime.stoves) {
    if (stove.status !== "cooking" || !stove.orderId) continue;
    const order = runtimeOrders(state).find((item) => item.id === stove.orderId);
    if (!order || order.status !== "cooking") continue;
    order.remaining = stove.remaining;
    if (order.remaining > 0) continue;
    const guest = findGuest(state, order.guestId);
    order.status = "ready"; order.waitingRemaining = guest?.kind ? (GUESTS.find((item) => item.kind === guest.kind)?.readyWait ?? 10) : 10;
    state.runtime.readyOrders.push(order);
    stove.status = "idle"; stove.orderId = undefined; stove.remaining = 0;
    if (state.effects.wizardOrderId === order.id) { state.effects.wizardOrderId = undefined; state.effects.wizardUses = 0; }
    addLog(state, `${dish(order.dishId)?.name ?? order.dishId} 做好了，等待出餐`, "ready");
    if (state.effects.donutRemaining > 0) serveOrder(state, order);
  }
}

function findGuest(state: GameState, guestId: string): Guest | undefined {
  return state.runtime.guests.find((item) => item.id === guestId);
}

function serveOrder(state: GameState, order: Order): boolean {
  if (order.status !== "ready") return false;
  const index = state.runtime.readyOrders.findIndex((item) => item.id === order.id);
  if (index < 0) return false;
  state.runtime.readyOrders.splice(index, 1);
  order.status = "served"; order.diningRemaining = 1; order.servedAtTick = state.clock.tick;
  const guest = findGuest(state, order.guestId);
  if (guest) { guest.status = "dining"; guest.mealRemaining = 1; }
  addLog(state, `${dish(order.dishId)?.name ?? "菜品"} 已出餐`, "serve");
  return true;
}

function settleOrders(state: GameState): void {
  for (const order of [...runtimeOrders(state)]) {
    if (order.status !== "served") continue;
    order.diningRemaining -= 1;
    if (order.diningRemaining > 0) continue;
    const guest = findGuest(state, order.guestId);
    const item = dish(order.dishId);
    if (guest && item) {
      const revenue = Math.round(item.price * guest.premium);
      state.resources.cash += revenue; state.stats.todayRevenue += revenue; state.stats.todayGuests += 1;
      const dropIndex = Number.isFinite(guest.dropIndex) ? guest.dropIndex : guest.tier - 1;
      const dropRate = [0.6, 0.65, 0.7, 0.75, 0.8, 0.85][Math.max(0, Math.min(5, dropIndex))];
      if (nextRandom(state) < dropRate) {
        const material = ["red", "green", "blue"][Math.floor(nextRandom(state) * 3)] as keyof ResourceBag;
        state.resources[material] += 1;
      }
      const badgeRate = [0.08, 0.1, 0.12, 0.14, 0.18, 0.22][Math.max(0, Math.min(5, dropIndex))];
      if (nextRandom(state) < badgeRate) state.resources.badges += 1;
      addLog(state, `${guest.name} 结账 +${revenue} 现金`, "checkout");
    }
    if (guest) guest.status = "dining";
    clearGuestSeat(state, order.guestId);
    order.status = "completed";
    removeOrder(state, order.id);
  }
}

function expireEntities(state: GameState): void {
  for (let index = state.runtime.queue.length - 1; index >= 0; index -= 1) {
    const guest = state.runtime.queue[index];
    guest.patienceRemaining -= 1;
    if (guest.patienceRemaining <= 0) {
      state.runtime.queue.splice(index, 1); addLog(state, `${guest.name} 等候太久离开了`, "leave");
    }
  }
  for (const order of [...runtimeOrders(state)]) {
    if (order.status !== "ready") continue;
    order.waitingRemaining -= 1;
    if (order.waitingRemaining > 0) continue;
    order.status = "cancelled"; clearGuestSeat(state, order.guestId);
    addLog(state, "待出餐超时，订单作废", "leave"); removeOrder(state, order.id);
  }
}

function spawnGuest(state: GameState, forcedTier?: 1 | 2 | 3): boolean {
  const cfg = restaurant(state.progress.restaurantLevel);
  if (state.runtime.queue.length >= cfg.queue && !emptySeat(state)) { addLog(state, "排队已满，客人流失", "capacity"); return false; }
  const guest = pickGuest(state, forcedTier);
  if (!guest) return false;
  state.runtime.queue.push(guest); state.runtime.guests.push(guest); addLog(state, `${guest.name} 来到店门口`, "arrival");
  return true;
}

function arrivals(state: GameState): void {
  const cfg = restaurant(state.progress.restaurantLevel);
  state.runtime.nextGuestIn -= 1;
  if (state.runtime.nextGuestIn > 0) return;
  spawnGuest(state);
  const multiplier = state.effects.mirror.layers === 0 ? 1 : [0, 1.5, 2, 2.5][state.effects.mirror.layers];
  state.runtime.nextGuestIn = Math.max(1, Math.round(60 / (cfg.guestsPerMinute * multiplier)));
}

function tickOne(state: GameState): void {
  state.clock.tick += 1;
  arrivals(state);
  expireEntities(state);
  seatGuests(state);
  assignStoves(state);
  for (const stove of state.runtime.stoves) if (stove.status === "cooking" && stove.orderId) {
    const order = runtimeOrders(state).find((item) => item.id === stove.orderId);
    if (order?.status === "cooking") { stove.remaining = Math.max(0, stove.remaining - chef(state.progress.chefLevel).speed); order.remaining = stove.remaining; }
  }
  finishCooking(state);
  if (state.effects.donutRemaining > 0) {
    state.effects.donutRemaining = Math.max(0, state.effects.donutRemaining - 1);
    for (const order of [...state.runtime.readyOrders]) serveOrder(state, order);
  }
  settleOrders(state);
  state.effects.mirror.remaining = Math.max(0, state.effects.mirror.remaining - 1);
  if (state.effects.mirror.remaining === 0) state.effects.mirror.layers = 0;
  state.effects.wizardCooldown = Math.max(0, state.effects.wizardCooldown - 1);
  state.effects.bombCooldown = Math.max(0, state.effects.bombCooldown - 1);
}

/** Advance by logical seconds; speed 2/5 executes that many fixed ticks per call. */
export function tick(input: GameState, logicalSeconds = 1): GameState {
  const state = cloneState(input);
  const count = Math.max(0, Math.floor(logicalSeconds)) * (state.clock.speed || 1);
  if (!state.clock.paused) for (let index = 0; index < count; index += 1) tickOne(state);
  return state;
}

function hasCost(resources: ResourceBag, cost: Partial<ResourceBag>): boolean {
  return Object.entries(cost).every(([key, value]) => resources[key as keyof ResourceBag] >= (value ?? 0));
}
function spend(resources: ResourceBag, cost: Partial<ResourceBag>): void {
  for (const [key, value] of Object.entries(cost)) resources[key as keyof ResourceBag] -= value ?? 0;
}
function resizeRuntime(state: GameState): void {
  const cfg = restaurant(state.progress.restaurantLevel);
  while (state.runtime.seats.length < cfg.seats) state.runtime.seats.push({ id: `seat-${state.runtime.seats.length + 1}`, status: "empty" });
  while (state.runtime.stoves.length < cfg.stoves) state.runtime.stoves.push({ id: `stove-${state.runtime.stoves.length + 1}`, status: "idle", remaining: 0 });
}
function publishDish(state: GameState, id: string): boolean {
  if (!state.progress.activeDishIds.includes(id)) return false;
  const max = restaurant(state.progress.restaurantLevel).dishSlots;
  if (state.progress.publishedDishIds.includes(id)) return true;
  if (state.progress.publishedDishIds.length >= max) return false;
  state.progress.publishedDishIds.push(id); return true;
}
function unpublishDish(state: GameState, id: string): boolean {
  const index = state.progress.publishedDishIds.indexOf(id);
  if (index < 0) return false;
  state.progress.publishedDishIds.splice(index, 1); return true;
}
function researchDish(state: GameState, id: string): boolean {
  const item = dish(id);
  if (!item || state.progress.activeDishIds.includes(id)) return false;
  // Research is unlocked by restaurant tier. A lower-level chef can see the
  // activated dish, but it remains locked out of the automatic menu until the
  // chef upgrade raises maxTier.
  if (item.tier > state.progress.restaurantLevel || !hasCost(state.resources, item.research)) return false;
  spend(state.resources, item.research); state.progress.activeDishIds.push(id);
  addLog(state, `研发成功：${item.name}`, "research");
  return true;
}
function upgradeRestaurant(state: GameState): boolean {
  if (state.progress.restaurantLevel >= 3) return false;
  const cost = restaurant((state.progress.restaurantLevel + 1) as RestaurantLevel).upgrade ?? {};
  if (!hasCost(state.resources, cost)) return false;
  spend(state.resources, cost); state.progress.restaurantLevel = (state.progress.restaurantLevel + 1) as RestaurantLevel; resizeRuntime(state);
  addLog(state, `饭馆升级到${state.progress.restaurantLevel}级`, "upgrade"); return true;
}
function upgradeChef(state: GameState): boolean {
  if (state.progress.chefLevel >= 3) return false;
  const next = CHEFS[Math.min(2, state.progress.chefLevel)];
  if (state.progress.restaurantLevel < next.restaurant || !hasCost(state.resources, next.upgrade)) return false;
  spend(state.resources, next.upgrade); state.progress.chefLevel = next.level; addLog(state, `厨师升级到${next.level}级`, "upgrade"); return true;
}
function rewardPill(state: GameState): void {
  state.progress.pillDrawCount += 1;
  const candidates = DISHES.filter((item) => !state.progress.activeDishIds.includes(item.id) && item.tier <= state.progress.restaurantLevel && item.tier <= chef(state.progress.chefLevel).maxTier);
  if (state.progress.pillDrawCount % 10 === 0) {
    if (candidates.length) { const item = candidates[Math.floor(nextRandom(state) * candidates.length)]; state.progress.activeDishIds.push(item.id); addLog(state, `能量药丸保底激活${item.name}（待上架）`, "gift"); return; }
    state.resources.red += 2; state.resources.green += 2; state.resources.blue += 2; addLog(state, "能量药丸保底转换为三色食材", "gift"); return;
  }
  const roll = nextRandom(state);
  if (roll < 0.23) state.resources.red += 2;
  else if (roll < 0.46) state.resources.green += 2;
  else if (roll < 0.69) state.resources.blue += 2;
  else if (roll < 0.81) state.resources.badges += 1;
  else if (roll < 0.89 && candidates.length) { const item = candidates[Math.floor(nextRandom(state) * candidates.length)]; state.progress.activeDishIds.push(item.id); }
  else state.resources.cash += 50;
  addLog(state, "能量药丸已结算", "gift");
}
function redWand(state: GameState): boolean {
  const stove = state.runtime.stoves.find((item) => item.status === "cooking" && item.orderId);
  if (!stove?.orderId) return false;
  const order = runtimeOrders(state).find((item) => item.id === stove.orderId);
  if (!order || order.status !== "cooking") return false;
  if (state.effects.wizardOrderId !== order.id) { state.effects.wizardOrderId = order.id; state.effects.wizardUses = 0; }
  if (state.effects.wizardUses >= 4) return false;
  order.remaining = Math.max(order.baseSeconds * 0.2, order.remaining - order.baseSeconds * 0.2); stove.remaining = order.remaining;
  state.effects.wizardUses += 1; addLog(state, "红色仙女棒缩短烹饪时间", "gift"); return true;
}
function mirrorGift(state: GameState): boolean {
  state.effects.mirror.layers = Math.min(3, state.effects.mirror.layers + 1) as 0 | 1 | 2 | 3; state.effects.mirror.remaining = 30; addLog(state, `魔法镜${state.effects.mirror.layers}层生效`, "gift"); return true;
}
function donutGift(state: GameState): boolean {
  state.effects.donutRemaining = Math.min(180, state.effects.donutRemaining + 60); for (const order of [...state.runtime.readyOrders]) serveOrder(state, order); addLog(state, "甜甜圈自动出餐效果生效", "gift"); return true;
}
function bombGift(state: GameState): boolean {
  if (state.effects.bombCooldown > 0) return false;
  if (!activeDishes(state).length) return false;
  const cfg = restaurant(state.progress.restaurantLevel);
  const capacity = cfg.queue - state.runtime.queue.length + state.runtime.seats.filter((item) => item.status === "empty").length;
  if (capacity < 3) return false;
  const count = Math.min(3 + state.progress.restaurantLevel, capacity);
  const high = Math.floor(count * 0.3);
  const highest = Math.max(...activeDishes(state).map((item) => item.tier)) as 1 | 2 | 3;
  for (let index = 0; index < count; index += 1) {
    spawnGuest(state, index < high ? highest : undefined);
    seatGuests(state);
  }
  state.effects.bombCooldown = 20; addLog(state, `炸弹招揽${count}位客人`, "gift"); return true;
}

/** Apply a user/event command and return a new state. Invalid commands are harmless. */
export function dispatch(input: GameState, command: Command | string): GameState {
  const state = cloneState(input);
  const raw = typeof command === "string" ? command : command.type;
  const normalized = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const cmd: Command = typeof command === "string" ? { type: raw } : command;
  switch (normalized) {
    case "SERVE": case "OUT": case "出餐": {
      const order = cmd.orderId ? orderById(state, cmd.orderId) : state.runtime.readyOrders[0];
      if (order && serveOrder(state, order)) break;
      addLog(state, "当前没有可出餐订单", "invalid"); break;
    }
    case "PAUSE": case "暂停": state.clock.paused = true; addLog(state, "经营已暂停", "command"); break;
    case "RESUME": case "继续": state.clock.paused = false; addLog(state, "经营继续", "command"); break;
    case "SET_SPEED": case "SPEED": case "1倍": case "2倍": case "5倍": {
      const speed = cmd.speed ?? (normalized === "1倍" ? 1 : normalized === "2倍" ? 2 : normalized === "5倍" ? 5 : cmd.value);
      if (speed === 1 || speed === 2 || speed === 5) { state.clock.speed = speed; addLog(state, `时间倍率调整为${speed}倍`, "command"); }
      break;
    }
    case "RESEARCH": case "RESEARCH_DISH": case "研发": researchDish(state, cmd.dishId ?? String(cmd.value ?? "")); break;
    case "PUBLISH": case "PUBLISH_DISH": case "上架": {
      const dishId = cmd.dishId ?? "";
      if (state.progress.publishedDishIds.includes(dishId)) unpublishDish(state, dishId); else publishDish(state, dishId);
      break;
    }
    case "UNPUBLISH": case "UNPUBLISH_DISH": case "下架": unpublishDish(state, cmd.dishId ?? ""); break;
    case "UPGRADE_RESTAURANT": case "UPGRADE_RESTAURANT_LEVEL": case "饭馆升级": upgradeRestaurant(state); break;
    case "UPGRADE_CHEF": case "厨师升级": upgradeChef(state); break;
    case "GIFT_RED_WAND": case "GIFT_WAND": case "RED_WAND": case "仙女棒": if (!redWand(state)) addLog(state, "没有烹饪中的订单，仙女棒没有消耗", "invalid"); break;
    case "GIFT_PILL": case "ENERGY_PILL": case "PILL": case "能量药丸": rewardPill(state); break;
    case "GIFT_MIRROR": case "MAGIC_MIRROR": case "魔法镜": mirrorGift(state); break;
    case "GIFT_DONUT": case "DONUT": case "甜甜圈": donutGift(state); break;
    case "GIFT_BOMB": case "BOMB": case "炸弹": if (!bombGift(state)) addLog(state, "当前空位不足或炸弹仍在冷却", "invalid"); break;
    case "排1": break;
    case "排2": if (state.runtime.queue[1]) { const [guest] = state.runtime.queue.splice(1, 1); state.runtime.queue.unshift(guest); } break;
    case "排3": if (state.runtime.queue[2]) { const [guest] = state.runtime.queue.splice(2, 1); state.runtime.queue.unshift(guest); } break;
    case "PRIORITIZE_QUEUE": {
      const position = Math.max(0, Math.min(state.runtime.queue.length - 1, Number(cmd.position ?? cmd.value ?? (cmd.payload as { position?: number } | undefined)?.position ?? 0)));
      if (state.runtime.queue[position]) { const [guest] = state.runtime.queue.splice(position, 1); state.runtime.queue.unshift(guest); }
      break;
    }
    default: addLog(state, `未识别指令：${raw}`, "invalid");
  }
  return state;
}

export function getVisibleDishes(state: GameState): Dish[] {
  return state.progress.activeDishIds.map((id) => dish(id)).filter((item): item is Dish => Boolean(item));
}

export function getAllDishes(): Dish[] { return [...DISHES]; }
export function getAvailableUpgrade(state: GameState): {
  type: "restaurant" | "chef";
  level: number;
  cost: Partial<ResourceBag>;
  affordable: boolean;
  restaurant?: { level: number; cost: Partial<ResourceBag>; affordable: boolean; requirement: string };
  chef?: { level: number; cost: Partial<ResourceBag>; affordable: boolean; requirement: string };
} | undefined {
  const restaurantInfo = state.progress.restaurantLevel < 3
    ? (() => {
      const level = (state.progress.restaurantLevel + 1) as RestaurantLevel;
      const cost = restaurant(level).upgrade ?? {};
      return { level, cost, affordable: hasCost(state.resources, cost), requirement: `需要现金${cost.cash ?? 0}、铭牌${cost.badges ?? 0}` };
    })()
    : undefined;
  const chefInfo = state.progress.chefLevel < 3
    ? (() => {
      const next = CHEFS[Math.min(2, state.progress.chefLevel)];
      const affordable = state.progress.restaurantLevel >= next.restaurant && hasCost(state.resources, next.upgrade);
      return { level: next.level, cost: next.upgrade, affordable, requirement: `需要饭馆${next.restaurant}级、现金${next.upgrade.cash ?? 0}` };
    })()
    : undefined;
  if (!restaurantInfo && !chefInfo) return undefined;
  const primary = restaurantInfo ? { type: "restaurant" as const, ...restaurantInfo } : { type: "chef" as const, ...chefInfo! };
  return { ...primary, restaurant: restaurantInfo, chef: chefInfo };
}

type PersistedState = Pick<GameState, "version" | "configVersion" | "resources" | "progress">;
export function serializeState(state: GameState): string {
  const payload: PersistedState = { version: 1, configVersion: CONFIG_VERSION, resources: clone(state.resources), progress: clone(state.progress) };
  return JSON.stringify(payload);
}
function rebuiltFromPersisted(value: unknown): GameState {
  const initial = createInitialState();
  if (!value || typeof value !== "object") return initial;
  const data = value as Partial<PersistedState>;
  if (data.configVersion !== CONFIG_VERSION || data.version !== 1) return initial;
  if (data.resources) initial.resources = { ...initial.resources, ...data.resources };
  if (data.progress) initial.progress = { ...initial.progress, ...data.progress, activeDishIds: [...(data.progress.activeDishIds ?? initial.progress.activeDishIds)], publishedDishIds: [...(data.progress.publishedDishIds ?? initial.progress.publishedDishIds)] };
  initial.progress.restaurantLevel = clamp(initial.progress.restaurantLevel, 1, 3) as RestaurantLevel;
  initial.progress.chefLevel = clamp(initial.progress.chefLevel, 1, 3) as ChefLevel;
  resizeRuntime(initial); return initial;
}
export function deserializeState(serialized: string | null | undefined): GameState {
  if (!serialized) return createInitialState();
  try { return rebuiltFromPersisted(JSON.parse(serialized)); } catch { return createInitialState(); }
}
export type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void };
export function saveState(state: GameState, storage?: StorageLike): string {
  const serialized = serializeState(state);
  if (storage) storage.setItem(SAVE_KEY, serialized);
  return serialized;
}
export function loadState(source?: StorageLike | string | PersistedState): GameState {
  if (!source) return createInitialState();
  if (typeof source === "string") return deserializeState(source);
  if (typeof (source as StorageLike).getItem === "function") return deserializeState((source as StorageLike).getItem(SAVE_KEY));
  return rebuiltFromPersisted(source);
}
