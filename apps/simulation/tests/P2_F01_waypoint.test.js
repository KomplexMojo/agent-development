/**
 * [REQ:P2-F01_5] Waypoint AIU module should invoke solver adapter and surface UNSAT from the stub.
 */
import assert from "node:assert/strict";

(async () => {
  const mod = await loadAssemblyModule();
  const configurator = mod.configurator_lifecycle_create();
  const actor = createMobile(mod);

  try {
    mod.configurator_lifecycle_initialize(configurator, 5, 5, 0);
    seedSurface(mod, configurator, 5, 5);

    const waypointModuleId = 1003; // WaypointAiu module id defined in aiuRuntime
    const moduleKind = 4;
    const baseCost = 12;
    const upkeep = 2;

    if (typeof mod.configurator_aiu_register_template === "function") {
      mod.configurator_aiu_register_template(configurator, waypointModuleId, moduleKind, baseCost, upkeep);
    } else {
      mod.configurator_aiu_register(configurator, waypointModuleId);
    }

    const roleMobile = expectNumber(mod.configurator_actor_role_mobile, "configurator_actor_role_mobile");
    mod.configurator_actor_ledger_record(configurator, actor, 1, 1, 0, roleMobile);
    mod.configurator_actor_assign_aiu(configurator, actor, waypointModuleId);
    seedActorPosition(mod, actor, 1, 1);

    const queue = expectNumber(mod.configurator_dispatch_process(configurator, 73), "configurator_dispatch_process");
    try {
      const solverCode = mod.configurator_dispatch_get_solver_code(queue, 0);
      const solverUnsat = expectNumber(mod.solver_result_code_unsat, "solver_result_code_unsat");
      assert.equal(solverCode, solverUnsat, "waypoint AIU should surface UNSAT verdict from stub");

      const dx = mod.configurator_dispatch_get_intent_dx(queue, 0);
      const dy = mod.configurator_dispatch_get_intent_dy(queue, 0);
      assert.equal(dx, 0, "waypoint fallback dx should default to zero");
      assert.equal(dy, 0, "waypoint fallback dy should default to zero");
    } finally {
      mod.configurator_dispatch_release(queue);
    }

    console.log("[REQ:P2-F01_5] waypoint AIU scaffolding tests: ok");
  } finally {
    mod.configurator_lifecycle_destroy(configurator);
    mod.actor_lifecycle_destroy(actor);
  }
})().catch((err) => {
  console.error("[REQ:P2-F01_5] waypoint AIU scaffolding tests: failed", err);
  process.exit(1);
});

async function loadAssemblyModule() {
  try {
    return await import("../build/release.js");
  } catch {
    return import("../build/debug.js");
  }
}

function createMobile(mod) {
  const archetype = expectNumber(mod.actor_archetype_mobile, "actor_archetype_mobile");
  const handle = mod.actor_lifecycle_create(archetype);
  mod.actor_lifecycle_init(handle);
  return handle;
}

function seedSurface(mod, configurator, width, height) {
  let surfaceId = 7100;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      mod.configurator_surface_ledger_record(configurator, surfaceId++, x, y, 0);
    }
  }
}

function seedActorPosition(mod, actorHandle, targetX, targetY) {
  const currentX = mod.actor_observation_get_x(actorHandle);
  const currentY = mod.actor_observation_get_y(actorHandle);
  const dx = targetX - currentX;
  const dy = targetY - currentY;
  if (dx !== 0 || dy !== 0) {
    mod.actor_transition_move_by(actorHandle, dx, dy);
  }
}

function expectNumber(value, label) {
  if (typeof value === "number") return value;
  if (typeof value === "function") {
    const result = value();
    if (typeof result === "number") return result;
  }
  if (typeof value === "object" && value !== null && typeof value.valueOf === "function") {
    const numeric = Number(value.valueOf());
    if (Number.isFinite(numeric)) return numeric;
  }
  throw new TypeError(`${label} should expose a numeric value`);
}
