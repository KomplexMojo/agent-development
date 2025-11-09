/**
 * [REQ:P1-F04_4] Coordinator resolve prevents ambulatory actors from overlapping.
 *
 * Reproduces a collision scenario observed in telemetry where multiple actors
 * attempt to enter the same tile during a single resolve pass. The coordinator
 * must ensure only one actor occupies the destination while subsequent movers
 * receive a rejection.
 */

import assert from "node:assert/strict";

(async () => {
  let mod;
  try {
    mod = await import("../build/release.js");
  } catch {
    mod = await import("../build/debug.js");
  }

  const configurator = mod.configurator_lifecycle_create();
  const coordinator = mod.coordinator_lifecycle_create();
  const actors = [];

  try {
    mod.configurator_lifecycle_initialize(configurator, 4, 4, 0);

    // Populate a 3x3 walkable area centered on the collision site.
    let surfaceId = 100;
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        mod.configurator_surface_ledger_record(configurator, surfaceId++, x, y, 0);
      }
    }

    const roleMobile = expectNumber(mod.configurator_actor_role_mobile(), "configurator_actor_role_mobile");

    const actorA = createMobile(mod);
    const actorB = createMobile(mod);
    actors.push(actorA, actorB);

    // Position the actors so they converge on the same destination (1,1).
    mod.configurator_actor_ledger_record(configurator, actorA, 0, 1, 0, roleMobile);
    mod.configurator_actor_ledger_record(configurator, actorB, 2, 1, 0, roleMobile);
    seedActorPosition(mod, actorA, 0, 1);
    seedActorPosition(mod, actorB, 2, 1);

    // Direct both actors to step into the shared tile on the upcoming tick.
    const tickSeed = 1;
    mod.configurator_director_set_movement(configurator, actorA, 1, 0, tickSeed);
    mod.configurator_director_set_movement(configurator, actorB, -1, 0, tickSeed);

    mod.coordinator_lifecycle_initialize(coordinator);
    mod.coordinator_bind_configurator(coordinator, configurator);
    mod.coordinator_lifecycle_process(coordinator);

    const queueHandle = mod.coordinator_get_dispatch_queue_handle(coordinator);
    assert.ok(queueHandle > 0, "schedule should expose a dispatch queue");

    const resultCount = mod.coordinator_dispatch_result_count(coordinator);
    assert.equal(resultCount, 2, "both actors should produce resolve results");

    const outcomeAccepted = expectNumber(mod.configurator_dispatch_outcome_accepted, "configurator_dispatch_outcome_accepted");
    const outcomeRejected = expectNumber(mod.configurator_dispatch_outcome_rejected, "configurator_dispatch_outcome_rejected");
    const rejectionBlocked = expectNumber(mod.configurator_dispatch_rejection_blocked, "configurator_dispatch_rejection_blocked");

    let rejectedCount = 0;
    const occupied = new Set();

    for (let i = 0; i < resultCount; i++) {
      const actorHandle = mod.coordinator_dispatch_result_get_actor(coordinator, i);
      const outcome = mod.coordinator_dispatch_result_get_outcome(coordinator, i);
      const rejection = mod.coordinator_dispatch_result_get_rejection(coordinator, i);
      const finalX = mod.actor_observation_get_x(actorHandle);
      const finalY = mod.actor_observation_get_y(actorHandle);
      const key = `${finalX},${finalY}`;

      assert.equal(occupied.has(key), false, "resolved actors should finish on unique tiles");
      occupied.add(key);

      if (outcome !== outcomeAccepted) {
        rejectedCount += 1;
        assert.equal(outcome, outcomeRejected, "conflicting movement should be rejected");
        assert.equal(rejection, rejectionBlocked, "collision rejection should flag the tile as blocked");
      }
    }

    assert.equal(rejectedCount, 1, "exactly one actor should be rejected for a shared destination");
    console.log("[REQ:P1-F04_4] collision-free resolve tests: ok");
  } finally {
    const queueHandle = mod.coordinator_get_dispatch_queue_handle(coordinator);
    if (queueHandle) {
      try {
        mod.configurator_dispatch_release(queueHandle);
      } catch {
        // ignore cleanup failure
      }
    }
    mod.coordinator_lifecycle_destroy(coordinator);
    mod.configurator_lifecycle_destroy(configurator);
    for (const actor of actors) {
      try {
        mod.actor_lifecycle_destroy(actor);
      } catch {
        // ignore cleanup failure
      }
    }
  }
})().catch((err) => {
  console.error("[REQ:P1-F04_4] collision-free resolve tests: failed", err);
  process.exit(1);
});

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
