/**
 * [REQ:P1-F01_6] INTROSPECTION (self-awareness): stable actor identity
 * Goal: Verify actor identities are deterministic per handle, remain stable across lifecycle
 *       activity, and stay unique when new actors are created.
 *
 * Verification per requirement:
 *  - unit: create an actor, read identity before/after lifecycle init/step, destroy and create
 *          a new actor, confirm identities remain stable per handle and unique across handles.
 *
 * Run:
 *   npm run asbuild
 *   npm test
 */

import assert from "node:assert/strict";

(async () => {
  let mod;
  try {
    mod = await import("../build/release.js");
  } catch {
    mod = await import("../build/debug.js");
  }

  const requiredExports = [
    "actor_lifecycle_create",
    "actor_lifecycle_destroy",
    "actor_lifecycle_init",
    "actor_lifecycle_process",
    "actor_identity_get",
  ];

  for (const name of requiredExports) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  let handleA = mod.actor_lifecycle_create();
  let handleB = 0;
  let handleC = 0;

  try {
    const idAInitial = mod.actor_identity_get(handleA);
    assert.ok(Number.isInteger(idAInitial) && idAInitial !== 0, "actor identity should be a non-zero integer");

    mod.actor_lifecycle_process(handleA);
    const idAAfterStep = mod.actor_identity_get(handleA);
    assert.equal(idAAfterStep, idAInitial, "identity should remain stable after lifecycle step");

    mod.actor_lifecycle_init(handleA);
    const idAAfterInit = mod.actor_identity_get(handleA);
    assert.equal(idAAfterInit, idAInitial, "identity should remain stable after lifecycle re-init");

    handleB = mod.actor_lifecycle_create();
    const idB = mod.actor_identity_get(handleB);
    assert.ok(Number.isInteger(idB) && idB !== 0, "second actor should expose a non-zero identity");
    assert.notEqual(idB, idAInitial, "each handle should map to a unique identity value");

    mod.actor_lifecycle_destroy(handleA);
    handleA = 0;

    handleC = mod.actor_lifecycle_create();
    const idC = mod.actor_identity_get(handleC);
    assert.ok(Number.isInteger(idC) && idC !== 0, "replacement actor should expose a non-zero identity");
    assert.notEqual(idC, idAInitial, "new handles should produce identities distinct from destroyed handles");
    assert.notEqual(idC, idB, "new handles should also be unique compared to existing handles");
  } finally {
    if (handleA !== 0) {
      mod.actor_lifecycle_destroy(handleA);
    }
    if (handleB !== 0) {
      mod.actor_lifecycle_destroy(handleB);
    }
    if (handleC !== 0) {
      mod.actor_lifecycle_destroy(handleC);
    }
  }

  console.log("[REQ:P1-F01_6] stable identity tests: ok");
})().catch((err) => {
  console.error("[REQ:P1-F01_6] stable identity tests: failed", err);
  process.exit(1);
});
