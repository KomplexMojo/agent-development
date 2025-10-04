/**
 * [REQ:P4-F02_3] Observation — radar range and memory configuration (scaffold)
 * Goal: Ensure observation exposes configuration hooks for radar range and
 * historical memory so future implementations can honour queue limits.
 *
 * Run:
 *   npm run asbuild
 *   npm test
 */

import assert from "node:assert/strict";

(async () => {
  let mod;
  try { mod = await import("../build/release.js"); } catch { mod = await import("../build/debug.js"); }

  const expectedExports = [
    "agent_lifecycle_create",
    "agent_lifecycle_destroy",
    "agent_lifecycle_init",
    "agent_lifecycle_step",
    "agent_observation_set_radar_range",
    "agent_observation_get_radar_range",
    "agent_observation_configure_memory",
    "agent_observation_get_memory_window",
    "agent_observation_get_memory_capacity",
    "agent_observation_get_record_count",
    "agent_observation_get_latest_record",
  ];

  for (const name of expectedExports) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  const observer = mod.agent_lifecycle_create();
  const target = mod.agent_lifecycle_create();

  try {
    mod.agent_lifecycle_init(observer);
    mod.agent_lifecycle_init(target);
    mod.agent_lifecycle_step(observer);
    mod.agent_lifecycle_step(target);

    // Radar configuration should clamp to a minimum of 1 and accept higher values.
    mod.agent_observation_set_radar_range(observer, 0);
    assert.equal(mod.agent_observation_get_radar_range(observer), 1, "radar range should clamp to minimum of 1");
    mod.agent_observation_set_radar_range(observer, 3);
    assert.equal(mod.agent_observation_get_radar_range(observer), 3, "radar range should accept larger values");

    // Memory configuration should store history window and capacity for future trimming logic.
    mod.agent_observation_configure_memory(observer, 4, 2);
    assert.equal(mod.agent_observation_get_memory_window(observer), 4, "memory window should store supplied tick span");
    assert.equal(mod.agent_observation_get_memory_capacity(observer), 2, "memory capacity should store supplied limit");

    // Gather more observations than the configured capacity to ensure the queue honours the limit.
    const records = [];
    for (let i = 0; i < 3; i++) {
      mod.agent_lifecycle_step(observer);
      const count = mod.agent_observation_get_record_count(observer);
      records.push(mod.agent_observation_get_latest_record(observer));
      mod.agent_transition_move_by(target, 1, 0);
      mod.agent_lifecycle_step(target);
    }

    const count = mod.agent_observation_get_record_count(observer);
    assert.equal(count, 2, "observation queue should retain at most the configured capacity");

    const latest = mod.agent_observation_get_latest_record(observer);
    const expectedLast = records[records.length - 1];
    assert.equal(latest.requestId, expectedLast.requestId, "latest record should reflect the most recent interrogation");
  } finally {
    mod.agent_lifecycle_destroy(observer);
    mod.agent_lifecycle_destroy(target);
  }
})();
