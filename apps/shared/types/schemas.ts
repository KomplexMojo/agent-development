/* eslint-disable @typescript-eslint/consistent-type-definitions */
// Shared type definitions and minimal runtime guards for blueprint, AIU registry,
// and telemetry schemas. These mirror the JSON schemas under /schemas.

type PrimitiveObject = Record<string, unknown>;
type CultivationTelemetry = {
  isActive: boolean;
  ticks: number;
};

function isObject(value: unknown): value is PrimitiveObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return Number.isInteger(value as number);
}

function isArrayOfString(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isCultivationTelemetry(value: unknown): value is CultivationTelemetry {
  if (!isObject(value)) return false;
  const obj = value as PrimitiveObject;
  const ticks = obj.ticks;
  return isBoolean(obj.isActive) && isInteger(ticks) && (ticks as number) >= 0;
}

// ---------------------------------------------------------------------------
// Blueprint

export type BlueprintBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BlueprintRoom = {
  id: string;
  name?: string;
  bounds: BlueprintBounds;
  walkable?: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

export type BlueprintConnector = {
  id: string;
  from: string;
  to: string;
  kind?: string;
  waypoints?: Array<{ x: number; y: number }>;
  width?: number;
  tags?: string[];
};

export type BlueprintAnchorRef = {
  roomId: string;
  position?: { x: number; y: number };
  notes?: string;
};

export type BlueprintSpawnIntent =
  | { type: "room"; roomId: string; notes?: string }
  | { type: "near"; target: string; radius?: number; notes?: string }
  | { type: "coordinate"; coordinates: Array<{ x: number; y: number }>; notes?: string }
  | { type: "path"; coordinates: Array<{ x: number; y: number }>; notes?: string };

export type BlueprintAIURef = {
  id: string;
  tier?: string;
  cost?: number;
  weight?: number;
  notes?: string;
};

export type BlueprintActorGroup = {
  label: string;
  description?: string;
  count: number;
  faction: string;
  spawn: BlueprintSpawnIntent;
  aius: BlueprintAIURef[];
  budget: number;
  confidence?: number;
  metadata?: Record<string, unknown>;
};

export type BlueprintBudget = {
  total: number;
  spent: number;
  remaining: number;
  currency?: string;
  notes?: string;
};

export type BlueprintProvenance = {
  model?: string;
  promptHash?: string;
  responseHash?: string;
  generatedAt?: string;
  seed?: number;
};

export type BlueprintDocument = {
  version: "orchestrator.blueprint.v1";
  request: {
    width: number;
    height: number;
    actors?: number;
    barriers?: number;
    difficulty?: string;
    seed?: number;
    notes?: string;
  };
  rooms: BlueprintRoom[];
  connectors: BlueprintConnector[];
  anchors: {
    start: BlueprintAnchorRef;
    exit: BlueprintAnchorRef;
    checkpoints?: BlueprintAnchorRef[];
  };
  flow: {
    sequence: string[];
    branches?: Array<{ entry: string; sequence: string[] }>;
  };
  constraints?: {
    requiredPaths?: Array<{ from: string; to: string; maxSteps?: number }>;
    forbiddenZones?: BlueprintBounds[];
    notes?: string;
  };
  actors: BlueprintActorGroup[];
  budget: BlueprintBudget;
  confidence?: { score?: number; explanation?: string };
  provenance?: BlueprintProvenance;
};

export function isBlueprintDocument(value: unknown): value is BlueprintDocument {
  if (!isObject(value)) return false;
  if (value.version !== "orchestrator.blueprint.v1") return false;
  const request = value.request;
  if (!isObject(request)) return false;
  if (!isInteger(request.width) || !isInteger(request.height)) return false;
  if (!Array.isArray(value.rooms) || value.rooms.length === 0) return false;
  if (!Array.isArray(value.connectors)) return false;
  if (!isObject(value.anchors)) return false;
  if (!isObject(value.flow) || !Array.isArray((value.flow as PrimitiveObject).sequence)) return false;
  if (!Array.isArray(value.actors)) return false;
  if (!isObject(value.budget)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// AIU Registry

export type AIUTemplate = {
  id: string;
  version: string;
  description?: string;
  cost: number;
  tier?: string;
  solverSchema: string;
  tags?: string[];
  prerequisites?: {
    minStamina?: number;
    requiresLineOfSight?: boolean;
    requiresEnhancedObservation?: boolean;
    factions?: string[];
    environmentTags?: string[];
  };
  budget?: {
    baseCost?: number;
    upkeepPerTick?: number;
  };
  metadata?: Record<string, unknown>;
  runtime?: {
    moduleId: number;
    moduleKind: string;
    hooks?: {
      prepare?: string;
      interpret?: string;
      fallback?: string;
    };
  };
};

export type AIURegistry = {
  version: "aiu.registry.v1";
  updatedAt?: string;
  currency?: string;
  templates: AIUTemplate[];
};

export function isAIURegistry(value: unknown): value is AIURegistry {
  if (!isObject(value)) return false;
  if (value.version !== "aiu.registry.v1") return false;
  if (!Array.isArray(value.templates) || value.templates.length === 0) return false;
  return value.templates.every((template) => {
    if (!isObject(template)) return false;
    if (!isString(template.id) || !isString(template.version) || !isNumber(template.cost)) return false;
    if (!isString(template.solverSchema)) return false;
    if ("runtime" in template) {
      const runtime = (template as PrimitiveObject).runtime;
      if (!isObject(runtime)) return false;
      const runtimeObj = runtime as PrimitiveObject;
      if (!isInteger(runtimeObj.moduleId) || (runtimeObj.moduleId as number) <= 0) return false;
      if (!isString(runtimeObj.moduleKind)) return false;
      if ("hooks" in runtimeObj) {
        const hooks = runtimeObj.hooks;
        if (!isObject(hooks)) return false;
        const hooksObj = hooks as PrimitiveObject;
        if ("prepare" in hooksObj && !isString(hooksObj.prepare)) return false;
        if ("interpret" in hooksObj && !isString(hooksObj.interpret)) return false;
        if ("fallback" in hooksObj && !isString(hooksObj.fallback)) return false;
      }
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Telemetry (raw and UI)

export type RawTelemetrySolverRecord = {
  verdict: string;
  code?: number;
  reason?: string;
};

export type RawTerrain = {
  base: string[];
  portals: Array<{ x: number; y: number; type: string; symbol?: string }>;
  stairs: Array<{ x: number; y: number; type: string; symbol?: string }>;
  barriers: Array<{
    id: string;
    x: number;
    y: number;
    symbol?: string;
    role?: string;
    kind?: string;
  }>;
};

export type RawTelemetryActors = {
  meta: Record<string, {
    symbol?: string;
    role?: string;
    kind?: string;
    faction?: string;
    aius?: Array<{ id: string; tier?: string; cost?: number; moduleId?: number; moduleKind?: string }>;
  }>;
  initial: Record<string, { x: number; y: number; stamina?: number; role?: string; kind?: string; symbol?: string }>;
};

export type RawTelemetryActorTick = {
  x: number;
  y: number;
  stamina?: number;
  intent?: string;
  tier?: string;
  outcome?: string;
  rejection?: string;
  solverCode?: number;
  solver?: RawTelemetrySolverRecord;
  aiuMode?: string;
  aiuModeCode?: number;
  aiuAux?: number;
  cultivation?: CultivationTelemetry;
  vulnerability?: number;
};

export type RawTelemetryTick = {
  tick: number;
  summary?: string;
  telemetry?: { directives: string[]; outcomes: string[]; solver?: string[] };
  actors?: Record<string, RawTelemetryActorTick>;
};

export type RawTelemetryDocument = {
  version: "orchestrator.telemetry.v2";
  seed?: number;
  summaries: string[];
  surface: { width: number; height: number };
  terrain: RawTerrain;
  actors: RawTelemetryActors;
  ticks: RawTelemetryTick[];
  budget?: { total: number; spent: number; remaining: number };
  provenance?: Record<string, unknown>;
  guidance?: {
    planId?: string;
    status?: string;
    promptHash?: string;
    responseHash?: string;
    model?: string;
    appliedOptions?: {
      width?: number;
      height?: number;
      actorCount?: number;
      barrierCount?: number;
      ticks?: number;
    };
  };
};

export function isRawTelemetryDocument(value: unknown): value is RawTelemetryDocument {
  if (!isObject(value)) return false;
  if (value.version !== "orchestrator.telemetry.v2") return false;
  if (!isObject(value.surface) || !isInteger((value.surface as PrimitiveObject).width) || !isInteger((value.surface as PrimitiveObject).height)) {
    return false;
  }
  if (!isObject(value.terrain)) return false;
  const terrain = value.terrain as PrimitiveObject;
  if (!Array.isArray(terrain.base)) return false;
  if (!Array.isArray(terrain.portals) || !Array.isArray(terrain.stairs) || !Array.isArray(terrain.barriers)) return false;
  if (!isObject(value.actors)) return false;
  if (!Array.isArray(value.ticks)) return false;
  return value.ticks.every((tick) => {
    if (!isObject(tick)) return false;
    if (!isInteger((tick as PrimitiveObject).tick)) return false;
    const telemetry = (tick as PrimitiveObject).telemetry;
    if (telemetry !== undefined) {
      if (!isObject(telemetry)) return false;
      if (!isArrayOfString((telemetry as PrimitiveObject).directives)) return false;
      if (!isArrayOfString((telemetry as PrimitiveObject).outcomes)) return false;
      const solver = (telemetry as PrimitiveObject).solver;
      if (solver !== undefined && !isArrayOfString(solver)) return false;
    }
    const actors = (tick as PrimitiveObject).actors;
    if (actors !== undefined) {
      if (!isObject(actors)) return false;
      const actorRecords = actors as PrimitiveObject;
      for (const key of Object.keys(actorRecords)) {
        const record = actorRecords[key];
        if (!isObject(record)) return false;
        if (!isNumber((record as PrimitiveObject).x) || !isNumber((record as PrimitiveObject).y)) return false;
        const solver = (record as PrimitiveObject).solver;
        if (solver !== undefined && (!isObject(solver) || !isString((solver as PrimitiveObject).verdict))) {
          return false;
        }
        const solverCode = (record as PrimitiveObject).solverCode;
        if (solverCode !== undefined && !isInteger(solverCode)) return false;
        const aiuMode = (record as PrimitiveObject).aiuMode;
        if (aiuMode !== undefined && !isString(aiuMode)) return false;
        const aiuModeCode = (record as PrimitiveObject).aiuModeCode;
        if (aiuModeCode !== undefined && !isInteger(aiuModeCode)) return false;
        const aiuAux = (record as PrimitiveObject).aiuAux;
        if (aiuAux !== undefined && !isInteger(aiuAux)) return false;
        const aiuApplied = (record as PrimitiveObject).aiuApplied;
        if (aiuApplied !== undefined && (!Array.isArray(aiuApplied) || !aiuApplied.every(isString))) {
          return false;
        }
        const aiuDropped = (record as PrimitiveObject).aiuDropped;
        if (aiuDropped !== undefined && (!Array.isArray(aiuDropped) || !aiuDropped.every(isString))) {
          return false;
        }
        const cultivation = (record as PrimitiveObject).cultivation;
        if (cultivation !== undefined && !isCultivationTelemetry(cultivation)) return false;
        const vulnerability = (record as PrimitiveObject).vulnerability;
        if (vulnerability !== undefined && !isInteger(vulnerability)) return false;
        if (solver !== undefined) {
          const solverObj = solver as PrimitiveObject;
          const solverCodeValue = solverObj.code;
          if (solverCodeValue !== undefined && !isInteger(solverCodeValue)) return false;
          const solverReason = solverObj.reason;
          if (solverReason !== undefined && !isString(solverReason)) return false;
        }
      }
    }
    return true;
  });
}

export type UITelemetryActor = {
  id: string;
  x: number;
  y: number;
  stamina?: number;
  symbol?: string;
  intent?: string;
  tier?: string;
  outcome?: string;
  rejection?: string;
  solver?: string;
  solverCode?: number;
  role?: string;
  kind?: string;
  faction?: string;
  aiuMode?: string;
  aiuModeCode?: number;
  aiuAux?: number;
  aiuApplied?: string[];
  aiuDropped?: string[];
  cultivation?: CultivationTelemetry;
  vulnerability?: number;
  aius?: Array<{ id: string; tier?: string; cost?: number; moduleId?: number; kind?: string }>;
};

export type UITelemetryFrame = {
  tick: number;
  grid: string[];
  summary?: string;
  actors: UITelemetryActor[];
  portals?: Array<{ x: number; y: number; type: string; symbol?: string }>;
  stairs?: Array<{ x: number; y: number; type: string; symbol?: string }>;
  telemetry?: { directives: string[]; outcomes: string[]; solver?: string[] };
};

export type UITelemetryMeta = {
  rawVersion?: string;
  seed?: number;
  summaries: string[];
  grid: { width: number; height: number };
  budget?: { total: number; spent: number; remaining: number };
  guidance?: {
    planId?: string;
    status?: string;
    promptHash?: string;
    responseHash?: string;
    model?: string;
    appliedOptions?: {
      width?: number;
      height?: number;
      actorCount?: number;
      barrierCount?: number;
      ticks?: number;
    };
  };
};

export type UITelemetryDocument = {
  version: "ui.telemetry.v1";
  meta: UITelemetryMeta;
  frames: UITelemetryFrame[];
};

export function isUITelemetryDocument(value: unknown): value is UITelemetryDocument {
  if (!isObject(value)) return false;
  if (value.version !== "ui.telemetry.v1") return false;
  if (!isObject(value.meta)) return false;
  const meta = value.meta as PrimitiveObject;
  if (!isArrayOfString(meta.summaries)) return false;
  if (!isObject(meta.grid) || !isInteger((meta.grid as PrimitiveObject).width) || !isInteger((meta.grid as PrimitiveObject).height)) return false;
  const guidanceMeta = meta.guidance;
  if (guidanceMeta !== undefined) {
    if (!isObject(guidanceMeta)) return false;
    const guidanceObj = guidanceMeta as PrimitiveObject;
    if ("planId" in guidanceObj && guidanceObj.planId !== undefined && !isString(guidanceObj.planId)) return false;
    if ("status" in guidanceObj && guidanceObj.status !== undefined && !isString(guidanceObj.status)) return false;
    if ("promptHash" in guidanceObj && guidanceObj.promptHash !== undefined && !isString(guidanceObj.promptHash)) return false;
    if ("responseHash" in guidanceObj && guidanceObj.responseHash !== undefined && !isString(guidanceObj.responseHash)) return false;
    if ("model" in guidanceObj && guidanceObj.model !== undefined && !isString(guidanceObj.model)) return false;
    const appliedOptions = guidanceObj.appliedOptions;
    if (appliedOptions !== undefined) {
      if (!isObject(appliedOptions)) return false;
      const applied = appliedOptions as PrimitiveObject;
      if ("width" in applied && applied.width !== undefined && !isInteger(applied.width)) return false;
      if ("height" in applied && applied.height !== undefined && !isInteger(applied.height)) return false;
      if ("actorCount" in applied && applied.actorCount !== undefined && !isInteger(applied.actorCount)) return false;
      if ("barrierCount" in applied && applied.barrierCount !== undefined && !isInteger(applied.barrierCount)) return false;
      if ("ticks" in applied && applied.ticks !== undefined && !isInteger(applied.ticks)) return false;
    }
  }
  if (!Array.isArray(value.frames)) return false;
  return value.frames.every((frame) => {
    if (!isObject(frame)) return false;
    if (!isInteger((frame as PrimitiveObject).tick)) return false;
    if (!Array.isArray((frame as PrimitiveObject).grid)) return false;
    if (!Array.isArray((frame as PrimitiveObject).actors)) return false;
    const actors = (frame as PrimitiveObject).actors as unknown[];
    if (
      !actors.every((actor) => {
        if (!isObject(actor) || !isString((actor as PrimitiveObject).id)) return false;
        const actorObj = actor as PrimitiveObject;
        if ("solver" in actorObj && actorObj.solver !== undefined && !isString(actorObj.solver)) return false;
        if ("solverCode" in actorObj && actorObj.solverCode !== undefined && !isInteger(actorObj.solverCode)) {
          return false;
        }
        if ("aiuMode" in actorObj && actorObj.aiuMode !== undefined && !isString(actorObj.aiuMode)) return false;
        if ("aiuModeCode" in actorObj && actorObj.aiuModeCode !== undefined && !isInteger(actorObj.aiuModeCode)) {
          return false;
        }
        if ("aiuAux" in actorObj && actorObj.aiuAux !== undefined && !isInteger(actorObj.aiuAux)) return false;
        if ("cultivation" in actorObj && actorObj.cultivation !== undefined && !isCultivationTelemetry(actorObj.cultivation)) {
          return false;
        }
        if ("aiuApplied" in actorObj && actorObj.aiuApplied !== undefined) {
          if (!Array.isArray(actorObj.aiuApplied) || !actorObj.aiuApplied.every(isString)) {
            return false;
          }
        }
        if ("aiuDropped" in actorObj && actorObj.aiuDropped !== undefined) {
          if (!Array.isArray(actorObj.aiuDropped) || !actorObj.aiuDropped.every(isString)) {
            return false;
          }
        }
        if ("vulnerability" in actorObj && actorObj.vulnerability !== undefined && !isInteger(actorObj.vulnerability)) {
          return false;
        }
        return true;
      })
    ) {
      return false;
    }
    const telemetry = (frame as PrimitiveObject).telemetry;
    if (telemetry !== undefined) {
      if (!isObject(telemetry)) return false;
      if (!isArrayOfString((telemetry as PrimitiveObject).directives)) return false;
      if (!isArrayOfString((telemetry as PrimitiveObject).outcomes)) return false;
      const solver = (telemetry as PrimitiveObject).solver;
      if (solver !== undefined && !isArrayOfString(solver)) return false;
    }
    return true;
  });
}
