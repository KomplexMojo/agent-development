/**
 * [REQ:P2-F07] Solver verification
 * Covers substrate-only connectivity behaviour (P2-F07_2).
 */

import assert from "node:assert/strict";

(async () => {
  let mod;
  try {
    mod = await import("../build/release.js");
  } catch {
    mod = await import("../build/debug.js");
  }

  const fns = [
    "configurator_lifecycle_create",
    "configurator_lifecycle_destroy",
    "configurator_lifecycle_initialize",
    "configurator_surface_ledger_record",
    "configurator_map_set_actor",
    "configurator_map_clear_actor",
    "configurator_solver_verify",
    "configurator_map_is_enterable",
  ];

  for (const name of fns) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  const handle = mod.configurator_lifecycle_create();
  const actor = createMobile(mod);
  try {
    mod.configurator_lifecycle_initialize(handle, 2, 2, 0);

    // Build a simple L shaped corridor of surfaces.
    mod.configurator_surface_ledger_record(handle, 1, 0, 0, 0);
    mod.configurator_surface_ledger_record(handle, 2, 1, 0, 0);
    mod.configurator_surface_ledger_record(handle, 3, 1, 1, 0);

    assert.equal(mod.configurator_solver_verify(handle, 0, 0, 1, 1, 0), 1, "surface path should be passable");

    // Place an actor on the path; solver should ignore it.
    mod.configurator_map_set_actor(handle, actor, 1, 0, 0);
    assert.equal(mod.configurator_solver_verify(handle, 0, 0, 1, 1, 0), 1, "solver should ignore actors when validating surfaces");

    // Reset context to simulate a missing substrate and confirm solver fails.
    mod.configurator_lifecycle_initialize(handle, 2, 2, 0);
    mod.configurator_surface_ledger_record(handle, 10, 0, 0, 0);
    // Missing intermediate surface prevents connectivity to (1,1).
    assert.equal(mod.configurator_solver_verify(handle, 0, 0, 1, 1, 0), 0, "solver should fail without continuous surfaces");

    console.log("[REQ:P2-F07] solver tests: ok");
  } finally {
    mod.configurator_lifecycle_destroy(handle);
    mod.actor_lifecycle_destroy(actor);
  }
})();

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
