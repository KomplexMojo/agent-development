/**
 * [REQ:P1-F07] Cultivation regenerates vitals and records vulnerability windows.
 * [REQ:P1-F03] Core AIU modules (find_exit, defend_exit, patrol_corridor) honour solver verdicts with graceful fallbacks.
 */
import assert from "node:assert/strict";

(async () => {
  const mod = await loadAssemblyModule();
  const configurator = mod.configurator_lifecycle_create();
  const actor = createMobile(mod);
  const MODE_CULTIVATE = expectNumber(mod.AIU_INTENT_MODE_CULTIVATE, "AIU_INTENT_MODE_CULTIVATE");
  const MODE_NONE = expectNumber(mod.AIU_INTENT_MODE_NONE, "AIU_INTENT_MODE_NONE");

  try {
    mod.configurator_lifecycle_initialize(configurator, 5, 5, 0);
    seedSurface(mod, configurator, 5, 5);

    const cultivationModuleId = 1401;
    const moduleKind = 9;
    assert.equal(
      typeof mod.configurator_aiu_register_template,
      "function",
      "configurator_aiu_register_template export required",
    );
    mod.configurator_aiu_register_template(configurator, cultivationModuleId, moduleKind, 6, 1);

    const roleMobile = expectNumber(mod.configurator_actor_role_mobile, "configurator_actor_role_mobile");
    mod.configurator_actor_ledger_record(configurator, actor, 2, 2, 0, roleMobile);
    mod.configurator_actor_assign_aiu(configurator, actor, cultivationModuleId);
    mod.actor_transition_teleport(actor, 2, 2, 0);

    const maxStamina = mod.actor_vitals_get_stamina_max(actor);
    const cultivationTarget = Math.max(0, Math.floor(maxStamina / 2));
    drainStaminaTo(mod, actor, cultivationTarget);
    mod.actor_transition_teleport(actor, 2, 2, 0);
    const drainedStamina = mod.actor_vitals_get_stamina_current(actor);
    assert.ok(drainedStamina <= cultivationTarget, "stamina must be drained to trigger cultivation");

    const ticksCultivated = 4;
    let latestStamina = drainedStamina;
    for (let i = 0; i < ticksCultivated; i++) {
      const queue = expectNumber(mod.configurator_dispatch_process(configurator, 100 + i), "dispatch handle");
      try {
        const tier = mod.configurator_dispatch_get_intent_tier(queue, 0);
        assert.equal(tier, 1, "cultivation intents should be tier AIU");
        const dx = mod.configurator_dispatch_get_intent_dx(queue, 0);
        const dy = mod.configurator_dispatch_get_intent_dy(queue, 0);
        assert.equal(dx, 0, "cultivation keeps actors stationary (dx)");
        assert.equal(dy, 0, "cultivation keeps actors stationary (dy)");

        const aiuMode = mod.configurator_dispatch_get_aiu_mode(queue, 0);
        assert.equal(aiuMode, MODE_CULTIVATE, "dispatch mode should mark cultivation");

        const cultTicks = mod.configurator_dispatch_get_cultivation_ticks(queue, 0);
        assert.equal(cultTicks, i + 1, "cultivation tick counter should increment each tick");

        const vulnerabilityTicks = mod.configurator_dispatch_get_vulnerability_ticks(queue, 0);
        assert.equal(vulnerabilityTicks, 0, "vulnerability window should remain zero while cultivating");

        const staminaAfterTick = mod.actor_vitals_get_stamina_current(actor);
        assert.ok(
          staminaAfterTick >= latestStamina,
          "stamina should not decrease while cultivating",
        );
        latestStamina = staminaAfterTick;
      } finally {
        mod.configurator_dispatch_release(queue);
      }
    }

    assert.ok(
      latestStamina > drainedStamina,
      "cultivation should regenerate stamina over time",
    );
    assert.equal(
      mod.configurator_actor_get_cultivation_ticks(configurator, actor),
      ticksCultivated,
      "context should remember cultivation streak",
    );

    mod.configurator_actor_assign_aiu(configurator, actor, 0);
    const vulnerabilityQueue = expectNumber(
      mod.configurator_dispatch_process(configurator, 200),
      "dispatch handle after cultivation",
    );
    try {
      const aiuMode = mod.configurator_dispatch_get_aiu_mode(vulnerabilityQueue, 0);
      assert.equal(aiuMode, MODE_NONE, "leaving cultivation should reset AIU intent mode");

      const cultTicks = mod.configurator_dispatch_get_cultivation_ticks(vulnerabilityQueue, 0);
      assert.equal(cultTicks, 0, "cultivation counter should reset after leaving cultivation");

      const vulnerabilityTicks = mod.configurator_dispatch_get_vulnerability_ticks(vulnerabilityQueue, 0);
      assert.equal(vulnerabilityTicks, 2, "four cultivation ticks yield sqrt window of 2 ticks");

      assert.equal(
        mod.configurator_actor_get_vulnerability_ticks(configurator, actor),
        2,
        "vulnerability counter should persist on context",
      );
    } finally {
      mod.configurator_dispatch_release(vulnerabilityQueue);
    }

    const decayQueue = expectNumber(mod.configurator_dispatch_process(configurator, 201), "dispatch handle for decay");
    try {
      const vulnerabilityTicks = mod.configurator_dispatch_get_vulnerability_ticks(decayQueue, 0);
      assert.equal(vulnerabilityTicks, 1, "subsequent ticks should decrement vulnerability countdown");
    } finally {
      mod.configurator_dispatch_release(decayQueue);
    }

    console.log("[REQ:P1-F07] cultivation AIU tests: ok");
  } finally {
    mod.configurator_lifecycle_destroy(configurator);
    mod.actor_lifecycle_destroy(actor);
  }
})().catch((err) => {
  console.error("[REQ:P1-F07] cultivation AIU tests: failed", err);
  process.exit(1);
});

