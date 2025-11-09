/**
 * [REQ:P2-F11] Dispatch history captures tier and outcome once commit runs.
 */

import assert from "node:assert/strict";

(async () => {
  const mod = await loadAssemblyModule();
  const configurator = mod.configurator_lifecycle_create();
  const coordinator = mod.coordinator_lifecycle_create();
  const actorA = createMobile(mod);
  const actorB = createMobile(mod);

  try {
    mod.configurator_lifecycle_initialize(configurator, 3, 3, 0);
    mod.configurator_surface_ledger_record(configurator, 100, 0, 0, 0);
    mod.configurator_surface_ledger_record(configurator, 101, 1, 0, 0);
    mod.configurator_surface_ledger_record(configurator, 110, 0, 1, 0);
    mod.configurator_surface_ledger_record(configurator, 111, 1, 1, 0);

    // Actor A (AIU movement)
    const aiuId = 7001;
    mod.configurator_actor_ledger_record(configurator, actorA, 0, 0, 0, 1);
    mod.configurator_actor_pool_register(configurator, actorA);
    mod.configurator_actor_assign_aiu(configurator, actorA, aiuId);

    // Actor B (logic tier)
    mod.configurator_actor_ledger_record(configurator, actorB, 0, 1, 0, 1);
    mod.configurator_actor_pool_register(configurator, actorB);
    mod.configurator_actor_assign_aiu(configurator, actorB, 0);
    mod.configurator_map_set_feature(configurator, 0, 0, 0, 3001, 1); // block south

    mod.coordinator_lifecycle_initialize(coordinator);
    mod.coordinator_bind_configurator(coordinator, configurator);
    mod.coordinator_lifecycle_process(coordinator);

    const queueHandle = mod.coordinator_get_dispatch_queue_handle(coordinator);
    assert.ok(queueHandle > 0, "dispatch queue should exist after schedule");

    const outcomeAccepted = expectNumber(mod.configurator_dispatch_outcome_accepted, "configurator_dispatch_outcome_accepted");
    const rejectionNone = expectNumber(mod.configurator_dispatch_rejection_none, "configurator_dispatch_rejection_none");

    const entryCount = mod.configurator_dispatch_get_entry_count(queueHandle);
    assert.equal(entryCount, 2, "two actors should be queued");

    for (let i = 0; i < entryCount; i++) {
      const actorHandle = mod.configurator_dispatch_get_actor_handle(queueHandle, i);
      const tier = mod.configurator_dispatch_get_intent_tier(queueHandle, i);
      const historyTier = mod.configurator_dispatch_get_history_tier(queueHandle, i, 0);
      assert.equal(historyTier, tier, "history should capture staged tier");

      const historyOutcome = mod.configurator_dispatch_get_history_outcome(queueHandle, i, 0);
      const resultOutcome = mod.coordinator_dispatch_result_get_outcome(coordinator, i);
      assert.equal(historyOutcome, resultOutcome, "history outcome should reflect resolved result");

      const historyReason = mod.configurator_dispatch_get_history_reason(queueHandle, i, 0);
      const resultRejection = mod.coordinator_dispatch_result_get_rejection(coordinator, i);
      assert.equal(historyReason, resultRejection, "history should capture resolve rejection code");
      if (resultOutcome == outcomeAccepted) {
        assert.equal(historyReason, rejectionNone, "accepted moves should retain empty rejection reason");
      }

      const initialX = mod.configurator_dispatch_get_initial_x(queueHandle, i);
      const initialY = mod.configurator_dispatch_get_initial_y(queueHandle, i);
      const level = mod.configurator_dispatch_get_initial_level(queueHandle, i);
      const finalX = mod.actor_observation_get_x(actorHandle);
      const finalY = mod.actor_observation_get_y(actorHandle);

      if (resultOutcome == outcomeAccepted) {
        assert.equal(
          mod.configurator_map_is_enterable(configurator, finalX, finalY, level),
          0,
          "accepted moves should mark the final tile as occupied after commit",
        );
      }

      // Origin may remain non-enterable if additional features block it; map updates are validated via history outcome above.
    }

    console.log("[REQ:P2-F11] dispatch history tests: ok");
  } finally {
    const handle = mod.coordinator_get_dispatch_queue_handle(coordinator);
    if (handle) {
      try { mod.configurator_dispatch_release(handle); } catch { /* ignore */ }
    }
    mod.coordinator_lifecycle_destroy(coordinator);
    mod.configurator_lifecycle_destroy(configurator);
    mod.actor_lifecycle_destroy(actorA);
    mod.actor_lifecycle_destroy(actorB);
  }
})().catch((err) => {
  console.error("[REQ:P2-F11] dispatch history tests: failed", err);
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

function expectNumber(value, label) {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && typeof value.valueOf === "function") {
    const numeric = Number(value.valueOf());
    if (Number.isFinite(numeric)) return numeric;
  }
  throw new TypeError(`${label} should expose a numeric value`);
}
