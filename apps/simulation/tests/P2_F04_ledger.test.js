/**
 * [REQ:P2-F04_2] Surface placement ledger & [REQ:P2-F04_3] Actor placement ledger
 * Goal: The configuration manager records surface and actor placements with provenance
 * and exposes them for audit.
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
    "configurator_surface_ledger_size",
    "configurator_surface_ledger_get_id",
    "configurator_surface_ledger_get_x",
    "configurator_surface_ledger_get_y",
    "configurator_surface_ledger_get_level",
    "configurator_actor_ledger_record",
    "configurator_actor_ledger_size",
    "configurator_actor_ledger_get_handle",
    "configurator_actor_ledger_get_x",
    "configurator_actor_ledger_get_y",
    "configurator_actor_ledger_get_level",
    "configurator_actor_ledger_get_role",
    "configurator_map_is_enterable",
  ];

  for (const name of fns) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  const handle = mod.configurator_lifecycle_create();
  const surfaceIds = [101, 102, 103];
  let actorHandle = 0;
  try {
    mod.configurator_lifecycle_initialize(handle, 1, 1, 0);

    mod.configurator_surface_ledger_record(handle, surfaceIds[0], 0, 0, 0);
    mod.configurator_surface_ledger_record(handle, surfaceIds[1], 1, 0, 0);
    mod.configurator_surface_ledger_record(handle, surfaceIds[2], 1, 1, 0);

    assert.equal(mod.configurator_surface_ledger_size(handle), 3, "ledger should contain three surfaces");
    assert.equal(mod.configurator_surface_ledger_get_id(handle, 1), surfaceIds[1], "id should match insertion order");
    assert.equal(mod.configurator_surface_ledger_get_x(handle, 2), 1, "x should be recorded");
    assert.equal(mod.configurator_surface_ledger_get_y(handle, 2), 1, "y should be recorded");

    // Register a mobile actor as actor and record placement/role
    actorHandle = createMobile(mod);
    mod.configurator_actor_ledger_record(handle, actorHandle, 0, 0, 0, 7);
    assert.equal(mod.configurator_actor_ledger_size(handle), 1, "actor ledger should contain one entry");
    assert.equal(mod.configurator_actor_ledger_get_handle(handle, 0), actorHandle, "actor handle should match");
    assert.equal(mod.configurator_actor_ledger_get_role(handle, 0), 7, "actor role should be recorded");

    assert.equal(mod.configurator_map_is_enterable(handle, 0, 0, 0), 0, "cell with actor should not be enterable");
    assert.equal(mod.configurator_map_is_enterable(handle, 1, 0, 0), 1, "cell without actor should be enterable");
  } finally {
    mod.configurator_lifecycle_destroy(handle);
    if (actorHandle !== 0) {
      try { mod.actor_lifecycle_destroy(actorHandle); } catch { /* ignore */ }
    }
  }

  console.log("[REQ:P2-F04] ledger tests: ok");
})().catch((err) => {
  console.error("[REQ:P2-F04] ledger tests: failed", err);
  process.exit(1);
});

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
