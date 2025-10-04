/**
 * [REQ:P4-F04_1] TRANSITION — unconstrained movement
 * Goal: The agent can move N, E, S, W, NE, NW, SE, SW.
 * This test defines the expected public exports and verifies predictable position changes.
 *
 * Acceptance:
 *  - The agent moves from one x,y coordinate in a specified direction.
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
  // - agent_lifecycle_init(): resets state
  // - agent_lifecycle_step(): advances the lifecycle pipeline (updates observation)
  // - agent_observation_get_x() / agent_observation_get_y(): read position snapshot
  // - agent_transition_move_by(dx, dy): move by integer deltas (unconstrained directions)
  const fns = [
    "agent_lifecycle_create",
    "agent_lifecycle_destroy",
    "agent_lifecycle_init",
    "agent_lifecycle_step",
    "agent_observation_get_x",
    "agent_observation_get_y",
    "agent_observation_get_level",
    "agent_transition_move_by",
    "agent_transition_move_level"
  ];

  for (const name of fns) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  const handle = mod.agent_lifecycle_create();
  try {
    // Initialization acceptance: agent is initialized with an x and y coordinate
    mod.agent_lifecycle_init(handle);
    mod.agent_lifecycle_step(handle); // ensure observation snapshot mirrors authoritative state
    const initX = mod.agent_observation_get_x(handle);
    const initY = mod.agent_observation_get_y(handle);
    const initLevel = mod.agent_observation_get_level(handle);

    // Must expose coordinates at init
    assert.equal(typeof initX, "number", "init x should be a number");
    assert.equal(typeof initY, "number", "init y should be a number");
    assert.ok(Number.isInteger(initX), "init x should be an integer");
    assert.ok(Number.isInteger(initY), "init y should be an integer");
    assert.equal(initLevel, 0, "init level should default to ground floor");

    // Coordinates should be readable/stable prior to any movement
    const initX2 = mod.agent_observation_get_x(handle);
    const initY2 = mod.agent_observation_get_y(handle);
    assert.equal(initX2, initX, "x should remain stable before movement");
    assert.equal(initY2, initY, "y should remain stable before movement");
    assert.equal(mod.agent_observation_get_level(handle), initLevel, "level should remain stable before movement");

    // Helper: assert one move produces expected position
    async function agent_transition_expect_move(dx, dy) {
      mod.agent_lifecycle_init(handle);
      mod.agent_lifecycle_step(handle);
      const x0 = mod.agent_observation_get_x(handle);
      const y0 = mod.agent_observation_get_y(handle);

      mod.agent_transition_move_by(handle, dx, dy);

      // Lifecycle step refreshes observation snapshot after the authoritative update
      mod.agent_lifecycle_step(handle);

      const x1 = mod.agent_observation_get_x(handle);
      const y1 = mod.agent_observation_get_y(handle);

      assert.equal(x1, x0 + dx, `x should change by ${dx}`);
      assert.equal(y1, y0 + dy, `y should change by ${dy}`);
    }

    // Cardinal directions
    await agent_transition_expect_move(0, 1);   // N
    await agent_transition_expect_move(1, 0);   // E
    await agent_transition_expect_move(0, -1);  // S
    await agent_transition_expect_move(-1, 0);  // W

    // Diagonals
    await agent_transition_expect_move(1, 1);    // NE
    await agent_transition_expect_move(-1, 1);   // NW
    await agent_transition_expect_move(1, -1);   // SE
    await agent_transition_expect_move(-1, -1);  // SW

    // Level traversal: move up then down, verifying constrained floor count
    mod.agent_lifecycle_init(handle);
    mod.agent_lifecycle_step(handle);
    const startingLevel = mod.agent_observation_get_level(handle);
    mod.agent_transition_move_level(handle, 2);
    mod.agent_lifecycle_step(handle);
    assert.equal(mod.agent_observation_get_level(handle), startingLevel + 2, "level should increase by delta");
    mod.agent_transition_move_level(handle, -3);
    mod.agent_lifecycle_step(handle);
    assert.equal(mod.agent_observation_get_level(handle), startingLevel - 1, "level should decrease by delta");
  } finally {
    mod.agent_lifecycle_destroy(handle);
  }

  console.log("[REQ:P4-F04_1] unconstrained movement tests: ok");
})().catch((err) => {
  console.error("[REQ:P4-F04_1] unconstrained movement tests: failed", err);
  process.exit(1);
});
