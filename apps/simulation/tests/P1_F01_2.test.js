/**
 * [REQ:P1-F01_2] & [REQ:P1-F01_3] Resource introspection
 * Goal: Verify actors expose stable identity hashes and encode occupancy semantics through
 * resource pillars (stamina, durability, health, mana).
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
    "actor_identity_get",
    "actor_vitals_get_stamina_current",
    "actor_vitals_get_stamina_max",
    "actor_vitals_get_stamina_regen",
    "actor_durability_get_current",
    "actor_durability_get_max",
    "actor_durability_get_regen",
    "actor_health_get_current",
    "actor_health_get_max",
    "actor_health_get_regen",
    "actor_mana_get_current",
    "actor_mana_get_max",
    "actor_mana_get_regen",
    "actor_transition_set_obstacle",
    "actor_resources_snapshot",
  ];

  for (const name of requiredFunctions) {
    assert.equal(typeof mod[name], "function", `${name} export should be a function`);
  }

  const constants = Object.freeze({
    archetypeMobile: expectNumber(mod.actor_archetype_mobile, "actor_archetype_mobile"),
    archetypeStaticTile: expectNumber(mod.actor_archetype_static_tile, "actor_archetype_static_tile"),
    resourceInfinity: expectNumber(mod.actor_resource_infinity, "actor_resource_infinity"),
  });

  const mobile = mod.actor_lifecycle_create(constants.archetypeMobile);
  const staticTile = mod.actor_lifecycle_create(constants.archetypeStaticTile);

  try {
    mod.actor_lifecycle_init(mobile);
    mod.actor_lifecycle_init(staticTile);

    const mobileId = mod.actor_identity_get(mobile);
    const tileId = mod.actor_identity_get(staticTile);
    assert.ok(Number.isInteger(mobileId) && mobileId !== 0, "mobile actor should expose non-zero identity");
    assert.ok(Number.isInteger(tileId) && tileId !== 0, "static tile should expose non-zero identity");
    assert.notEqual(mobileId, tileId, "each actor should have a unique identity value");

    const infinity = constants.resourceInfinity;
    const expectedMobileSnapshot = {
      stamina: { current: 100, max: 100, regen: 0 },
      durability: { current: 100, max: 100, regen: 0 },
      health: { current: 100, max: 100, regen: 0 },
      mana: { current: 50, max: 50, regen: 0 },
    };

    const expectedStaticSnapshot = {
      stamina: { current: 0, max: 0, regen: 0 },
      durability: { current: infinity, max: infinity, regen: infinity },
      health: { current: 0, max: 0, regen: 0 },
      mana: { current: 0, max: 0, regen: 0 },
    };

    assertResourceSnapshot(mobile, expectedMobileSnapshot, "mobile defaults");

    assertResourceSnapshot(staticTile, expectedStaticSnapshot, "static tile defaults");

    // Toggling obstacle status should swap between blocking and walkable defaults.
    mod.actor_transition_set_obstacle(staticTile, true);
    assertResourceSnapshot(staticTile, expectedMobileSnapshot, "static tile as obstacle");

    mod.actor_transition_set_obstacle(staticTile, false);
    assertResourceSnapshot(staticTile, expectedStaticSnapshot, "static tile restored");
  } finally {
    mod.actor_lifecycle_destroy(mobile);
    mod.actor_lifecycle_destroy(staticTile);
  }

  function assertResourceSnapshot(handle, expected, label) {
    const actual = {
      stamina: {
        current: mod.actor_vitals_get_stamina_current(handle),
        max: mod.actor_vitals_get_stamina_max(handle),
        regen: mod.actor_vitals_get_stamina_regen(handle),
      },
      durability: {
        current: mod.actor_durability_get_current(handle),
        max: mod.actor_durability_get_max(handle),
        regen: mod.actor_durability_get_regen(handle),
      },
      health: {
        current: mod.actor_health_get_current(handle),
        max: mod.actor_health_get_max(handle),
        regen: mod.actor_health_get_regen(handle),
      },
      mana: {
        current: mod.actor_mana_get_current(handle),
        max: mod.actor_mana_get_max(handle),
        regen: mod.actor_mana_get_regen(handle),
      },
    };
    assert.deepEqual(actual, expected, `${label} resource snapshot should match archetype defaults`);
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
