/**
 * [REQ:P4-F01_7] INTROSPECTION (self-awareness): position snapshot (coordinates & level)
 * Goal: Verify introspection exposes X/Y coordinates, level, and Vec2 location consistently,
 *       and that values update after transitions while getters remain immutable views.
 *
 * Verification per requirement:
 *  - unit: move an agent horizontally and vertically via transition helpers and verify the X, Y,
 *          level, and Vec2 getters return updated values while mutating the returned Vec2 leaves
 *          the internal state unchanged.
 *
 * Run:
 *   npm run asbuild
 *   npm test
 */

import assert from "node:assert/strict";

(async () => {
  let mod;
  try {
    mod = await import("../build/release.js");
  } catch {
    mod = await import("../build/debug.js");
  }

  const requiredExports = [
    "agent_lifecycle_create",
    "agent_lifecycle_destroy",
    "agent_lifecycle_init",
    "agent_transition_move_by",
    "agent_transition_move_level",
    "agent_observation_get_x",
    "agent_observation_get_y",
    "agent_observation_get_level",
    "agent_observation_get_location",
    "agent_observation_get_location_snapshot",
    "agent_vec2_read",
    "agent_vec2_write",
  ];

  for (const name of requiredExports) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }
  assert.ok(mod.memory instanceof WebAssembly.Memory, "memory export should be a WebAssembly.Memory instance");

  const handle = mod.agent_lifecycle_create();

  try {
    mod.agent_lifecycle_init(handle);

    assert.equal(mod.agent_observation_get_x(handle), 0, "initial X should default to 0");
    assert.equal(mod.agent_observation_get_y(handle), 0, "initial Y should default to 0");
    assert.equal(mod.agent_observation_get_level(handle), 0, "initial level should default to 0");

    const locInitialVec = mod.agent_observation_get_location(handle);
    const locInitial = mod.agent_vec2_read(locInitialVec);
    assert.deepEqual(locInitial, { x: 0, y: 0 }, "initial Vec2 snapshot should be (0,0)");

    mod.agent_vec2_write(locInitialVec, 42, -17);
    assert.deepEqual(mod.agent_vec2_read(locInitialVec), { x: 42, y: -17 }, "mutating snapshot copy should reflect local change");
    assert.equal(mod.agent_observation_get_x(handle), 0, "mutating snapshot memory must not affect internal X");
    assert.equal(mod.agent_observation_get_y(handle), 0, "mutating snapshot memory must not affect internal Y");

    const locCopyVec = mod.agent_observation_get_location(handle);
    assert.notEqual(locCopyVec.valueOf(), locInitialVec.valueOf(), "each location call should return an independent Vec2 allocation");
    assert.deepEqual(mod.agent_vec2_read(locCopyVec), { x: 0, y: 0 }, "fresh snapshot still reflects authoritative coordinates");

    mod.agent_transition_move_by(handle, 3, -2);
    assert.equal(mod.agent_observation_get_x(handle), 3, "X should update after horizontal move");
    assert.equal(mod.agent_observation_get_y(handle), -2, "Y should update after vertical move");
    assert.equal(mod.agent_observation_get_level(handle), 0, "level remains unchanged by horizontal move");

    const locAfterMoveVec = mod.agent_observation_get_location(handle);
    assert.deepEqual(mod.agent_vec2_read(locAfterMoveVec), { x: 3, y: -2 }, "location snapshot should reflect updated coordinates");

    assert.deepEqual(
      mod.agent_observation_get_location_snapshot(handle),
      { x: 3, y: -2 },
      "location snapshot helper should match updated coordinates",
    );

    mod.agent_transition_move_level(handle, 2);
    assert.equal(mod.agent_observation_get_level(handle), 2, "level should update after upward move");
    assert.deepEqual(
      mod.agent_vec2_read(mod.agent_observation_get_location(handle)),
      { x: 3, y: -2 },
      "location Vec2 remains unaffected by level change",
    );

    mod.agent_transition_move_level(handle, -5);
    assert.equal(mod.agent_observation_get_level(handle), -3, "level should update after downward move");

    mod.agent_transition_move_by(handle, -8, 4);
    assert.deepEqual(
      {
        x: mod.agent_observation_get_x(handle),
        y: mod.agent_observation_get_y(handle),
        level: mod.agent_observation_get_level(handle),
      },
      { x: -5, y: 2, level: -3 },
      "subsequent moves should update position and preserve level"
    );

    assert.deepEqual(
      mod.agent_observation_get_location_snapshot(handle),
      { x: -5, y: 2 },
      "Vec2 snapshot tracks final coordinates"
    );
  } finally {
    mod.agent_lifecycle_destroy(handle);
  }

  console.log("[REQ:P4-F01_7] position snapshot tests: ok");

})().catch((err) => {
  console.error("[REQ:P4-F01_7] position snapshot tests: failed", err);
  process.exit(1);
});
