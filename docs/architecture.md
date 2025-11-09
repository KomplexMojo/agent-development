# Architecture Charter

## Personas & Responsibilities
- **Actor**: The doer. Executes gameplay mechanics and applies directives. Owns the lifecycle `actor_lifecycle_*` with states Introspection → Observation → Evaluation → Transition → Emission.
- **Configurator**: The environment coordinator. Sets up the space, provisions actors, schedules movement, and validates constraints. Lifecycle `configurator_lifecycle_*` with states Plan → Propose → Survey → Dispatch → Verify → Confirm.
- **Director**: The intelligence broker. Synthesizes AI/solver insight into directives and patches. Lifecycle `director_lifecycle_*` (collect/analyze/plan/emit).
- **Moderator**: The narrator. Collects, aggregates, and emits telemetry for external observers and tooling. Lifecycle `moderator_lifecycle_*` (collect/aggregate/emit).
- **Coordinator**: The conductor. Drives per-tick sequencing across all personas, resolves conflicts, and ensures deterministic ordering. Lifecycle `coordinator_lifecycle_*` (schedule/resolve/commit).

## Structural Pattern
For every persona module:
1. `apps/simulation/assembly/<persona>/<persona>.ts` exports `persona_lifecycle_*` functions and orchestrates state transitions.
2. `apps/simulation/assembly/<persona>/contracts.ts` holds shared data structures and reset logic.
3. `apps/simulation/assembly/<persona>/states/*.ts` contains pure state handlers. Each state mutates the context but does not jump to other states directly.
4. Tests and consumers interact only through the lifecycle or explicit request APIs.

## Interaction Guidelines
- Cross-persona interactions go through explicit contracts (directives, patches, telemetry). No persona should mutate another’s internal state directly.
- Director produces structured directives or patches. Configurator and Actor accept/reject them via public APIs.
- Configurator handles safety checks (enterability, stamina, solver verification) before applying actor moves.
- Internal barriers are modelled as actors with a barrier role: configurator ledger tracks them, enterability treats them as blocking, and coordinator skips them during dispatch.
- Moderator captures all significant events, storing both human-readable summaries and machine-readable JSON/JSONL with provenance metadata.

## Development Loop
1. Update requirements to express new intent (persona + area + rationale).
2. Add or extend tests that fail until the requirement is met.
3. Extract any shared scaffolding introduced by the test into reusable modules.
4. Implement the minimal code to satisfy the tests, keeping logic inside the appropriate persona state machine.
5. Run `pnpm run asbuild` and `pnpm test` once the slice is green.

## Enforcement Checklist
- Lifecycle functions follow the naming pattern `<persona>_lifecycle_<verb>`.
- Shared context lives in `contracts.ts`; lifecycle file owns handle creation/lookup.
- State handlers are pure and only mutate their persona context.
- Cross-persona calls use contracts or lifecycle APIs, not state internals.
- Telemetry records the persona/tier responsible for decisions, enabling audit via Moderator logs.

Maintaining these conventions keeps each module a focused specialist and makes it easier to reason about the simulation as complexity grows.
