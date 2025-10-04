/**
 * [REQ:P4-F04_2] Transition — constrained movement with obstacles (scaffold)
 * Goal: Define the expected API surface for movement when obstacles or occupied
 * tiles are present so that transition logic can later enforce the rules.
 *
 * NOTE: This scaffold assumes the movement/occupancy helpers exist but does not
 * yet assert behaviour. It verifies that calls do not throw and that placeholder
 * structures are returned. Once the movement logic is implemented the assertions
 * can be tightened to enforce the acceptance criteria.
 *
 * Run:
 *   npm run asbuild
 *   npm test
 */

import assert from "node:assert/strict";

(async () => {
  let mod;
  try { mod = await import("../build/release.js"); } catch { mod = await import("../build/debug.js"); }

  const requiredFunctions = [
    "agent_lifecycle_create",
    "agent_lifecycle_destroy",
    "agent_lifecycle_init",
    "agent_transition_move_by",
    "agent_transition_attempt_move",
    "agent_transition_set_obstacle",
  ];

  for (const name of requiredFunctions) {
    assert.equal(typeof mod[name], "function", `${name} export should be a function`);
  }

  const archetypes = Object.freeze({
    mobile: expectNumber(mod.agent_archetype_mobile, "agent_archetype_mobile"),
    staticTile: expectNumber(mod.agent_archetype_static_tile, "agent_archetype_static_tile"),
  });

  const mover = mod.agent_lifecycle_create(archetypes.mobile);
  const floor = mod.agent_lifecycle_create(archetypes.staticTile);
  const wall = mod.agent_lifecycle_create(archetypes.staticTile);
  const obstacle = mod.agent_lifecycle_create(archetypes.staticTile);
  const otherAgent = mod.agent_lifecycle_create(archetypes.mobile);

  try {
    for (const handle of [mover, floor, wall, obstacle, otherAgent]) {
      mod.agent_lifecycle_init(handle);
    }

    // Placeholder calls expressing intent of future behaviour
    mod.agent_transition_set_obstacle(floor, false); // ensure walkable
    mod.agent_transition_set_obstacle(wall, true);   // ensure blocking
    mod.agent_transition_set_obstacle(obstacle, true);

    const attemptFloor = mod.agent_transition_attempt_move(mover, floor, 1, 0);
    assert.ok(attemptFloor === true || attemptFloor === false, "attempt_move should return boolean placeholder");

    const attemptWall = mod.agent_transition_attempt_move(mover, wall, 0, 1);
    assert.ok(attemptWall === true || attemptWall === false, "attempt_move placeholder for wall");

    const attemptObstacle = mod.agent_transition_attempt_move(mover, obstacle, -1, 0);
    assert.ok(attemptObstacle === true || attemptObstacle === false, "attempt_move placeholder for obstacle");

    const attemptOther = mod.agent_transition_attempt_move(mover, otherAgent, 0, -1);
    assert.ok(attemptOther === true || attemptOther === false, "attempt_move placeholder for other agent");

    // Allow toggling cells into the obstacle grid (placeholder API)
    mod.agent_transition_set_obstacle(wall, true);
    mod.agent_transition_set_obstacle(floor, false);

    // Basic unconstrained move remains callable
    mod.agent_transition_move_by(mover, 1, 0);
  } finally {
    for (const handle of [mover, floor, wall, obstacle, otherAgent]) {
      mod.agent_lifecycle_destroy(handle);
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
