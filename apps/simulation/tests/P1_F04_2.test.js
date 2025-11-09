/**
 * [REQ:P1-F04_2] Transition — constrained movement with obstacles.
 *
 * Verifies that movement succeeds on walkable tiles, fails against blocking
 * obstacles or other actors, and is also denied once the mover runs out of
 * stamina even if the target tile is walkable.
 */

import assert from "node:assert/strict";

(async () => {
  let mod;
  try { mod = await import("../build/release.js"); } catch { mod = await import("../build/debug.js"); }

  const requiredFunctions = [
    "actor_lifecycle_create",
    "actor_lifecycle_destroy",
    "actor_lifecycle_init",
    "actor_lifecycle_process",
    "actor_observation_get_x",
    "actor_observation_get_y",
    "actor_vitals_get_stamina_current",
    "actor_transition_move_by",
    "actor_transition_attempt_move",
    "actor_transition_set_obstacle",
  ];

  for (const name of requiredFunctions) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  const archetypes = Object.freeze({
    mobile: expectNumber(mod.actor_archetype_mobile, "actor_archetype_mobile"),
    staticTile: expectNumber(mod.actor_archetype_static_tile, "actor_archetype_static_tile"),
  });

  const mover = mod.actor_lifecycle_create(archetypes.mobile);
  const walkableTile = mod.actor_lifecycle_create(archetypes.staticTile);
  const blockingTile = mod.actor_lifecycle_create(archetypes.staticTile);
  const obstacleTile = mod.actor_lifecycle_create(archetypes.staticTile);
  const otherActor = mod.actor_lifecycle_create(archetypes.mobile);

  try {
    for (const handle of [mover, walkableTile, blockingTile, obstacleTile, otherActor]) {
      mod.actor_lifecycle_init(handle);
    }

    const getPosition = () => {
      mod.actor_lifecycle_process(mover);
      return {
        x: mod.actor_observation_get_x(mover),
        y: mod.actor_observation_get_y(mover),
      };
    };

    const resetMover = () => {
      mod.actor_lifecycle_init(mover);
      mod.actor_lifecycle_process(mover);
    };

    const markWalkable = (handle) => mod.actor_transition_set_obstacle(handle, false);
    const markBlocking = (handle) => mod.actor_transition_set_obstacle(handle, true);

    // Walkable surface should allow the move and update the position.
    resetMover();
    markWalkable(walkableTile);
    const beforeWalkable = getPosition();
    const allowed = mod.actor_transition_attempt_move(mover, walkableTile, 1, 0);
    mod.actor_lifecycle_process(mover);
    const afterWalkable = getPosition();
    assert.equal(allowed, true, "walkable surfaces should accept movement");
    assert.equal(afterWalkable.x, beforeWalkable.x + 1, "x should advance onto walkable tile");
    assert.equal(afterWalkable.y, beforeWalkable.y, "y should remain unchanged for eastward move");

    // Blocking tiles should deny the request and keep position unchanged.
    resetMover();
    markBlocking(blockingTile);
    const beforeBlocking = getPosition();
    const blocked = mod.actor_transition_attempt_move(mover, blockingTile, 1, 0);
    mod.actor_lifecycle_process(mover);
    const afterBlocking = getPosition();
    assert.equal(blocked, false, "blocking obstacle should deny movement");
    assert.deepEqual(afterBlocking, beforeBlocking, "position should remain unchanged when blocked");

    // Other actors occupy the destination and should also block movement.
    resetMover();
    markBlocking(otherActor); // ensure the other actor remains treated as blocking
    const beforeOccupied = getPosition();
    const occupied = mod.actor_transition_attempt_move(mover, otherActor, 0, 1);
    mod.actor_lifecycle_process(mover);
    const afterOccupied = getPosition();
    assert.equal(occupied, false, "occupied cell should deny movement");
    assert.deepEqual(afterOccupied, beforeOccupied, "position should remain unchanged when cell is occupied");

    // Running out of stamina should prevent movement even on a walkable tile.
    resetMover();
    markWalkable(obstacleTile);
    drainStamina();
    const exhaustedBefore = getPosition();
    const exhausted = mod.actor_transition_attempt_move(mover, obstacleTile, 1, 0);
    mod.actor_lifecycle_process(mover);
    const exhaustedAfter = getPosition();
    assert.equal(exhausted, false, "movement should be denied when stamina is exhausted");
    assert.deepEqual(exhaustedAfter, exhaustedBefore, "stamina exhaustion should leave position unchanged");

    console.log("[REQ:P1-F04_2] constrained movement tests: ok");

    function drainStamina() {
      let previous = mod.actor_vitals_get_stamina_current(mover);
      let guard = 0;
      while (previous > 0 && guard < 64) {
        mod.actor_transition_move_by(mover, 1, 0);
        mod.actor_lifecycle_process(mover);
        const current = mod.actor_vitals_get_stamina_current(mover);
        if (current >= previous) {
          break;
        }
        previous = current;
        guard += 1;
      }
    }
  } finally {
    for (const handle of [mover, walkableTile, blockingTile, obstacleTile, otherActor]) {
      mod.actor_lifecycle_destroy(handle);
    }
  }
})().catch((err) => {
  console.error("[REQ:P1-F04_2] constrained movement tests: failed", err);
  process.exit(1);
});

function expectNumber(value, label) {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && typeof value.valueOf === "function") {
    const numeric = Number(value.valueOf());
    if (Number.isFinite(numeric)) return numeric;
  }
  throw new TypeError(`${label} should expose a numeric value`);
}
