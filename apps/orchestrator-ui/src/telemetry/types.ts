import type { ActorState, PortalState, StairState } from "../utils/types";

export type ViewportFrame = {
  tick: number;
  grid: string[];
  summary?: string;
  actors: ActorState[];
  portals: PortalState[];
  stairs: StairState[];
};

export type TelemetryMeta = {
  rawVersion?: string;
  seed?: number;
  summaries: string[];
  grid: {
    width: number;
    height: number;
  };
  error?: string;
};

export type TelemetryDocument = {
  version: "ui.telemetry.v1";
  meta: TelemetryMeta;
  frames: ViewportFrame[];
};
