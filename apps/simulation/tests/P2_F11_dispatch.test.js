/**
 * [REQ:P2-F11] Movement dispatch queue staging.
 * Exercises the essential queue behaviour so the configurator can stage every ambulatory actor,
 * assign deterministic priorities, and expose telemetry for downstream personas.
 */

import assert from "node:assert/strict";

(async () => {
  const mod = await loadAssemblyModule();

  const requiredFunctions = [
    // lifecycle + ledgers
    "configurator_lifecycle_create",
    "configurator_lifecycle_destroy",
    "configurator_lifecycle_initialize",
    "configurator_surface_ledger_record",
    "configurator_actor_ledger_record",
    "configurator_actor_pool_register",
    "configurator_actor_assign_aiu",
    "configurator_actor_pool_available_count",
    "configurator_actor_pool_borrowed_count",
    "configurator_map_is_enterable",
    "configurator_actor_role_mobile",
    "configurator_actor_role_barrier",
    // dispatch queue API (new)
    "configurator_dispatch_process",
    "configurator_dispatch_release",
    "configurator_dispatch_get_entry_count",
    "configurator_dispatch_get_actor_handle",
    "configurator_dispatch_get_priority_token",
    "configurator_dispatch_get_initial_x",
    "configurator_dispatch_get_initial_y",
    "configurator_dispatch_get_initial_level",
    "configurator_dispatch_get_stamina",
    "configurator_dispatch_get_intent_dx",
    "configurator_dispatch_get_intent_dy",
    "configurator_dispatch_get_intent_tier",
    "configurator_dispatch_get_outcome",
    "configurator_dispatch_get_rejection_code",
    "configurator_dispatch_get_history_count",
  ];

  const requiredConstants = [
    "configurator_dispatch_tier_aiu",
    "configurator_dispatch_tier_logic",
    "configurator_dispatch_tier_instinct",
    "configurator_dispatch_outcome_pending",
    "configurator_dispatch_outcome_accepted",
    "configurator_dispatch_outcome_rejected",
    "configurator_dispatch_rejection_none",
    "configurator_dispatch_rejection_stamina",
    "configurator_dispatch_rejection_blocked",
    "configurator_dispatch_rejection_duplicate",
  ];

  for (const name of requiredFunctions) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  for (const name of requiredConstants) {
    const value = mod[name];
    assert.ok(
      typeof value === "number" || (typeof value === "object" && value !== null),
      `${name} constant should expose a numeric value`,
    );
    expectNumber(value, name);
  }

  const aiuDirective = 7001;
  const actors = [];
  const placements = new Map(); // actorHandle -> { x, y, level }

  const handle = mod.configurator_lifecycle_create();
  let barrierHandle = 0;
  try {
    mod.configurator_lifecycle_initialize(handle, 4, 4, 0);

    // Create a 3x3 walkable surface
    let surfaceId = 100;
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        mod.configurator_surface_ledger_record(handle, surfaceId++, x, y, 0);
      }
    }

    const roleMobile = expectNumber(
      mod.configurator_actor_role_mobile(),
      "configurator_actor_role_mobile",
    );
    const roleBarrier = expectNumber(
      mod.configurator_actor_role_barrier(),
      "configurator_actor_role_barrier",
    );

    // Provision three mobile actors in different cells
    for (const coord of [
      { x: 0, y: 0, level: 0 },
      { x: 2, y: 0, level: 0 },
      { x: 1, y: 2, level: 0 },
    ]) {
      const actorHandle = createMobile(mod);
      actors.push(actorHandle);
      placements.set(actorHandle, coord);
      mod.configurator_actor_ledger_record(handle, actorHandle, coord.x, coord.y, coord.level, roleMobile);
      mod.configurator_actor_pool_register(handle, actorHandle);
      mod.configurator_actor_assign_aiu(handle, actorHandle, aiuDirective);
    }

    barrierHandle = createBarrier(mod);
    mod.configurator_actor_ledger_record(handle, barrierHandle, 1, 1, 0, roleBarrier);
    assert.equal(
      mod.configurator_map_is_enterable(handle, 1, 1, 0),
      0,
      "barrier occupies its cell and prevents entry",
    );

    assert.equal(
      mod.configurator_actor_pool_available_count(handle),
      actors.length,
      "all actors should be available before dispatch",
    );
    assert.equal(mod.configurator_actor_pool_borrowed_count(handle), 0, "no actors borrowed yet");

    const tickSeed = 42;
    const queueHandle = expectNumber(
      mod.configurator_dispatch_process(handle, tickSeed),
      "configurator_dispatch_process",
    );
    try {
      const entryCount = expectNumber(
        mod.configurator_dispatch_get_entry_count(queueHandle),
        "configurator_dispatch_get_entry_count",
      );
      assert.equal(entryCount, actors.length, "dispatch queue should include every ambulatory actor");

      const tierAiu = expectNumber(mod.configurator_dispatch_tier_aiu, "configurator_dispatch_tier_aiu");
      const tierLogic = expectNumber(mod.configurator_dispatch_tier_logic, "configurator_dispatch_tier_logic");
      const tierInstinct = expectNumber(mod.configurator_dispatch_tier_instinct, "configurator_dispatch_tier_instinct");
      const allowedTiers = [tierAiu, tierLogic, tierInstinct];

      const outcomePending = expectNumber(
        mod.configurator_dispatch_outcome_pending,
        "configurator_dispatch_outcome_pending",
      );
      const rejectionNone = expectNumber(
        mod.configurator_dispatch_rejection_none,
        "configurator_dispatch_rejection_none",
      );

      const tokens = [];
      const order = [];
      const seenActors = new Set();
      for (let i = 0; i < entryCount; i++) {
        const actorHandle = expectNumber(
          mod.configurator_dispatch_get_actor_handle(queueHandle, i),
          "configurator_dispatch_get_actor_handle",
        );
        assert.ok(placements.has(actorHandle), "queue should reference registered actors");
        assert.ok(!seenActors.has(actorHandle), "each actor should appear exactly once");
        seenActors.add(actorHandle);
        order.push(actorHandle);

        const queueActor = placements.get(actorHandle);
        const { x, y, level } = queueActor;
        assert.equal(
          mod.configurator_dispatch_get_initial_x(queueHandle, i),
          x,
          "queue entry should capture origin X",
        );
        assert.equal(
          mod.configurator_dispatch_get_initial_y(queueHandle, i),
          y,
          "queue entry should capture origin Y",
        );
        assert.equal(
          mod.configurator_dispatch_get_initial_level(queueHandle, i),
          level,
          "queue entry should capture origin level",
        );

        const stamina = expectNumber(
          mod.configurator_dispatch_get_stamina(queueHandle, i),
          "configurator_dispatch_get_stamina",
        );
        assert.ok(stamina >= 0, "stamina snapshot should be non-negative");

        const tier = expectNumber(
          mod.configurator_dispatch_get_intent_tier(queueHandle, i),
          "configurator_dispatch_get_intent_tier",
        );
        assert.ok(allowedTiers.includes(tier), `tier ${tier} should match one of the dispatch tiers`);

        const dx = expectNumber(
          mod.configurator_dispatch_get_intent_dx(queueHandle, i),
          "configurator_dispatch_get_intent_dx",
        );
        const dy = expectNumber(
          mod.configurator_dispatch_get_intent_dy(queueHandle, i),
          "configurator_dispatch_get_intent_dy",
        );
        assert.ok(Number.isInteger(dx) && Number.isInteger(dy), "intent offsets should be integers");

        if (tier === tierAiu) {
          const expected = computeExpectedAiuIntent(aiuDirective, actorHandle, tickSeed);
          assert.equal(dx, expected.dx, "AIU intent dx should match scripted contract");
          assert.equal(dy, expected.dy, "AIU intent dy should match scripted contract");
        }

        const token = expectNumber(
          mod.configurator_dispatch_get_priority_token(queueHandle, i),
          "configurator_dispatch_get_priority_token",
        );
        tokens.push(token);

        const outcome = expectNumber(
          mod.configurator_dispatch_get_outcome(queueHandle, i),
          "configurator_dispatch_get_outcome",
        );
        assert.equal(outcome, outcomePending, "queue staging should mark entries as pending");

        const rejectionCode = expectNumber(
          mod.configurator_dispatch_get_rejection_code(queueHandle, i),
          "configurator_dispatch_get_rejection_code",
        );
        assert.equal(rejectionCode, rejectionNone, "fresh queue entries should have no rejection");

        const historyCount = expectNumber(
          mod.configurator_dispatch_get_history_count(queueHandle, i),
          "configurator_dispatch_get_history_count",
        );
        assert.ok(historyCount >= 0, "history count should be available even if empty");
      }

      assert.deepStrictEqual(
        [...tokens].sort((a, b) => a - b),
        tokens,
        "priority tokens should be sorted ascending to guarantee deterministic order",
      );

      // Re-running dispatch for the same tick should preserve ordering.
      const queueHandleSameTick = expectNumber(
        mod.configurator_dispatch_process(handle, tickSeed),
        "configurator_dispatch_process (same tick)",
      );
      try {
        const repeatOrder = readOrder(mod, queueHandleSameTick, entryCount);
        assert.deepStrictEqual(repeatOrder, order, "ordering must be stable for the same tick seed");
      } finally {
        mod.configurator_dispatch_release(queueHandleSameTick);
      }

      // A different tick seed should re-shuffle priority tokens.
      const queueHandleNewTick = expectNumber(
        mod.configurator_dispatch_process(handle, tickSeed + 1),
        "configurator_dispatch_process (next tick)",
      );
      try {
        const nextTokens = readTokens(mod, queueHandleNewTick, entryCount);
        assert.notDeepEqual(
          nextTokens,
          tokens,
          "different tick seeds should yield different priority tokens",
        );
      } finally {
        mod.configurator_dispatch_release(queueHandleNewTick);
      }
    } finally {
      mod.configurator_dispatch_release(queueHandle);
    }
  } finally {
    mod.configurator_lifecycle_destroy(handle);
    while (actors.length > 0) {
      const actorHandle = actors.pop();
      try {
        mod.actor_lifecycle_destroy(actorHandle);
      } catch {
        /* ignore */
      }
    }
    if (barrierHandle !== 0) {
      try {
        mod.actor_lifecycle_destroy(barrierHandle);
      } catch {
        /* ignore */
      }
    }
  }

  console.log("[REQ:P2-F11] dispatch queue tests: ok");
})().catch((err) => {
  console.error("[REQ:P2-F11] dispatch queue tests: failed", err);
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

function createBarrier(mod) {
  const archetype = expectNumber(mod.actor_archetype_static_tile, "actor_archetype_static_tile");
  const handle = mod.actor_lifecycle_create(archetype, false);
  mod.actor_lifecycle_init(handle);
  return handle;
}

function expectNumber(value, label) {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && typeof value.valueOf === "function") {
    const numeric = Number(value.valueOf());
    if (Number.isFinite(numeric)) return numeric;
  }
  throw new TypeError(`${label} should expose a numeric value`);
}

function readOrder(mod, queueHandle, entryCount) {
  const order = [];
  for (let i = 0; i < entryCount; i++) {
    order.push(expectNumber(mod.configurator_dispatch_get_actor_handle(queueHandle, i), "configurator_dispatch_get_actor_handle"));
  }
  return order;
}

function readTokens(mod, queueHandle, entryCount) {
  const tokens = [];
  for (let i = 0; i < entryCount; i++) {
    tokens.push(expectNumber(mod.configurator_dispatch_get_priority_token(queueHandle, i), "configurator_dispatch_get_priority_token"));
  }
  return tokens;
}

function computeExpectedAiuIntent(aiuId, actorHandle, tickSeed) {
  if (aiuId === 0) return { dx: 0, dy: 0 };
  const directions = [
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: 1 },
    { dx: -1, dy: 1 },
    { dx: -1, dy: -1 },
    { dx: 1, dy: -1 },
  ];
  const seed = (aiuId ^ (actorHandle << 1) ^ tickSeed) >>> 0;
  const rotation = directions.length > 0 ? seed % directions.length : 0;
  for (let i = 0; i < directions.length; i++) {
    const dir = directions[(rotation + i) % directions.length];
    if (dir.dx !== 0 || dir.dy !== 0) {
      return dir;
    }
  }
  return { dx: 0, dy: 0 };
}
