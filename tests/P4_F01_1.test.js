/**
 * [REQ:P4-F01_1] INTROSPECTION (self-awareness): stamina
 * Goal: The agent tracks and exposes stamina (current, total, regeneration).
 * This test validates the presence and defaults of agent_vitals stamina exports.
 *
 * Verification per requirement:
 *  - unit: reading self-state returns expected values for current, total, and stamina regeneration.
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

  // Required exports (call signatures) for stamina introspection
  const fns = [
    "agent_lifecycle_create",
    "agent_lifecycle_destroy",
    "agent_lifecycle_init",
    "agent_vitals_get_stamina_current",
    "agent_vitals_get_stamina_max",
    "agent_vitals_get_stamina_regen",
  ];

  for (const name of fns) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  const handle = mod.agent_lifecycle_create();
  try {
    // Initialize a fresh agent context
    mod.agent_lifecycle_init(handle);

    // Read stamina values
    const cur0 = mod.agent_vitals_get_stamina_current(handle);
    const max0 = mod.agent_vitals_get_stamina_max(handle);
    const rgn0 = mod.agent_vitals_get_stamina_regen(handle);

    // Basic shape checks
    assert.equal(typeof cur0, "number", "current stamina should be a number");
    assert.equal(typeof max0, "number", "max stamina should be a number");
    assert.equal(typeof rgn0, "number", "stamina regen should be a number");

    // Expected defaults for the initial implementation (can be tuned later):
    // - current == max at init
    // - max defaults to 100
    // - regen defaults to 0 (no automatic change)
    assert.equal(cur0, max0, "at init, current stamina should equal max");
    assert.equal(max0, 100, "default max stamina should be 100");
    assert.equal(rgn0, 0, "default stamina regen should be 0");
  } finally {
    mod.agent_lifecycle_destroy(handle);
  }

  console.log("[REQ:P4-F01_1] stamina introspection tests: ok");
})().catch((err) => {
  console.error("[REQ:P4-F01_1] stamina introspection tests: failed", err);
  process.exit(1);
});
