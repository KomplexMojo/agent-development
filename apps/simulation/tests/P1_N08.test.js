/**
 * [REQ:P1-N08] Actor pooling (deployment strategy)
 * Goal: Demonstrate that actors are created, managed, and destroyed
 * individually without requiring in-actor pool state.
 *
 * This test stresses the public lifecycle APIs by creating a batch of
 * static and mobile actors, mutating them independently, and confirming
 * that each retains a unique identity and state.
 *
 * Run:
 *   npm run asbuild
 *   npm test
 */

import assert from "node:assert/strict";

(async () => {
  let mod;
  try {
    mod = await import("../build/release.js");
  } catch {
    mod = await import("../build/debug.js");
  }

  const requiredFunctions = [
    "actor_lifecycle_create",
    "actor_lifecycle_destroy",
    "actor_lifecycle_init",
    "actor_lifecycle_process",
    "actor_transition_move_by",
    "actor_transition_set_obstacle",
    "actor_identity_get",
    "actor_observation_get_x",
    "actor_observation_get_y",
    "actor_observation_get_level",
  ];

  for (const name of requiredFunctions) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  const archetypes = Object.freeze({
    mobile: expectNumber(mod.actor_archetype_mobile, "actor_archetype_mobile"),
    staticTile: expectNumber(mod.actor_archetype_static_tile, "actor_archetype_static_tile"),
  });

  const STATIC_COUNT = 16;
  const MOBILE_COUNT = 16;

  const staticHandles = new Array(STATIC_COUNT)
    .fill(0)
    .map(() => mod.actor_lifecycle_create(archetypes.staticTile));
  const mobileHandles = new Array(MOBILE_COUNT)
    .fill(0)
    .map(() => mod.actor_lifecycle_create(archetypes.mobile));

  const allHandles = [...staticHandles, ...mobileHandles];
  const destroyed = new Set();

  try {
    for (const handle of allHandles) {
      mod.actor_lifecycle_init(handle);
      mod.actor_lifecycle_process(handle);
    }

    const identities = new Set();
    for (const handle of allHandles) {
      const id = mod.actor_identity_get(handle);
      assert.ok(Number.isInteger(id) && id !== 0, "each actor should expose a unique non-zero identity");
      assert.equal(identities.has(id), false, "actor identities should be unique");
      identities.add(id);
    }

    staticHandles.forEach((handle, index) => {
      const shouldBlock = index % 2 === 0;
      mod.actor_transition_set_obstacle(handle, shouldBlock);
      mod.actor_lifecycle_process(handle);
      const level = mod.actor_observation_get_level(handle);
      assert.equal(level, 0, "static actor level should remain at baseline");
    });

    mobileHandles.forEach((handle, index) => {
      const dx = (index % 4) - 1; // -1,0,1,2
      const dy = Math.floor(index / 4) - 1; // -1..2
      mod.actor_transition_move_by(handle, dx, dy);
      mod.actor_lifecycle_process(handle);
    });

    const positionKeys = new Set();
    for (const handle of mobileHandles) {
      const key = `${mod.actor_observation_get_x(handle)},${mod.actor_observation_get_y(handle)}`;
      positionKeys.add(key);
    }
    assert.equal(positionKeys.size, mobileHandles.length, "each mobile should occupy a distinct coordinate after moves");

    // Destroy a subset and ensure remaining actors continue to function.
    for (let i = 0; i < 4; i++) {
      const handle = staticHandles[i];
      mod.actor_lifecycle_destroy(handle);
      destroyed.add(handle);
    }

    for (const handle of allHandles) {
      if (destroyed.has(handle)) continue;
      mod.actor_lifecycle_process(handle);
      // Observations should remain readable after neighbours are removed.
      mod.actor_observation_get_x(handle);
      mod.actor_observation_get_y(handle);
    }

    console.log("[REQ:P1-N08] pooled actor independence test: ok");
  } finally {
    for (const handle of allHandles) {
      if (destroyed.has(handle)) continue;
      try { mod.actor_lifecycle_destroy(handle); } catch { /* ignore double-destroy */ }
    }
  }
})();

function expectNumber(value, label) {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && typeof value.valueOf === "function") {
    const numeric = Number(value.valueOf());
    if (Number.isFinite(numeric)) return numeric;
  }
  throw new TypeError(`${label} should expose a numeric value`);
}
