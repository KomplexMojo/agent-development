/**
 * [REQ:P5-F02] Coordinator resolve state hands actors dispatch permits in queue order.
 * Verifies that the coordinator iterates the configurator dispatch queue, applies
 * permits, and records outcomes for Commit/telemetry.
 */

import assert from "node:assert/strict";

(async () => {
  const mod = await loadAssemblyModule();
  const configurator = mod.configurator_lifecycle_create();
  const coordinator = mod.coordinator_lifecycle_create();
  const actors = [];

  try {
    mod.configurator_lifecycle_initialize(configurator, 4, 4, 0);

    // Lay down a 3x3 walkable surface so movement intents succeed.
    let surfaceId = 100;
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        mod.configurator_surface_ledger_record(configurator, surfaceId++, x, y, 0);
      }
    }

    // Provision two mobile actors with AIU assignments so the queue generates intents.
    const aiuOne = 7001;
    const aiuTwo = 8001;
    mod.configurator_aiu_register(configurator, aiuOne);
    mod.configurator_aiu_register(configurator, aiuTwo);

    const initialPositions = [];
    for (const { x, y, aiu } of [
      { x: 0, y: 0, aiu: aiuOne },
      { x: 2, y: 1, aiu: aiuTwo },
    ]) {
      const actor = createMobile(mod);
      actors.push(actor);
      mod.configurator_actor_ledger_record(configurator, actor, x, y, 0, 1);
      mod.configurator_actor_assign_aiu(configurator, actor, aiu);
      seedActorPosition(mod, actor, x, y);
      initialPositions.push({ actor, x, y });
    }

    mod.coordinator_lifecycle_initialize(coordinator);
    mod.coordinator_bind_configurator(coordinator, configurator);

    mod.coordinator_lifecycle_process(coordinator);

    const queueHandle = mod.coordinator_get_dispatch_queue_handle(coordinator);
    assert.ok(queueHandle > 0, "schedule should produce a dispatch queue handle");

    const resultCount = mod.coordinator_dispatch_result_count(coordinator);
    const entryCount = mod.configurator_dispatch_get_entry_count(queueHandle);
    assert.equal(resultCount, entryCount, "resolve results should match queue size");
    assert.equal(resultCount, actors.length, "each actor should yield one result");

    const accepted = expectNumber(mod.configurator_dispatch_outcome_accepted, "configurator_dispatch_outcome_accepted");
    const rejectionNone = expectNumber(mod.configurator_dispatch_rejection_none, "configurator_dispatch_rejection_none");

    for (let i = 0; i < resultCount; i++) {
      const actorHandle = expectNumber(
        mod.coordinator_dispatch_result_get_actor(coordinator, i),
        "coordinator_dispatch_result_get_actor",
      );
      const queueActor = expectNumber(
        mod.configurator_dispatch_get_actor_handle(queueHandle, i),
        "configurator_dispatch_get_actor_handle",
      );
      assert.equal(actorHandle, queueActor, "resolve should respect queue ordering");

      const dxQueue = expectNumber(
        mod.configurator_dispatch_get_intent_dx(queueHandle, i),
        "configurator_dispatch_get_intent_dx",
      );
      const dyQueue = expectNumber(
        mod.configurator_dispatch_get_intent_dy(queueHandle, i),
        "configurator_dispatch_get_intent_dy",
      );

      assert.equal(
        mod.coordinator_dispatch_result_get_dx(coordinator, i),
        dxQueue,
        "result dx should mirror queue intent",
      );
      assert.equal(
        mod.coordinator_dispatch_result_get_dy(coordinator, i),
        dyQueue,
        "result dy should mirror queue intent",
      );

      const outcome = mod.coordinator_dispatch_result_get_outcome(coordinator, i);
      const rejection = mod.coordinator_dispatch_result_get_rejection(coordinator, i);
      assert.equal(outcome, accepted, "successful permit should be marked accepted");
      assert.equal(rejection, rejectionNone, "accepted moves should record no rejection reason");

      // Actor coordinates should advance by the applied intent.
      const before = initialPositions.find((p) => p.actor === actorHandle);
      const finalX = mod.actor_observation_get_x(actorHandle);
      const finalY = mod.actor_observation_get_y(actorHandle);
      assert.ok(before, "initial position should be tracked");
      assert.equal(finalX, before.x + dxQueue, "actor X should advance by dx");
      assert.equal(finalY, before.y + dyQueue, "actor Y should advance by dy");
    }

    console.log("[REQ:P5-F02] coordinator resolve tests: ok");
  } finally {
    const queueHandle = mod.coordinator_get_dispatch_queue_handle(coordinator);
    if (queueHandle) {
      try { mod.configurator_dispatch_release(queueHandle); } catch { /* ignore */ }
    }
    mod.coordinator_lifecycle_destroy(coordinator);
    mod.configurator_lifecycle_destroy(configurator);
    for (const actor of actors) {
      try { mod.actor_lifecycle_destroy(actor); } catch { /* ignore */ }
    }
  }
})().catch((err) => {
  console.error("[REQ:P5-F02] coordinator resolve tests: failed", err);
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
