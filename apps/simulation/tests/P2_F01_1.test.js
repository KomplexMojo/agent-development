/**
 * [REQ:P2-F01_1] Static surface pooling
 * Goal: The configuration manager prepares a pool of static surfaces with the expected resource pillars,
 * observation hooks, and placement metadata so downstream states can build a surface map.
 * This scaffold validates module exports and basic invariants for the pooled surfaces.
 *
 * Verification per requirement:
 *  - unit: creating a configuration manager instance produces the surface pool and confirms each surface
 *    presents the expected resource pillars, observation hooks, and placement metadata for the
 *    surface map.
 *
 * Run:
 *   npm run asbuild
 *   npm test
 */

import assert from "node:assert/strict";

(async () => {
  // Load the compiled AssemblyScript module (prefer release build, fall back to debug).
  let mod;
  try {
    mod = await import("../build/release.js");
  } catch {
    mod = await import("../build/debug.js");
  }

  const requiredFns = [
    "configurator_lifecycle_create",
    "configurator_lifecycle_destroy",
    "configurator_lifecycle_initialize",
    "configurator_surface_pool_size",
    "configurator_surface_pool_get_stamina",
    "configurator_surface_pool_get_health",
    "configurator_surface_pool_get_mana",
    "configurator_surface_pool_get_durability",
    "configurator_surface_pool_get_position_x",
    "configurator_surface_pool_get_position_y",
    "configurator_surface_pool_get_level",
    "configurator_surface_pool_get_id",
    "configurator_surface_pool_is_static",
    "configurator_surface_pool_request_observation",
    "configurator_surface_pool_get_last_observation_capability",
  ];

  for (const name of requiredFns) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  const constants = Object.freeze({
    resourceInfinity: expectNumber(mod.actor_resource_infinity, "actor_resource_infinity"),
    observationEnhanced: expectNumber(
      mod.actor_observation_capability_enhanced,
      "actor_observation_capability_enhanced",
    ),
  });

  const handle = mod.configurator_lifecycle_create();
  try {
    // Initialize the configuration manager with a simple pool request (width x height surfaces).
    const width = 3;
    const height = 3;
    mod.configurator_lifecycle_initialize(handle, width, height, 0);

    const surfaceCount = mod.configurator_surface_pool_size(handle);
    assert.equal(
      surfaceCount,
      width * height,
      "surface pool should match requested grid dimensions",
    );

    const seenPositions = new Set();
    const seenIds = new Set();

    for (let index = 0; index < surfaceCount; index += 1) {
      const surfaceId = mod.configurator_surface_pool_get_id(handle, index);
      assert.ok(Number.isInteger(surfaceId) && surfaceId > 0, "surface should expose a positive id");
      assert.equal(seenIds.has(surfaceId), false, "surface ids should be unique");
      seenIds.add(surfaceId);

      const stamina = mod.configurator_surface_pool_get_stamina(handle, index);
      const health = mod.configurator_surface_pool_get_health(handle, index);
      const mana = mod.configurator_surface_pool_get_mana(handle, index);
      const durability = mod.configurator_surface_pool_get_durability(handle, index);
      const x = mod.configurator_surface_pool_get_position_x(handle, index);
      const y = mod.configurator_surface_pool_get_position_y(handle, index);
      const level = mod.configurator_surface_pool_get_level(handle, index);

      assert.equal(stamina, 0, "surfaces should report zero stamina");
      assert.equal(health, 0, "surfaces should report zero health");
      assert.equal(mana, 0, "surfaces should report zero mana");
      assert.equal(durability, constants.resourceInfinity, "surfaces should expose infinite durability");

      assert.equal(typeof x, "number", "surface x position should be numeric");
      assert.equal(typeof y, "number", "surface y position should be numeric");
      assert.equal(typeof level, "number", "surface level should be numeric");
      assert.ok(Number.isInteger(x), "surface x should be an integer grid coordinate");
      assert.ok(Number.isInteger(y), "surface y should be an integer grid coordinate");
      assert.ok(Number.isInteger(level), "surface level should be an integer");

      assert.equal(
        mod.configurator_surface_pool_is_static(handle, index),
        1,
        "surface resources should classify as walkable static",
      );

      const firstTicket = mod.configurator_surface_pool_request_observation(handle, index);
      assert.ok(Number.isInteger(firstTicket) && firstTicket > 0, "observation ticket should increment from 1");

      const secondTicket = mod.configurator_surface_pool_request_observation(handle, index);
      assert.ok(secondTicket > firstTicket, "subsequent observation should advance ticket counter");

      const lastCapability = mod.configurator_surface_pool_get_last_observation_capability(handle, index);
      assert.equal(
        lastCapability,
        constants.observationEnhanced,
        "configuration manager should use enhanced observation capability when interrogating surfaces",
      );

      const key = `${x},${y},${level}`;
      assert.equal(seenPositions.has(key), false, "each surface should occupy a unique position");
      seenPositions.add(key);
    }

    mod.configurator_surface_ledger_record(
      handle,
      mod.configurator_surface_pool_get_id(handle, 0),
      mod.configurator_surface_pool_get_position_x(handle, 0),
      mod.configurator_surface_pool_get_position_y(handle, 0),
      mod.configurator_surface_pool_get_level(handle, 0),
    );

    assert.equal(seenPositions.size, surfaceCount, "surface metadata should cover every pooled surface");
  } finally {
    mod.configurator_lifecycle_destroy(handle);
  }

  console.log("[REQ:P2-F01_1] static surface pooling tests: ok");
})().catch((err) => {
  console.error("[REQ:P2-F01_1] static surface pooling tests: failed", err);
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
