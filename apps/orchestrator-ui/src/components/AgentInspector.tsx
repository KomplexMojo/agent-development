import { useMemo } from "react";
import { useTelemetryFeed } from "../hooks/useTelemetryFeed";
import "./AgentInspector.css";

type Props = {
  agentId: string | null;
  onClose?: () => void;
};

const AgentInspector: React.FC<Props> = ({ agentId, onClose }) => {
  const { currentFrame, currentTick } = useTelemetryFeed();

  const agent = useMemo(() => currentFrame?.actors.find((actor) => actor.id === agentId) ?? null, [currentFrame, agentId]);

  if (!agentId || !agent) return null;

  return (
    <section className="agent-inspector" role="dialog" aria-modal="false">
      <header className="agent-inspector__header">
        <div>
          <h2>Agent Telemetry</h2>
          <span className="agent-inspector__agent-id">{agent.id}</span>
        </div>
        <button type="button" className="agent-inspector__close" onClick={onClose} aria-label="Close agent telemetry">
          X
        </button>
      </header>
      <dl>
        <div>
          <dt>Role</dt>
          <dd>{agent.role ?? agent.kind ?? "mobile"}</dd>
        </div>
        <div>
          <dt>Tick</dt>
          <dd>{currentTick + 1}</dd>
        </div>
        <div>
          <dt>Position</dt>
          <dd>({agent.x}, {agent.y})</dd>
        </div>
        <div>
          <dt>Stamina</dt>
          <dd>{agent.stamina ?? agent.mana ?? 0}</dd>
        </div>
        <div>
          <dt>Intent</dt>
          <dd>{agent.intent ?? "pending"}</dd>
        </div>
        <div>
          <dt>Dispatch Tier</dt>
          <dd>{agent.tier ?? "n/a"}</dd>
        </div>
        <div>
          <dt>Outcome</dt>
          <dd>{agent.outcome ?? "n/a"}</dd>
        </div>
      </dl>
    </section>
  );
};

export default AgentInspector;
