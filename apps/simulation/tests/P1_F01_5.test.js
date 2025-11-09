/**
 * [REQ:P1-F01_5] Environmental awareness model
 * Goal: Actors maintain a persistent snapshot of the surrounding tiles/actors
 * that can be queried after interrogations.
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
    "actor_lifecycle_create",
    "actor_lifecycle_destroy",
    "actor_lifecycle_init",
    "actor_lifecycle_process",
    "actor_transition_move_by",
    "actor_observation_get_record_count",
    "actor_observation_get_adjacent_info",
    "actor_observation_get_adjacent_snapshot",
    "actor_observation_direction_get_offset",
    "actor_observation_set_capability",
  ];

  for (const name of requiredFunctions) {
    assert.equal(typeof mod[name], "function", `${name} export should be a function`);
  }

  const constants = Object.freeze({
    capabilityBasic: expectNumber(mod.actor_observation_capability_basic, "actor_observation_capability_basic"),
    capabilityEnhanced: expectNumber(mod.actor_observation_capability_enhanced, "actor_observation_capability_enhanced"),
    statusUnknown: expectNumber(mod.actor_observation_adjacent_status_unknown, "actor_observation_adjacent_status_unknown"),
    statusObserved: expectNumber(mod.actor_observation_adjacent_status_observed, "actor_observation_adjacent_status_observed"),
    occupancyUnknown: expectNumber(mod.actor_observation_occupancy_unknown, "actor_observation_occupancy_unknown"),
    occupancyWalkable: expectNumber(mod.actor_observation_occupancy_walkable_static, "actor_observation_occupancy_walkable_static"),
    occupancyBlocking: expectNumber(mod.actor_observation_occupancy_blocking, "actor_observation_occupancy_blocking"),
    archetypeMobile: expectNumber(mod.actor_archetype_mobile, "actor_archetype_mobile"),
    archetypeStatic: expectNumber(mod.actor_archetype_static_tile, "actor_archetype_static_tile"),
    direction: {
      north: expectNumber(mod.actor_observation_direction_north, "actor_observation_direction_north"),
      east: expectNumber(mod.actor_observation_direction_east, "actor_observation_direction_east"),
      south: expectNumber(mod.actor_observation_direction_south, "actor_observation_direction_south"),
      west: expectNumber(mod.actor_observation_direction_west, "actor_observation_direction_west"),
      northEast: expectNumber(mod.actor_observation_direction_north_east, "actor_observation_direction_north_east"),
      southEast: expectNumber(mod.actor_observation_direction_south_east, "actor_observation_direction_south_east"),
      southWest: expectNumber(mod.actor_observation_direction_south_west, "actor_observation_direction_south_west"),
      northWest: expectNumber(mod.actor_observation_direction_north_west, "actor_observation_direction_north_west"),
    },
  });

  const readVec2 = (vec) => mod.actor_vec2_read(vec);

  const observer = mod.actor_lifecycle_create(constants.archetypeMobile);

  const neighborConfigs = [
    { dir: constants.direction.north, archetype: constants.archetypeStatic },
    { dir: constants.direction.east, archetype: constants.archetypeStatic },
    { dir: constants.direction.south, archetype: constants.archetypeMobile },
    { dir: constants.direction.west, archetype: constants.archetypeMobile },
    { dir: constants.direction.northEast, archetype: constants.archetypeStatic },
  ];

  const neighbors = neighborConfigs.map((cfg) => ({ handle: mod.actor_lifecycle_create(cfg.archetype), ...cfg }));

  try {
    mod.actor_lifecycle_init(observer);
    neighbors.forEach((neighbor) => mod.actor_lifecycle_init(neighbor.handle));

    mod.actor_observation_set_capability(observer, constants.capabilityEnhanced);

    // Place neighbors around the observer and allow them to settle.
    for (const neighbor of neighbors) {
      const offset = readVec2(mod.actor_observation_direction_get_offset(neighbor.dir));
      mod.actor_transition_move_by(neighbor.handle, offset.x, offset.y);
      mod.actor_lifecycle_process(neighbor.handle);
    }

    // Lifecycle step triggers radar scanning.
    mod.actor_lifecycle_process(observer);

    // A second step ensures persistence across ticks.
    mod.actor_lifecycle_process(observer);

    for (const neighbor of neighbors) {
      const info = mod.actor_observation_get_adjacent_snapshot(observer, neighbor.dir);
      assert.equal(info.direction, neighbor.dir, `adjacent info should retain direction ${neighbor.dir}`);
      assert.equal(info.status, constants.statusObserved, "adjacent slot should be marked as observed");
      assert.equal(info.observedHandle, neighbor.handle, "adjacent slot should track observed handle");
      assert.ok(info.record, "adjacent slot should retain observation record reference");

      const record = info.record;
      assert.ok(record, "observation record should remain accessible");
      assert.ok(record.requestId < 0, "radar-produced records should carry internal request identifiers");
      const offset = readVec2(mod.actor_observation_direction_get_offset(neighbor.dir));
      assert.equal(record.observedX, offset.x, "recorded X should match neighbor displacement");
      assert.equal(record.observedY, offset.y, "recorded Y should match neighbor displacement");
      const expectedOccupancy =
        neighbor.archetype === constants.archetypeStatic
          ? constants.occupancyWalkable
          : constants.occupancyBlocking;
      assert.equal(record.observedOccupancy, expectedOccupancy, "occupancy classification should match archetype");
    }

    assert.ok(
      mod.actor_observation_get_record_count(observer) >= neighbors.length,
      "radar scan should accumulate observation records",
    );

    // Directions without neighbours should remain unknown.
    const emptyDir = constants.direction.southEast;
    const emptyInfo = mod.actor_observation_get_adjacent_snapshot(observer, emptyDir);
    assert.equal(emptyInfo.status, constants.statusUnknown, "unpopulated direction should remain unknown");
    assert.equal(emptyInfo.record, null, "unpopulated direction should not reference a record");

    console.log("[REQ:P1-F01_5] environmental awareness model tests: ok");
  } finally {
    for (const neighbor of neighbors) {
      try { mod.actor_lifecycle_destroy(neighbor.handle); } catch { /* ignore */ }
    }
    mod.actor_lifecycle_destroy(observer);
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
