/**
 * [REQ:P4-F01_6] INTROSPECTION (self-awareness): stable agent identity
 * Goal: Verify agent identities are deterministic per handle, remain stable across lifecycle
 *       activity, and stay unique when new agents are created.
 *
 * Verification per requirement:
 *  - unit: create an agent, read identity before/after lifecycle init/step, destroy and create
 *          a new agent, confirm identities remain stable per handle and unique across handles.
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
    "agent_lifecycle_create",
    "agent_lifecycle_destroy",
    "agent_lifecycle_init",
    "agent_lifecycle_step",
    "agent_identity_get",
  ];

  for (const name of requiredExports) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  let handleA = mod.agent_lifecycle_create();
  let handleB = 0;
  let handleC = 0;

  try {
    const idAInitial = mod.agent_identity_get(handleA);
    assert.ok(Number.isInteger(idAInitial) && idAInitial !== 0, "agent identity should be a non-zero integer");

    mod.agent_lifecycle_step(handleA);
    const idAAfterStep = mod.agent_identity_get(handleA);
    assert.equal(idAAfterStep, idAInitial, "identity should remain stable after lifecycle step");

    mod.agent_lifecycle_init(handleA);
    const idAAfterInit = mod.agent_identity_get(handleA);
    assert.equal(idAAfterInit, idAInitial, "identity should remain stable after lifecycle re-init");

    handleB = mod.agent_lifecycle_create();
    const idB = mod.agent_identity_get(handleB);
    assert.ok(Number.isInteger(idB) && idB !== 0, "second agent should expose a non-zero identity");
    assert.notEqual(idB, idAInitial, "each handle should map to a unique identity value");

    mod.agent_lifecycle_destroy(handleA);
    handleA = 0;

    handleC = mod.agent_lifecycle_create();
    const idC = mod.agent_identity_get(handleC);
    assert.ok(Number.isInteger(idC) && idC !== 0, "replacement agent should expose a non-zero identity");
    assert.notEqual(idC, idAInitial, "new handles should produce identities distinct from destroyed handles");
    assert.notEqual(idC, idB, "new handles should also be unique compared to existing handles");
  } finally {
    if (handleA !== 0) {
      mod.agent_lifecycle_destroy(handleA);
    }
    if (handleB !== 0) {
      mod.agent_lifecycle_destroy(handleB);
    }
    if (handleC !== 0) {
      mod.agent_lifecycle_destroy(handleC);
    }
  }

  console.log("[REQ:P4-F01_6] stable identity tests: ok");
})().catch((err) => {
  console.error("[REQ:P4-F01_6] stable identity tests: failed", err);
  process.exit(1);
});
