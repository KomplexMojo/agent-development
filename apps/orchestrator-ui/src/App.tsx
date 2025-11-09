import { useState } from "react";
import { PlaybackProvider } from "./context/PlaybackContext";
import GridViewport from "./components/GridViewport";
import PlaybackControls from "./components/PlaybackControls";
import TimelineScrubber from "./components/TimelineScrubber";
import AgentInspector from "./components/AgentInspector";
import GenerationControls from "./components/GenerationControls";
import "./App.css";

function App(): JSX.Element {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);

  return (
    <PlaybackProvider>
      <div className="app-shell">
        <header className="app-header">
          <h1>Orchestrator Telemetry Viewer</h1>
          <div className="app-header__actions">
            <button type="button" onClick={() => setIsGeneratorOpen(true)}>
              Simulation Menu
            </button>
          </div>
        </header>
        <main className="app-main">
          <section className="viewport-stack">
            <GridViewport selectedAgentId={selectedAgentId} onSelectAgent={setSelectedAgentId} />
            <div className="viewport-controls">
              <TimelineScrubber />
              <PlaybackControls />
            </div>
          </section>
        </main>
        {isGeneratorOpen && (
          <div className="app-menu-overlay" role="dialog" aria-modal="true">
            <div className="app-menu-panel">
              <div className="app-menu-panel__header">
                <h2>Simulation Generator</h2>
                <button
                  type="button"
                  className="app-menu-close"
                  onClick={() => setIsGeneratorOpen(false)}
                  aria-label="Close simulation generator menu"
                >
                  X
                </button>
              </div>
              <GenerationControls showTitle={false} />
            </div>
          </div>
        )}
        <AgentInspector agentId={selectedAgentId} onClose={() => setSelectedAgentId(null)} />
      </div>
    </PlaybackProvider>
  );
}

export default App;
