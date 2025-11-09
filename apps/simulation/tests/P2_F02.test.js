/**
 * [REQ:P2-F02] Level stateflow (coordinating states)
 * Goal: The configurator advances through the documented states in order and
 * rejects invalid transitions.
 */

import assert from "node:assert/strict";

(async () => {
  let mod;
  try {
    mod = await import("../build/release.js");
  } catch {
    mod = await import("../build/debug.js");
  }

  const fns = [
    "configurator_lifecycle_create",
    "configurator_lifecycle_destroy",
    "configurator_lifecycle_initialize",
    "configurator_lifecycle_get_state",
    "configurator_lifecycle_transition_state",
    "configurator_lifecycle_advance_state",
  ];

  for (const name of fns) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  const handle = mod.configurator_lifecycle_create();
  try {
    mod.configurator_lifecycle_initialize(handle, 1, 1, 0);

    const states = {
      PLAN: 0,
      PROPOSE: 1,
      SURVEY: 2,
      DISPATCH: 3,
      VERIFY: 4,
      CONFIRM: 5,
    };

    assert.equal(mod.configurator_lifecycle_get_state(handle), states.PLAN, "init state should be PLAN");

    assert.equal(mod.configurator_lifecycle_transition_state(handle, states.PROPOSE), 1, "should advance to PROPOSE");
    assert.equal(mod.configurator_lifecycle_get_state(handle), states.PROPOSE, "state should now be PROPOSE");

    assert.equal(mod.configurator_lifecycle_transition_state(handle, states.SURVEY), 1, "should advance to SURVEY");
    assert.equal(mod.configurator_lifecycle_get_state(handle), states.SURVEY, "state should now be SURVEY");

    assert.equal(mod.configurator_lifecycle_transition_state(handle, states.VERIFY), 0, "invalid skip should fail");
    assert.equal(mod.configurator_lifecycle_get_state(handle), states.SURVEY, "state should remain SURVEY after invalid skip");

    assert.equal(mod.configurator_lifecycle_advance_state(handle), states.DISPATCH, "advance should move to DISPATCH");
    assert.equal(mod.configurator_lifecycle_advance_state(handle), states.VERIFY, "advance should move to VERIFY");
    assert.equal(mod.configurator_lifecycle_advance_state(handle), states.CONFIRM, "advance should move to CONFIRM");
    assert.equal(mod.configurator_lifecycle_advance_state(handle), states.CONFIRM, "advance beyond CONFIRM should stay capped");
  } finally {
    mod.configurator_lifecycle_destroy(handle);
  }

  console.log("[REQ:P2-F02] stateflow tests: ok");
})().catch((err) => {
  console.error("[REQ:P2-F02] stateflow tests: failed", err);
  process.exit(1);
});
