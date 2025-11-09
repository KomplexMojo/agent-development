/**
 * [REQ:P1-F02_2] Structured interrogation observations
 * Goal: Observers capture positional, categorical, and (optionally) enhanced
 * facts when interrogating nearby actors, depending on their capability tier.
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
    "actor_lifecycle_create",
    "actor_lifecycle_destroy",
    "actor_lifecycle_init",
    "actor_lifecycle_process",
    "actor_transition_move_by",
    "actor_transition_move_level",
    "actor_transition_set_obstacle",
    "actor_vitals_get_stamina_current",
    "actor_vitals_get_stamina_max",
    "actor_vitals_get_stamina_regen",
    "actor_observation_get_x",
    "actor_observation_get_y",
    "actor_observation_set_capability",
    "actor_observation_get_capability",
    "actor_observation_get_latest_record",
    "actor_observation_get_record_count",
    "actor_observation_get_record",
    "actor_observation_set_radar_range",
  ];

  for (const name of requiredFunctions) {
    assert.equal(typeof mod[name], "function", `${name} export should be a function`);
  }

  const constants = Object.freeze({
    capabilityBasic: expectNumber(mod.actor_observation_capability_basic, "actor_observation_capability_basic"),
    capabilityEnhanced: expectNumber(mod.actor_observation_capability_enhanced, "actor_observation_capability_enhanced"),
    archetypeMobile: expectNumber(mod.actor_archetype_mobile, "actor_archetype_mobile"),
    archetypeStatic: expectNumber(mod.actor_archetype_static_tile, "actor_archetype_static_tile"),
    occupancyWalkable: expectNumber(mod.actor_observation_occupancy_walkable_static, "actor_observation_occupancy_walkable_static"),
    occupancyBlocking: expectNumber(mod.actor_observation_occupancy_blocking, "actor_observation_occupancy_blocking"),
  });

  const observerBasic = mod.actor_lifecycle_create(constants.archetypeMobile);
  const observerEnhanced = mod.actor_lifecycle_create(constants.archetypeMobile);
  const target = mod.actor_lifecycle_create(constants.archetypeStatic);

  try {
    mod.actor_lifecycle_init(observerBasic);
    mod.actor_lifecycle_init(observerEnhanced);
    mod.actor_lifecycle_init(target);

    mod.actor_transition_move_by(observerBasic, 0, 0);
    mod.actor_transition_move_by(observerEnhanced, 0, 1);
    mod.actor_transition_move_by(target, 1, 0);

    mod.actor_lifecycle_process(target);

    mod.actor_observation_set_capability(observerBasic, constants.capabilityBasic);
    mod.actor_observation_set_capability(observerEnhanced, constants.capabilityEnhanced);
    mod.actor_observation_set_radar_range(observerBasic, 2);
    mod.actor_observation_set_radar_range(observerEnhanced, 2);

    mod.actor_lifecycle_process(observerBasic);
    mod.actor_lifecycle_process(observerEnhanced);

    const allowedHandles = new Set([0, observerBasic, observerEnhanced, target]);

    const basicRecords = collectRecords(observerBasic);
    assert.ok(
      basicRecords.every((record) => allowedHandles.has(record.observedHandle)),
      "basic observer should only report directly observed actor handles",
    );
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

    assert.ok(mod.actor_observation_get_record_count(observerBasic) >= 1, "basic observer should store its records");

    // Privileged coordinator escalates capability to Enhanced for the same observer.
    mod.actor_observation_set_capability(observerBasic, constants.capabilityEnhanced);
    mod.actor_lifecycle_process(observerBasic);

    const upgradedRecords = collectRecords(observerBasic);
    const upgradedTarget = upgradedRecords.filter((record) => record.observedHandle === target).pop();
    assert.ok(upgradedTarget, "upgraded observer should retain target record");
    assert.equal(upgradedTarget.hasEnhancedDetailsFlag, 1, "upgraded observer should expose enhanced details");
    assert.equal(
      upgradedTarget.staminaMax,
      mod.actor_vitals_get_stamina_max(target),
      "upgraded observer should report target stamina max",
    );
    assert.equal(
      upgradedTarget.staminaCurrent,
      mod.actor_vitals_get_stamina_current(target),
      "upgraded observer should report target stamina current",
    );
    assert.equal(
      upgradedTarget.staminaRegen,
      mod.actor_vitals_get_stamina_regen(target),
      "upgraded observer should report target stamina regen",
    );
    assert.ok(
      upgradedRecords.every((record) => allowedHandles.has(record.observedHandle)),
      "upgraded observer should continue to report only directly observed entities",
    );

    // Reconfigure target as a blocking archetype to verify enhanced data capture.
    mod.actor_transition_set_obstacle(target, true);
    mod.actor_lifecycle_process(target);

    mod.actor_lifecycle_process(observerEnhanced);

    const enhancedRecords = collectRecords(observerEnhanced);
    assert.ok(
      enhancedRecords.every((record) => allowedHandles.has(record.observedHandle)),
      "enhanced observer should only report direct observations",
    );
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

    console.log("[REQ:P1-F02_2] structured observation tests: ok");
  } finally {
    for (const handle of [observerBasic, observerEnhanced, target]) {
      try { mod.actor_lifecycle_destroy(handle); } catch { /* ignore */ }
    }
  }

  function collectRecords(handle) {
    const count = mod.actor_observation_get_record_count(handle);
    const records = [];
    for (let i = 0; i < count; i++) {
      records.push(mod.actor_observation_get_record(handle, i));
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
