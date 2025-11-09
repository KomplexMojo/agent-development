/**
 * [REQ:P2-F11] Director hints should resolve per actor so movement stays autonomous.
 */

import assert from "node:assert/strict";

(async () => {
  const mod = await loadAssemblyModule();
  const configurator = mod.configurator_lifecycle_create();
  const actors = [createMobile(mod), createMobile(mod)];

  try {
    mod.configurator_lifecycle_initialize(configurator, 3, 3, 0);

    // Create a 3x3 walkable surface so both actors can move independently.
    let surfaceId = 200;
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        mod.configurator_surface_ledger_record(configurator, surfaceId++, x, y, 0);
      }
    }

    const aiuId = 9001;
    mod.configurator_aiu_register(configurator, aiuId);

    const placements = [
      { handle: actors[0], x: 0, y: 0, level: 0, expected: { dx: 1, dy: 0 } },
      { handle: actors[1], x: 2, y: 2, level: 0, expected: { dx: 0, dy: -1 } },
    ];

    for (const { handle, x, y, level } of placements) {
      mod.configurator_actor_ledger_record(configurator, handle, x, y, level, 1);
      mod.configurator_actor_pool_register(configurator, handle);
      mod.configurator_actor_assign_aiu(configurator, handle, aiuId);
      seedActorPosition(mod, handle, x, y);
    }

    const tickSeed = 77;
    for (const { handle, expected } of placements) {
      mod.configurator_director_set_movement(configurator, handle, expected.dx, expected.dy, tickSeed);
    }

    const queueHandle = expectNumber(
      mod.configurator_dispatch_process(configurator, tickSeed),
      "configurator_dispatch_process",
    );

    try {
      const count = expectNumber(
        mod.configurator_dispatch_get_entry_count(queueHandle),
        "configurator_dispatch_get_entry_count",
      );
      assert.equal(count, placements.length, "dispatch should stage one entry per actor");

      const tierAiu = expectNumber(mod.configurator_dispatch_tier_aiu, "configurator_dispatch_tier_aiu");
      const seen = new Map();

      for (let i = 0; i < count; i++) {
        const actorHandle = expectNumber(
          mod.configurator_dispatch_get_actor_handle(queueHandle, i),
          "configurator_dispatch_get_actor_handle",
        );
        const dx = expectNumber(
          mod.configurator_dispatch_get_intent_dx(queueHandle, i),
          "configurator_dispatch_get_intent_dx",
        );
        const dy = expectNumber(
          mod.configurator_dispatch_get_intent_dy(queueHandle, i),
          "configurator_dispatch_get_intent_dy",
        );
        const tier = expectNumber(
          mod.configurator_dispatch_get_intent_tier(queueHandle, i),
          "configurator_dispatch_get_intent_tier",
        );
        seen.set(actorHandle, { dx, dy, tier });
      }

      for (const { handle, expected } of placements) {
        assert.ok(seen.has(handle), "every actor should appear in the dispatch queue");
        const result = seen.get(handle);
        assert.equal(result.tier, tierAiu, "director hints should register as AIU tier intents");
        assert.equal(result.dx, expected.dx, "actor dx should match its individual director hint");
        assert.equal(result.dy, expected.dy, "actor dy should match its individual director hint");
      }

      const [first, second] = placements.map((p) => seen.get(p.handle));
      assert.notDeepEqual(first, second, "actors should retain distinct intents when hints differ");
    } finally {
      mod.configurator_dispatch_release(queueHandle);
    }

    console.log("[REQ:P2-F11] director autonomy dispatch: ok");
  } finally {
    mod.configurator_lifecycle_destroy(configurator);
    for (const handle of actors) {
      try {
        mod.actor_lifecycle_destroy(handle);
      } catch {
        /* ignore teardown errors */
      }
    }
  }
})().catch((err) => {
  console.error("[REQ:P2-F11] director autonomy dispatch: failed", err);
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
