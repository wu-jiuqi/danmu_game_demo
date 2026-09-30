/**
 * Static balance/configuration for the Bawei Restaurant H5 demo.
 *
 * This module deliberately contains no gameplay logic.  The engine consumes
 * these values when creating guests, assigning orders, resolving upgrades and
 * applying gifts so that the frozen demo numbers live in one place.
 */

export type ResourceBag = {
  cash: number;
  red: number;
  green: number;
  blue: number;
  badges: number;
};

export type RestaurantLevel = 1 | 2 | 3;
export type ChefLevel = 1 | 2 | 3;

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

export type ChefConfig = {
  level: ChefLevel;
  maxTier: 1 | 2 | 3;
  speed: number;
  restaurant: RestaurantLevel;
  upgrade: Partial<ResourceBag>;
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
  /** Probability of one random material drop on checkout. */
  materialDropRate: number;
  /** Probability of one badge-fragment drop on checkout. */
  badgeDropRate: number;
};

export type GiftConfig = {
  redWand: {
    reductionRatio: number;
    maxUses: number;
    minRemainingRatio: number;
  };
  energyPill: {
    pityDraws: number;
    materialAmount: number;
    cashAmount: number;
  };
  magicMirror: {
    maxLayers: number;
    durationSeconds: number;
    trafficMultipliers: readonly number[];
    highTierWeightMultiplierPerLayer: number;
  };
  donut: {
    durationPerGiftSeconds: number;
    maxStoredSeconds: number;
  };
  bomb: {
    cooldownSeconds: number;
    minimumCapacity: number;
    baseGuests: number;
    highTierRatio: number;
  };
};

export type PillReward = {
  id: "red" | "green" | "blue" | "badges" | "dish" | "cash";
  probability: number;
  amount?: number;
};

export const CONFIG_VERSION = "h5-v1";
export const SAVE_KEY = "bawei-restaurant-save-v1";

export const RESTAURANTS: readonly RestaurantConfig[] = [
  { level: 1, seats: 3, queue: 5, stoves: 1, dishSlots: 3, guestsPerMinute: 2 },
  { level: 2, seats: 4, queue: 6, stoves: 2, dishSlots: 5, guestsPerMinute: 2.4, upgrade: { cash: 300, badges: 2 } },
  { level: 3, seats: 5, queue: 8, stoves: 3, dishSlots: 7, guestsPerMinute: 2.8, upgrade: { cash: 900, badges: 6 } },
];

export const CHEFS: readonly ChefConfig[] = [
  { level: 1, maxTier: 1, speed: 1, restaurant: 1, upgrade: {} },
  { level: 2, maxTier: 2, speed: 1.25, restaurant: 2, upgrade: { cash: 200 } },
  { level: 3, maxTier: 3, speed: 1.5, restaurant: 3, upgrade: { cash: 600 } },
];

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
  { kind: "student", name: "放学学生", tier: 1, patience: 45, readyWait: 10, premium: 1, preferredTiers: [1], weights: { 1: 55, 2: 35, 3: 25 }, materialDropRate: 0.6, badgeDropRate: 0.08 },
  { kind: "worker", name: "工地工人", tier: 1, patience: 50, readyWait: 12, premium: 1, preferredTiers: [1], weights: { 1: 45, 2: 30, 3: 20 }, materialDropRate: 0.65, badgeDropRate: 0.1 },
  { kind: "office", name: "赶时间上班族", tier: 2, patience: 40, readyWait: 10, premium: 1, preferredTiers: [1, 2], weights: { 2: 25, 3: 22 }, materialDropRate: 0.7, badgeDropRate: 0.12 },
  { kind: "blogger", name: "探店博主", tier: 2, patience: 35, readyWait: 8, premium: 1.2, preferredTiers: [2, 1], weights: { 2: 10, 3: 13 }, materialDropRate: 0.75, badgeDropRate: 0.14 },
  { kind: "owner", name: "小企业主", tier: 3, patience: 30, readyWait: 10, premium: 1.25, preferredTiers: [3, 2], weights: { 3: 13 }, materialDropRate: 0.8, badgeDropRate: 0.18 },
  { kind: "critic", name: "美食评论家", tier: 3, patience: 25, readyWait: 8, premium: 1.4, preferredTiers: [3, 2], weights: { 3: 7 }, materialDropRate: 0.85, badgeDropRate: 0.22 },
];

export const GIFT_CONFIG: GiftConfig = {
  redWand: { reductionRatio: 0.2, maxUses: 4, minRemainingRatio: 0.2 },
  energyPill: { pityDraws: 10, materialAmount: 2, cashAmount: 50 },
  magicMirror: {
    maxLayers: 3,
    durationSeconds: 30,
    trafficMultipliers: [1, 1.5, 2, 2.5],
    highTierWeightMultiplierPerLayer: 1.5,
  },
  donut: { durationPerGiftSeconds: 60, maxStoredSeconds: 180 },
  bomb: { cooldownSeconds: 20, minimumCapacity: 3, baseGuests: 3, highTierRatio: 0.3 },
};

export const PILL_REWARDS: readonly PillReward[] = [
  { id: "red", probability: 0.23, amount: 2 },
  { id: "green", probability: 0.23, amount: 2 },
  { id: "blue", probability: 0.23, amount: 2 },
  { id: "badges", probability: 0.12, amount: 1 },
  { id: "dish", probability: 0.08 },
  { id: "cash", probability: 0.11, amount: 50 },
];

