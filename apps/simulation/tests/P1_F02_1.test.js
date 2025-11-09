/**
 * [REQ:P1-F02_1] Observation — message-driven adjacency awareness (scaffold)
 * Goal: Define the expected emission-based workflow for interrogating neighbours
 * so observation can be implemented against this contract.
 *
 * NOTE: This scaffold assumes supporting emission helpers exist but does not
 * assert behaviour yet. It only verifies the surface and that calls do not
 * throw, allowing future implementation to fulfil the requirement.
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
    "actor_emission_send_request_adjacent",
    "actor_emission_poll_response",
    "actor_observation_get_adjacent_info",
    "actor_observation_get_adjacent_snapshot",
    "actor_observation_set_radar_range",
    "actor_observation_get_radar_range",
    "actor_observation_configure_memory",
    "actor_observation_get_memory_window",
    "actor_observation_get_memory_capacity",
    "actor_observation_reset_adjacent",
    "actor_observation_mark_adjacent_pending",
    "actor_observation_mark_adjacent_no_response",
    "actor_observation_mark_adjacent_observed",
  ];

  for (const name of requiredFunctions) {
    assert.equal(typeof mod[name], "function", `${name} export should be a function`);
  }

  const constants = Object.freeze({
    directions: [
      expectNumber(mod.actor_observation_direction_north, "actor_observation_direction_north"),
      expectNumber(mod.actor_observation_direction_east, "actor_observation_direction_east"),
      expectNumber(mod.actor_observation_direction_south, "actor_observation_direction_south"),
      expectNumber(mod.actor_observation_direction_west, "actor_observation_direction_west"),
      expectNumber(mod.actor_observation_direction_north_east, "actor_observation_direction_north_east"),
      expectNumber(mod.actor_observation_direction_south_east, "actor_observation_direction_south_east"),
      expectNumber(mod.actor_observation_direction_south_west, "actor_observation_direction_south_west"),
      expectNumber(mod.actor_observation_direction_north_west, "actor_observation_direction_north_west"),
    ],
    statusUnknown: expectNumber(mod.actor_observation_adjacent_status_unknown, "actor_observation_adjacent_status_unknown"),
    statusPending: expectNumber(mod.actor_observation_adjacent_status_pending, "actor_observation_adjacent_status_pending"),
    statusNoResponse: expectNumber(mod.actor_observation_adjacent_status_no_response, "actor_observation_adjacent_status_no_response"),
    statusObserved: expectNumber(mod.actor_observation_adjacent_status_observed, "actor_observation_adjacent_status_observed"),
  });

  const DIRECTIONS = constants.directions;

  const observer = mod.actor_lifecycle_create();
  const neighbour = mod.actor_lifecycle_create();

  try {
    mod.actor_lifecycle_init(observer);
    mod.actor_lifecycle_init(neighbour);

    mod.actor_observation_set_radar_range(observer, 2);
    assert.equal(mod.actor_observation_get_radar_range(observer), 2, "radar range should be configurable");

    mod.actor_observation_configure_memory(observer, 5, 12);
    assert.equal(mod.actor_observation_get_memory_window(observer), 5, "history window should be configurable");
    assert.equal(mod.actor_observation_get_memory_capacity(observer), 12, "memory capacity should be configurable");

    mod.actor_observation_reset_adjacent(observer);

    for (const dir of DIRECTIONS) {
      // Pretend to send a request; expect a message id placeholder
      const requestId = mod.actor_emission_send_request_adjacent(observer, dir);
      assert.ok(Number.isInteger(requestId), `request id for dir ${dir} should be an integer placeholder`);

      // Poll for a response (placeholder expectation)
      const response = mod.actor_emission_poll_response(observer, requestId);
      assert.ok(response === null || typeof response === "object", `response for dir ${dir} should be pending/placeholder`);

      // Retrieve interpreted info object for that direction
      const info = mod.actor_observation_get_adjacent_snapshot(observer, dir);
      assert.ok(info, `info snapshot for dir ${dir} should exist`);
      assert.equal(info.direction, dir, `info for dir ${dir} should mirror direction`);
      assert.equal(info.status, constants.statusUnknown, `info for dir ${dir} should default to unknown status`);
      assert.equal(info.requestId, 0, `info for dir ${dir} should default request id to 0`);
      assert.equal(info.observedHandle, 0, `info for dir ${dir} should default observed handle to 0`);
    }

    mod.actor_observation_mark_adjacent_pending(observer, constants.directions[0], 101);
    let infoNorth = mod.actor_observation_get_adjacent_snapshot(observer, constants.directions[0]);
    assert.equal(infoNorth.status, constants.statusPending, "pending status should be recorded");
    assert.equal(infoNorth.requestId, 101, "pending status should retain request id");

    mod.actor_observation_mark_adjacent_no_response(observer, constants.directions[1], 202);
    const infoEast = mod.actor_observation_get_adjacent_snapshot(observer, constants.directions[1]);
    assert.equal(infoEast.status, constants.statusNoResponse, "no-response status should be recorded");
    assert.equal(infoEast.requestId, 202, "no-response status should retain request id");

    mod.actor_observation_mark_adjacent_observed(observer, constants.directions[2], 303, neighbour, -1);
    const infoSouth = mod.actor_observation_get_adjacent_snapshot(observer, constants.directions[2]);
    assert.equal(infoSouth.status, constants.statusObserved, "observed status should be recorded");
    assert.equal(infoSouth.requestId, 303, "observed status should retain request id");
    assert.equal(infoSouth.observedHandle, neighbour, "observed status should store handle");
    assert.ok(infoSouth.record === null || typeof infoSouth.record === "object", "observed status should expose record snapshot or null");

    // Persistence check across lifecycle ticks
    mod.actor_lifecycle_process(observer);
    const persisted = mod.actor_observation_get_adjacent_snapshot(observer, constants.directions[2]);
    assert.equal(persisted.status, constants.statusObserved, "observed status should persist across ticks");
  } finally {
    mod.actor_lifecycle_destroy(observer);
    mod.actor_lifecycle_destroy(neighbour);
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
