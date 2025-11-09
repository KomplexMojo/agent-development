import { useTelemetryFeed } from "../hooks/useTelemetryFeed";
import "./AgentList.css";

type Props = {
  selectedAgentId: string | null;
  onSelectAgent: (id: string | null) => void;
};

const AgentList: React.FC<Props> = ({ selectedAgentId, onSelectAgent }) => {
  const { currentFrame } = useTelemetryFeed();
  const agents = currentFrame?.actors ?? [];

  return (
    <section className="agent-list">
      <h2>Agents</h2>
      <ul>
        {agents.map((actor) => (
          <li key={actor.id}>
            <button
              type="button"
              className={actor.id === selectedAgentId ? "is-selected" : undefined}
              onClick={() => onSelectAgent(actor.id === selectedAgentId ? null : actor.id)}
            >
              <span className="agent-list__symbol">{actor.symbol ?? "?"}</span>
              <span className="agent-list__label">{actor.id}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default AgentList;
