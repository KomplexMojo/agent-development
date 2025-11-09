# Simulation Runtime (AssemblyScript)

The AssemblyScript simulation now lives entirely inside this directory:

- Source: `apps/simulation/assembly`
- Build output: `apps/simulation/build`
- Tests: `apps/simulation/tests`
- Config: `apps/simulation/asconfig.json`
- Docs & requirements: `docs/*`

From the repository root you can continue to use the usual commands:

- `pnpm run asbuild`
- `pnpm test`

Additional integration assets (e.g., WASM bundlers, loaders) should also live
under `apps/simulation` so that client delivery artifacts remain grouped with
the core simulation runtime.
