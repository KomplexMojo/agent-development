/**
 * [REQ:P2-F11] Logic tier should consume actor evaluation data before falling back to instinct.
 */

import assert from "node:assert/strict";

(async () => {
  const mod = await loadAssemblyModule();
  const configurator = mod.configurator_lifecycle_create();
  const actor = createMobile(mod);

  try {
    mod.configurator_lifecycle_initialize(configurator, 3, 3, 0);
    // Establish walkable surfaces for source and target cells.
    mod.configurator_surface_ledger_record(configurator, 101, 0, 0, 0);
    mod.configurator_surface_ledger_record(configurator, 102, 1, 0, 0);

    // Place actor without an AIU so the logic tier must supply an intent.
    mod.configurator_actor_ledger_record(configurator, actor, 0, 0, 0, 1);
    mod.configurator_actor_assign_aiu(configurator, actor, 0);
    seedActorPosition(mod, actor, 0, 0);

    const queueHandle = mod.configurator_dispatch_process(configurator, 11);
    try {
      const count = mod.configurator_dispatch_get_entry_count(queueHandle);
      assert.equal(count, 1, "queue should include the evaluation-driven actor");

      const tier = mod.configurator_dispatch_get_intent_tier(queueHandle, 0);
      const logicTier = expectNumber(mod.configurator_dispatch_tier_logic, "configurator_dispatch_tier_logic");
      assert.equal(
        tier,
        logicTier,
        "logic tier should service evaluation-driven intents",
      );

      assert.equal(mod.configurator_dispatch_get_intent_dx(queueHandle, 0), 1, "logic dx should use evaluation move");
      assert.equal(mod.configurator_dispatch_get_intent_dy(queueHandle, 0), 0, "logic dy should use evaluation move");
    } finally {
      mod.configurator_dispatch_release(queueHandle);
    }

    console.log("[REQ:P2-F11] logic tier evaluation tests: ok");
  } finally {
    mod.configurator_lifecycle_destroy(configurator);
    mod.actor_lifecycle_destroy(actor);
  }
})().catch((err) => {
  console.error("[REQ:P2-F11] logic tier evaluation tests: failed", err);
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
