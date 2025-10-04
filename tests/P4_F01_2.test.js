/**
 * [REQ:P4-F01_2] & [REQ:P4-F01_3] Resource introspection
 * Goal: Verify agents expose stable identity hashes and encode occupancy semantics through
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
    "agent_lifecycle_create",
    "agent_lifecycle_destroy",
    "agent_lifecycle_init",
    "agent_identity_get",
    "agent_vitals_get_stamina_current",
    "agent_vitals_get_stamina_max",
    "agent_vitals_get_stamina_regen",
    "agent_durability_get_current",
    "agent_durability_get_max",
    "agent_durability_get_regen",
    "agent_health_get_current",
    "agent_health_get_max",
    "agent_health_get_regen",
    "agent_mana_get_current",
    "agent_mana_get_max",
    "agent_mana_get_regen",
    "agent_transition_set_obstacle",
    "agent_resources_snapshot",
  ];

  for (const name of requiredFunctions) {
    assert.equal(typeof mod[name], "function", `${name} export should be a function`);
  }

  const constants = Object.freeze({
    archetypeMobile: expectNumber(mod.agent_archetype_mobile, "agent_archetype_mobile"),
    archetypeStaticTile: expectNumber(mod.agent_archetype_static_tile, "agent_archetype_static_tile"),
    resourceInfinity: expectNumber(mod.agent_resource_infinity, "agent_resource_infinity"),
  });

  const mobile = mod.agent_lifecycle_create(constants.archetypeMobile);
  const staticTile = mod.agent_lifecycle_create(constants.archetypeStaticTile);

  try {
    mod.agent_lifecycle_init(mobile);
    mod.agent_lifecycle_init(staticTile);

    const mobileId = mod.agent_identity_get(mobile);
    const tileId = mod.agent_identity_get(staticTile);
    assert.ok(Number.isInteger(mobileId) && mobileId !== 0, "mobile agent should expose non-zero identity");
    assert.ok(Number.isInteger(tileId) && tileId !== 0, "static tile should expose non-zero identity");
    assert.notEqual(mobileId, tileId, "each agent should have a unique identity value");

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
    mod.agent_transition_set_obstacle(staticTile, true);
    assertResourceSnapshot(staticTile, expectedMobileSnapshot, "static tile as obstacle");

    mod.agent_transition_set_obstacle(staticTile, false);
    assertResourceSnapshot(staticTile, expectedStaticSnapshot, "static tile restored");
  } finally {
    mod.agent_lifecycle_destroy(mobile);
    mod.agent_lifecycle_destroy(staticTile);
  }

  function assertResourceSnapshot(handle, expected, label) {
    const actual = {
      stamina: {
        current: mod.agent_vitals_get_stamina_current(handle),
        max: mod.agent_vitals_get_stamina_max(handle),
        regen: mod.agent_vitals_get_stamina_regen(handle),
      },
      durability: {
        current: mod.agent_durability_get_current(handle),
        max: mod.agent_durability_get_max(handle),
        regen: mod.agent_durability_get_regen(handle),
      },
      health: {
        current: mod.agent_health_get_current(handle),
        max: mod.agent_health_get_max(handle),
        regen: mod.agent_health_get_regen(handle),
      },
      mana: {
        current: mod.agent_mana_get_current(handle),
        max: mod.agent_mana_get_max(handle),
        regen: mod.agent_mana_get_regen(handle),
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
