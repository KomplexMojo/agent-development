/**
 * [REQ:P2-F04_7] AIU catalog management & [REQ:P2-F04_8] AIU injection during provisioning
 * Goal: Ensure the configuration manager registers AIUs, assigns them to actors, and
 * falls back cleanly when requested AIUs are missing.
 */

import assert from "node:assert/strict";

(async () => {
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
    "configurator_aiu_register",
    "configurator_aiu_is_registered",
    "configurator_actor_assign_aiu",
    "configurator_actor_get_aiu",
    "configurator_actor_ledger_record",
    "configurator_actor_ledger_size",
    "configurator_surface_ledger_record",
  ];

  for (const name of requiredFns) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  const handle = mod.configurator_lifecycle_create();
  const actor = createMobile(mod);

  try {
    mod.configurator_lifecycle_initialize(handle, 1, 1, 0);
    mod.configurator_surface_ledger_record(handle, 1, 0, 0, 0);

    const aiuPatrol = 101;
    const aiuScout = 202;

    // Register AIUs and verify catalog behaviour.
    assert.equal(mod.configurator_aiu_register(handle, aiuPatrol), 1, "new AIU should register");
    assert.equal(mod.configurator_aiu_register(handle, aiuPatrol), 0, "duplicate registration should be ignored");
    assert.equal(mod.configurator_aiu_is_registered(handle, aiuPatrol), 1, "AIU should be reported as registered");
    assert.equal(mod.configurator_aiu_is_registered(handle, aiuScout), 0, "unknown AIU should be reported missing");

    // Assign registered AIU.
    assert.equal(mod.configurator_actor_assign_aiu(handle, actor, aiuPatrol), 1, "registered AIU should assign");
    assert.equal(mod.configurator_actor_get_aiu(handle, actor), aiuPatrol, "assignment should be recorded");

    // Assign missing AIU should fall back to instinct (0).
    assert.equal(mod.configurator_actor_assign_aiu(handle, actor, aiuScout), 0, "missing AIU should trigger fallback");
    assert.equal(mod.configurator_actor_get_aiu(handle, actor), 0, "fallback should be recorded as zero");

    // Actor provisioning can record ledger and AIU assignment together.
    mod.configurator_aiu_register(handle, aiuScout);
    mod.configurator_actor_assign_aiu(handle, actor, aiuScout);
    mod.configurator_actor_ledger_record(handle, actor, 0, 0, 0, 7);
    assert.equal(mod.configurator_actor_ledger_size(handle), 1, "actor ledger should record entry");
    assert.equal(mod.configurator_actor_get_aiu(handle, actor), aiuScout, "ledger integration maintains AIU assignment");

    const templateId = 909;
    const moduleKind = 3;
    const baseCost = 15;
    const upkeepCost = 2;
    assert.equal(
      mod.configurator_aiu_register_template(handle, templateId, moduleKind, baseCost, upkeepCost),
      1,
      "registering template should insert metadata",
    );
    assert.equal(mod.configurator_aiu_get_module_kind(handle, templateId), moduleKind, "module kind should be recorded");
    assert.equal(mod.configurator_aiu_get_base_cost(handle, templateId), baseCost, "base cost should be stored");
    assert.equal(mod.configurator_aiu_get_upkeep_cost(handle, templateId), upkeepCost, "upkeep cost should be stored");

    const updatedModuleKind = 5;
    const updatedBaseCost = 20;
    assert.equal(
      mod.configurator_aiu_register_template(handle, templateId, updatedModuleKind, updatedBaseCost, 0),
      0,
      "re-registering template should update metadata",
    );
    assert.equal(mod.configurator_aiu_get_module_kind(handle, templateId), updatedModuleKind, "module kind should be updated");
    assert.equal(mod.configurator_aiu_get_base_cost(handle, templateId), updatedBaseCost, "base cost should be updated");
    assert.equal(mod.configurator_aiu_get_upkeep_cost(handle, templateId), 0, "upkeep should be updated");

    console.log("[REQ:P2-F04_7] aiu catalog tests: ok");
  } finally {
    mod.configurator_lifecycle_destroy(handle);
    mod.actor_lifecycle_destroy(actor);
  }
})();

function createMobile(mod) {
  const archetype = expectNumber(mod.actor_archetype_mobile, "actor_archetype_mobile");
  const handle = mod.actor_lifecycle_create(archetype);
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
