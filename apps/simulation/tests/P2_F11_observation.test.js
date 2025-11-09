/**
 * [REQ:P2-F11] Observation snapshots influence logic-tier intent selection.
 * When an actor observes a nearby blocker, the logic tier should avoid that cell even
 * if the configurator map marks it enterable.
 */

import assert from "node:assert/strict";

(async () => {
  const mod = await loadAssemblyModule();
  const configurator = mod.configurator_lifecycle_create();
  const actorA = createMobile(mod);
  const actorB = createMobile(mod);

  try {
    mod.configurator_lifecycle_initialize(configurator, 3, 3, 0);
    mod.configurator_surface_ledger_record(configurator, 100, 0, 0, 0);
    mod.configurator_surface_ledger_record(configurator, 101, 1, 0, 0);
    mod.configurator_surface_ledger_record(configurator, 102, 0, 1, 0);

    // Only actor A is under configurator control; actor B is an observed neighbour not registered in the ledger.
    mod.configurator_actor_ledger_record(configurator, actorA, 0, 0, 0, 1);
    mod.configurator_actor_assign_aiu(configurator, actorA, 0);
    seedActorPosition(mod, actorA, 0, 0);

    // Position actor B at (1,0) so observation sees a blocker, but configurator map remains enterable.
    mod.configurator_actor_assign_aiu(configurator, actorB, 0);
    seedActorPosition(mod, actorB, 1, 0);

    mod.actor_observation_set_radar_range(actorA, 2);
    mod.actor_observation_set_radar_range(actorB, 2);

    // Advance lifecycle once to register observation records.
    mod.actor_lifecycle_process(actorA);
    mod.actor_lifecycle_process(actorB);

    const queueHandle = mod.configurator_dispatch_process(configurator, 23);
    try {
      assert.equal(mod.configurator_dispatch_get_entry_count(queueHandle), 1, "only actor A should be queued");

      const tierLogic = expectNumber(mod.configurator_dispatch_tier_logic, "configurator_dispatch_tier_logic");
      const tier = mod.configurator_dispatch_get_intent_tier(queueHandle, 0);
      assert.equal(tier, tierLogic, "observation avoidance should still be treated as logic tier");

      const dx = mod.configurator_dispatch_get_intent_dx(queueHandle, 0);
      const dy = mod.configurator_dispatch_get_intent_dy(queueHandle, 0);
      assert.ok(!(dx === 1 && dy === 0), "logic tier should avoid the observed east cell");
    } finally {
      mod.configurator_dispatch_release(queueHandle);
    }

    console.log("[REQ:P2-F11] observation avoidance tests: ok");
  } finally {
    mod.configurator_lifecycle_destroy(configurator);
    mod.actor_lifecycle_destroy(actorA);
    mod.actor_lifecycle_destroy(actorB);
  }
})().catch((err) => {
  console.error("[REQ:P2-F11] observation avoidance tests: failed", err);
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

function seedActorPosition(mod, actorHandle, targetX, targetY) {
  const currentX = mod.actor_observation_get_x(actorHandle);
  const currentY = mod.actor_observation_get_y(actorHandle);
  const dx = targetX - currentX;
  const dy = targetY - currentY;
  if (dx !== 0 || dy !== 0) {
    mod.actor_transition_move_by(actorHandle, dx, dy);
  }
}

function expectNumber(value, label) {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && typeof value.valueOf === "function") {
    const numeric = Number(value.valueOf());
    if (Number.isFinite(numeric)) return numeric;
  }
  throw new TypeError(`${label} should expose a numeric value`);
}
