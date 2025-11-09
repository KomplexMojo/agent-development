/**
 * [REQ:P2-F05] Observation aggregation & sweep helpers
 * Covers updated meta requirement plus P2-F05_2 (enhanced sweep) and
 * P2-F05_3 (reconciliation bookkeeping via sweep counts).
 */

import assert from "node:assert/strict";

(async () => {
  let mod;
  try {
    mod = await import("../build/release.js");
  } catch {
    mod = await import("../build/debug.js");
  }

  const fns = [
    "configurator_lifecycle_create",
    "configurator_lifecycle_destroy",
    "configurator_lifecycle_initialize",
    "configurator_surface_ledger_record",
    "configurator_observation_sweep",
    "configurator_observation_last_sweep_count",
    "configurator_surface_pool_get_last_observation_capability",
  ];

  for (const name of fns) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  const handle = mod.configurator_lifecycle_create();
  try {
    mod.configurator_lifecycle_initialize(handle, 2, 2, 0);

    // Register two surface placements so the ledger mirrors expected usage.
    mod.configurator_surface_ledger_record(handle, 11, 0, 0, 0);
    mod.configurator_surface_ledger_record(handle, 12, 1, 0, 0);

    const swept = mod.configurator_observation_sweep(handle);
    assert.equal(swept, 4, "sweep should cover entire surface pool");
    assert.equal(mod.configurator_observation_last_sweep_count(handle), 4, "last sweep count should match");

    // Enhanced capability should be the last recorded mode for each surface.
    const enhanced = expectNumber(mod.actor_observation_capability_enhanced, "actor_observation_capability_enhanced");

    for (let i = 0; i < swept; i++) {
      const cap = mod.configurator_surface_pool_get_last_observation_capability(handle, i);
      assert.equal(cap, enhanced, "sweep should request enhanced observations");
    }

    console.log("[REQ:P2-F05] observation sweep tests: ok");
  } finally {
    mod.configurator_lifecycle_destroy(handle);
  }
})().catch((err) => {
  console.error("[REQ:P2-F05] observation sweep tests: failed", err);
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
