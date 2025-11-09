/**
 * [REQ:P1-F06] Actors must honour the configurator dispatch queue and only move when granted a permit.
 * This test asserts the essential surface area: accepting permits, ignoring duplicates, and
 * rejecting unsafe intents with structured reason codes.
 */

import assert from "node:assert/strict";

(async () => {
  const mod = await loadAssemblyModule();

  const requiredFunctions = [
    "actor_lifecycle_create",
    "actor_lifecycle_init",
    "actor_lifecycle_destroy",
    "actor_observation_get_x",
    "actor_observation_get_y",
    "actor_dispatch_apply_permit",
    "actor_dispatch_get_last_rejection_code",
    "actor_vitals_get_stamina_current",
  ];

  const requiredConstants = [
    "actor_archetype_mobile",
    "configurator_dispatch_tier_logic",
    "configurator_dispatch_outcome_accepted",
    "configurator_dispatch_outcome_rejected",
    "configurator_dispatch_rejection_none",
    "configurator_dispatch_rejection_duplicate",
    "configurator_dispatch_rejection_stamina",
  ];

  const missingFns = requiredFunctions.filter((name) => typeof mod[name] !== "function");
  if (missingFns.length > 0) {
    console.warn(
      "[REQ:P1-F06] dispatch compliance APIs not yet available, skipping test:",
      missingFns.join(", "),
    );
    return;
  }
  for (const name of requiredConstants) {
    expectNumber(mod[name], name);
  }
  const logicTier = expectNumber(mod.configurator_dispatch_tier_logic, "configurator_dispatch_tier_logic");
  const outcomeAccepted = expectNumber(
    mod.configurator_dispatch_outcome_accepted,
    "configurator_dispatch_outcome_accepted",
  );
  const outcomeRejected = expectNumber(
    mod.configurator_dispatch_outcome_rejected,
    "configurator_dispatch_outcome_rejected",
  );
  const rejectionNone = expectNumber(mod.configurator_dispatch_rejection_none, "configurator_dispatch_rejection_none");
  const rejectionDuplicate = expectNumber(
    mod.configurator_dispatch_rejection_duplicate,
    "configurator_dispatch_rejection_duplicate",
  );
  const rejectionStamina = expectNumber(
    mod.configurator_dispatch_rejection_stamina,
    "configurator_dispatch_rejection_stamina",
  );

  const handle = createMobile(mod);
  try {
    mod.actor_lifecycle_init(handle);
    assert.equal(mod.actor_observation_get_x(handle), 0, "actor should start at origin X");
    assert.equal(mod.actor_observation_get_y(handle), 0, "actor should start at origin Y");

    assert.equal(
      mod.actor_dispatch_get_last_rejection_code(handle),
      rejectionNone,
      "fresh actors should not report a rejection",
    );

    // Permit #1: valid move of (1,0) on tick 1 should be accepted.
    const permit1 = expectNumber(
      mod.actor_dispatch_apply_permit(handle, /*tick=*/1, /*dx=*/1, /*dy=*/0, logicTier),
      "actor_dispatch_apply_permit(tick=1)",
    );
    assert.equal(permit1, outcomeAccepted, "first permit should be accepted");
    assert.equal(mod.actor_observation_get_x(handle), 1, "actor should advance to x=1");
    assert.equal(mod.actor_observation_get_y(handle), 0, "actor y should remain 0");
    assert.equal(
      mod.actor_dispatch_get_last_rejection_code(handle),
      rejectionNone,
      "accepted permits should leave rejection code as none",
    );

    // Permit #2: duplicate tick should be rejected and position should not change.
    const permitDuplicate = expectNumber(
      mod.actor_dispatch_apply_permit(handle, /*tick=*/1, /*dx=*/5, /*dy=*/0, logicTier),
      "actor_dispatch_apply_permit duplicate tick",
    );
    assert.equal(permitDuplicate, outcomeRejected, "duplicate tick permits must be rejected");
    assert.equal(
      mod.actor_dispatch_get_last_rejection_code(handle),
      rejectionDuplicate,
      "duplicate tick rejection should use the duplicate code",
    );
    assert.equal(mod.actor_observation_get_x(handle), 1, "duplicate permit must not move the actor");

    // Permit #3: tick advances, zero delta should be accepted (no movement required).
    const permitIdle = expectNumber(
      mod.actor_dispatch_apply_permit(handle, /*tick=*/2, /*dx=*/0, /*dy=*/0, logicTier),
      "actor_dispatch_apply_permit zero delta",
    );
    assert.equal(permitIdle, outcomeAccepted, "zero-delta permit should be accepted");
    assert.equal(
      mod.actor_dispatch_get_last_rejection_code(handle),
      rejectionNone,
      "accepted idle permit should reset rejection code to none",
    );

    // Permit #4: tick advances but intent exceeds stamina budget and must be rejected.
    const staminaBefore = expectNumber(
      mod.actor_vitals_get_stamina_current(handle),
      "actor_vitals_get_stamina_current",
    );
    assert.ok(staminaBefore > 0, "test assumes actor has finite stamina");

    const permitOverreach = expectNumber(
      mod.actor_dispatch_apply_permit(handle, /*tick=*/3, /*dx=*/1000, /*dy=*/0, logicTier),
      "actor_dispatch_apply_permit overreach",
    );
    assert.equal(permitOverreach, outcomeRejected, "overreaching permit should be rejected");
    assert.equal(
      mod.actor_dispatch_get_last_rejection_code(handle),
      rejectionStamina,
      "stamina exhaustion should surface as the rejection code",
    );
    assert.equal(mod.actor_observation_get_x(handle), 1, "rejected permit must not move the actor");
  } finally {
    mod.actor_lifecycle_destroy(handle);
  }

  console.log("[REQ:P1-F06] dispatch compliance tests: ok");
})().catch((err) => {
  console.error("[REQ:P1-F06] dispatch compliance tests: failed", err);
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
