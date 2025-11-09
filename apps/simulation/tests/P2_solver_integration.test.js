/**
 * [REQ:P2-F01_5] Configurator AIU pipeline consults solver adapter for reachability intents.
 */
import assert from "node:assert/strict";

(async () => {
  const mod = await loadAssemblyModule();
  const configurator = mod.configurator_lifecycle_create();
  const actor = createMobile(mod);

  try {
    mod.configurator_lifecycle_initialize(configurator, 4, 3, 0);
    seedSurface(mod, configurator, 4, 3);

    const aiuId = 9101;
    mod.configurator_aiu_register(configurator, aiuId);

    const roleMobile = expectNumber(mod.configurator_actor_role_mobile(), "configurator_actor_role_mobile");
    mod.configurator_actor_ledger_record(configurator, actor, 1, 1, 0, roleMobile);
    mod.configurator_actor_assign_aiu(configurator, actor, aiuId);
    mod.configurator_actor_pool_register(configurator, actor);
    seedActorPosition(mod, actor, 1, 1);

    const queueHandle = expectNumber(mod.configurator_dispatch_process(configurator, 9), "configurator_dispatch_process");
    try {
      const count = mod.configurator_dispatch_get_entry_count(queueHandle);
      assert.equal(count, 1, "single actor should stage one dispatch entry");
      const tier = mod.configurator_dispatch_get_intent_tier(queueHandle, 0);
      const tierAiu = expectNumber(mod.configurator_dispatch_tier_aiu, "configurator_dispatch_tier_aiu");
      assert.equal(tier, tierAiu, "solver-backed intents should be tagged AIU tier");

      const dx = mod.configurator_dispatch_get_intent_dx(queueHandle, 0);
      const dy = mod.configurator_dispatch_get_intent_dy(queueHandle, 0);
      assert.ok(Math.abs(dx) <= 1, "solver intent step dx should be adjacent");
      assert.ok(Math.abs(dy) <= 1, "solver intent step dy should be adjacent");
      assert.ok(Math.abs(dx) + Math.abs(dy) > 0, "solver intent should yield movement");
    } finally {
      mod.configurator_dispatch_release(queueHandle);
    }

    console.log("[REQ:P2-F01_5] solver integration tests: ok");
  } finally {
    mod.configurator_lifecycle_destroy(configurator);
    mod.actor_lifecycle_destroy(actor);
  }
})().catch((err) => {
  console.error("[REQ:P2-F01_5] solver integration tests: failed", err);
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
  let surfaceId = 2000;
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
  if (typeof value === "object" && value !== null && typeof value.valueOf === "function") {
    const numeric = Number(value.valueOf());
    if (Number.isFinite(numeric)) return numeric;
  }
  throw new TypeError(`${label} should expose a numeric value`);
}