(async () => {
  const mod = await loadAssemblyModule();
  const configurator = mod.configurator_lifecycle_create();
  const actor = createMobile(mod);
  const MODE_CULTIVATE = expectNumber(mod.AIU_INTENT_MODE_CULTIVATE, "AIU_INTENT_MODE_CULTIVATE");
  try {
    mod.configurator_lifecycle_initialize(configurator, 20, 7, 0);
    seedSurface(mod, configurator, 20, 7);

    const findExitModuleId = 1101;
    mod.configurator_aiu_register_template(configurator, findExitModuleId, 5, 12, 2);

    const roleMobile = expectNumber(mod.configurator_actor_role_mobile, "configurator_actor_role_mobile");
    mod.configurator_actor_ledger_record(configurator, actor, 1, 1, 0, roleMobile);
    mod.actor_transition_teleport(actor, 1, 1, 0);
    mod.configurator_actor_assign_aiu(configurator, actor, findExitModuleId);

    const exitX = 15;
    const exitY = 1;
    mod.configurator_map_set_portal(configurator, exitX, exitY, 0, 2);

    const CODE_SAT = expectNumber(mod.solver_result_code_sat, "solver_result_code_sat");
    const CODE_TIMEOUT = expectNumber(mod.solver_result_code_timeout, "solver_result_code_timeout");
    const CODE_UNSAT = expectNumber(mod.solver_result_code_unsat, "solver_result_code_unsat");

    const satQueue = expectNumber(mod.configurator_dispatch_process(configurator, 300), "dispatch handle (SAT)");
    try {
      const solverCode = mod.configurator_dispatch_get_solver_code(satQueue, 0);
      assert.equal(solverCode, CODE_SAT, "reachable exit should produce SAT verdict");

      const dx = mod.configurator_dispatch_get_intent_dx(satQueue, 0);
      const dy = mod.configurator_dispatch_get_intent_dy(satQueue, 0);
      assert.ok(Math.abs(dx) <= 1 && Math.abs(dy) <= 1, "SAT intent must be a single-step vector");
      assert.ok(dx !== 0 || dy !== 0, "SAT intent should move toward the exit");
    } finally {
      mod.configurator_dispatch_release(satQueue);
    }

    drainStaminaTo(mod, actor, 0);
    mod.actor_resources_cultivate_tick(actor);
    mod.actor_transition_teleport(actor, 1, 1, 0);
    const staminaBeforeTimeout = mod.actor_vitals_get_stamina_current(actor);
    const exitDistance = exitX - 1; // actor positioned at x=1, same y
    assert.ok(
      staminaBeforeTimeout < exitDistance,
      `expected drained stamina < distance (${exitDistance}), got ${staminaBeforeTimeout}`,
    );

    const timeoutQueue = expectNumber(mod.configurator_dispatch_process(configurator, 301), "dispatch handle (TIMEOUT)");
    try {
      const solverCode = mod.configurator_dispatch_get_solver_code(timeoutQueue, 0);
      assert.equal(solverCode, CODE_TIMEOUT, "insufficient stamina budget should surface TIMEOUT verdict");

      const dx = mod.configurator_dispatch_get_intent_dx(timeoutQueue, 0);
      const dy = mod.configurator_dispatch_get_intent_dy(timeoutQueue, 0);
      assert.ok(Math.abs(dx) <= 1 && Math.abs(dy) <= 1, "fallback intent should remain single-step");
    } finally {
      mod.configurator_dispatch_release(timeoutQueue);
    }

    for (let i = 0; i < 20; i++) {
      mod.actor_resources_cultivate_tick(actor);
    }
    mod.actor_transition_teleport(actor, 1, 1, 0);

    mod.configurator_map_set_feature(configurator, exitX, exitY, 0, 9001, 1);

    const unsatQueue = expectNumber(mod.configurator_dispatch_process(configurator, 302), "dispatch handle (UNSAT)");
    try {
      const solverCode = mod.configurator_dispatch_get_solver_code(unsatQueue, 0);
      assert.equal(solverCode, CODE_UNSAT, "blocked exit should produce UNSAT verdict");

      const dx = mod.configurator_dispatch_get_intent_dx(unsatQueue, 0);
      const dy = mod.configurator_dispatch_get_intent_dy(unsatQueue, 0);
      assert.ok(Math.abs(dx) <= 1 && Math.abs(dy) <= 1, "UNSAT fallback should yield adjacent intent");
    } finally {
      mod.configurator_dispatch_release(unsatQueue);
    }

    console.log("[REQ:P1-F03] find_exit AIU tests: ok");
  } finally {
    mod.configurator_lifecycle_destroy(configurator);
    mod.actor_lifecycle_destroy(actor);
  }
})().catch((err) => {
  console.error("[REQ:P1-F03] find_exit AIU tests: failed", err);
  process.exit(1);
});

