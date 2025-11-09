# AIU Motivation Implementation Roadmap

This roadmap captures the end-to-end plan for investing actors with reusable AIU blocks (e.g., `find_exit`) while keeping requirements, schemas, and telemetry aligned. Each phase enumerates deliverables, key requirements, and validation tasks so code remains traceable to intent.

---

## Phase 3 — Core AIU Modules (complete)
- `find_exit`: reachability path to exits; returns next intent vector.
- `defend_exit`: guard radius/hold-time constraints; ensure solver prevents leaving zone.
- `patrol_corridor`: waypoint visiting order.
- Budget metadata for each AIU; unit tests verifying solver queries & results.
- **Execution sub-steps**
  ✅ 1. **Module scaffolding & registry entries**
    - Add default template rows for `find_exit`, `defend_exit`, `patrol_corridor` to `schemas/aiu.registry.v1.json` fixtures and orchestrator bootstrap.
    - Ensure configurator AIU registry enforces cost/prerequisite metadata for these ids.
  ✅ 2. **Simulation logic & tests**
    - Implemented cultivation regeneration intent with vulnerability tracking (`apps/simulation/assembly/configurator/aiuRuntime.ts`, `P3_F02_aiuModules.test.js`).
    - Hardened `find_exit`, `defend_exit`, `patrol_corridor` modules with solver-aware fallbacks & new AssemblyScript exports; coverage lives in `P3_F02_aiuModules.test.js`.
    - Coordinated dispatch metadata now carries AIU mode/aux/cultivation/vulnerability ticks downstream.
  ✅ 3. **Telemetry exposure**
    - Raw/UI schemas, guards, and fixtures now surface AIU ids (including `cultivation`), module kinds, solver verdict codes, and cultivation/vulnerability windows (`schemas/telemetry.*`, `apps/shared/types/schemas.ts`, `telemetrySchemas.test.ts`).
    - Orchestrator telemetry pipeline exports AIU mode/solver metadata per actor tick; Vitest exercises confirm loadouts & metadata appear in serialized telemetry (`apps/orchestrator/src/index.js`, `telemetrySchemas.test.ts`).
  ✅ 4. **Budget & prerequisites enforcement**
    - Configurator now checks AIU prerequisites (stamina + enhanced observation) before assignment via `configurator_aiu_set_prerequisites`/`configurator_actor_assign_aiu`.
    - Added scenario coverage (`P3_F04_aiuPrerequisites.test.js`) proving rejection when actors fail thresholds and acceptance once requirements are met.
  ✅ 5. **Documentation & plan sync**
     - Persona requirements and traces now describe the Phase 3 AIUs, telemetry surface area, and prerequisite enforcement (`docs/p1.ACTOR.reqs.md`, `docs/p2.CONFIGURATOR.reqs.md`, `docs/p0.ORCHESTRATOR.reqs.md`).
     - Phase 3 status promoted; roadmap ready to advance to Phase 4 deliverables.

## Phase 4 — AI Guidance Integration (Director/Orchestrator)
- Director request/response plumbing via orchestrator (P3-F05, P3-F05_2, P0-F01).
- Validation against blueprint & AIU schemas, budget ledgers, fallback heuristics.
- Provenance logging (model id, prompt hash, response hash, budget deltas).
- Tests mocking AI replies (valid, overspend, unknown AIUs) + retry logic.
- **Execution sub-steps**
  ✅ 1. **Director gateway & AI stub harness**
     - Implemented the orchestrator guidance gateway that packages deterministic prompts, hashes requests, retries transient failures, and records provenance (`apps/orchestrator/src/guidance/gateway.js`).
     - Added Vitest coverage with mocked AI clients verifying payload structure, retry behaviour, and envelope metadata (`apps/orchestrator/tests/directorGateway.test.ts`).
  ✅ 2. **Blueprint & AIU proposal validation**
     - Guidance responses are now parsed/normalized via `apps/orchestrator/src/guidance/proposal.js`, leveraging the shared blueprint schema guard and returning deterministic provenance packages.
     - The validator cross-checks actor recommendations against the AIU registry (unknown ids, per-group and scenario budgets, min-stamina + enhanced-observation prerequisites) and emits structured `GuidanceValidationError` diagnostics.
     - Vitest coverage (`apps/orchestrator/tests/guidanceProposal.test.ts`) exercises valid payloads plus error cases for unknown AIUs, overspends, and prerequisite failures.
  ✅ 3. **Configurator ingestion & feedback loop**
     - Added a guidance plan store/queue (`apps/orchestrator/src/guidance/planStore.js`) so validated blueprints/actor loadouts can be staged, consumed, and acknowledged with diagnostics.
     - `runMvpDemo` now consumes staged plans, applies width/height/actor overrides, and records success/failure feedback for provenance.
     - Vitest coverage (`apps/orchestrator/tests/guidancePlanStore.test.ts`) verifies staging, consumption, feedback logging, and that mock runs honour plan overrides.
  ✅ 4. **Telemetries & provenance logging**
     - Raw/UI telemetry schemas now expose guidance provenance (plan id, prompt/response hashes, model id, applied options) plus per-actor `aiuApplied`/`aiuDropped` arrays; TypeScript guards mirror the new fields.
     - Orchestrator exporter attaches guidance metadata to the run and per-frame records, and actors emit applied AIU ids; fallback guidance runs are marked with failure status.
     - Tests updated (`telemetrySchemas.test.ts`, `telemetryEnrichment.test.ts`) to assert provenance and AIU deltas are present.

