/**
 * [REQ:P4-F01][REQ:P4-F02] Moderator lifecycle collects and exposes telemetry summaries.
 */

import assert from "node:assert/strict";

(async () => {
  const mod = await loadAssemblyModule();
  const moderator = mod.moderator_lifecycle_create();

  try {
    mod.moderator_lifecycle_initialize(moderator);
    assert.equal(mod.moderator_summary_count(moderator), 0, "moderator should start empty");

    mod.moderator_collect_summary(moderator, 1, "tick 1 summary");
    mod.moderator_collect_summary(moderator, 2, "tick 2 summary");

    assert.equal(mod.moderator_summary_count(moderator), 2, "moderator should record summaries");
    assert.equal(mod.moderator_summary_get(moderator, 1), "tick 2 summary");

    mod.moderator_lifecycle_process(moderator); // should no-op safely

    mod.moderator_lifecycle_initialize(moderator);
    assert.equal(mod.moderator_summary_count(moderator), 0, "initialize should clear summaries");

    console.log("[REQ:P4-F01][REQ:P4-F02] moderator lifecycle tests: ok");
  } finally {
    mod.moderator_lifecycle_destroy(moderator);
  }
})().catch((err) => {
  console.error("[REQ:P4-F01][REQ:P4-F02] moderator lifecycle tests: failed", err);
  process.exit(1);
});

async function loadAssemblyModule() {
  try {
    return await import("../build/release.js");
  } catch {
    return import("../build/debug.js");
  }
}
