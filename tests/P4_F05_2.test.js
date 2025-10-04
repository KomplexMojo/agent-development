/**
 * [REQ:P4-F05_2] Emission — interrogation exchange (scaffold)
 * Goal: Document that interrogation is now observation-owned and no longer
 *       exposed through emission helpers. Emission retains only generic,
 *       action, and adjacency messaging.
 *
 * NOTE: This scaffold verifies that the legacy interrogation helpers are not
 * part of the public emission surface so downstream code relies on the
 * observation domain for neighbour data.
 *
 * Run:
 *   npm run asbuild
 *   npm test
 */

import assert from "node:assert/strict";

(async () => {
  let mod;
  try { mod = await import("../build/release.js"); } catch { mod = await import("../build/debug.js"); }

  const forbiddenExports = [
    "agent_observation_interrogate",
    "agent_emission_send_interrogation",
    "agent_emission_poll_interrogation_reply",
  ];

  for (const name of forbiddenExports) {
    assert.equal(typeof mod[name], "undefined", `${name} should no longer be exported`);
  }

  const identityExports = [
    "agent_lifecycle_create",
    "agent_lifecycle_destroy",
    "agent_lifecycle_init",
    "agent_identity_get",
    "agent_durability_get_max",
  ];

  for (const name of identityExports) {
    assert.equal(typeof mod[name], "function", `${name} export should exist`);
  }

  const interrogator = mod.agent_lifecycle_create();

  try {
    mod.agent_lifecycle_init(interrogator);
    assert.ok(Number.isInteger(mod.agent_identity_get(interrogator)), "identity getter should return placeholder number");
    assert.ok(Number.isInteger(mod.agent_durability_get_max(interrogator)), "durability getter should return placeholder number");
  } finally {
    mod.agent_lifecycle_destroy(interrogator);
  }
})();
