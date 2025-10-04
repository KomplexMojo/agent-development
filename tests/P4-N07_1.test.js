/**
 * [REQ:P4-N07_1] Pooled simple agents — shared-thread independence
 * Goal: Demonstrate that many lightweight agents can share one execution pool,
 * remaining responsive and keeping their state isolated while the pool advances
 * them in order.
 *
 * Verification per requirement:
 *  - unit: create a batch of simple agents, advance them sequentially, and
 *          confirm their positions stay independent through multiple cycles.
 *
 * Run:
 *   npm run asbuild
 *   npm test
 */

import assert from "node:assert/strict";

(async () => {
  // Load the compiled AssemblyScript module (release, then debug fallback)
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

  const ARCHETYPES = {
    Mobile: 0,
    StaticTile: 1,
  };

  const poolSize = 10;
  const handles = [];
  const expected = [];

  try {
    // Configuration scenario: create a static tile archetype and ensure lifecycle works
    const wall = mod.agent_lifecycle_create(ARCHETYPES.StaticTile);
    mod.agent_lifecycle_init(wall);
    mod.agent_lifecycle_destroy(wall);

    // Spawn pooled agents, initialise them, and record baseline positions.
    for (let i = 0; i < poolSize; i++) {
      const handle = mod.agent_lifecycle_create(ARCHETYPES.Mobile);
      handles.push(handle);
      mod.agent_lifecycle_init(handle);
      mod.agent_lifecycle_step(handle);
      expected.push({ x: 0, y: 0 });
      assert.deepEqual(getPos(handle), expected[i], `agent ${i} should start at origin`);
    }

    // Sequentially advance each agent with a unique move, simulating pooled ticks.
    for (let i = 0; i < poolSize; i++) {
      const handle = handles[i];
      const dx = i + 1;       // unique delta per agent
      const dy = -(i % 3);    // cycle negative offsets to vary movement
      mod.agent_transition_move_by(handle, dx, dy);
      mod.agent_lifecycle_step(handle);

      expected[i].x += dx;
      expected[i].y += dy;
      assertPoolMatches("after move", handles, expected, getPos);
    }

    // Run several pooled cycles without additional moves to ensure stability.
    for (let tick = 0; tick < 3; tick++) {
      for (const handle of handles) {
        mod.agent_lifecycle_step(handle);
      }
      assertPoolMatches(`after idle tick ${tick + 1}`, handles, expected, getPos);
    }

    console.log("[REQ:P4-N07_1] pooled simple agents tests: ok");
  } finally {
    // Tear down all handles even if assertions fail.
    for (const handle of handles) {
      try { mod.agent_lifecycle_destroy(handle); } catch { /* ignore */ }
    }
  }

  function getPos(handle) {
    return {
      x: mod.agent_observation_get_x(handle),
      y: mod.agent_observation_get_y(handle),
    };
  }

  function assertPoolMatches(label, handles, expected, reader) {
    handles.forEach((handle, idx) => {
      const actual = reader(handle);
      assert.equal(actual.x, expected[idx].x, `${label}: agent ${idx} x`);
      assert.equal(actual.y, expected[idx].y, `${label}: agent ${idx} y`);
    });
  }
})();