(async () => {
  const mod = await loadAssemblyModule();
  const configurator = mod.configurator_lifecycle_create();
  const actor = createMobile(mod);
  const MODE_CULTIVATE = expectNumber(mod.AIU_INTENT_MODE_CULTIVATE, "AIU_INTENT_MODE_CULTIVATE");
  try {
    mod.configurator_lifecycle_initialize(configurator, 7, 7, 0);
    seedSurface(mod, configurator, 7, 7);

    const findExitModuleId = 1101;
    const cultivationModuleId = 1401;
    mod.configurator_aiu_register_template(configurator, findExitModuleId, 5, 12, 2);
    mod.configurator_aiu_register_template(configurator, cultivationModuleId, 6, 5, 0);

    const roleMobile = expectNumber(mod.configurator_actor_role_mobile, "configurator_actor_role_mobile");
    mod.configurator_actor_ledger_record(configurator, actor, 2, 2, 0, roleMobile);
    mod.actor_transition_teleport(actor, 2, 2, 0);
    mod.configurator_actor_assign_aiu(configurator, actor, findExitModuleId);

    drainStaminaTo(mod, actor, 0);
    mod.actor_transition_teleport(actor, 2, 2, 0);

    let observedCultivation = false;
    for (let i = 0; i < 12; i++) {
      const queue = expectNumber(mod.configurator_dispatch_process(configurator, 500 + i), "dispatch handle (forced cultivation)");
      try {
        const aiuMode = mod.configurator_dispatch_get_aiu_mode(queue, 0);
        if (aiuMode === MODE_CULTIVATE) {
          observedCultivation = true;
          break;
        }
      } finally {
        mod.configurator_dispatch_release(queue);
      }
    }

    assert.ok(
      observedCultivation,
      "actors without an explicit cultivation AIU should auto-enter cultivation when depleted",
    );

    const staminaMax = mod.actor_vitals_get_stamina_max(actor);
    const exitThreshold = computeCultivationExitThreshold(staminaMax);
    const belowExitThreshold = Math.max(0, exitThreshold - 1);
    drainStaminaTo(mod, actor, belowExitThreshold);
    mod.actor_transition_teleport(actor, 2, 2, 0);

    let ticksHeldBelowThreshold = 0;
    for (let i = 0; i < exitThreshold; i++) {
      const queue = expectNumber(
        mod.configurator_dispatch_process(configurator, 700 + i),
        "dispatch handle (below S_exit)",
      );
      try {
        const aiuMode = mod.configurator_dispatch_get_aiu_mode(queue, 0);
        const staminaSnapshot = mod.configurator_dispatch_get_stamina(queue, 0);
        if (aiuMode !== MODE_CULTIVATE) {
          assert.ok(
            staminaSnapshot >= exitThreshold,
            "actors should only exit cultivation once the exit threshold has been met",
          );
          break;
        }
        ticksHeldBelowThreshold += 1;
        assert.ok(
          staminaSnapshot < exitThreshold,
          "stamina snapshot should stay below the cultivation exit threshold during gating",
        );
      } finally {
        mod.configurator_dispatch_release(queue);
      }
    }
    assert.ok(
      ticksHeldBelowThreshold > 0,
      "actors should remain locked in cultivation while stamina is below the exit threshold",
    );

    let exitedCultivationAfterThreshold = false;
    let safety = 64;
    while (safety-- > 0 && !exitedCultivationAfterThreshold) {
      const queue = expectNumber(
        mod.configurator_dispatch_process(configurator, 800 + safety),
        "dispatch handle (exit S_exit)",
      );
      try {
        const aiuMode = mod.configurator_dispatch_get_aiu_mode(queue, 0);
        const staminaSnapshot = mod.configurator_dispatch_get_stamina(queue, 0);
        if (staminaSnapshot < exitThreshold) {
          assert.equal(
            aiuMode,
            MODE_CULTIVATE,
            "actors should remain locked in cultivation until stamina crosses S_exit",
          );
          continue;
        }
        if (aiuMode !== MODE_CULTIVATE) {
          exitedCultivationAfterThreshold = true;
          assert.ok(
            staminaSnapshot >= exitThreshold,
            "exiting cultivation must only occur once the cultivation exit threshold is covered",
          );
        }
      } finally {
        mod.configurator_dispatch_release(queue);
      }
    }

    assert.ok(
      exitedCultivationAfterThreshold,
      "once stamina reaches S_exit, actors must resume their regular AIU intents",
    );

    console.log("[REQ:P1-F07] forced cultivation fallback: ok");
  } finally {
    mod.configurator_lifecycle_destroy(configurator);
    mod.actor_lifecycle_destroy(actor);
  }
})().catch((err) => {
  console.error("[REQ:P1-F07] forced cultivation fallback: failed", err);
  process.exit(1);
});