## Phase 5 — Configurator Ingestion & Placement (P2-F01_9, P2-F04_5)
- Map spawn intents to concrete cells with conflict resolution & deterministic tie-breaking.
- Cost ledger debits, downgrade/reject pathways, solver re-validation of paths.
- Ledger outputs for actors (handle, location, AIUs, cost).
- Integration tests: accept blueprint → actors spawn; overspend/invalid AIU → rejection diagnostics.
- **Execution sub-steps**
  ☐ 1. **Blueprint ingestion & provenance capture**
     - Extend configurator plan/propose states (`apps/simulation/assembly/configurator/states/plan.ts`, `states/propose.ts`) to accept staged director blueprints, normalize rooms/connectors/anchors, and persist prompt/response hashes for traceability.
     - Guard against malformed geometry (overlapping rooms, invalid anchors) using the shared schema; emit `req: P2-F01_9` diagnostics recorded through the guidance plan feedback loop.
     - Unit tests: deterministic blueprint fixture proving provenance hash propagation plus rejection coverage for malformed geometry.
  ☐ 2. **Actor provisioning, AIU attachment, and budget debits**
     - Teach `configurator.ts` to instantiate actor groups from blueprint spawn intents, attaching requested AIU stacks while re-validating prerequisites and downgrading gracefully when prerequisites or inventory shards are missing.
     - Implement budgeting ledger entries (cost per actor + AIU) with running totals and `req: P2-F04_5` downgrade diagnostics; persist results for telemetry.
     - Tests: new AssemblyScript harness to prove (a) valid groups debit budgets and spawn actors at requested cells, (b) overspend/invalid AIU cases reject or downgrade with clear errors.
  ☐ 3. **Solver validation & conflict resolution**
     - After placement, invoke the solver to ensure every level remains traversable start→exit; deterministically resolve conflicts (duplicate anchors, overlapping actors/barriers) before the solver run.
     - If SAT fails, rollback the placement batch and surface structured errors referencing offending rooms/connectors; hook into orchestrator feedback so guidance can retry.
     - Tests: integration-level scenario verifying SAT success plus failure path that confirms rollback + diagnostics, including a regression for conflict tie-breaking.
  ☐ 4. **Telemetry & placement ledger emission**
     - Enrich raw/UI telemetry (`schemas/telemetry.raw.v2.json`, `telemetry.ui.v1.json`) with placement ledger entries: actor id, spawn cell, AIUs applied/downgraded, cost debits, solver verdict.
     - Update UI normalizer + renderer to surface placement provenance (even if UI hides it for now) and ensure orchestrator-run telemetry captures the new ledger.
     - Tests: schema/guard updates, telemetry normalizer assertions, and an orchestrator → configurator integration test that confirms ledger rows serialize correctly.

## Phase 6 — Telemetry & UI (P2-F05_4, P0-F04)
- Telemetry emission for AIU loadouts, per-tick activations, solver verdicts, remaining budget.
- UI adapter normalization of AIU fields; optional surface showing active AIU & SAT/UNSAT state.
- Tests ensuring telemetry fixtures validate against schemas; UI hook snapshot tests.

## Phase 7 — End-to-End Scenarios
- Scenario harness: director → orchestrator → configurator → actors → telemetry loop.
- Assertions: solver SAT rate, fallback usage, budget balances, layout solvability.
- Golden recordings for replay/regression.

## Phase 8 — Observability, Docs, & Flags
- Feature flags (`aiu.enabled`, AIU-specific toggles); default safe OFF until stable.
- Metrics: per-tick solver time, AIU SAT/UNSAT counts, budget spend.
- Documentation updates (requirements, ADRs, architecture diagrams).
- CI checks: schema validation, requirement-test coverage, doc/code trace verification.

---

### Ongoing Practices
- Tag code modules & tests with requirement IDs (`// req: P2-F01_9`).
- Link pull requests to requirement IDs; failing CI if doc/code drift mismatches.
- Maintain ADRs for major schema/reasoning updates.

This roadmap replaces previous phased plans and should remain the single source for sequencing AIU motivation work. Update it alongside requirements and ADRs when scope shifts occur.
