/**
 * [REQ:P2-F10] Actor pooling (dynamic actors)
 * Covers borrow/return lifecycle and placement rules (P2-F10_1..3).
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
    "configurator_actor_pool_register",
    "configurator_actor_pool_borrow",
    "configurator_actor_pool_return",
    "configurator_actor_pool_available_count",
    "configurator_actor_pool_borrowed_count",
    "configurator_map_set_actor",
    "configurator_map_clear_actor",
    "configurator_map_is_enterable",
  ];

  for (const name of fns) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  const handle = mod.configurator_lifecycle_create();
  const actors = [createMobile(mod), createMobile(mod)];
  try {
    mod.configurator_lifecycle_initialize(handle, 2, 2, 0);
    mod.configurator_surface_ledger_record(handle, 1, 0, 0, 0);
    mod.configurator_surface_ledger_record(handle, 2, 1, 0, 0);

    mod.configurator_actor_pool_register(handle, actors[0]);
    mod.configurator_actor_pool_register(handle, actors[1]);
    assert.equal(mod.configurator_actor_pool_available_count(handle), 2, "both actors should be available");

    const borrowed = mod.configurator_actor_pool_borrow(handle);
    assert.ok(borrowed === actors[0] || borrowed === actors[1], "borrow should yield a registered actor handle");
    assert.equal(mod.configurator_actor_pool_borrowed_count(handle), 1, "one actor should be borrowed");

    // Place borrowed actor on the map.
    assert.equal(mod.configurator_map_set_actor(handle, borrowed, 0, 0, 0), 1, "borrowed actor should occupy surface");
    assert.equal(mod.configurator_map_is_enterable(handle, 0, 0, 0), 0, "occupied surface should be blocked for others");

    // Attempt to place second actor on same cell should fail.
    const second = borrowed === actors[0] ? actors[1] : actors[0];
    assert.equal(mod.configurator_map_set_actor(handle, second, 0, 0, 0), 0, "second actor cannot occupy same cell");

    // Return the borrowed actor and verify counts reset.
    mod.configurator_map_clear_actor(handle, 0, 0, 0);
    assert.equal(mod.configurator_actor_pool_return(handle, borrowed), 1, "return should succeed");
    assert.equal(mod.configurator_actor_pool_available_count(handle), 2, "all actors back in pool");
    assert.equal(mod.configurator_actor_pool_borrowed_count(handle), 0, "no borrowed actors remain");

    console.log("[REQ:P2-F10] actor pool tests: ok");
  } finally {
    mod.configurator_lifecycle_destroy(handle);
    for (const actor of actors) {
      mod.actor_lifecycle_destroy(actor);
    }
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
