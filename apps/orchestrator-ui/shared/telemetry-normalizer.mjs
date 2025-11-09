function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? ""));
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function cloneState(state) {
  return { ...state };
}

function normalizeCultivationState(value) {
  if (!value || typeof value !== "object") return undefined;
  const isActive = Boolean(value.isActive);
  const ticks = isFiniteNumber(value.ticks) ? Math.max(0, Math.floor(value.ticks)) : 0;
  if (!isActive && ticks <= 0) {
    return undefined;
  }
  return { isActive, ticks };
}

function normalizeLegacyFrame(frame, index) {
  const grid = toArray(frame?.grid).map((row) => String(row ?? ""));
  const actors = toArray(frame?.actors).map((actor) => ({
    id: typeof actor?.id === "string" ? actor.id : `actor-${index}-${Math.random().toString(36).slice(2, 7)}`,
    symbol: typeof actor?.symbol === "string" ? actor.symbol : undefined,
    x: isFiniteNumber(actor?.x) ? actor.x : 0,
    y: isFiniteNumber(actor?.y) ? actor.y : 0,
    stamina: isFiniteNumber(actor?.stamina) ? actor.stamina : 0,
    intent: typeof actor?.intent === "string" ? actor.intent : undefined,
    tier: typeof actor?.tier === "string" ? actor.tier : undefined,
    outcome: typeof actor?.outcome === "string" ? actor.outcome : undefined,
    rejection: typeof actor?.rejection === "string" ? actor.rejection : undefined,
    role: typeof actor?.role === "string" ? actor.role : undefined,
    kind: typeof actor?.kind === "string" ? actor.kind : undefined,
    cultivation: normalizeCultivationState(actor?.cultivation),
    vulnerability: isFiniteNumber(actor?.vulnerability) ? actor.vulnerability : undefined,
  }));

  const portals = toArray(frame?.portals).map((portal) => ({
    x: isFiniteNumber(portal?.x) ? portal.x : 0,
    y: isFiniteNumber(portal?.y) ? portal.y : 0,
    type: portal?.type === "exit" ? "exit" : "entrance",
    symbol: typeof portal?.symbol === "string" ? portal.symbol : undefined,
  }));

  const stairs = toArray(frame?.stairs).map((stair) => ({
    x: isFiniteNumber(stair?.x) ? stair.x : 0,
    y: isFiniteNumber(stair?.y) ? stair.y : 0,
    type: stair?.type === "down" ? "down" : "up",
    symbol: typeof stair?.symbol === "string" ? stair.symbol : undefined,
  }));

  const telemetry = frame?.telemetry;
  const normalizedTelemetry = telemetry
    ? {
        tick: isFiniteNumber(telemetry.tick) ? telemetry.tick : index,
        directives: toStringArray(telemetry.directives ?? []),
        outcomes: toStringArray(telemetry.outcomes ?? []),
      }
    : undefined;

  return {
    tick: isFiniteNumber(frame?.tick) ? frame.tick : index,
    grid,
    summary: typeof frame?.summary === "string" ? frame.summary : undefined,
    telemetry: normalizedTelemetry,
    actors,
    portals,
    stairs,
  };
}

function calculateGridSize(frames) {
  let width = 0;
  let height = 0;
  for (const frame of frames) {
    height = Math.max(height, frame.grid.length);
    for (const row of frame.grid) {
      width = Math.max(width, row.length);
    }
  }
  return { width, height };
}

function fillBaseSurface(baseRows, width, height) {
  if (!Array.isArray(baseRows) || baseRows.length === 0) {
    return Array.from({ length: height }, () => ".".repeat(width));
  }
  return baseRows.map((row) => String(row ?? "").padEnd(width, ".")).slice(0, height);
}

function makeSurfaceCanvas(baseRows) {
  return baseRows.map((row) => row.split(""));
}

function canvasToRows(canvas) {
  return canvas.map((row) => row.join(""));
}

function normalizeBarrierEntry(entry, index) {
  return {
    id: typeof entry?.id === "string" ? entry.id : `barrier-${index + 1}`,
    symbol: typeof entry?.symbol === "string" ? entry.symbol : "█",
    x: isFiniteNumber(entry?.x) ? entry.x : 0,
    y: isFiniteNumber(entry?.y) ? entry.y : 0,
    stamina: isFiniteNumber(entry?.stamina) ? entry.stamina : 0,
    intent: typeof entry?.intent === "string" ? entry.intent : "(0,0)",
    tier: typeof entry?.tier === "string" ? entry.tier : "barrier",
    outcome: typeof entry?.outcome === "string" ? entry.outcome : "static",
    rejection: typeof entry?.rejection === "string" ? entry.rejection : undefined,
    role: typeof entry?.role === "string" ? entry.role : "barrier",
    kind: typeof entry?.kind === "string" ? entry.kind : "barrier",
  };
}

