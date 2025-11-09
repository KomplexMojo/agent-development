/**
 * [REQ:P5-F03] Coordinator commit stage records dispatch outcomes and telemetry.
 * Ensures coordinators push queue outcomes into configurator history and produce
 * a human-readable summary for moderator logging.
 */

import assert from "node:assert/strict";

(async () => {
  const mod = await loadAssemblyModule();
  const configurator = mod.configurator_lifecycle_create();
  const coordinator = mod.coordinator_lifecycle_create();
  const actor = createMobile(mod);

  try {
    mod.configurator_lifecycle_initialize(configurator, 3, 3, 0);
    mod.configurator_surface_ledger_record(configurator, 100, 0, 0, 0);
    mod.configurator_surface_ledger_record(configurator, 101, 1, 0, 0);

    mod.configurator_aiu_register(configurator, 9001);
    mod.configurator_actor_ledger_record(configurator, actor, 0, 0, 0, 1);
    mod.configurator_actor_assign_aiu(configurator, actor, 9001);
    seedActorPosition(mod, actor, 0, 0);

    mod.coordinator_lifecycle_initialize(coordinator);
    mod.coordinator_bind_configurator(coordinator, configurator);

    mod.coordinator_lifecycle_process(coordinator);

    const queueHandle = mod.coordinator_get_dispatch_queue_handle(coordinator);
    assert.ok(queueHandle > 0, "queue handle should be present after schedule");

    // Commit telemetry should mention the actor outcome and rejection code.
    const summaryCount = mod.coordinator_dispatch_result_count(coordinator);
    assert.equal(summaryCount, 1, "exactly one dispatch result should exist");

    const acceptedConst = expectNumber(mod.configurator_dispatch_outcome_accepted, "configurator_dispatch_outcome_accepted");
    const rejectionNoneConst = expectNumber(mod.configurator_dispatch_rejection_none, "configurator_dispatch_rejection_none");

    const tierHistory = mod.configurator_dispatch_get_history_tier(queueHandle, 0, 0);
    assert.ok(tierHistory > 0, "history tier should be recorded");

    const outcomeHistory = mod.configurator_dispatch_get_history_outcome(queueHandle, 0, 0);
    assert.equal(outcomeHistory, acceptedConst, "history should show accepted outcome");

    const rejectionHistory = mod.configurator_dispatch_get_history_reason(queueHandle, 0, 0);
    assert.equal(rejectionHistory, rejectionNoneConst, "accepted move should have none rejection");

    const summaryLines = collectSummaries(mod, coordinator);
    assert.ok(summaryLines.length > 0, "commit should produce telemetry summaries");
    assert.ok(summaryLines.some((line) => line.includes(`actor=${actor}`)), "summary should mention actor outcomes");
    console.log("[REQ:P5-F03] coordinator commit tests: ok");
  } finally {
    const queueHandle = mod.coordinator_get_dispatch_queue_handle(coordinator);
    if (queueHandle) {
      try { mod.configurator_dispatch_release(queueHandle); } catch { /* ignore */ }
    }
    mod.coordinator_lifecycle_destroy(coordinator);
    mod.configurator_lifecycle_destroy(configurator);
    mod.actor_lifecycle_destroy(actor);
  }
})().catch((err) => {
  console.error("[REQ:P5-F03] coordinator commit tests: failed", err);
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

function collectSummaries(mod, coordinatorHandle) {
  const summaries = [];
  const count = mod.coordinator_summary_count(coordinatorHandle);
  for (let i = 0; i < count; i++) {
    summaries.push(mod.coordinator_summary_get(coordinatorHandle, i));
  }
  return summaries;
}

function expectNumber(value, label) {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && typeof value.valueOf === "function") {
    const numeric = Number(value.valueOf());
    if (Number.isFinite(numeric)) return numeric;
  }
  throw new TypeError(`${label} should expose a numeric value`);
}
