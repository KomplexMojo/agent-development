/**
 * [REQ:P4-F04_3] Transition — stamina reducing movement
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
    "agent_lifecycle_create",
    "agent_lifecycle_destroy",
    "agent_lifecycle_init",
    "agent_lifecycle_step",
    "agent_observation_get_x",
    "agent_observation_get_y",
    "agent_observation_get_level",
    "agent_vitals_get_stamina_current",
    "agent_vitals_get_stamina_max",
    "agent_transition_move_by",
    "agent_transition_move_level",
  ];

  for (const name of expectedExports) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  const handle = mod.agent_lifecycle_create();
  const tolerance = 0.1; // allow rounding differences in AssemblyScript math
  try {
    const resetAgent = () => {
      mod.agent_lifecycle_init(handle);
      mod.agent_lifecycle_step(handle);
    };

    const getStamina = () => mod.agent_vitals_get_stamina_current(handle);
    const getPos = () => ({
      x: mod.agent_observation_get_x(handle),
      y: mod.agent_observation_get_y(handle),
      level: mod.agent_observation_get_level(handle),
    });

    resetAgent();
    const staminaMax = mod.agent_vitals_get_stamina_max(handle);
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

    console.log("[REQ:P4-F04_3] stamina reducing movement tests: ok");

    function measureCardinalCost() {
      resetAgent();
      const stamina0 = getStamina();
      const before = getPos();
      mod.agent_transition_move_by(handle, 1, 0);
      mod.agent_lifecycle_step(handle);
      const after = getPos();
      assert.equal(after.x, before.x + 1, "cardinal move should change x");
      assert.equal(after.y, before.y, "cardinal move should not change y");
      const stamina1 = getStamina();
      const delta = stamina0 - stamina1;
      assert.ok(delta > 0, "stamina must decrease after cardinal move");
      return delta;
    }

    function measureDiagonalCost() {
      resetAgent();
      const stamina0 = getStamina();
      const before = getPos();
      mod.agent_transition_move_by(handle, 1, 1);
      mod.agent_lifecycle_step(handle);
      const after = getPos();
      assert.equal(after.x, before.x + 1, "diagonal move should increase x");
      assert.equal(after.y, before.y + 1, "diagonal move should increase y");
      const stamina1 = getStamina();
      const delta = stamina0 - stamina1;
      assert.ok(delta > 0, "stamina must decrease after diagonal move");
      return delta;
    }

    function measureDownwardCost() {
      resetAgent();
      const stamina0 = getStamina();
      const before = getPos();
      mod.agent_transition_move_level(handle, -1);
      mod.agent_lifecycle_step(handle);
      const after = getPos();
      assert.equal(after.level, before.level - 1, "level should decrease by one when moving down");
      const stamina1 = getStamina();
      const delta = stamina0 - stamina1;
      assert.ok(delta > 0, "stamina must decrease after descending a level");
      return delta;
    }

    function ensureMovementDeniedWhenExhausted(requiredCost) {
      resetAgent();
      let previous = getStamina();
      let safety = 0;
      while (getStamina() >= requiredCost && safety < 64) {
        mod.agent_transition_move_by(handle, 1, 0);
        mod.agent_lifecycle_step(handle);
        const current = getStamina();
        assert.ok(current <= previous, "stamina should not increase while moving");
        if (current === previous) {
          assert.fail("stamina should decrease while it remains sufficient for movement");
        }
        previous = current;
        safety += 1;
      }

      const beforeMove = getStamina();
      const beforePos = getPos();
      mod.agent_transition_move_by(handle, 1, 0);
      mod.agent_lifecycle_step(handle);
      const afterPos = getPos();
      const afterMove = getStamina();

      assert.equal(afterPos.x, beforePos.x, "movement should be blocked without sufficient stamina");
      assert.equal(afterPos.y, beforePos.y, "movement should be blocked without sufficient stamina");
      assert.equal(afterPos.level, beforePos.level, "level should remain unchanged when movement fails");
      assert.equal(afterMove, beforeMove, "stamina should remain unchanged when movement is denied");
    }
  } finally {
    mod.agent_lifecycle_destroy(handle);
  }
})().catch((err) => {
  console.error("[REQ:P4-F04_3] stamina reducing movement tests: failed", err);
  process.exit(1);
});