(async () => {
  const mod = await loadAssemblyModule();
  const actor = createMobile(mod);
  try {
    const staminaMax = mod.actor_vitals_get_stamina_max(actor);
    const minActionCost = computeMinMeaningfulActionCost(staminaMax);
    const expectedGain = minActionCost * 2;

    drainStaminaTo(mod, actor, 0);
    const before = mod.actor_vitals_get_stamina_current(actor);
    assert.ok(before <= minActionCost, "actor should start cultivation test from a low stamina state");

    mod.actor_resources_cultivate_tick(actor);
    const afterFirst = mod.actor_vitals_get_stamina_current(actor);
    assert.equal(
      afterFirst,
      Math.min(staminaMax, before + expectedGain),
      "cultivation tick should restore exactly two action costs of stamina",
    );

    mod.actor_resources_cultivate_tick(actor);
    const afterSecond = mod.actor_vitals_get_stamina_current(actor);
    assert.equal(
      afterSecond,
      Math.min(staminaMax, afterFirst + expectedGain),
      "consecutive cultivation ticks should stack the same regeneration until max stamina is reached",
    );

    console.log("[REQ:P1-F07] cultivation regen ratio: ok");
  } finally {
    mod.actor_lifecycle_destroy(actor);
  }
})().catch((err) => {
  console.error("[REQ:P1-F07] cultivation regen ratio: failed", err);
  process.exit(1);
});

