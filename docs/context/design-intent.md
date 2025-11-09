# Design Intent — Modular AIU Simulation with Deterministic Solver Pipeline

This document describes the north star for a modular, test‑driven simulation in which actors (mobile or static) operate under resource constraints, localized observations, and attachable intelligence units (AIUs). The design emphasizes determinism, traceability, and schema‑driven interoperability between the simulation, orchestrator, and UI. The is the first step towards a fully functioning rogue-like dungeon crawler game that leverages complex technonlogies such as interaction with AI for strategic decision making, interaction with solvers like z3 for logic, blockchain for capturing immutable source of truth information and provenance through NFTs, and IPFS for decentralized file storage. The intent of the game is to run with no central server. It will interact with decentralized services.

---

## 1. Goals

- Build a simulation that shows emergent intelligence through the assembly of a number of small atomic behaviours and the incorporation AI through LLMs, solvers like z3, and conventional "rule-cages" to capture fallback behaviour.
- Provable budgets: allocated budgets that determine the type of configuration that can be applied to elements such as actors and levels.
- Modular intelligence: attach **granular** AIU modules per actor (e.g., explore as a movement booster, find_entrance layered atop explore, attack layered atop pathfinding) with budgets and prerequisites so complex behaviors emerge by composing small capabilities.
- Sustained play loops: actors can enter **cultivation** to regenerate vitals (health, stamina, mana, durability). Cultivation is a deliberate, zero-movement AIU that trades survivability for recovery—remaining stationary accrues a post-cultivation vulnerability window equal to ⌈√ticks⌉ during which offensive/defensive actions are disabled.
- Deterministic reasoning: solver adapter is bounded, cached, and seeded; runs produce the same outcomes for the same inputs.
- Clear personas: Orchestrator, Configurator, Director, Moderator, Coordinator, and Actors each have scoped responsibilities.
- Traceability: every behavior maps to a requirement (P0–P5) and validated schemas; tests fail first, code follows.
- Telemetry first: structured telemetry (raw + UI) captures intents, outcomes, solver verdicts, and AIU loadouts for analysis and replay.

Non‑goals (for this project phase): sprite/TLV encoding, HUD affinity rules, blockchain persistence; these may be future experiments but are not required for the AIU/solver work.

---

## 2. System Overview

- P2 Configurator owns: map layers (surfaces, features, occupancy), actor placement, AIU attachment, and per‑tick dispatch planning (AIU → logic → instinct).
- P5 Coordinator orders the tick: Director (optional guidance) → Configurator (builds dispatch) → Actors (apply transitions) → Moderator (summaries/telemetry).
- P0 Orchestrator runs demos, stitches frames, and exports telemetry for the UI; it registers AIU templates and provisions actors.
- P4 Moderator collects per‑tick summaries and solver verdicts for downstream analysis and UI.
- P1 Actors expose resources (stamina, health, mana, durability), observation memory, and transitions; they do not know global state.

---

## 3. AIU & Solver Design

- AIU modules expose deterministic hooks:
  - prepare: translate context into a solver query (reachability, guard_radius, waypoint, …)
  - interpret: convert solver results into an intent vector; persist diagnostics
  - fallback: degrade to safe behavior if UNSAT/timeout/unimplemented
- Solver adapter (stub today) provides SAT/UNSAT/timeout verdicts and minimal step data; it is deterministic and cached.
- Evaluation order: director intents (if any) → AIU module intent → local logic (grid evaluation) → instinct fallback.

---

## 4. Schemas & Contracts

- JSON Schemas: `schemas/blueprint.v1.json`, `schemas/aiu.registry.v1.json`, `schemas/telemetry.raw.v2.json`, `schemas/telemetry.ui.v1.json`.
- Shared guards/types: `apps/shared/types/schemas.ts` validate example payloads.
- Telemetry must remain backward compatible within a schema version; version bumps require tests and fixtures.

---

## 5. Determinism & Testing Strategy

- Seeds and ordering: priority tokens, tie‑breakers, and budgets must be seeded and reproducible.
- Tests lead implementation: write failing tests per requirement, then code to pass them.
- Keep tests close to their domains (simulation vs orchestrator UI) and validate all schemas in CI.

---

## 6. Roadmap (Phases)

- Phase 0: Contracts & Schemas complete (registry, telemetry, blueprint; guards/tests).
- Phase 1: AIU runtime foundation complete (module hooks, registry, evaluation stack).
- Phase 2: Solver adapter stub complete; guard‑radius and waypoint query builders wired; telemetry surfaces solver verdicts.
- Phase 3: Core AIU modules (find_exit, defend_exit, patrol_corridor) with budgets and tests.
- Phase 4: Director/orchestrator guidance, ingestion & placement, telemetry polish, end‑to‑end scenarios, observability.
- Phase 5: Integrate actor icons with digitally encoded pixels for storing information.
- Phase 6: Create actor configuration screen. Allow for the setup of levels, assignment of intelligence and intent.
- Phase 7+: Allow user to take control of actors and play them as a character.

---

## 7. Traceability Rules

- Every change references requirement IDs and, when applicable, the active steps in `docs/plan.md`.
- New features must add or update tests and, when involving payloads, update schema fixtures.
- Decisions that alter requirements or architecture should be recorded in a durable `decisions.log`.

This intent document is the top authority for scope and approach. Requirements, plans, tests, and code must align with it.

## 8. Structure

- Each persona is implemented as a state machine.
- The /states folder under each personal folder /actor /configurator /coordinator stores the state for each persona
- The persona cycle through the entire cycle, including each state within the cycle every tick.

