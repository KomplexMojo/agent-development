/**
 * [REQ:P4-N07_2] Dedicated specialists — isolated execution
 * Goal: Demonstrate that specialist agents keep their own pacing and state even
 * when other agents are busy, and that they can be torn down without harming
 * the rest of the system.
 *
 * Verification per requirement:
 *  - unit: run two “intellectual” agents with divergent workloads and confirm
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
    "agent_lifecycle_create",
    "agent_lifecycle_destroy",
    "agent_lifecycle_init",
    "agent_lifecycle_step",
    "agent_observation_get_x",
    "agent_observation_get_y",
    "agent_transition_move_by",
  ];

  for (const name of fns) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  const heavy = mod.agent_lifecycle_create();
  const solo = mod.agent_lifecycle_create();

  try {
    // Bring each specialist online.
    mod.agent_lifecycle_init(heavy);
    mod.agent_lifecycle_init(solo);
    mod.agent_lifecycle_step(heavy);
    mod.agent_lifecycle_step(solo);

    const startHeavy = snapshot(heavy);
    const startSolo = snapshot(solo);
    assert.deepEqual(startHeavy, { x: 0, y: 0 }, "heavy agent should start at origin");
    assert.deepEqual(startSolo, { x: 0, y: 0 }, "solo agent should start at origin");

    // Apply a large workload to the heavy agent only.
    for (let i = 0; i < 5; i++) {
      mod.agent_transition_move_by(heavy, 2 + i, i % 2 === 0 ? 1 : -1);
      mod.agent_lifecycle_step(heavy);

      // While heavy agent works, the solo agent remains untouched.
      const soloDuring = snapshot(solo);
      assert.deepEqual(soloDuring, startSolo, `solo agent remains stable during heavy cycle ${i}`);
    }

    const afterHeavy = snapshot(heavy);
    assert.notDeepEqual(afterHeavy, startHeavy, "heavy agent should have progressed");

    // Now let the solo agent act, proving it still responds after the heavy load.
    mod.agent_transition_move_by(solo, -3, 4);
    mod.agent_lifecycle_step(solo);
    const afterSolo = snapshot(solo);
    assert.deepEqual(afterSolo, { x: -3, y: 4 }, "solo agent should move independently after heavy load");

    // Tear down the heavy agent to ensure cleanup works while the solo agent continues.
    mod.agent_lifecycle_destroy(heavy);

    // Create a replacement specialist and verify it starts fresh.
    const replacement = mod.agent_lifecycle_create();
    try {
      mod.agent_lifecycle_init(replacement);
      mod.agent_lifecycle_step(replacement);
      assert.deepEqual(snapshot(replacement), { x: 0, y: 0 }, "replacement agent should start clean after destroy");
    } finally {
      mod.agent_lifecycle_destroy(replacement);
    }

    // Solo agent should still function after the other agent was recycled.
    mod.agent_transition_move_by(solo, 1, -2);
    mod.agent_lifecycle_step(solo);
    assert.deepEqual(snapshot(solo), { x: -2, y: 2 }, "solo agent should keep operating after peer cleanup");

    console.log("[REQ:P4-N07_2] dedicated specialists tests: ok");
  } finally {
    try { mod.agent_lifecycle_destroy(heavy); } catch { /* already destroyed */ }
    mod.agent_lifecycle_destroy(solo);
  }

  function snapshot(handle) {
    return {
      x: mod.agent_observation_get_x(handle),
      y: mod.agent_observation_get_y(handle),
    };
  }
})();