(async () => {
  const mod = await loadAssemblyModule();
  const configurator = mod.configurator_lifecycle_create();
  const actor = createMobile(mod);
  const CODE_UNSAT = expectNumber(mod.solver_result_code_unsat, "solver_result_code_unsat");

  try {
    mod.configurator_lifecycle_initialize(configurator, 5, 5, 0);
    seedSurface(mod, configurator, 5, 5);

    const defendExitModuleId = 1201;
    mod.configurator_aiu_register_template(configurator, defendExitModuleId, 6, 9, 1);

    const roleMobile = expectNumber(mod.configurator_actor_role_mobile, "configurator_actor_role_mobile");
    mod.configurator_actor_ledger_record(configurator, actor, 2, 2, 0, roleMobile);
    mod.actor_transition_teleport(actor, 2, 2, 0);
    mod.configurator_actor_assign_aiu(configurator, actor, defendExitModuleId);

    mod.configurator_map_set_portal(configurator, 2, 2, 0, 2);

    const queue = expectNumber(mod.configurator_dispatch_process(configurator, 400), "dispatch handle");
    try {
      const solverCode = mod.configurator_dispatch_get_solver_code(queue, 0);
      assert.equal(solverCode, CODE_UNSAT, "guard radius stub should return UNSAT");

      const dx = mod.configurator_dispatch_get_intent_dx(queue, 0);
      const dy = mod.configurator_dispatch_get_intent_dy(queue, 0);
      assert.equal(dx, 0, "defend_exit should hold position on UNSAT (dx)");
      assert.equal(dy, 0, "defend_exit should hold position on UNSAT (dy)");
    } finally {
      mod.configurator_dispatch_release(queue);
    }

    console.log("[REQ:P1-F03] defend_exit AIU tests: ok");
  } finally {
    mod.configurator_lifecycle_destroy(configurator);
    mod.actor_lifecycle_destroy(actor);
  }
})().catch((err) => {
  console.error("[REQ:P1-F03] defend_exit AIU tests: failed", err);
  process.exit(1);
});

