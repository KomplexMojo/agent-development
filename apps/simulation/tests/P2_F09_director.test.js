/**
 * [REQ:P2-F09_2] Director directive application safeguards.
 * Ensures patches are only accepted when enterability and substrate solver
 * checks succeed.
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
    "configurator_map_set_feature",
    "configurator_map_clear_feature",
    "configurator_map_is_enterable",
    "configurator_solver_verify",
    "configurator_director_apply_patch",
  ];

  for (const name of fns) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  const handle = mod.configurator_lifecycle_create();
  try {
    mod.configurator_lifecycle_initialize(handle, 2, 2, 0);
    // Build a simple path from (0,0) to (1,0)
    mod.configurator_surface_ledger_record(handle, 1, 0, 0, 0);
    mod.configurator_surface_ledger_record(handle, 2, 1, 0, 0);

    assert.equal(mod.configurator_map_is_enterable(handle, 1, 0, 0), 1, "target tile should be enterable");
    assert.equal(mod.configurator_solver_verify(handle, 0, 0, 1, 0, 0), 1, "substrate should be traversable");

    assert.equal(
      mod.configurator_director_apply_patch(handle, 1, 0, 0, 0, 0, 1, 0),
      1,
      "valid patch should succeed",
    );

    // Make target non-enterable: add blocking feature.
    mod.configurator_map_set_feature(handle, 1, 0, 0, 77, 1);
    assert.equal(
      mod.configurator_director_apply_patch(handle, 1, 0, 0, 0, 0, 1, 0),
      0,
      "blocking feature should cause patch rejection",
    );

    mod.configurator_map_clear_feature(handle, 1, 0, 0);
    // Break substrate path by removing one surface (re-initialise context).
    mod.configurator_lifecycle_initialize(handle, 1, 1, 0);
    mod.configurator_surface_ledger_record(handle, 3, 0, 0, 0);

    assert.equal(
      mod.configurator_director_apply_patch(handle, 0, 0, 0, 0, 0, 1, 0),
      0,
      "missing substrate should cause patch rejection",
    );

    console.log("[REQ:P2-F09_2] director tests: ok");
  } finally {
    mod.configurator_lifecycle_destroy(handle);
  }
})();