function expandOptimizedTelemetry(raw) {
  const surface = raw?.surface ?? {};
  const terrain = raw?.terrain ?? {};
  const actorsSection = raw?.actors ?? {};
  const ticks = toArray(raw?.ticks);

  const width = isFiniteNumber(surface.width) ? surface.width : 0;
  const height = isFiniteNumber(surface.height) ? surface.height : 0;

  const baseRows = fillBaseSurface(terrain.base ?? [], width, height);
  const portals = toArray(terrain.portals ?? raw?.static?.portals).map((portal) => ({
    x: isFiniteNumber(portal?.x) ? portal.x : 0,
    y: isFiniteNumber(portal?.y) ? portal.y : 0,
    type: portal?.type === "exit" ? "exit" : "entrance",
    symbol: typeof portal?.symbol === "string" ? portal.symbol : undefined,
  }));
  const stairs = toArray(terrain.stairs ?? raw?.static?.stairs).map((stair) => ({
    x: isFiniteNumber(stair?.x) ? stair.x : 0,
    y: isFiniteNumber(stair?.y) ? stair.y : 0,
    type: stair?.type === "down" ? "down" : "up",
    symbol: typeof stair?.symbol === "string" ? stair.symbol : undefined,
  }));
  const barrierEntries = toArray(terrain.barriers ?? raw?.static?.barriers).map(normalizeBarrierEntry);

  const metaByActor = actorsSection.meta && typeof actorsSection.meta === "object" ? actorsSection.meta : {};
  const initialByActor = actorsSection.initial && typeof actorsSection.initial === "object" ? actorsSection.initial : {};

  const stateByActor = new Map();
  for (const [actorId, initial] of Object.entries(initialByActor)) {
    const meta = metaByActor[actorId] ?? {};
    stateByActor.set(actorId, {
      id: actorId,
      symbol: typeof initial?.symbol === "string" ? initial.symbol : typeof meta?.symbol === "string" ? meta.symbol : undefined,
      x: isFiniteNumber(initial?.x) ? initial.x : 0,
      y: isFiniteNumber(initial?.y) ? initial.y : 0,
      stamina: isFiniteNumber(initial?.stamina) ? initial.stamina : 0,
      intent: typeof initial?.intent === "string" ? initial.intent : undefined,
      tier: typeof initial?.tier === "string" ? initial.tier : typeof meta?.tier === "string" ? meta.tier : undefined,
      outcome: typeof initial?.outcome === "string" ? initial.outcome : undefined,
      rejection: typeof initial?.rejection === "string" ? initial.rejection : undefined,
      role: typeof initial?.role === "string" ? initial.role : typeof meta?.role === "string" ? meta.role : "mobile",
      kind: typeof initial?.kind === "string" ? initial.kind : typeof meta?.kind === "string" ? meta.kind : "mobile",
      cultivation: normalizeCultivationState(initial?.cultivation),
      vulnerability: isFiniteNumber(initial?.vulnerability) ? initial.vulnerability : undefined,
    });
  }

  const frames = [];
  const summaries = toStringArray(raw?.summaries ?? raw?.meta?.summaries);
  const guidance = raw?.guidance && typeof raw.guidance === "object" ? { ...raw.guidance } : undefined;

  let tickIndex = 0;
  for (const tickEntry of ticks) {
    const tickNumber = isFiniteNumber(tickEntry?.tick) ? tickEntry.tick : tickIndex;
    const actorUpdates = tickEntry?.actors && typeof tickEntry.actors === "object" ? tickEntry.actors : {};

    for (const [actorId, update] of Object.entries(actorUpdates)) {
      if (update && typeof update === "object" && update.despawn) {
        stateByActor.delete(actorId);
        continue;
      }
      const meta = metaByActor[actorId] ?? {};
      const previous = stateByActor.get(actorId) ?? {
        id: actorId,
        symbol: typeof meta?.symbol === "string" ? meta.symbol : undefined,
        x: 0,
        y: 0,
        stamina: 0,
        intent: undefined,
        tier: typeof meta?.tier === "string" ? meta.tier : undefined,
        outcome: undefined,
        rejection: undefined,
        role: typeof meta?.role === "string" ? meta.role : "mobile",
        kind: typeof meta?.kind === "string" ? meta.kind : "mobile",
      };
      const next = cloneState(previous);

      const candidateEntries = Object.entries(update ?? {});
      for (const [key, value] of candidateEntries) {
        switch (key) {
          case "x":
          case "y":
          case "stamina":
            if (isFiniteNumber(value)) {
              next[key] = value;
            }
            break;
          case "intent":
          case "tier":
          case "outcome":
          case "rejection":
          case "role":
          case "kind":
            if (typeof value === "string") {
              next[key] = value;
            } else if (value === null) {
              next[key] = undefined;
            }
            break;
          case "symbol":
            if (typeof value === "string") {
              next.symbol = value;
            }
            break;
          case "cultivation": {
            const cultivationState = normalizeCultivationState(value);
            next.cultivation = cultivationState;
            break;
          }
          case "vulnerability":
            if (isFiniteNumber(value)) {
              next.vulnerability = value;
            } else if (value === null) {
              next.vulnerability = undefined;
            }
            break;
          default:
            break;
        }
      }

      stateByActor.set(actorId, next);
    }

    const canvas = makeSurfaceCanvas(baseRows);
    for (const barrier of barrierEntries) {
      if (canvas[barrier.y] && canvas[barrier.y][barrier.x] !== undefined) {
        canvas[barrier.y][barrier.x] = barrier.symbol ?? "█";
      }
    }

    const actorSnapshots = [];
    for (const state of stateByActor.values()) {
      actorSnapshots.push({
        id: state.id,
        symbol: state.symbol,
        x: state.x,
        y: state.y,
        stamina: state.stamina,
        intent: state.intent,
        tier: state.tier,
        outcome: state.outcome,
        rejection: state.rejection,
        role: state.role,
        kind: state.kind,
        cultivation: state.cultivation ? { ...state.cultivation } : undefined,
        vulnerability: state.vulnerability,
      });
      if (state.role !== "barrier" && state.kind !== "barrier") {
        if (canvas[state.y] && canvas[state.y][state.x] !== undefined) {
          canvas[state.y][state.x] = state.symbol ?? "•";
        }
      }
    }

    const barrierSnapshots = barrierEntries.map((barrier) => ({
      id: barrier.id,
      symbol: barrier.symbol,
      x: barrier.x,
      y: barrier.y,
      stamina: barrier.stamina,
      intent: barrier.intent,
      tier: barrier.tier,
      outcome: barrier.outcome,
      rejection: barrier.rejection,
      role: barrier.role,
      kind: barrier.kind,
    }));

    for (const barrier of barrierSnapshots) {
      if (canvas[barrier.y] && canvas[barrier.y][barrier.x] !== undefined) {
        canvas[barrier.y][barrier.x] = barrier.symbol ?? "█";
      }
    }

    const summary = typeof tickEntry?.summary === "string" ? tickEntry.summary : summaries[tickIndex];
    const telemetry = tickEntry?.telemetry;
    const normalizedTelemetry = telemetry
      ? {
          tick: tickNumber,
          directives: toStringArray(telemetry.directives ?? []),
          outcomes: toStringArray(telemetry.outcomes ?? []),
        }
      : undefined;

    frames.push({
      tick: tickNumber,
      grid: canvasToRows(canvas),
      summary,
      telemetry: normalizedTelemetry,
      actors: actorSnapshots.concat(barrierSnapshots),
      portals,
      stairs,
    });

    tickIndex += 1;
  }

  const { width: calculatedWidth, height: calculatedHeight } = calculateGridSize(frames);

  return {
    version: "ui.telemetry.v1",
    meta: {
      rawVersion: typeof raw?.version === "string" ? raw.version : "orchestrator.telemetry.v2",
      seed: isFiniteNumber(raw?.seed) ? raw.seed : undefined,
      summaries,
      grid: {
        width: calculatedWidth || width,
        height: calculatedHeight || height,
      },
      guidance,
    },
    frames,
  };
}

export function expandTelemetryDocument(raw) {
  if (raw && typeof raw === "object") {
    if (Array.isArray(raw.frames)) {
      const frames = raw.frames.map(normalizeLegacyFrame);
      const { width, height } = calculateGridSize(frames);
      return {
        version: "ui.telemetry.v1",
        meta: {
          rawVersion: typeof raw.version === "string" ? raw.version : "orchestrator.telemetry.v1",
          seed: isFiniteNumber(raw.seed) ? raw.seed : undefined,
          summaries: toStringArray(raw.summaries ?? []),
          grid: { width, height },
        },
        frames,
      };
    }
    if (Array.isArray(raw.ticks) || (raw.actors && raw.surface)) {
      return expandOptimizedTelemetry(raw);
    }
  }

  return {
    version: "ui.telemetry.v1",
    meta: {
      rawVersion: undefined,
      seed: undefined,
      summaries: [],
      grid: { width: 0, height: 0 },
      error: "Unrecognized telemetry format",
    },
    frames: [],
  };
}
