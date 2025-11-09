# Orchestrator GUI – Proposed Folder Structure

> Development entry point: run `pnpm run dev:orchestrator` from the repo root.  
> This single command builds the AssemblyScript bundle, seeds telemetry with the testing defaults (57×25 surface, full tick budget, and ratio-based actor/barrier counts), then launches the generator API plus the Vite dev server. Use the in-app **Generate Simulation** button to experiment with different parameters.

```
apps/
  orchestrator-ui/
    package.json          # UI workspace (Vite/React tooling)
    tsconfig.json         # TypeScript compiler settings
    vite.config.ts        # Vite dev/build configuration
    public/
      index.html          # Root HTML shell
    src/
      main.tsx            # Entry point bootstrapping React app
      App.tsx             # Top-level layout (surface viewport + panels)
      components/
        GridViewport.tsx  # Canvas/SVG rendering of map + actors
        PlaybackControls.tsx  # Play/Pause/Step controls
        TimelineScrubber.tsx  # Tick slider visualisation
        AgentList.tsx         # Selectable list of actors
        AgentInspector.tsx    # Telemetry panel for selected actor
      hooks/
        usePlayback.ts        # Playback state machine (play, pause, step)
        useTelemetryFeed.ts   # Bridge to orchestrator telemetry source
      context/
        PlaybackContext.tsx   # Context providers for shared state
      styles/
        globals.css           # Base styles and layout variables
        theme.css             # Light/Dark theme tokens
      utils/
        types.ts              # Shared TypeScript types for UI
        formatters.ts         # Helpers for formatting telemetry
      data/
        demoAdapter.ts        # Adapter to consume demo JSON stream
```

> Note: The structure assumes a React + Vite stack. Adjustments can be made if another framework is preferred, but separating components, hooks, context, and utilities keeps playback/state logic isolated from rendering concerns.
