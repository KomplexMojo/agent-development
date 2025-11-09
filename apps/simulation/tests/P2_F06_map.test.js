/**
 * [REQ:P2-F06] Level map assembly + layered occupancy helpers.
 * Covers P2-F06_1 (layered model) and P2-F06_2 (enterability checks).
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
    "configurator_map_set_feature",
    "configurator_map_clear_feature",
  "configurator_map_set_actor",
  "configurator_map_clear_actor",
  "configurator_map_is_enterable",
  "configurator_actor_ledger_record",
  "configurator_actor_ledger_get_role",
  "configurator_actor_role_mobile",
  "configurator_actor_role_barrier",
  "configurator_map_set_portal",
  "configurator_map_get_portal",
  "configurator_map_clear_portal",
  "configurator_map_set_stair",
  "configurator_map_get_stair",
  "configurator_map_clear_stair",
];

  for (const name of fns) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  const handle = mod.configurator_lifecycle_create();
  const actor = createMobile(mod);
  let barrierHandle = 0;
  try {
    mod.configurator_lifecycle_initialize(handle, 2, 2, 0);

    // Register surfaces so the map has a substrate.
    mod.configurator_surface_ledger_record(handle, 1, 0, 0, 0);
    mod.configurator_surface_ledger_record(handle, 2, 1, 0, 0);
    mod.configurator_surface_ledger_record(handle, 3, 0, 1, 0);

    assert.equal(mod.configurator_map_is_enterable(handle, 0, 0, 0), 1, "surface with no feature/actor should be enterable");

    mod.configurator_map_set_feature(handle, 0, 0, 0, 50, 1);
    assert.equal(mod.configurator_map_is_enterable(handle, 0, 0, 0), 0, "blocking feature should prevent entry");

    mod.configurator_map_clear_feature(handle, 0, 0, 0);
    assert.equal(mod.configurator_map_is_enterable(handle, 0, 0, 0), 1, "clearing feature restores enterability");

    const roleMobile = expectNumber(mod.configurator_actor_role_mobile(), "configurator_actor_role_mobile");
    const roleBarrier = expectNumber(mod.configurator_actor_role_barrier(), "configurator_actor_role_barrier");

    assert.equal(mod.configurator_map_set_actor(handle, actor, 0, 0, 0), 1, "actor should be placed on surface");
    assert.equal(mod.configurator_map_is_enterable(handle, 0, 0, 0), 0, "actor occupancy should block entry");

    mod.configurator_map_clear_actor(handle, 0, 0, 0);
    assert.equal(mod.configurator_map_is_enterable(handle, 0, 0, 0), 1, "clearing actor restores enterability");

    assert.equal(mod.configurator_map_set_actor(handle, actor, 1, 0, 0), 1, "actor can move to another surface");
    assert.equal(mod.configurator_map_is_enterable(handle, 1, 0, 0), 0, "new location becomes blocked by actor");

    barrierHandle = createBarrier(mod);
    assert.equal(
      mod.configurator_actor_ledger_record(handle, barrierHandle, 0, 1, 0, roleBarrier),
      1,
      "barrier should be recorded in the ledger",
    );
    assert.equal(
      mod.configurator_actor_ledger_get_role(handle, 0),
      roleBarrier,
      "ledger should expose barrier role flag",
    );
    assert.equal(
      mod.configurator_map_is_enterable(handle, 0, 1, 0),
      0,
      "barrier placement should block enterability",
    );

    assert.equal(
      mod.configurator_map_set_portal(handle, 0, 0, 0, 1),
      1,
      "setting entrance portal on surface should succeed",
    );
    assert.equal(
      mod.configurator_map_get_portal(handle, 0, 0, 0),
      1,
      "portal query should return entrance flag",
    );
    mod.configurator_map_clear_portal(handle, 0, 0, 0);
    assert.equal(
      mod.configurator_map_get_portal(handle, 0, 0, 0),
      0,
      "clearing portal resets the marker",
    );
    assert.equal(
      mod.configurator_map_set_portal(handle, 1, 1, 0, 2),
      0,
      "setting portal on non-surface cell should fail",
    );

    assert.equal(
      mod.configurator_map_set_stair(handle, 0, 0, 0, 1),
      1,
      "setting up-level stair on surface should succeed",
    );
    assert.equal(
      mod.configurator_map_get_stair(handle, 0, 0, 0),
      1,
      "stair query should return up-level flag",
    );
    mod.configurator_map_clear_stair(handle, 0, 0, 0);
    assert.equal(
      mod.configurator_map_get_stair(handle, 0, 0, 0),
      0,
      "clearing stair resets the marker",
    );
    assert.equal(
      mod.configurator_map_set_stair(handle, 1, 1, 0, 2),
      0,
      "setting stair on non-surface cell should fail",
    );

    console.log("[REQ:P2-F06] level map tests: ok");
  } finally {
    mod.configurator_lifecycle_destroy(handle);
    mod.actor_lifecycle_destroy(actor);
    if (barrierHandle !== 0) mod.actor_lifecycle_destroy(barrierHandle);
  }
})();

function createMobile(mod) {
  const archetype = expectNumber(mod.actor_archetype_mobile, "actor_archetype_mobile");
  const handle = mod.actor_lifecycle_create(archetype);
  mod.actor_lifecycle_init(handle);
  return handle;
}

function createBarrier(mod) {
  const archetype = expectNumber(mod.actor_archetype_static_tile, "actor_archetype_static_tile");
  const handle = mod.actor_lifecycle_create(archetype, false);
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
