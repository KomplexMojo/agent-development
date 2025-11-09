# System Prompt — Project Continuity & Traceability

This file defines how to maintain long-term coherence across design intent, requirements, planning, testing, and implementation for this project. It does not restate design intent. Instead:

**The single source of design intent is:**
`/docs/context/design-intent.md`

All work must trace back to that document.

---

## 1. Authority Hierarchy

When conflicts arise, resolve in this order:
1. `/docs/context/design-intent.md` (Design intent)
2. Approved requirements (P0–P4) with acceptance criteria
3. `plan.md` (if applicable to complex features)
4. Tests (unit, integration, e2e)
5. Code and asset implementations

Codex must not override or invent content above it in this chain.

---

## 2. Requirements & Template Enforcement (P0–P5)

Requirements live under `/docs/` as persona-scoped files (e.g. `docs/p0.ORCHESTRATOR.reqs.md`, `docs/p1.ACTOR.reqs.md`, … `docs/p5.COORDINATOR.reqs.md`). They use a structured header with fields like `status`, `owner`, `req_type`, `phase`, `area`, `priority`, `labels`, `rationale`, `acceptance`, `verification`, and `traces`.

If a requirement lacks acceptance criteria or rationale:
- Do not proceed with implementation.
- Request the missing content or a confirmation update to the requirement file.

---

## 3. plan.md (Transient Implementation Plans)

`plan.md` is a short-lived, optional file used only for complex changes. It is not permanent documentation.

### **Rules for `plan.md`:**
- Required only when implementation spans multiple modules, schemas, or sessions.
- Location: `docs/plan.md` (current) or `/docs/plans/<feature-or-requirement-id>/plan.md` for multi-track efforts.
- Must reference requirement IDs and describe steps to satisfy acceptance criteria.
- Must connect changes to design intent when relevant.

### **Lifecycle of `plan.md`:**
| Condition | Expected Action |
|-----------|------------------|
| Entire plan implemented within session | Content cleared or file removed. |
| Plan partially executed | Update remaining steps, or replace with a fresh plan.md before resuming next session. |
| Requirements or intent change mid-execution | plan.md must be updated and decisions logged in `decisions.log`. |

---

## 4. Traceability Pipeline

| Phase | Artifact | Description |
|-------|----------|-------------|
| 1 | **Design intent** | `/docs/context/design-intent.md` — core philosophy and architectural north star. |
| 2 | **Requirements** | `/docs/requirements/` — structured per Section 2; no feature without a requirement. |
| 3 | **plan.md** *(if complex)* | Transient execution plan tied to requirements; removed after completion. |
| 4 | **Tests** | Must be created or updated to match acceptance criteria. Tests fail first. |
| 5 | **Code & Assets** | Implementation must satisfy tests and reference relevant requirement IDs and/or plan.md. |
| 6 | **decisions.log** | Permanent record of rationale for changes affecting design or requirements. |

---

## 5. P0–P5 Roles & Governance

| Persona | Responsibility |
|---------|----------------|
| **P0 Orchestrator** | Bridges the simulation to tooling and UI; runs demos, assembles frames, and exports telemetry. |
| **P1 Actor** | Core simulation entities (mobile or static) with resources, perception, and transitions. |
| **P2 Configurator** | Maintains map layers, actor placement, AIU attachment, and per-tick dispatch planning. |
| **P3 Director** | Provides high-level guidance (optional), broadcasting intents that the Configurator may consider. |
| **P4 Moderator** | Collects summaries/telemetry for analysis and UI consumption. |
| **P5 Coordinator** | Coordinates deterministic per‑tick flow across Director → Configurator → Actors → Moderator. |

---

## 6. Schemas & Telemetry Contracts

Non‑negotiable, project‑specific schema guarantees:
- JSON Schemas under `/schemas/` are the contract among orchestrator, simulation, and UI.
- Versioned files currently in use: `blueprint.v1.json`, `aiu.registry.v1.json`, `telemetry.raw.v2.json`, `telemetry.ui.v1.json`.
- Shared guards/types live in `apps/shared/types/schemas.ts` and must validate example payloads in tests.
- Telemetry emitted by the orchestrator must remain stable and validate against the above schemas.

---

## 7. When Something is Missing or Ambiguous

Codex must not hallucinate missing logic, tests, or requirements.

Instead, it should:
- Identify the missing artifact (`design-intent`, `requirement`, `plan.md`, test, schema).
- Request it explicitly.
- Halt further implementation until alignment is restored.

---

## 8. AIU & Solver Integration Principles

- AIU modules are modular capabilities attached per actor via a registry/budget. They expose deterministic hooks to prepare queries and interpret solver outcomes, then fall back if needed.
- The solver adapter (stub today) must be deterministic, bounded, and cache results.
- Determinism is mandatory: seeds, orderings, and budgets must yield reproducible runs.

This `codex-prompt.md` is meant to be reloaded at the start of any session where context is lost. It protects continuity and traceability across sessions.
