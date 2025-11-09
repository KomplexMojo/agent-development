export type PortalState = {
  x: number;
  y: number;
  type: "entrance" | "exit";
  symbol?: string;
};

export type StairState = {
  x: number;
  y: number;
  type: "up" | "down";
  symbol?: string;
};

export type CultivationState = {
  isActive: boolean;
  ticks: number;
};

export type ActorState = {
  id: string;
  symbol?: string;
  x: number;
  y: number;
  stamina: number;
  intent?: string;
  tier?: string;
  outcome?: string;
  rejection?: string;
  role?: string;
  kind?: string;
  aius?: Array<{ id: string; tier?: string; cost?: number }>;
  cultivation?: CultivationState;
  vulnerability?: number;
};

export type TelemetryFrame = {
  tick: number;
  grid: string[];
  summary?: string;
  telemetry?: {
    tick: number;
    directives: string[];
    outcomes: string[];
  };
  actors: ActorState[];
  portals: PortalState[];
  stairs: StairState[];
};
