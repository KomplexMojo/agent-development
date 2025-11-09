/**
 * [REQ:P2-F01_5] Solver adapter stub should cache results and surface SAT/UNSAT/TIMEOUT codes.
 */
import assert from "node:assert/strict";

(async () => {
  const mod = await loadAssemblyModule();
  const solver = mod.solver_adapter_create();
  const configurator = mod.configurator_lifecycle_create();

  try {
    mod.configurator_lifecycle_initialize(configurator, 5, 5, 0);
    seedSurface(mod, configurator, 5, 5);
    mod.solver_adapter_bind_map(solver, configurator);

    const satCode = mod.solver_adapter_solve_reachability(solver, 0, 0, 1, 0, 0, 2);
    assert.equal(satCode, 1, "reachable cell should return SAT");
    const stepCount = mod.solver_adapter_result_step_count(solver);
    assert.ok(stepCount > 0, "SAT result should provide at least one step");
    const dx = mod.solver_adapter_result_step_get_dx(solver, 0);
    const dy = mod.solver_adapter_result_step_get_dy(solver, 0);
    assert.equal(dx, 1, "first step dx should move east");
    assert.equal(dy, 0, "first step dy should remain on row");

    const cachedCode = mod.solver_adapter_solve_reachability(solver, 0, 0, 1, 0, 0, 2);
    assert.equal(cachedCode, 1, "cached query should reuse SAT result");

    const timeoutCode = mod.solver_adapter_solve_reachability(solver, 0, 0, 4, 4, 0, 1);
    assert.equal(timeoutCode, 3, "insufficient budget should return TIMEOUT");

    const guardCode = mod.solver_adapter_solve_guard_radius(solver, 0, 0, 0, 2, 4);
    assert.equal(guardCode, 2, "guard radius stub currently UNSAT");

    const waypointCode = mod.solver_adapter_solve_waypoint(solver, 0, 0, 0, 0);
    assert.equal(waypointCode, 5, "zero waypoint count unresolved");

    console.log("[REQ:P2-F01_5] solver adapter stub tests: ok");
  } finally {
    mod.solver_adapter_destroy(solver);
    mod.configurator_lifecycle_destroy(configurator);
  }
})().catch((err) => {
  console.error("[REQ:P2-F01_5] solver adapter stub tests: failed", err);
  process.exit(1);
});

async function loadAssemblyModule() {
  try {
    return await import("../build/release.js");
  } catch {
    return import("../build/debug.js");
  }
}

function seedSurface(mod, configurator, width, height) {
  let surfaceId = 1000;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      mod.configurator_surface_ledger_record(configurator, surfaceId++, x, y, 0);
    }
  }
}
