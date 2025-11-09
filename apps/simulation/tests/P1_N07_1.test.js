/**
 * [REQ:P1-N07_1] Pooled simple actors — shared-thread independence
 * Goal: Demonstrate that many lightweight actors can share one execution pool,
 * remaining responsive and keeping their state isolated while the pool advances
 * them in order.
 *
 * Verification per requirement:
 *  - unit: create a batch of simple actors, advance them sequentially, and
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

  const ARCHETYPES = {
    Mobile: 0,
    StaticTile: 1,
  };

  const poolSize = 10;
  const handles = [];
  const expected = [];

  try {
    // Configuration scenario: create a static tile archetype and ensure lifecycle works
    const wall = mod.actor_lifecycle_create(ARCHETYPES.StaticTile);
    mod.actor_lifecycle_init(wall);
    mod.actor_lifecycle_destroy(wall);

    // Spawn pooled actors, initialise them, and record baseline positions.
    for (let i = 0; i < poolSize; i++) {
      const handle = mod.actor_lifecycle_create(ARCHETYPES.Mobile);
      handles.push(handle);
      mod.actor_lifecycle_init(handle);
      mod.actor_lifecycle_process(handle);
      expected.push({ x: 0, y: 0 });
      assert.deepEqual(getPos(handle), expected[i], `actor ${i} should start at origin`);
    }

    // Sequentially advance each actor with a unique move, simulating pooled ticks.
    for (let i = 0; i < poolSize; i++) {
      const handle = handles[i];
      const dx = i + 1;       // unique delta per actor
      const dy = -(i % 3);    // cycle negative offsets to vary movement
      mod.actor_transition_move_by(handle, dx, dy);
      mod.actor_lifecycle_process(handle);

      expected[i].x += dx;
      expected[i].y += dy;
      assertPoolMatches("after move", handles, expected, getPos);
    }

    // Run several pooled cycles without additional moves to ensure stability.
    for (let tick = 0; tick < 3; tick++) {
      for (const handle of handles) {
        mod.actor_lifecycle_process(handle);
      }
      assertPoolMatches(`after idle tick ${tick + 1}`, handles, expected, getPos);
    }

    console.log("[REQ:P1-N07_1] pooled simple actors tests: ok");
  } finally {
    // Tear down all handles even if assertions fail.
    for (const handle of handles) {
      try { mod.actor_lifecycle_destroy(handle); } catch { /* ignore */ }
    }
  }

  function getPos(handle) {
    return {
      x: mod.actor_observation_get_x(handle),
      y: mod.actor_observation_get_y(handle),
    };
  }

  function assertPoolMatches(label, handles, expected, reader) {
    handles.forEach((handle, idx) => {
      const actual = reader(handle);
      assert.equal(actual.x, expected[idx].x, `${label}: actor ${idx} x`);
      assert.equal(actual.y, expected[idx].y, `${label}: actor ${idx} y`);
    });
  }
})();
