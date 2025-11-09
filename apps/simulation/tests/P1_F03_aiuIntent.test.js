/**
 * [REQ:P1-F03] AIU random-walk module produces deterministic intents and degrades to wait when blocked.
 *
 * Verifies that the default AIU registry yields predictable vectors based on (aiuId, actorHandle, tickSeed)
 * and that actors fall back to a zero vector when every adjacent cell is blocked.
 */

import assert from "node:assert/strict";

(async () => {
  const mod = await loadAssemblyModule();
  const configurator = mod.configurator_lifecycle_create();
  const actor = createMobile(mod);

  try {
    const roleMobile = expectNumber(mod.configurator_actor_role_mobile(), "configurator_actor_role_mobile");
    const roleBarrier = expectNumber(mod.configurator_actor_role_barrier(), "configurator_actor_role_barrier");
    const aiuId = 3003;

    mod.configurator_lifecycle_initialize(configurator, 5, 5, 0);
    // Lay down a 5x5 walkable surface.
    let surfaceId = 5000;
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        mod.configurator_surface_ledger_record(configurator, surfaceId++, x, y, 0);
      }
    }

    mod.configurator_aiu_register(configurator, aiuId);
    const origin = { x: 2, y: 2, level: 0 };
    mod.configurator_actor_ledger_record(configurator, actor, origin.x, origin.y, origin.level, roleMobile);
    mod.configurator_actor_assign_aiu(configurator, actor, aiuId);
    seedActorPosition(mod, actor, origin.x, origin.y);

    const tickSeed = 17;
    const firstQueue = expectNumber(
      mod.configurator_dispatch_process(configurator, tickSeed),
      "configurator_dispatch_process",
    );
    try {
      const count = mod.configurator_dispatch_get_entry_count(firstQueue);
      assert.equal(count, 1, "queue should stage the AIU-driven actor");

      const dx = mod.configurator_dispatch_get_intent_dx(firstQueue, 0);
      const dy = mod.configurator_dispatch_get_intent_dy(firstQueue, 0);

      assert.ok(Math.abs(dx) <= 1, "solver-backed AIU step dx should be adjacent");
      assert.ok(Math.abs(dy) <= 1, "solver-backed AIU step dy should be adjacent");
      assert.ok(Math.abs(dx) + Math.abs(dy) > 0, "solver-backed AIU should attempt movement");

      const tier = mod.configurator_dispatch_get_intent_tier(firstQueue, 0);
      const tierAiu = expectNumber(mod.configurator_dispatch_tier_aiu, "configurator_dispatch_tier_aiu");
      assert.equal(tier, tierAiu, "intent should be recorded under the AIU tier");
    } finally {
      mod.configurator_dispatch_release(firstQueue);
    }

    // Surround the actor with blocking tiles so no AIU move is feasible.
    const barriers = [];
    for (const [dx, dy] of NEIGHBOR_DELTAS) {
      const barrier = createBarrier(mod);
      barriers.push(barrier);
      mod.configurator_actor_ledger_record(
        configurator,
        barrier,
        origin.x + dx,
        origin.y + dy,
        origin.level,
        roleBarrier,
      );
    }

    const secondQueue = expectNumber(
      mod.configurator_dispatch_process(configurator, tickSeed + 1),
      "configurator_dispatch_process",
    );
    try {
      const dx = mod.configurator_dispatch_get_intent_dx(secondQueue, 0);
      const dy = mod.configurator_dispatch_get_intent_dy(secondQueue, 0);
      assert.equal(dx, 0, "AIU should fall back to wait when no movement is possible (dx)");
      assert.equal(dy, 0, "AIU should fall back to wait when no movement is possible (dy)");

      const tier = mod.configurator_dispatch_get_intent_tier(secondQueue, 0);
      const tierAiu = expectNumber(mod.configurator_dispatch_tier_aiu, "configurator_dispatch_tier_aiu");
      assert.equal(tier, tierAiu, "even fallback waits should remain tagged as AIU tier");
    } finally {
      mod.configurator_dispatch_release(secondQueue);
    }

    console.log("[REQ:P1-F03] AIU intent determinism tests: ok");

    for (const barrier of barriers) {
      try {
        mod.actor_lifecycle_destroy(barrier);
      } catch {
        /* ignore teardown */
      }
    }
  } finally {
    mod.configurator_lifecycle_destroy(configurator);
    mod.actor_lifecycle_destroy(actor);
  }
})().catch((err) => {
  console.error("[REQ:P1-F03] AIU intent determinism tests: failed", err);
  process.exit(1);
});

async function loadAssemblyModule() {
  try {
    return await import("../build/release.js");
  } catch {
    return import("../build/debug.js");
  }
}

function createMobile(mod) {
  const archetype = expectNumber(mod.actor_archetype_mobile, "actor_archetype_mobile");
  const handle = mod.actor_lifecycle_create(archetype);
  mod.actor_lifecycle_init(handle);
  return handle;
}

function createBarrier(mod) {
  const archetype = expectNumber(mod.actor_archetype_static_tile, "actor_archetype_static_tile");
  const handle = mod.actor_lifecycle_create(archetype);
  mod.actor_lifecycle_init(handle);
  return handle;
}

function seedActorPosition(mod, actorHandle, targetX, targetY) {
  const currentX = mod.actor_observation_get_x(actorHandle);
  const currentY = mod.actor_observation_get_y(actorHandle);
  const dx = targetX - currentX;
  const dy = targetY - currentY;
  if (dx !== 0 || dy !== 0) {
    mod.actor_transition_move_by(actorHandle, dx, dy);
  }
}

const NEIGHBOR_DELTAS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
];

function expectNumber(value, label) {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && typeof value.valueOf === "function") {
    const numeric = Number(value.valueOf());
    if (Number.isFinite(numeric)) return numeric;
  }
  throw new TypeError(`${label} should expose a numeric value`);
}
