/**
 * [REQ:P4-F01_5] Environmental awareness model
 * Goal: Agents maintain a persistent snapshot of the surrounding tiles/agents
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
    "agent_lifecycle_create",
    "agent_lifecycle_destroy",
    "agent_lifecycle_init",
    "agent_lifecycle_step",
    "agent_transition_move_by",
    "agent_observation_get_record_count",
    "agent_observation_get_adjacent_info",
    "agent_observation_get_adjacent_snapshot",
    "agent_observation_direction_get_offset",
    "agent_observation_set_capability",
  ];

  for (const name of requiredFunctions) {
    assert.equal(typeof mod[name], "function", `${name} export should be a function`);
  }

  const constants = Object.freeze({
    capabilityBasic: expectNumber(mod.agent_observation_capability_basic, "agent_observation_capability_basic"),
    capabilityEnhanced: expectNumber(mod.agent_observation_capability_enhanced, "agent_observation_capability_enhanced"),
    statusUnknown: expectNumber(mod.agent_observation_adjacent_status_unknown, "agent_observation_adjacent_status_unknown"),
    statusObserved: expectNumber(mod.agent_observation_adjacent_status_observed, "agent_observation_adjacent_status_observed"),
    occupancyUnknown: expectNumber(mod.agent_observation_occupancy_unknown, "agent_observation_occupancy_unknown"),
    occupancyWalkable: expectNumber(mod.agent_observation_occupancy_walkable_static, "agent_observation_occupancy_walkable_static"),
    occupancyBlocking: expectNumber(mod.agent_observation_occupancy_blocking, "agent_observation_occupancy_blocking"),
    archetypeMobile: expectNumber(mod.agent_archetype_mobile, "agent_archetype_mobile"),
    archetypeStatic: expectNumber(mod.agent_archetype_static_tile, "agent_archetype_static_tile"),
    direction: {
      north: expectNumber(mod.agent_observation_direction_north, "agent_observation_direction_north"),
      east: expectNumber(mod.agent_observation_direction_east, "agent_observation_direction_east"),
      south: expectNumber(mod.agent_observation_direction_south, "agent_observation_direction_south"),
      west: expectNumber(mod.agent_observation_direction_west, "agent_observation_direction_west"),
      northEast: expectNumber(mod.agent_observation_direction_north_east, "agent_observation_direction_north_east"),
      southEast: expectNumber(mod.agent_observation_direction_south_east, "agent_observation_direction_south_east"),
      southWest: expectNumber(mod.agent_observation_direction_south_west, "agent_observation_direction_south_west"),
      northWest: expectNumber(mod.agent_observation_direction_north_west, "agent_observation_direction_north_west"),
    },
  });

  const readVec2 = (vec) => mod.agent_vec2_read(vec);

  const observer = mod.agent_lifecycle_create(constants.archetypeMobile);

  const neighborConfigs = [
    { dir: constants.direction.north, archetype: constants.archetypeStatic },
    { dir: constants.direction.east, archetype: constants.archetypeStatic },
    { dir: constants.direction.south, archetype: constants.archetypeMobile },
    { dir: constants.direction.west, archetype: constants.archetypeMobile },
    { dir: constants.direction.northEast, archetype: constants.archetypeStatic },
  ];

  const neighbors = neighborConfigs.map((cfg) => ({ handle: mod.agent_lifecycle_create(cfg.archetype), ...cfg }));

  try {
    mod.agent_lifecycle_init(observer);
    neighbors.forEach((neighbor) => mod.agent_lifecycle_init(neighbor.handle));

    mod.agent_observation_set_capability(observer, constants.capabilityEnhanced);

    // Place neighbors around the observer and allow them to settle.
    for (const neighbor of neighbors) {
      const offset = readVec2(mod.agent_observation_direction_get_offset(neighbor.dir));
      mod.agent_transition_move_by(neighbor.handle, offset.x, offset.y);
      mod.agent_lifecycle_step(neighbor.handle);
    }

    // Lifecycle step triggers radar scanning.
    mod.agent_lifecycle_step(observer);

    // A second step ensures persistence across ticks.
    mod.agent_lifecycle_step(observer);

    for (const neighbor of neighbors) {
      const info = mod.agent_observation_get_adjacent_snapshot(observer, neighbor.dir);
      assert.equal(info.direction, neighbor.dir, `adjacent info should retain direction ${neighbor.dir}`);
      assert.equal(info.status, constants.statusObserved, "adjacent slot should be marked as observed");
      assert.equal(info.observedHandle, neighbor.handle, "adjacent slot should track observed handle");
      assert.ok(info.record, "adjacent slot should retain observation record reference");

      const record = info.record;
      assert.ok(record, "observation record should remain accessible");
      assert.ok(record.requestId < 0, "radar-produced records should carry internal request identifiers");
      const offset = readVec2(mod.agent_observation_direction_get_offset(neighbor.dir));
      assert.equal(record.observedX, offset.x, "recorded X should match neighbor displacement");
      assert.equal(record.observedY, offset.y, "recorded Y should match neighbor displacement");
      const expectedOccupancy =
        neighbor.archetype === constants.archetypeStatic
          ? constants.occupancyWalkable
          : constants.occupancyBlocking;
      assert.equal(record.observedOccupancy, expectedOccupancy, "occupancy classification should match archetype");
    }

    assert.ok(
      mod.agent_observation_get_record_count(observer) >= neighbors.length,
      "radar scan should accumulate observation records",
    );

    // Directions without neighbours should remain unknown.
    const emptyDir = constants.direction.southEast;
    const emptyInfo = mod.agent_observation_get_adjacent_snapshot(observer, emptyDir);
    assert.equal(emptyInfo.status, constants.statusUnknown, "unpopulated direction should remain unknown");
    assert.equal(emptyInfo.record, null, "unpopulated direction should not reference a record");

    console.log("[REQ:P4-F01_5] environmental awareness model tests: ok");
  } finally {
    for (const neighbor of neighbors) {
      try { mod.agent_lifecycle_destroy(neighbor.handle); } catch { /* ignore */ }
    }
    mod.agent_lifecycle_destroy(observer);
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
