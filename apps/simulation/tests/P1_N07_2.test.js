/**
 * [REQ:P1-N07_2] Dedicated specialists — isolated execution
 * Goal: Demonstrate that specialist actors keep their own pacing and state even
 * when other actors are busy, and that they can be torn down without harming
 * the rest of the system.
 *
 * Verification per requirement:
 *  - unit: run two “intellectual” actors with divergent workloads and confirm
 *          their state never bleeds across handles and cleanup works.
 *
 * Run:
 *   npm run asbuild
 *   npm test
 */

import assert from "node:assert/strict";

(async () => {
  let mod;
  try { mod = await import("../build/release.js"); } catch { mod = await import("../build/debug.js"); }

  const fns = [
    "actor_lifecycle_create",
    "actor_lifecycle_destroy",
    "actor_lifecycle_init",
    "actor_lifecycle_process",
    "actor_observation_get_x",
    "actor_observation_get_y",
    "actor_transition_move_by",
  ];

  for (const name of fns) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  const heavy = mod.actor_lifecycle_create();
  const solo = mod.actor_lifecycle_create();

  try {
    // Bring each specialist online.
    mod.actor_lifecycle_init(heavy);
    mod.actor_lifecycle_init(solo);
    mod.actor_lifecycle_process(heavy);
    mod.actor_lifecycle_process(solo);

    const startHeavy = snapshot(heavy);
    const startSolo = snapshot(solo);
    assert.deepEqual(startHeavy, { x: 0, y: 0 }, "heavy actor should start at origin");
    assert.deepEqual(startSolo, { x: 0, y: 0 }, "solo actor should start at origin");

    // Apply a large workload to the heavy actor only.
    for (let i = 0; i < 5; i++) {
      mod.actor_transition_move_by(heavy, 2 + i, i % 2 === 0 ? 1 : -1);
      mod.actor_lifecycle_process(heavy);

      // While heavy actor works, the solo actor remains untouched.
      const soloDuring = snapshot(solo);
      assert.deepEqual(soloDuring, startSolo, `solo actor remains stable during heavy cycle ${i}`);
    }

    const afterHeavy = snapshot(heavy);
    assert.notDeepEqual(afterHeavy, startHeavy, "heavy actor should have progressed");

    // Now let the solo actor act, proving it still responds after the heavy load.
    mod.actor_transition_move_by(solo, -3, 4);
    mod.actor_lifecycle_process(solo);
    const afterSolo = snapshot(solo);
    assert.deepEqual(afterSolo, { x: -3, y: 4 }, "solo actor should move independently after heavy load");

    // Tear down the heavy actor to ensure cleanup works while the solo actor continues.
    mod.actor_lifecycle_destroy(heavy);

    // Create a replacement specialist and verify it starts fresh.
    const replacement = mod.actor_lifecycle_create();
    try {
      mod.actor_lifecycle_init(replacement);
      mod.actor_lifecycle_process(replacement);
      assert.deepEqual(snapshot(replacement), { x: 0, y: 0 }, "replacement actor should start clean after destroy");
    } finally {
      mod.actor_lifecycle_destroy(replacement);
    }

    // Solo actor should still function after the other actor was recycled.
    mod.actor_transition_move_by(solo, 1, -2);
    mod.actor_lifecycle_process(solo);
    assert.deepEqual(snapshot(solo), { x: -2, y: 2 }, "solo actor should keep operating after peer cleanup");

    console.log("[REQ:P1-N07_2] dedicated specialists tests: ok");
  } finally {
    try { mod.actor_lifecycle_destroy(heavy); } catch { /* already destroyed */ }
    mod.actor_lifecycle_destroy(solo);
  }

  function snapshot(handle) {
    return {
      x: mod.actor_observation_get_x(handle),
      y: mod.actor_observation_get_y(handle),
    };
  }
})();
