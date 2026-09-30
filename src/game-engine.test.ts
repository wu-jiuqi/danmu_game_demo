import { describe, expect, it } from "vitest";
import {
  createInitialState,
  dispatch,
  serializeState,
  deserializeState,
  tick,
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
});
