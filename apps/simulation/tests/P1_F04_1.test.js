/**
 * [REQ:P1-F04_1] TRANSITION — unconstrained movement
 * Goal: The actor can move N, E, S, W, NE, NW, SE, SW.
 * This test defines the expected public exports and verifies predictable position changes.
 *
 * Acceptance:
 *  - The actor moves from one x,y coordinate in a specified direction.
 * Verification:
 *  - unit: invoking movement results in predictable changes in state or position.
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

  // Expected public API for movement (stubs to be implemented in AssemblyScript):
  // - actor_lifecycle_init(): resets state
  // - actor_lifecycle_process(): advances the lifecycle pipeline (updates observation)
  // - actor_observation_get_x() / actor_observation_get_y(): read position snapshot
  // - actor_transition_move_by(dx, dy): move by integer deltas (unconstrained directions)
  const fns = [
    "actor_lifecycle_create",
    "actor_lifecycle_destroy",
    "actor_lifecycle_init",
    "actor_lifecycle_process",
    "actor_observation_get_x",
    "actor_observation_get_y",
    "actor_observation_get_level",
    "actor_transition_move_by",
    "actor_transition_move_level",
    "actor_transition_attempt_move"
  ];

  for (const name of fns) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  const handle = mod.actor_lifecycle_create();
  try {
    // Initialization acceptance: actor is initialized with an x and y coordinate
    mod.actor_lifecycle_init(handle);
    mod.actor_lifecycle_process(handle); // ensure observation snapshot mirrors authoritative state
    const initX = mod.actor_observation_get_x(handle);
    const initY = mod.actor_observation_get_y(handle);
    const initLevel = mod.actor_observation_get_level(handle);

    // Must expose coordinates at init
    assert.equal(typeof initX, "number", "init x should be a number");
    assert.equal(typeof initY, "number", "init y should be a number");
    assert.ok(Number.isInteger(initX), "init x should be an integer");
    assert.ok(Number.isInteger(initY), "init y should be an integer");
    assert.equal(initLevel, 0, "init level should default to ground floor");

    // Coordinates should be readable/stable prior to any movement
    const initX2 = mod.actor_observation_get_x(handle);
    const initY2 = mod.actor_observation_get_y(handle);
    assert.equal(initX2, initX, "x should remain stable before movement");
    assert.equal(initY2, initY, "y should remain stable before movement");
    assert.equal(mod.actor_observation_get_level(handle), initLevel, "level should remain stable before movement");

    // Helper: assert one move produces expected position
    async function actor_transition_expect_move(dx, dy) {
      mod.actor_lifecycle_init(handle);
      mod.actor_lifecycle_process(handle);
      const x0 = mod.actor_observation_get_x(handle);
      const y0 = mod.actor_observation_get_y(handle);

      mod.actor_transition_move_by(handle, dx, dy);

      // Lifecycle step refreshes observation snapshot after the authoritative update
      mod.actor_lifecycle_process(handle);

      const x1 = mod.actor_observation_get_x(handle);
      const y1 = mod.actor_observation_get_y(handle);

      assert.equal(x1, x0 + dx, `x should change by ${dx}`);
      assert.equal(y1, y0 + dy, `y should change by ${dy}`);
    }

    // Cardinal directions
    await actor_transition_expect_move(0, 1);
    await actor_transition_expect_move(1, 0);
    await actor_transition_expect_move(0, -1);
    await actor_transition_expect_move(-1, 0);

    // Diagonals
    await actor_transition_expect_move(1, 1);
    await actor_transition_expect_move(-1, 1);
    await actor_transition_expect_move(1, -1);
    await actor_transition_expect_move(-1, -1);

    // Level traversal: move up then down, verifying constrained floor count
    mod.actor_lifecycle_init(handle);
    mod.actor_lifecycle_process(handle);
    const startingLevel = mod.actor_observation_get_level(handle);
    mod.actor_transition_move_level(handle, 2);
    mod.actor_lifecycle_process(handle);
    assert.equal(mod.actor_observation_get_level(handle), startingLevel + 2, "level should increase by delta");
    mod.actor_transition_move_level(handle, -3);
    mod.actor_lifecycle_process(handle);
    assert.equal(mod.actor_observation_get_level(handle), startingLevel - 1, "level should decrease by delta");
  } finally {
    mod.actor_lifecycle_destroy(handle);
  }

  console.log("[REQ:P1-F04_1] unconstrained movement tests: ok");
})().catch((err) => {
  console.error("[REQ:P1-F04_1] unconstrained movement tests: failed", err);
  process.exit(1);
});