(async () => {
  const mod = await loadAssemblyModule();
  const configurator = mod.configurator_lifecycle_create();
  const actor = createMobile(mod);
  const MODE_PATROL = expectNumber(mod.AIU_INTENT_MODE_PATROL, "AIU_INTENT_MODE_PATROL");
  const CODE_UNSAT = expectNumber(mod.solver_result_code_unsat, "solver_result_code_unsat");

  try {
    mod.configurator_lifecycle_initialize(configurator, 5, 5, 0);
    seedSurface(mod, configurator, 5, 5);

    const patrolModuleId = 1301;
    mod.configurator_aiu_register_template(configurator, patrolModuleId, 7, 7, 1);

    const roleMobile = expectNumber(mod.configurator_actor_role_mobile, "configurator_actor_role_mobile");
    mod.configurator_actor_ledger_record(configurator, actor, 2, 2, 0, roleMobile);
    mod.actor_transition_teleport(actor, 2, 2, 0);
    mod.configurator_actor_assign_aiu(configurator, actor, patrolModuleId);

    assert.equal(
      typeof mod.configurator_dispatch_get_aiu_aux,
      "function",
      "configurator_dispatch_get_aiu_aux export required for patrol metadata",
    );

    // Block the first patrol direction so fallback must skip to the next waypoint.
    mod.configurator_map_set_feature(configurator, 3, 2, 0, 333, 1);

    const expectedSequence = [
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
    ];

    for (let i = 0; i < expectedSequence.length; i++) {
      const queue = expectNumber(mod.configurator_dispatch_process(configurator, 500 + i), "dispatch handle");
      try {
        const solverCode = mod.configurator_dispatch_get_solver_code(queue, 0);
        assert.equal(solverCode, CODE_UNSAT, "waypoint solver stub currently returns UNSAT; module should fallback");

        const dx = mod.configurator_dispatch_get_intent_dx(queue, 0);
        const dy = mod.configurator_dispatch_get_intent_dy(queue, 0);
        assert.equal(dx, expectedSequence[i].dx, `patrol step ${i} should follow sequence dx`);
        assert.equal(dy, expectedSequence[i].dy, `patrol step ${i} should follow sequence dy`);

        const aiuMode = mod.configurator_dispatch_get_aiu_mode(queue, 0);
        assert.equal(aiuMode, MODE_PATROL, "patrol intents should set patrol mode");

        const aux = mod.configurator_dispatch_get_aiu_aux(queue, 0);
        assert.equal(aux, (i + 2) % 4, "auxiliary index should track next waypoint");

        assert.equal(
          mod.configurator_actor_get_patrol_index(configurator, actor),
          aux,
          "context patrol index should persist between ticks",
        );
      } finally {
        mod.configurator_dispatch_release(queue);
      }

      if (i === 0) {
        mod.configurator_map_clear_feature(configurator, 3, 2, 0);
      }
    }

    console.log("[REQ:P1-F03] patrol_corridor AIU tests: ok");
  } finally {
    mod.configurator_lifecycle_destroy(configurator);
    mod.actor_lifecycle_destroy(actor);
  }
})().catch((err) => {
  console.error("[REQ:P1-F03] patrol_corridor AIU tests: failed", err);
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
  let surfaceId = 5000;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      mod.configurator_surface_ledger_record(configurator, surfaceId++, x, y, 0);
    }
  }
}

function drainStaminaTo(mod, actorHandle, target) {
  const clamp = target < 0 ? 0 : target;
  let safety = 256;
  while (safety-- > 0) {
    const current = mod.actor_vitals_get_stamina_current(actorHandle);
    if (current <= clamp) break;
    mod.actor_transition_move_by(actorHandle, 1, 0);
  }
}

const MIN_MEANINGFUL_ACTION_PERCENT = 4;
const CULTIVATION_MIN_EXIT_STAMINA = 6;

function computeMinMeaningfulActionCost(staminaMax) {
  if (!Number.isFinite(staminaMax) || staminaMax <= 0) return 0;
  const base = Math.ceil((staminaMax * MIN_MEANINGFUL_ACTION_PERCENT) / 100);
  return Math.max(1, base);
}

function computeCultivationExitThreshold(staminaMax) {
  if (!Number.isFinite(staminaMax) || staminaMax <= 0) return 0;
  const exitFloor = Math.max(CULTIVATION_MIN_EXIT_STAMINA, computeMinMeaningfulActionCost(staminaMax));
  return Math.min(exitFloor, staminaMax);
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
