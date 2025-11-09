/**
 * [REQ:P2-F11] Fallback logic tier produces deterministic intents when evaluation/AIU are unavailable.
 */

import assert from "node:assert/strict";

(async () => {
  const mod = await loadAssemblyModule();
  const configurator = mod.configurator_lifecycle_create();
  const actor = createMobile(mod);

  try {
    mod.configurator_lifecycle_initialize(configurator, 3, 3, 0);

    // Only east (1,0) surface exists so fallback must pick it.
    mod.configurator_surface_ledger_record(configurator, 100, 0, 0, 0);
    mod.configurator_surface_ledger_record(configurator, 101, 1, 0, 0);

    mod.configurator_actor_ledger_record(configurator, actor, 0, 0, 0, 1);
    mod.configurator_actor_assign_aiu(configurator, actor, 0);
    seedActorPosition(mod, actor, 0, 0);

    const queueHandle = mod.configurator_dispatch_process(configurator, 17);
    try {
      const count = mod.configurator_dispatch_get_entry_count(queueHandle);
      assert.equal(count, 1, "queue should contain the fallback actor");

      const tier = mod.configurator_dispatch_get_intent_tier(queueHandle, 0);
      const logicTier = expectNumber(mod.configurator_dispatch_tier_logic, "configurator_dispatch_tier_logic");
      assert.equal(tier, logicTier, "fallback intent should be marked as logic tier");

      assert.equal(mod.configurator_dispatch_get_intent_dx(queueHandle, 0), 1, "dx should move east toward available surface");
      assert.equal(mod.configurator_dispatch_get_intent_dy(queueHandle, 0), 0, "dy should remain 0");
    } finally {
      mod.configurator_dispatch_release(queueHandle);
    }

    console.log("[REQ:P2-F11] fallback logic tests: ok");
  } finally {
    mod.configurator_lifecycle_destroy(configurator);
    mod.actor_lifecycle_destroy(actor);
  }
})().catch((err) => {
  console.error("[REQ:P2-F11] fallback logic tests: failed", err);
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
