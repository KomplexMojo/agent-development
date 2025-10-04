/**
 * [REQ:P4-F02_2] Structured interrogation observations
 * Goal: Observers capture positional, categorical, and (optionally) enhanced
 * facts when interrogating nearby agents, depending on their capability tier.
 *
 * Verification per requirement:
 *  - Basic capability: captures observer position, observed position, tick,
 *    and observed purpose/category via interrogation.
 *  - Enhanced capability: additionally captures vitals data from the target.
 *
 * Run:
 *   npm run asbuild
 *   npm test
 */

import assert from "node:assert/strict";

(async () => {
  let mod;
  try { mod = await import("../build/release.js"); } catch { mod = await import("../build/debug.js"); }

  const requiredFunctions = [
    "agent_lifecycle_create",
    "agent_lifecycle_destroy",
    "agent_lifecycle_init",
    "agent_lifecycle_step",
    "agent_transition_move_by",
    "agent_transition_move_level",
    "agent_transition_set_obstacle",
    "agent_observation_get_x",
    "agent_observation_get_y",
    "agent_observation_set_capability",
    "agent_observation_get_capability",
    "agent_observation_get_latest_record",
    "agent_observation_get_record_count",
    "agent_observation_get_record",
    "agent_observation_set_radar_range",
  ];

  for (const name of requiredFunctions) {
    assert.equal(typeof mod[name], "function", `${name} export should be a function`);
  }

  const constants = Object.freeze({
    capabilityBasic: expectNumber(mod.agent_observation_capability_basic, "agent_observation_capability_basic"),
    capabilityEnhanced: expectNumber(mod.agent_observation_capability_enhanced, "agent_observation_capability_enhanced"),
    archetypeMobile: expectNumber(mod.agent_archetype_mobile, "agent_archetype_mobile"),
    archetypeStatic: expectNumber(mod.agent_archetype_static_tile, "agent_archetype_static_tile"),
    occupancyWalkable: expectNumber(mod.agent_observation_occupancy_walkable_static, "agent_observation_occupancy_walkable_static"),
    occupancyBlocking: expectNumber(mod.agent_observation_occupancy_blocking, "agent_observation_occupancy_blocking"),
  });

  const observerBasic = mod.agent_lifecycle_create(constants.archetypeMobile);
  const observerEnhanced = mod.agent_lifecycle_create(constants.archetypeMobile);
  const target = mod.agent_lifecycle_create(constants.archetypeStatic);

  try {
    mod.agent_lifecycle_init(observerBasic);
    mod.agent_lifecycle_init(observerEnhanced);
    mod.agent_lifecycle_init(target);

    mod.agent_transition_move_by(observerBasic, 0, 0);
    mod.agent_transition_move_by(observerEnhanced, 0, 1);
    mod.agent_transition_move_by(target, 1, 0);

    mod.agent_lifecycle_step(target);

    mod.agent_observation_set_capability(observerBasic, constants.capabilityBasic);
    mod.agent_observation_set_capability(observerEnhanced, constants.capabilityEnhanced);
    mod.agent_observation_set_radar_range(observerBasic, 2);
    mod.agent_observation_set_radar_range(observerEnhanced, 2);

    mod.agent_lifecycle_step(observerBasic);
    mod.agent_lifecycle_step(observerEnhanced);

    const basicRecords = collectRecords(observerBasic);
    const basicTarget = basicRecords.find((record) => record.observedHandle === target);
    assert.ok(basicTarget, "basic observer should capture target record via radar");
    assert.equal(basicTarget.tick, 0, "first radar pass should record initial tick");
    assert.equal(basicTarget.observerHandle, observerBasic, "record should reference observer handle");
    assert.deepEqual(
      { x: basicTarget.observerX, y: basicTarget.observerY },
      { x: 0, y: 0 },
      "observer position should be captured",
    );
    assert.equal(basicTarget.observedHandle, target, "record should reference target handle");
    assert.deepEqual(
      { x: basicTarget.observedX, y: basicTarget.observedY },
      { x: 1, y: 0 },
      "target position should be captured",
    );
    assert.equal(basicTarget.observedOccupancy, constants.occupancyWalkable, "static tiles should report walkable occupancy");
    assert.equal(basicTarget.hasEnhancedDetailsFlag, 0, "basic capability should not expose enhanced details");
    assert.equal(basicTarget.staminaCurrent, 0, "basic capability should not include stamina data");
    assert.equal(basicTarget.priority, 0, "basic record should default priority to 0");

    assert.ok(mod.agent_observation_get_record_count(observerBasic) >= 1, "basic observer should store its records");

    // Reconfigure target as a blocking archetype to verify enhanced data capture.
    mod.agent_transition_set_obstacle(target, true);
    mod.agent_lifecycle_step(target);

    mod.agent_lifecycle_step(observerEnhanced);

    const enhancedRecords = collectRecords(observerEnhanced);
    const enhancedTarget = enhancedRecords.filter((record) => record.observedHandle === target).pop();
    assert.ok(enhancedTarget, "enhanced observer should retain target record");
    assert.equal(enhancedTarget.hasEnhancedDetailsFlag, 1, "enhanced capability should flag enriched data");
    assert.equal(enhancedTarget.staminaCurrent, 100, "enhanced capability should capture current stamina");
    assert.equal(enhancedTarget.staminaMax, 100, "enhanced capability should capture max stamina");
    assert.equal(enhancedTarget.staminaRegen, 0, "enhanced capability should capture regen rate");
    assert.deepEqual(
      { x: enhancedTarget.observerX, y: enhancedTarget.observerY },
      { x: 0, y: 1 },
      "enhanced observer position should be captured",
    );
    assert.deepEqual(
      { x: enhancedTarget.observedX, y: enhancedTarget.observedY },
      { x: 1, y: 0 },
      "enhanced record should mirror target position",
    );
    assert.equal(enhancedTarget.observedOccupancy, constants.occupancyBlocking, "enhanced record should capture blocking occupancy");
    assert.equal(enhancedTarget.priority, 0, "enhanced record should default priority to 0");

    console.log("[REQ:P4-F02_2] structured observation tests: ok");
  } finally {
    for (const handle of [observerBasic, observerEnhanced, target]) {
      try { mod.agent_lifecycle_destroy(handle); } catch { /* ignore */ }
    }
  }

  function collectRecords(handle) {
    const count = mod.agent_observation_get_record_count(handle);
    const records = [];
    for (let i = 0; i < count; i++) {
      records.push(mod.agent_observation_get_record(handle, i));
    }
    return records;
  }
})();

function expectNumber(value, label) {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && typeof value.valueOf === "function") {
    const numeric = Number(value.valueOf());
    if (Number.isFinite(numeric)) return numeric;
  }
  throw new TypeError(`${label} should expose a numeric value`);
}
