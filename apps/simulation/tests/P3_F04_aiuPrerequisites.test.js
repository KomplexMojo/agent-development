/**
 * [REQ:P2-F11_6] AIU prerequisites block unsupported actors and allow valid ones.
 */
import assert from "node:assert/strict";

(async () => {
  const mod = await loadAssemblyModule();
  const configurator = mod.configurator_lifecycle_create();
  const actor = createMobile(mod);

  try {
    mod.configurator_lifecycle_initialize(configurator, 5, 5, 0);
    seedSurface(mod, configurator, 5, 5);

    const roleMobile = expectNumber(mod.configurator_actor_role_mobile, "configurator_actor_role_mobile");
    mod.configurator_actor_ledger_record(configurator, actor, 2, 2, 0, roleMobile);
    mod.actor_transition_teleport(actor, 2, 2, 0);

    // Min-stamina prerequisite enforcement.
    const staminaIntensiveAiu = 9201;
    mod.configurator_aiu_register_template(configurator, staminaIntensiveAiu, 0, 0, 0);
    mod.configurator_aiu_set_prerequisites(configurator, staminaIntensiveAiu, 500, 0);
    assert.equal(
      mod.configurator_actor_assign_aiu(configurator, actor, staminaIntensiveAiu),
      0,
      "actors below the min stamina threshold should be rejected",
    );
    assert.equal(
      mod.configurator_actor_get_aiu(configurator, actor),
      0,
      "failed assignment should clear any pending AIU selection",
    );

    mod.configurator_aiu_set_prerequisites(configurator, staminaIntensiveAiu, 10, 0);
    assert.equal(
      mod.configurator_actor_assign_aiu(configurator, actor, staminaIntensiveAiu),
      1,
      "actors meeting min stamina should accept the AIU",
    );
    assert.equal(
      mod.configurator_actor_get_aiu(configurator, actor),
      staminaIntensiveAiu,
      "actor should now carry the stamina-intensive AIU",
    );

    // Enhanced observation prerequisite enforcement.
    const observationAiu = 9202;
    mod.configurator_aiu_register_template(configurator, observationAiu, 0, 0, 0);
    mod.configurator_aiu_set_prerequisites(configurator, observationAiu, 0, 1);
    const capabilityBasic = expectNumber(mod.actor_observation_capability_basic, "actor_observation_capability_basic");
    mod.actor_observation_set_capability(actor, capabilityBasic);
    assert.equal(
      mod.configurator_actor_assign_aiu(configurator, actor, observationAiu),
      0,
      "basic observation capability should not satisfy enhanced prerequisites",
    );
    assert.equal(
      mod.configurator_actor_get_aiu(configurator, actor),
      0,
      "failed assignment should keep the actor on the fallback (instinct) AIU",
    );

    const capabilityEnhanced = expectNumber(
      mod.actor_observation_capability_enhanced,
      "actor_observation_capability_enhanced",
    );
    mod.actor_observation_set_capability(actor, capabilityEnhanced);
    assert.equal(
      mod.configurator_actor_assign_aiu(configurator, actor, observationAiu),
      1,
      "enhanced observation should satisfy the prerequisite",
    );
    assert.equal(
      mod.configurator_actor_get_aiu(configurator, actor),
      observationAiu,
      "actor should now carry the observation-gated AIU",
    );

    console.log("[REQ:P2-F11_6] aiu prerequisite enforcement tests: ok");
  } finally {
    mod.configurator_lifecycle_destroy(configurator);
    mod.actor_lifecycle_destroy(actor);
  }
})().catch((err) => {
  console.error("[REQ:P2-F11_6] aiu prerequisite enforcement tests: failed", err);
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
  let surfaceId = 1000;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      mod.configurator_surface_ledger_record(configurator, surfaceId++, x, y, 0);
    }
  }
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
