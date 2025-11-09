# Orchestrator Client (placeholder)

This directory will host the client-side orchestrator responsible for bridging
the AssemblyScript simulation with external services (AI guidance, IPFS,
blockchain interaction, UI).

Planned responsibilities:

- Load the compiled WASM bundle produced by the simulation build.
- Drive the coordinator lifecycle and respond to director requests.
- Communicate with LLMs, IPFS, and on-chain contracts directly from the
  player's device (no centralized backend).
- Feed responses back into the simulation via the exported contracts/APIs.

For now the folder only contains scaffolding (`src/index.ts`).  Implementation
will be filled in once we define the wire protocol between Director and the
client orchestrator.
