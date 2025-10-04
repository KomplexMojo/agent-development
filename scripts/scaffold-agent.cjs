#!/usr/bin/env node
/**
 * Scaffold agent domain files (AssemblyScript) + JS tests consistent with the
 * official AssemblyScript layout produced by `npx asinit .`.
 *
 * Assumptions (from official docs):
 * - Sources live in `assembly/`
 * - Build artifacts + JS bindings are emitted to `build/` via `npm run asbuild`
 * - Tests are plain JS under `tests/` that import from `build/` and run with `npm test`
 *
 * Docs: https://www.assemblyscript.org/getting-started.html
 */

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const root = process.cwd();

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function writeFileSafe(p, content) {
  try {
    await fsp.access(p, fs.constants.F_OK);
    console.log("skip   ", p);
  } catch {
    await ensureDir(path.dirname(p));
    await fsp.writeFile(p, content, "utf8");
    console.log("create ", p);
  }
}

async function appendOnce(p, marker, chunk) {
  try {
    const src = await fsp.readFile(p, "utf8");
    if (!src.includes(marker)) {
      await fsp.writeFile(p, src + "\n" + chunk + "\n", "utf8");
      console.log("update ", p);
    } else {
      console.log("skip   ", p, "(marker found)");
    }
  } catch (e) {
    // If the file doesn't exist yet, create it fresh
    if (e.code === "ENOENT") {
      await writeFileSafe(p, chunk + "\n");
    } else {
      throw e;
    }
  }
}

(async () => {
  // --- Source files (AssemblyScript) ---
  await ensureDir("assembly/agent");
  await writeFileSafe(
    "assembly/agent/agent_fsm.ts",
    `// Purpose: AgentFSM orchestrates the five domain passes per tick
// (INTROSPECTION → OBSERVATION → EVALUATION → TRANSITION → EMISSION).
// It owns sequencing and "one intent per tick", but not domain mechanics.

import { Intent, AgentContext } from "./contracts";
import { stepIntrospection } from "./introspection";
import { stepObservation } from "./observation";
import { stepEvaluation } from "./evaluation";
import { stepTransition } from "./transition";
import { stepEmission } from "./emission";

export function agent_tick(ctx: AgentContext): Intent | null {
  // 1) INTROSPECTION
  stepIntrospection(ctx);
  // 2) OBSERVATION
  stepObservation(ctx);
  // 3) EVALUATION
  const suggested = stepEvaluation(ctx);
  // 4) TRANSITION
  const finalized = stepTransition(ctx, suggested);
  // 5) EMISSION (only if we haven't finalized an action)
  const emitted = finalized ? null : stepEmission(ctx);

  return finalized ?? emitted ?? null;
}
`
  );

  await writeFileSafe(
    "assembly/agent/contracts.ts",
    `// Purpose: Minimal shared types for the agent domains. Keep this small and stable.

export type IntentKind = 0 | 1 | 2 | 3 | 4; // Move, Attack, Use, Emit, Wait (placeholder)

export class Intent {
  kind: IntentKind = 4; // default WAIT
  dir: i8 = 0;          // for Move/Attack
}

export class Vec2 {
  constructor(public x: i32 = 0, public y: i32 = 0) {}
}

export class SelfState {
  hp: i32 = 100;
  sp: i32 = 100;
  cooldown: i32 = 0;
  effortBudget: i32 = 0;
  pos: Vec2 = new Vec2(0, 0);
}

export class DerivedView {
  // placeholder derived fields
  nearestThreatDx: i16 = 0;
  nearestThreatDy: i16 = 0;
}

export class AgentContext {
  self: SelfState = new SelfState();
  derived: DerivedView = new DerivedView();
}
`
  );

  await writeFileSafe(
    "assembly/agent/introspection.ts",
    `// Purpose: INTROSPECTION — owns self-state (vitals/cadence/budgets). Other domains read-only.

import { AgentContext } from "./contracts";

export function stepIntrospection(ctx: AgentContext): void {
  // TODO: tick regen/cooldowns, refresh per-tick effort budget.
  if (ctx.self.cooldown > 0) ctx.self.cooldown -= 1;
  if (ctx.self.effortBudget <= 0) ctx.self.effortBudget = 10; // placeholder
}
`
  );

  await writeFileSafe(
    "assembly/agent/observation.ts",
    `// Purpose: OBSERVATION — ingest latest frame into a tiny derived view.

import { AgentContext } from "./contracts";

export function stepObservation(ctx: AgentContext): void {
  // TODO: compute derived fields from cached frame
  // placeholder leaves derived view unchanged
}
`
  );

  await writeFileSafe(
    "assembly/agent/evaluation.ts",
    `// Purpose: EVALUATION — decide on at most one suggested Intent (or WAIT/null).

import { AgentContext, Intent } from "./contracts";

export function stepEvaluation(ctx: AgentContext): Intent | null {
  // Placeholder: always WAIT (null signals "no suggestion")
  return null;
}
`
  );

  await writeFileSafe(
    "assembly/agent/transition.ts",
    `// Purpose: TRANSITION — validate suggestion with guards & costs, yield finalized Intent.

import { AgentContext, Intent } from "./contracts";

export function stepTransition(ctx: AgentContext, suggested: Intent | null): Intent | null {
  // Placeholder: accept nothing yet; return null
  return null;
}
`
  );

  await writeFileSafe(
    "assembly/agent/emission.ts",
    `// Purpose: EMISSION — package messages as Emit intent under a small per-tick budget.

import { AgentContext, Intent } from "./contracts";

export function stepEmission(ctx: AgentContext): Intent | null {
  // Placeholder: no emission
  return null;
}
`
  );

  // Wire a public export from `assembly/index.ts` without clobbering custom edits:
  // `asinit` creates `assembly/index.ts`. We append a stable export once.
  const marker = "// EXPORT_AGENT_TICK";
  const exportChunk = `${marker}
export { agent_tick } from "./agent/agent_fsm";
`;
  await appendOnce("assembly/index.ts", marker, exportChunk);

  // --- Tests (plain JS, consistent with official flow) ---
  // Tests import from build output after `npm run asbuild`.
  await ensureDir("tests");
  await writeFileSafe(
    "tests/agent.smoke.test.js",
    `/**
 * Purpose: smoke test for agent build & export. Uses the official test style:
 * plain JS test that imports from the generated JS bindings in ./build/.
 *
 * Run:
 *   npm run asbuild   # per official docs
 *   npm test
 *
 * Docs:
 * - Getting started (structure, build, tests): https://www.assemblyscript.org/getting-started.html
 */

import assert from "node:assert/strict";

// Prefer release build if present; fall back to debug
let mod;
try {
  mod = await import("../build/release.js");
} catch {
  mod = await import("../build/debug.js");
}

assert.ok(mod, "module should load");
assert.ok(typeof mod.agent_tick === "function", "agent_tick export should exist");

// Minimal context object matching the exported signatures (JS binding will marshal)
const ctx = {
  self: { hp: 100, sp: 100, cooldown: 0, effortBudget: 0, pos: { x: 0, y: 0 } },
  derived: { nearestThreatDx: 0, nearestThreatDy: 0 },
};

const intent = mod.agent_tick(ctx);
assert.equal(intent, null, "placeholder agent should produce no intent yet");
`
  );

  console.log("\nScaffold complete.\nNext steps:");
  console.log("  1) npm run asbuild   # compile AssemblyScript → build/");
  console.log("  2) npm test          # runs JS tests under tests/");
})();