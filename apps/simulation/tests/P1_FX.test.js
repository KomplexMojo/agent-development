/**
 * [REQ:P1-FX] Actor lifecycle — stateflow smoke test
 * Goal: Exercise the per-tick lifecycle (INTROSPECTION → OBSERVATION → EVALUATION → TRANSITION → EMISSION)
 * through the public API without asserting domain-specific semantics.
 *
 * Scope:
 *  - Only verifies that lifecycle entry points exist and can be invoked without throwing.
 *  - Verifies observation getters return sane numeric values across steps.
 *  - Leaves domain-specific assertions (e.g., stamina, movement guards) to their own requirement tests.
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

  // Public lifecycle + observation surface expected by the facade
  const fns = [
    "actor_lifecycle_create",
    "actor_lifecycle_destroy",
    "actor_lifecycle_init",
    "actor_lifecycle_process",
    "actor_observation_get_x",
    "actor_observation_get_y",
  ];

  for (const name of fns) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  const handle = mod.actor_lifecycle_create();
  try {
    // Helper to assert observation shape is sane
    function expectObservation(label) {
      const x = mod.actor_observation_get_x(handle);
      const y = mod.actor_observation_get_y(handle);
      assert.equal(typeof x, "number", `${label}: x should be a number`);
      assert.equal(typeof y, "number", `${label}: y should be a number`);
      assert.ok(Number.isInteger(x), `${label}: x should be an integer`);
      assert.ok(Number.isInteger(y), `${label}: y should be an integer`);
    }

    // Fresh init provides readable observation
    mod.actor_lifecycle_init(handle);
    expectObservation("after init");

    // A single step should not throw and should keep observation readable
    mod.actor_lifecycle_process(handle);
    expectObservation("after 1 step");

    // Multiple steps remain stable (no NaNs, no exceptions)
    for (let i = 0; i < 3; i++) {
      mod.actor_lifecycle_process(handle);
      expectObservation(`after step ${i + 2}`);
    }

    console.log("[REQ:P1-FX] lifecycle smoke tests: ok");
  } finally {
    mod.actor_lifecycle_destroy(handle);
  }
})().catch((err) => {
  console.error("[REQ:P1-FX] lifecycle smoke tests: failed", err);
  process.exit(1);
});
