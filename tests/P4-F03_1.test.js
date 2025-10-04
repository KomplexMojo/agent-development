/**
 * [REQ:P4-F03_1] EVALUATION — where to move
 * Goal: The agent reviews a grid of surrounding tiles, classifies which moves
 * are allowed, persists both lists for later inspection, and selects the first
 * valid option.
 *
 * Verification per requirement:
 *  - unit: create a grid containing blocked and open coordinates, place the
 *          agent, and verify the evaluation results and chosen move.
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

  // Expected public API surface for the evaluation requirement
  const expectedExports = {
    agent_lifecycle_create: "function",
    agent_lifecycle_destroy: "function",
    agent_lifecycle_init: "function",
    agent_lifecycle_step: "function",
    agent_transition_move_by: "function",
    agent_evaluation_reset_grid: "function",
    agent_evaluation_mark_blocked: "function",
    agent_evaluation_get_valid_move_count: "function",
    agent_evaluation_get_invalid_move_count: "function",
    agent_evaluation_get_valid_move: "function",
    agent_evaluation_get_invalid_move: "function",
    agent_evaluation_get_chosen_move: "function",
    agent_vec2_read: "function",
  };

  for (const [name, type] of Object.entries(expectedExports)) {
    assert.equal(typeof mod[name], type, `${name} export should be a ${type}`);
  }

  const readVec2 = (vec) => mod.agent_vec2_read(vec);

  const handle = mod.agent_lifecycle_create();
  try {
    // Scenario: agent at (1,1) with cardinal neighbors — only north and west are open
    mod.agent_lifecycle_init(handle);
    mod.agent_evaluation_reset_grid(handle, 3, 3);

    // Explicitly classify the four cardinal neighbors
    mod.agent_evaluation_mark_blocked(handle, 1, 2, 0); // north open
    mod.agent_evaluation_mark_blocked(handle, 2, 1, 1); // east blocked
    mod.agent_evaluation_mark_blocked(handle, 1, 0, 1); // south blocked
    mod.agent_evaluation_mark_blocked(handle, 0, 1, 0); // west open

    // Place the agent in the center of the grid
    mod.agent_transition_move_by(handle, 1, 1);

    // Run a lifecycle tick to trigger evaluation (INTROSPECTION→OBSERVATION→EVALUATION→...)
    mod.agent_lifecycle_step(handle);

    const validCount = mod.agent_evaluation_get_valid_move_count(handle);
    const invalidCount = mod.agent_evaluation_get_invalid_move_count(handle);

    assert.equal(validCount, 2, "expected two valid moves (north, west)");
    assert.equal(invalidCount, 2, "expected two invalid moves (east, south)");

    const valid0 = readVec2(mod.agent_evaluation_get_valid_move(handle, 0));
    const valid1 = readVec2(mod.agent_evaluation_get_valid_move(handle, 1));
    const invalid0 = readVec2(mod.agent_evaluation_get_invalid_move(handle, 0));
    const invalid1 = readVec2(mod.agent_evaluation_get_invalid_move(handle, 1));

    assert.deepEqual(valid0, { x: 1, y: 2 }, "first valid move should be north (first considered)");
    assert.deepEqual(valid1, { x: 0, y: 1 }, "second valid move should be west");
    assert.deepEqual(invalid0, { x: 2, y: 1 }, "first invalid move should be east");
    assert.deepEqual(invalid1, { x: 1, y: 0 }, "second invalid move should be south");

    const chosen = readVec2(mod.agent_evaluation_get_chosen_move(handle));
    assert.deepEqual(chosen, valid0, "agent should choose the first valid move");
  } finally {
    mod.agent_lifecycle_destroy(handle);
  }

  console.log("[REQ:P4-F03_1] evaluation where-to-move tests: ok");
})().catch((err) => {
  console.error("[REQ:P4-F03_1] evaluation where-to-move tests: failed", err);
  process.exit(1);
});
