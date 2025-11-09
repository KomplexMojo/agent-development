/**
 * [REQ:P1-F03_1] EVALUATION — where to move
 * Goal: The actor reviews a grid of surrounding tiles, classifies which moves
 * are allowed, persists both lists for later inspection, and selects the first
 * valid option.
 *
 * Verification per requirement:
 *  - unit: create a grid containing blocked and open coordinates, place the
 *          actor, and verify the evaluation results and chosen move.
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
    actor_lifecycle_create: "function",
    actor_lifecycle_destroy: "function",
    actor_lifecycle_init: "function",
    actor_lifecycle_process: "function",
    actor_transition_move_by: "function",
    actor_evaluation_reset_grid: "function",
    actor_evaluation_mark_blocked: "function",
    actor_evaluation_get_valid_move_count: "function",
    actor_evaluation_get_invalid_move_count: "function",
    actor_evaluation_get_valid_move: "function",
    actor_evaluation_get_invalid_move: "function",
    actor_evaluation_get_chosen_move: "function",
    actor_vec2_read: "function",
  };

  for (const [name, type] of Object.entries(expectedExports)) {
    assert.equal(typeof mod[name], type, `${name} export should be a ${type}`);
  }

  const readVec2 = (vec) => mod.actor_vec2_read(vec);

  const handle = mod.actor_lifecycle_create();
  try {
    // Scenario: actor at (1,1) with cardinal neighbors — only north and west are open
    mod.actor_lifecycle_init(handle);
    mod.actor_evaluation_reset_grid(handle, 3, 3);

    // Explicitly classify the four cardinal neighbors
    mod.actor_evaluation_mark_blocked(handle, 1, 2, 0); // north open
    mod.actor_evaluation_mark_blocked(handle, 2, 1, 1); // east blocked
    mod.actor_evaluation_mark_blocked(handle, 1, 0, 1); // south blocked
    mod.actor_evaluation_mark_blocked(handle, 0, 1, 0); // west open

    // Place the actor in the center of the grid
    mod.actor_transition_move_by(handle, 1, 1);

    // Run a lifecycle tick to trigger evaluation (INTROSPECTION→OBSERVATION→EVALUATION→...)
    mod.actor_lifecycle_process(handle);

    const validCount = mod.actor_evaluation_get_valid_move_count(handle);
    const invalidCount = mod.actor_evaluation_get_invalid_move_count(handle);

    assert.equal(validCount, 2, "expected two valid moves (north, west)");
    assert.equal(invalidCount, 2, "expected two invalid moves (east, south)");

    const valid0 = readVec2(mod.actor_evaluation_get_valid_move(handle, 0));
    const valid1 = readVec2(mod.actor_evaluation_get_valid_move(handle, 1));
    const invalid0 = readVec2(mod.actor_evaluation_get_invalid_move(handle, 0));
    const invalid1 = readVec2(mod.actor_evaluation_get_invalid_move(handle, 1));

    assert.deepEqual(valid0, { x: 1, y: 2 }, "first valid move should be north (first considered)");
    assert.deepEqual(valid1, { x: 0, y: 1 }, "second valid move should be west");
    assert.deepEqual(invalid0, { x: 2, y: 1 }, "first invalid move should be east");
    assert.deepEqual(invalid1, { x: 1, y: 0 }, "second invalid move should be south");

    const chosen = readVec2(mod.actor_evaluation_get_chosen_move(handle));
    assert.deepEqual(chosen, valid0, "actor should choose the first valid move");
  } finally {
    mod.actor_lifecycle_destroy(handle);
  }

  console.log("[REQ:P1-F03_1] evaluation where-to-move tests: ok");
})().catch((err) => {
  console.error("[REQ:P1-F03_1] evaluation where-to-move tests: failed", err);
  process.exit(1);
});
