/**
 * [REQ:P1-F04_3] Transition — stamina reducing movement
 * Goal: Movement consumes stamina scaled by direction.
 *
 * Acceptance highlights:
 *  - Moving costs stamina as a fraction of the max pool.
 *  - Cardinal, inter-cardinal, and downward moves scale by 1, sqrt2, sqrt3 multipliers.
 *  - Movement is denied when stamina is insufficient.
 *
 * Run:
 *   npm run asbuild
 *   npm test
 */

import assert from "node:assert/strict";

(async () => {
  let mod;
  try { mod = await import("../build/release.js"); } catch { mod = await import("../build/debug.js"); }

  const expectedExports = [
    "actor_lifecycle_create",
    "actor_lifecycle_destroy",
    "actor_lifecycle_init",
    "actor_lifecycle_process",
    "actor_observation_get_x",
    "actor_observation_get_y",
    "actor_observation_get_level",
    "actor_vitals_get_stamina_current",
    "actor_vitals_get_stamina_max",
    "actor_transition_move_by",
    "actor_transition_move_level",
  ];

  for (const name of expectedExports) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  const handle = mod.actor_lifecycle_create();
  const tierAiu = expectNumber(mod.configurator_dispatch_tier_aiu, "configurator_dispatch_tier_aiu");
  const outcomeAccepted = expectNumber(mod.configurator_dispatch_outcome_accepted, "configurator_dispatch_outcome_accepted");
  const outcomeRejected = expectNumber(mod.configurator_dispatch_outcome_rejected, "configurator_dispatch_outcome_rejected");
  const rejectionStamina = expectNumber(mod.configurator_dispatch_rejection_stamina, "configurator_dispatch_rejection_stamina");
  const tolerance = 0.1; // allow rounding differences in AssemblyScript math
  try {
    const resetActor = () => {
      mod.actor_lifecycle_init(handle);
      mod.actor_lifecycle_process(handle);
    };

    const getStamina = () => mod.actor_vitals_get_stamina_current(handle);
    const getPos = () => ({
      x: mod.actor_observation_get_x(handle),
      y: mod.actor_observation_get_y(handle),
      level: mod.actor_observation_get_level(handle),
    });

    resetActor();
    const staminaMax = mod.actor_vitals_get_stamina_max(handle);
    assert.ok(staminaMax > 0, "max stamina should be positive");

    const cardinalCost = measureCardinalCost();
    assert.ok(cardinalCost > 0, "cardinal move should consume stamina");

    const diagonalCost = measureDiagonalCost();
    const diagonalRatio = diagonalCost / cardinalCost;
    assert.ok(Math.abs(diagonalRatio - Math.SQRT2) <= tolerance, `diagonal cost should scale by sqrt2 (got ${diagonalRatio.toFixed(3)})`);

    const downwardCost = measureDownwardCost();
    const downwardRatio = downwardCost / cardinalCost;
    const sqrt3 = Math.sqrt(3);
    assert.ok(Math.abs(downwardRatio - sqrt3) <= tolerance, `downward level change should scale by sqrt3 (got ${downwardRatio.toFixed(3)})`);

    ensureMovementDeniedWhenExhausted(cardinalCost);

    console.log("[REQ:P1-F04_3] stamina reducing movement tests: ok");

    function measureCardinalCost() {
      resetActor();
      const stamina0 = getStamina();
      const before = getPos();
      mod.actor_transition_move_by(handle, 1, 0);
      mod.actor_lifecycle_process(handle);
      const after = getPos();
      assert.equal(after.x, before.x + 1, "cardinal move should change x");
      assert.equal(after.y, before.y, "cardinal move should not change y");
      const stamina1 = getStamina();
      const delta = stamina0 - stamina1;
      assert.ok(delta > 0, "stamina must decrease after cardinal move");
      return delta;
    }

    function measureDiagonalCost() {
      resetActor();
      const stamina0 = getStamina();
      const before = getPos();
      mod.actor_transition_move_by(handle, 1, 1);
      mod.actor_lifecycle_process(handle);
      const after = getPos();
      assert.equal(after.x, before.x + 1, "diagonal move should increase x");
      assert.equal(after.y, before.y + 1, "diagonal move should increase y");
      const stamina1 = getStamina();
      const delta = stamina0 - stamina1;
      assert.ok(delta > 0, "stamina must decrease after diagonal move");
      return delta;
    }

    function measureDownwardCost() {
      resetActor();
      const stamina0 = getStamina();
      const before = getPos();
      mod.actor_transition_move_level(handle, -1);
      mod.actor_lifecycle_process(handle);
      const after = getPos();
      assert.equal(after.level, before.level - 1, "level should decrease by one when moving down");
      const stamina1 = getStamina();
      const delta = stamina0 - stamina1;
      assert.ok(delta > 0, "stamina must decrease after descending a level");
      return delta;
    }

    function ensureMovementDeniedWhenExhausted(requiredCost) {
      resetActor();
      let tick = 1;
      let previous = getStamina();
      let safety = 0;

      while (previous >= requiredCost && safety < 128) {
        const outcome = mod.actor_dispatch_apply_permit(handle, tick++, 1, 0, tierAiu);
        assert.equal(outcome, outcomeAccepted, "dispatch permit should be accepted while stamina remains");
        mod.actor_lifecycle_process(handle);
        const current = getStamina();
        assert.ok(current < previous, "stamina should decrease after an accepted move");
        previous = current;
        safety += 1;
      }

      const beforeStamina = getStamina();
      const beforePos = getPos();
      const rejected = mod.actor_dispatch_apply_permit(handle, tick++, 1, 0, tierAiu);
      assert.equal(rejected, outcomeRejected, "movement should be rejected once stamina is insufficient");
      assert.equal(
        mod.actor_dispatch_get_last_rejection_code(handle),
        rejectionStamina,
        "stamina exhaustion should be the rejection reason",
      );

      mod.actor_lifecycle_process(handle);
      const afterPos = getPos();
      const afterStamina = getStamina();

      assert.equal(afterPos.x, beforePos.x, "position should remain unchanged when stamina blocks movement");
      assert.equal(afterPos.y, beforePos.y, "position should remain unchanged when stamina blocks movement");
      assert.equal(afterPos.level, beforePos.level, "level should remain unchanged when stamina blocks movement");
      assert.equal(afterStamina, beforeStamina, "stamina should not change when movement is denied");
    }
  } finally {
    mod.actor_lifecycle_destroy(handle);
  }
})().catch((err) => {
  console.error("[REQ:P1-F04_3] stamina reducing movement tests: failed", err);
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
