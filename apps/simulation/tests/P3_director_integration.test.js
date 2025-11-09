/**
 * [REQ:P3-F01][REQ:P2-F11] Director-issued movement influences AIU dispatch.
 */

import assert from "node:assert/strict";

(async () => {
  const mod = await loadAssemblyModule();
  const configurator = mod.configurator_lifecycle_create();
  const coordinator = mod.coordinator_lifecycle_create();
  const director = mod.director_lifecycle_create();
  const actor = createMobile(mod);

  try {
    mod.configurator_lifecycle_initialize(configurator, 3, 3, 0);
    mod.configurator_surface_ledger_record(configurator, 100, 0, 0, 0);
    mod.configurator_surface_ledger_record(configurator, 101, 1, 0, 0);

    mod.configurator_actor_ledger_record(configurator, actor, 0, 0, 0, 1);
    mod.configurator_actor_assign_aiu(configurator, actor, 9001);

    mod.coordinator_lifecycle_initialize(coordinator);
    mod.director_lifecycle_initialize(director);
    mod.coordinator_bind_configurator(coordinator, configurator);
    mod.coordinator_bind_director(coordinator, director);

    mod.coordinator_lifecycle_process(coordinator);

    const queueHandle = mod.coordinator_get_dispatch_queue_handle(coordinator);
    assert.ok(queueHandle > 0, "dispatch queue should exist");
    assert.equal(mod.configurator_dispatch_get_entry_count(queueHandle), 1, "only one actor staged");

    const intentDx = mod.configurator_dispatch_get_intent_dx(queueHandle, 0);
    const intentDy = mod.configurator_dispatch_get_intent_dy(queueHandle, 0);
    assert.ok(Math.abs(intentDx) + Math.abs(intentDy) > 0, "director vector should yield movement");

    const outcomeAccepted = expectNumber(mod.configurator_dispatch_outcome_accepted, "configurator_dispatch_outcome_accepted");
    assert.equal(mod.configurator_dispatch_get_history_outcome(queueHandle, 0, 0), outcomeAccepted);

    console.log("[REQ:P3-F01][REQ:P2-F11] director integration tests: ok");
  } finally {
    const queueHandle = mod.coordinator_get_dispatch_queue_handle(coordinator);
    if (queueHandle) {
      try { mod.configurator_dispatch_release(queueHandle); } catch { /* ignore */ }
    }
    mod.coordinator_lifecycle_destroy(coordinator);
    mod.director_lifecycle_destroy(director);
    mod.configurator_lifecycle_destroy(configurator);
    mod.actor_lifecycle_destroy(actor);
  }
})().catch((err) => {
  console.error("[REQ:P3-F01][REQ:P2-F11] director integration tests: failed", err);
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
