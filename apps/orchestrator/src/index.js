/**
 * @typedef {{id:string,x:number,y:number,stamina:number,symbol?:string,kind?:string,role?:string,aiuModuleId?:number,aiuTemplateId?:string}} ActorSnapshot
 * @typedef {{tick:number,directives:string[],outcomes:string[],solver?:string[]}} FrameTelemetry
 * @typedef {{type:"entrance"|"exit",x:number,y:number,symbol?:string}} PortalSnapshot
 * @typedef {{type:"up"|"down",x:number,y:number,symbol?:string}} StairSnapshot
 * @typedef {{tick:number,grid:string[],telemetry:FrameTelemetry,portals?:PortalSnapshot[],stairs?:StairSnapshot[]}} DemoFrame
 * @typedef {{frames:DemoFrame[],summaries:string[]}} DemoResult
 * @typedef {{ticks?:number,width?:number,height?:number,actorSymbols?:string[],actorCount?:number,barrierCount?:number,mock?:boolean,seed?:number}} DemoOptions
 */

import { DEFAULT_AIU_REGISTRY } from "./data/defaultAiuRegistry.js";
import { normalizeAiuRegistry, AiuModuleKindCode } from "./data/aiuRegistry.js";
import { consumeGuidancePlan, recordGuidancePlanFeedback } from "./guidance/planStore.js";

/**
 * @param {number} width
 * @param {number} height
 * @param {ActorSnapshot[]} actors
 * @param {{x:number,y:number,symbol?:string}[]} [obstacles]
 * @returns {string[]}
 */
const PORTAL_SYMBOL_ENTRANCE = "◀";
const PORTAL_SYMBOL_EXIT = "▶";
const PORTAL_TYPE_ENTRANCE = 1;
const PORTAL_TYPE_EXIT = 2;
const STAIR_SYMBOL_UP = "▲";
const STAIR_SYMBOL_DOWN = "▼";
const STAIR_TYPE_UP = 1;
const STAIR_TYPE_DOWN = 2;
const BARRIER_SYMBOL = "█";

const RESERVED_SYMBOLS = new Set([
  PORTAL_SYMBOL_ENTRANCE,
  PORTAL_SYMBOL_EXIT,
  STAIR_SYMBOL_UP,
  STAIR_SYMBOL_DOWN,
  BARRIER_SYMBOL,
]);

const ACTOR_SYMBOL_POOL = [
  ..."αβγδεζηθικλμνξοπρστυφχψω",
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."abcdefghijklmnopqrstuvwxyz",
  ..."0123456789",
  ..."♠♣♥♦★☆☀☁☂☃☄☾☽♜♞♝♛♚♖♘♗♕♔",
].filter((symbol) => !RESERVED_SYMBOLS.has(symbol));

export const DEFAULT_SIMULATION_TICKS = 100;
export const DEFAULT_SURFACE_WIDTH = 20;
export const DEFAULT_SURFACE_HEIGHT = 20;
export const DEFAULT_BARRIER_RATIO = 0.1;
export const DEFAULT_ACTOR_RATIO = 0.05;
export const RESERVED_SPECIAL_CELL_COUNT = 4;

function computeSurfaceAvailability(width, height) {
  const totalCells = Math.max(0, Math.floor(width) * Math.floor(height));
  const available = Math.max(0, totalCells - RESERVED_SPECIAL_CELL_COUNT);
  return { totalCells, availableCells: available };
}

function deriveGuidanceOverrides(plan) {
  if (!plan || typeof plan !== "object") return {};
  const request = plan.blueprint?.request ?? {};
  const width = Number.isFinite(request.width) ? request.width : undefined;
  const height = Number.isFinite(request.height) ? request.height : undefined;
  const actorCount =
    Array.isArray(plan.groups) && plan.groups.length > 0
      ? plan.groups.reduce(
          (sum, group) => sum + (Number.isFinite(group?.count) ? Math.max(0, Math.floor(group.count)) : 0),
          0,
        )
      : undefined;
  const barrierCount = Number.isFinite(request.barriers) ? Math.max(0, Math.floor(request.barriers)) : undefined;
  return { width, height, actorCount, barrierCount };
}

function normalizeCultivationTicks(value) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  return Math.floor(value);
}

function buildCultivationTelemetry(value) {
  const ticks = normalizeCultivationTicks(value);
  return { isActive: ticks > 0, ticks };
}

export function computeDefaultPopulation(width, height) {
  const { totalCells, availableCells } = computeSurfaceAvailability(width, height);
  if (availableCells <= 0) {
    return { actorCount: 0, barrierCount: 0 };
  }

  const desiredActors = Math.max(1, Math.floor(totalCells * DEFAULT_ACTOR_RATIO));
  const desiredBarriers = Math.max(0, Math.floor(totalCells * DEFAULT_BARRIER_RATIO));

  let actorCount = Math.min(desiredActors, availableCells);
  let barrierCount = Math.min(desiredBarriers, Math.max(0, availableCells - actorCount));

  const overflow = actorCount + barrierCount - availableCells;
  if (overflow > 0) {
    barrierCount = Math.max(0, barrierCount - overflow);
  }

  if (actorCount <= 0 && availableCells > 0) {
    actorCount = Math.min(availableCells, 1);
  }

  if (barrierCount > availableCells - actorCount) {
    barrierCount = Math.max(0, availableCells - actorCount);
  }

  return { actorCount, barrierCount };
}

function generateActorSymbols(count) {
  const symbols = [];
  for (let index = 0; index < count; index += 1) {
    if (index < ACTOR_SYMBOL_POOL.length) {
      symbols.push(ACTOR_SYMBOL_POOL[index]);
      continue;
    }
    const offset = index - ACTOR_SYMBOL_POOL.length;
    const baseChar = String.fromCharCode(0x41 + (offset % 26));
    const suffix = Math.floor(offset / 26);
    const fallback = suffix === 0 ? baseChar : `${baseChar}${suffix}`;
    symbols.push(fallback);
  }
  return symbols;
}

export function generateAsciiFrame(width, height, actors, obstacles = []) {
  const grid = Array.from({ length: height }, () => Array(width).fill("."));

  for (const { x, y, symbol } of obstacles) {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      grid[y][x] = symbol ?? "#";
    }
  }

  for (const actor of actors) {
    if (actor.x >= 0 && actor.x < width && actor.y >= 0 && actor.y < height) {
      grid[actor.y][actor.x] = actor.symbol ?? actor.id.charAt(0).toUpperCase();
    }
  }

  return grid.map((row) => row.join(""));
}

/**
 * @param {number} tick
 * @param {ActorSnapshot[]} actors
 * @returns {FrameTelemetry}
 */
export function formatTelemetry(tick, actors) {
  const directives = actors.map((actor) => `${actor.id}:dir(${actor.x},${actor.y}) stamina=${actor.stamina}`);
  const outcomes = actors.map((actor) => `${actor.id}:move(${actor.x},${actor.y}) stamina=${actor.stamina}`);
  const solver = actors.map((actor) => {
    const verdict = actor.solver ?? "none";
    return `${actor.id}:solver=${verdict}`;
  });
  return { tick, directives, outcomes, solver };
}

/**
 * @param {DemoOptions} [options]
 * @returns {Promise<DemoResult>}
 */
export async function runMvpDemo(options = {}) {
  const activePlan = consumeGuidancePlan();
  const overrides = activePlan ? deriveGuidanceOverrides(activePlan) : {};

  const width = Math.max(4, Math.floor(overrides.width ?? options.width ?? DEFAULT_SURFACE_WIDTH));
  const height = Math.max(3, Math.floor(overrides.height ?? options.height ?? DEFAULT_SURFACE_HEIGHT));
  const ticks = Math.max(1, Math.floor(options.ticks ?? DEFAULT_SIMULATION_TICKS));
  const normalizedSeed = Number.isFinite(options.seed) ? Math.floor(options.seed) : Date.now();

  const { actorCount: defaultActors, barrierCount: defaultBarriers } = computeDefaultPopulation(width, height);
  const requestedActorCount = Number.isFinite(options.actorCount)
    ? Math.max(1, Math.floor(options.actorCount))
    : overrides.actorCount;
  const requestedSymbols = Array.isArray(options.actorSymbols)
    ? options.actorSymbols.filter((symbol) => typeof symbol === "string" && symbol.length > 0)
    : undefined;

  const { availableCells } = computeSurfaceAvailability(width, height);
  let actorCountBase = requestedSymbols?.length ?? requestedActorCount ?? defaultActors;
  if (availableCells > 0) {
    actorCountBase = Math.max(1, Math.min(actorCountBase, availableCells));
  } else {
    actorCountBase = 0;
  }

  const actorSymbolsSource = requestedSymbols ?? generateActorSymbols(actorCountBase);
  const actorSymbols = actorSymbolsSource.slice(0, actorCountBase);
  const actorCount = actorSymbols.length;

  const rawBarriers = Number.isFinite(options.barrierCount)
    ? Math.max(0, Math.floor(options.barrierCount))
    : Number.isFinite(overrides.barrierCount)
      ? Math.max(0, Math.floor(overrides.barrierCount))
      : defaultBarriers;
  const barrierCapacity = Math.max(0, availableCells - actorCount);
  const barrierCount = Math.min(rawBarriers, barrierCapacity);

  const normalized = {
    ...options,
    seed: normalizedSeed,
    ticks,
    width,
    height,
    actorCount,
    actorSymbols,
    barrierCount,
  };

  let demoResult;
  let guidanceTelemetry = activePlan
    ? {
        planId: activePlan.id,
        status: "applied",
        promptHash: activePlan.provenance?.promptHash,
        responseHash: activePlan.provenance?.responseHash,
        model: activePlan.provenance?.model,
        appliedOptions: { width, height, actorCount, barrierCount, ticks },
      }
    : undefined;
  try {
    if (normalized.mock) {
      demoResult = runMockDemo(normalized);
    } else {
      demoResult = await runSimulationDemo(normalized, guidanceTelemetry);
    }
    if (activePlan) {
      guidanceTelemetry = {
        planId: activePlan.id,
        status: "applied",
        promptHash: activePlan.provenance?.promptHash,
        responseHash: activePlan.provenance?.responseHash,
        model: activePlan.provenance?.model,
        appliedOptions: { width, height, actorCount, barrierCount, ticks },
      };
      recordGuidancePlanFeedback(activePlan.id, guidanceTelemetry);
    }
    return {
      ...demoResult,
      guidance: guidanceTelemetry,
      seed: normalizedSeed,
    };
  } catch (error) {
    if (activePlan) {
      const failureFeedback = {
        status: "failed",
        promptHash: activePlan.provenance?.promptHash,
        responseHash: activePlan.provenance?.responseHash,
        model: activePlan.provenance?.model,
        error: error instanceof Error ? error.message : String(error),
      };
      guidanceTelemetry = failureFeedback;
      recordGuidancePlanFeedback(activePlan.id, failureFeedback);
    }
    throw error;
  }
}

/**
 * @param {DemoOptions} options
 * @returns {DemoResult}
 */
function runMockDemo(options) {
  const ticks = Math.max(1, Math.floor(options.ticks ?? DEFAULT_SIMULATION_TICKS));
  const width = Math.max(4, Math.floor(options.width ?? DEFAULT_SURFACE_WIDTH));
  const height = Math.max(3, Math.floor(options.height ?? DEFAULT_SURFACE_HEIGHT));
  const defaults = computeDefaultPopulation(width, height);
  const availability = computeSurfaceAvailability(width, height);
  const desiredActorCount = Math.max(1, Math.floor(options.actorCount ?? defaults.actorCount));
  const actorCap = availability.availableCells > 0 ? Math.min(desiredActorCount, availability.availableCells) : 0;
  const actorSymbols = (options.actorSymbols ?? generateActorSymbols(actorCap)).slice(0, actorCap);
  const actorCount = actorSymbols.length;
  const rawBarriers = Math.max(0, Math.floor(options.barrierCount ?? defaults.barrierCount));
  const seed = Number.isFinite(options.seed) ? Number(options.seed) : 0;

  const frames = [];
  const summaries = [];

  const initialActorCells = new Set();
  for (let index = 0; index < actorSymbols.length; index++) {
    const x0 = (index * 2) % width;
    const y0 = index % height;
    initialActorCells.add(`${x0}:${y0}`);
  }

  const barrierBlueprint = [];
  const usedCells = new Set(initialActorCells);
  const portals = [
    { x: 0, y: Math.max(0, height - 1), type: "entrance", symbol: PORTAL_SYMBOL_ENTRANCE },
    { x: Math.max(0, width - 1), y: 0, type: "exit", symbol: PORTAL_SYMBOL_EXIT },
  ];
  for (const portal of portals) {
    usedCells.add(`${portal.x}:${portal.y}`);
  }
  const stairs = [
    {
      x: Math.floor(width / 2),
      y: Math.max(0, Math.floor(height / 2) - 1),
      type: "up",
      symbol: STAIR_SYMBOL_UP,
    },
    {
      x: Math.max(0, Math.floor(width / 2)),
      y: Math.max(0, Math.floor(height / 2) + 1),
      type: "down",
      symbol: STAIR_SYMBOL_DOWN,
    },
  ];
  for (const stair of stairs) {
    usedCells.add(`${stair.x}:${stair.y}`);
  }
  const reservedCellsCount = actorCount + portals.length + stairs.length;
  const maxBarrierCapacity = Math.max(0, width * height - reservedCellsCount);
  if (rawBarriers > maxBarrierCapacity) {
    throw new Error(`Barrier count ${rawBarriers} exceeds available space (${maxBarrierCapacity})`);
  }
  const barrierCount = rawBarriers;
  let cursor = width * height - 1;
  for (let index = 0; index < barrierCount; index++) {
    while (cursor >= 0) {
      const x = cursor % width;
      const y = Math.floor(cursor / width);
      cursor -= 1;
      const key = `${x}:${y}`;
      if (usedCells.has(key)) continue;
      usedCells.add(key);
      barrierBlueprint.push({
        id: `barrier-${index + 1}`,
        symbol: BARRIER_SYMBOL,
        x,
        y,
        stamina: 0,
        intent: "(0, 0)",
        tier: "barrier",
        outcome: "stationary",
        kind: "barrier",
        role: "barrier",
      });
      break;
    }
  }

  for (let tick = 0; tick < ticks; tick++) {
    const reservedCells = new Set([
      ...portals.map((portal) => `${portal.x}:${portal.y}`),
      ...stairs.map((stair) => `${stair.x}:${stair.y}`),
    ]);
    const mobiles = actorSymbols.map((symbol, index) => {
      let x = (tick + index * 2) % width;
      let y = (tick + index) % height;
      let attempts = 0;
      while (reservedCells.has(`${x}:${y}`) && attempts < width * height) {
        x = (x + 1) % width;
        if (x === 0) {
          y = (y + 1) % height;
        }
        attempts += 1;
      }
      if (reservedCells.has(`${x}:${y}`)) {
        throw new Error("Unable to place mock actor without colliding with reserved cells");
      }
      reservedCells.add(`${x}:${y}`);
      return {
        id: `actor-${symbol}-${index + 1}`,
        symbol,
        x,
        y,
        stamina: Math.max(0, 100 - tick * 10 - index * 5),
        intent: `(${(tick + index * 2) % width}, ${(tick + index) % height})`,
        tier: "aiu",
        outcome: "accepted",
        kind: "mobile",
        role: "mobile",
        solver: "sat",
      };
    });

    const barriers = barrierBlueprint.map((blueprint) => ({ ...blueprint, solver: "none" }));
    const actors = mobiles.concat(barriers);
    const overlays = [
      ...portals.map(({ x, y, symbol }) => ({ x, y, symbol })),
      ...stairs.map(({ x, y, symbol }) => ({ x, y, symbol })),
    ];

    const grid = generateAsciiFrame(width, height, actors, overlays);
    const telemetry = formatTelemetry(tick, actors);

    frames.push({
      tick,
      grid,
      telemetry,
      actors,
      portals: portals.map((portal) => ({ ...portal })),
      stairs: stairs.map((stair) => ({ ...stair })),
    });

    const mobileSummary = mobiles.map((a) => `${a.symbol}@(${a.x},${a.y}) stamina=${a.stamina}`).join(" ");
    const barrierSummary = barriers.length > 0 ? barriers.map((b) => `${b.id}@(${b.x},${b.y}) barrier`).join(" ") : "";
    const portalSummary = portals.map((p) => `${p.type}@(${p.x},${p.y})`).join(" ");
    const stairSummary = stairs.map((s) => `${s.type}@(${s.x},${s.y})`).join(" ");
    let summaryLine = `tick ${tick}: ${mobileSummary}`;
    if (barrierSummary) {
      summaryLine += ` | barriers: ${barrierSummary}`;
    }
    if (portalSummary) {
      summaryLine += ` | portals: ${portalSummary}`;
    }
    if (stairSummary) {
      summaryLine += ` | stairs: ${stairSummary}`;
    }
    summaries.push(summaryLine);
  }

  return { frames, summaries, seed };
}

let wasmModulePromise;

async function loadSimulationModule() {
  if (!wasmModulePromise) {
    wasmModulePromise = (async () => {
      try {
        return await import(new URL("../../simulation/build/release.js", import.meta.url));
      } catch (err) {
        try {
          return await import(new URL("../../simulation/build/debug.js", import.meta.url));
        } catch (fallbackErr) {
          const error = new Error("Failed to load simulation module. Run `pnpm run asbuild` before running the orchestrator demo.");
          error.cause = fallbackErr;
          throw error;
        }
      }
    })();
  }
  return wasmModulePromise;
}

function createRng(seed) {
  let state = seed >>> 0;
  if (state === 0) {
    state = 0x6d2b79f5;
  }
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state;
  };
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (value !== null && typeof value === "object" && typeof value.valueOf === "function") {
    const numeric = Number(value.valueOf());
    if (Number.isFinite(numeric)) return numeric;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : NaN;
}

function pickUniqueCell(rng, width, height, occupied) {
  const capacity = width * height;
  if (occupied.size >= capacity) {
    throw new Error("Cannot place more actors than available surface cells");
  }
  while (true) {
    const raw = rng();
    const x = raw % width;
    const y = ((raw / width) >>> 0) % height;
    const key = `${x}:${y}`;
    if (!occupied.has(key)) {
      occupied.add(key);
      return { x, y };
    }
  }
}

/**
 * @param {DemoOptions} options
 * @returns {Promise<DemoResult>}
 */
async function runSimulationDemo(options, guidanceTelemetry) {
  const sim = await loadSimulationModule();

  const ticks = Math.max(1, Math.floor(options.ticks ?? DEFAULT_SIMULATION_TICKS));
  const width = Math.max(4, Math.floor(options.width ?? DEFAULT_SURFACE_WIDTH));
  const height = Math.max(3, Math.floor(options.height ?? DEFAULT_SURFACE_HEIGHT));
  const defaults = computeDefaultPopulation(width, height);
  const availability = computeSurfaceAvailability(width, height);
  const desiredActors = Math.max(1, Math.floor(options.actorCount ?? defaults.actorCount));
  const actorCap = availability.availableCells > 0 ? Math.min(desiredActors, availability.availableCells) : 0;
  const actorSymbols = (options.actorSymbols ?? generateActorSymbols(actorCap)).slice(0, actorCap);
  const seed = Number.isFinite(options.seed) ? Number(options.seed) : Date.now();
  const rng = createRng(seed);
  const occupiedCells = new Set();

  const configurator = sim.configurator_lifecycle_create();
  sim.configurator_lifecycle_initialize(configurator, width, height, 0);

  let surfaceId = 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      sim.configurator_surface_ledger_record(configurator, surfaceId++, x, y, 0);
    }
  }

  const portalDefinitions = [
    { x: 0, y: Math.max(0, height - 1), type: "entrance", symbol: PORTAL_SYMBOL_ENTRANCE, portalType: PORTAL_TYPE_ENTRANCE },
    { x: Math.max(0, width - 1), y: 0, type: "exit", symbol: PORTAL_SYMBOL_EXIT, portalType: PORTAL_TYPE_EXIT },
  ];
  for (const portal of portalDefinitions) {
    occupiedCells.add(`${portal.x}:${portal.y}`);
    if (typeof sim.configurator_map_set_portal === "function") {
      sim.configurator_map_set_portal(configurator, portal.x, portal.y, 0, portal.portalType);
    }
  }
  const portalMarkers = portalDefinitions.map(({ portalType, ...rest }) => rest);
  const stairDefinitions = [
    {
      x: Math.floor(width / 2),
      y: Math.max(0, Math.floor(height / 2) - 1),
      type: "up",
      symbol: STAIR_SYMBOL_UP,
      stairType: STAIR_TYPE_UP,
    },
    {
      x: Math.max(0, Math.floor(width / 2)),
      y: Math.max(0, Math.floor(height / 2) + 1),
      type: "down",
      symbol: STAIR_SYMBOL_DOWN,
      stairType: STAIR_TYPE_DOWN,
    },
  ];
  for (const stair of stairDefinitions) {
    occupiedCells.add(`${stair.x}:${stair.y}`);
    if (typeof sim.configurator_map_set_stair === "function") {
      sim.configurator_map_set_stair(configurator, stair.x, stair.y, 0, stair.stairType);
    }
  }
  const stairMarkers = stairDefinitions.map(({ stairType, ...rest }) => rest);

  const reservedCellsCount = actorSymbols.length + portalDefinitions.length + stairDefinitions.length;
  const rawBarriers = Math.max(0, Math.floor(options.barrierCount ?? defaults.barrierCount));
  const maxBarrierCapacity = Math.max(0, width * height - reservedCellsCount);
  if (rawBarriers > maxBarrierCapacity) {
    throw new Error(`Barrier count ${rawBarriers} exceeds available space (${maxBarrierCapacity})`);
  }
  const barrierCount = rawBarriers;

  const mobileRole = toNumber(
    typeof sim.configurator_actor_role_mobile === "function"
      ? sim.configurator_actor_role_mobile()
      : sim.configurator_actor_role_mobile,
  );
  const barrierRole = toNumber(
    typeof sim.configurator_actor_role_barrier === "function"
      ? sim.configurator_actor_role_barrier()
      : sim.configurator_actor_role_barrier,
  );
  const archetypeMobile = toNumber(sim.actor_archetype_mobile);
  const archetypeBarrier = toNumber(sim.actor_archetype_static_tile);

  const aiuTemplates = normalizeAiuRegistry(DEFAULT_AIU_REGISTRY);
  const templateById = new Map(aiuTemplates.map((template) => [template.moduleId, template]));
  for (const template of aiuTemplates) {
    const baseCost = Math.round(template.budget.baseCost);
    const upkeepCost = Math.round(template.budget.upkeepPerTick);
    if (typeof sim.configurator_aiu_register_template === "function") {
      sim.configurator_aiu_register_template(
        configurator,
        template.moduleId,
        template.moduleKind,
        baseCost,
        upkeepCost,
      );
    } else {
      sim.configurator_aiu_register(configurator, template.moduleId);
    }
    if (typeof sim.configurator_aiu_set_prerequisites === "function") {
      const prereqs = template.prerequisites ?? {};
      const minStamina = Number.isFinite(prereqs.minStamina)
        ? Math.round(prereqs.minStamina)
        : 0;
      const requiresEnhancedObservation = prereqs.requiresEnhancedObservation ? 1 : 0;
      sim.configurator_aiu_set_prerequisites(
        configurator,
        template.moduleId,
        minStamina,
        requiresEnhancedObservation,
      );
    }
  }
  const exploreTemplate = aiuTemplates.find((tpl) => tpl.moduleKind === AiuModuleKindCode.Explore) ?? null;
  const randomTemplate = aiuTemplates.find((tpl) => tpl.moduleKind === AiuModuleKindCode.RandomWalk) ?? null;
  const defaultAiuId = exploreTemplate?.moduleId ?? randomTemplate?.moduleId ?? 0;
  const selectedTemplate = defaultAiuId !== 0 ? templateById.get(defaultAiuId) ?? null : null;

  const mobileActors = actorSymbols.map((symbol, index) => {
    const handle = toNumber(sim.actor_lifecycle_create(archetypeMobile));
    sim.actor_lifecycle_init(handle);

    const { x: startX, y: startY } = pickUniqueCell(rng, width, height, occupiedCells);

    sim.configurator_actor_ledger_record(configurator, handle, startX, startY, 0, mobileRole);
    sim.configurator_actor_pool_register(configurator, handle);
    if (defaultAiuId !== 0) {
      sim.configurator_actor_assign_aiu(configurator, handle, defaultAiuId);
    }
    sim.actor_transition_teleport(handle, startX, startY, 0);

    return {
      handle,
      symbol,
      kind: "mobile",
      role: "mobile",
      id: `actor-${symbol}-${index + 1}`,
      aiuModuleId: defaultAiuId,
      aiuTemplateId: selectedTemplate?.id ?? (defaultAiuId !== 0 ? randomTemplate?.id ?? null : null),
    };
  });

  const barrierActors = Array.from({ length: barrierCount }, (_, index) => {
    const handle = toNumber(sim.actor_lifecycle_create(archetypeBarrier, 0));
    sim.actor_lifecycle_init(handle);

    const { x: startX, y: startY } = pickUniqueCell(rng, width, height, occupiedCells);
    const placed = toNumber(sim.configurator_actor_ledger_record(configurator, handle, startX, startY, 0, barrierRole));
    if (placed !== 1) {
      throw new Error(`Failed to place internal barrier ${index + 1} at (${startX}, ${startY})`);
    }
    sim.actor_transition_teleport(handle, startX, startY, 0);

    return { handle, symbol: BARRIER_SYMBOL, kind: "barrier", role: "barrier", id: `barrier-${index + 1}`, stamina: 0 };
  });
  const barrierHandleSet = new Set(barrierActors.map(({ handle }) => handle));

  const coordinator = sim.coordinator_lifecycle_create();
  sim.coordinator_lifecycle_initialize(coordinator);
  const director = sim.director_lifecycle_create();
  sim.director_lifecycle_initialize(director);
  const moderator = sim.moderator_lifecycle_create();
  sim.moderator_lifecycle_initialize(moderator);

  sim.coordinator_bind_configurator(coordinator, configurator);
  sim.coordinator_bind_director(coordinator, director);
  sim.coordinator_bind_moderator(coordinator, moderator);

  const tierLabels = new Map([
    [toNumber(sim.configurator_dispatch_tier_aiu), "aiu"],
    [toNumber(sim.configurator_dispatch_tier_logic), "logic"],
    [toNumber(sim.configurator_dispatch_tier_instinct), "instinct"],
  ]);
  const outcomeLabels = new Map([
    [toNumber(sim.configurator_dispatch_outcome_pending), "pending"],
    [toNumber(sim.configurator_dispatch_outcome_accepted), "accepted"],
    [toNumber(sim.configurator_dispatch_outcome_rejected), "rejected"],
  ]);
  const rejectionLabels = new Map([
    [toNumber(sim.configurator_dispatch_rejection_none), "none"],
    [toNumber(sim.configurator_dispatch_rejection_stamina), "stamina"],
    [toNumber(sim.configurator_dispatch_rejection_blocked), "blocked"],
    [toNumber(sim.configurator_dispatch_rejection_duplicate), "duplicate"],
  ]);
  const solverLabels = new Map([
    [toNumber(sim.solver_result_code_sat), "sat"],
    [toNumber(sim.solver_result_code_unsat), "unsat"],
    [toNumber(sim.solver_result_code_timeout), "timeout"],
    [toNumber(sim.solver_result_code_error), "error"],
    [toNumber(sim.solver_result_code_unimplemented), "unimplemented"],
  ]);
  const aiuModeLabels = new Map([
    [toNumber(sim.AIU_INTENT_MODE_NONE ?? 0), "none"],
    [toNumber(sim.AIU_INTENT_MODE_CULTIVATE ?? 1), "cultivate"],
    [toNumber(sim.AIU_INTENT_MODE_PATROL ?? 2), "patrol"],
  ]);
  const moduleKindLabels = new Map([
    [AiuModuleKindCode.None, "none"],
    [AiuModuleKindCode.RandomWalk, "random_walk"],
    [AiuModuleKindCode.Explore, "explore"],
    [AiuModuleKindCode.DefendExit, "defend_exit"],
    [AiuModuleKindCode.PatrolCorridor, "patrol_corridor"],
    [AiuModuleKindCode.FindExit, "find_exit"],
    [AiuModuleKindCode.Cultivation, "cultivation"],
    [AiuModuleKindCode.Custom, "custom"],
  ]);

  const frames = [];
  const summaries = [];

  for (let tick = 0; tick < ticks; tick++) {
    sim.coordinator_lifecycle_process(coordinator);

    const allActors = mobileActors.concat(barrierActors);
    const actorSnapshots = allActors.map((actor) => ({
      id: actor.id,
      handle: actor.handle,
      symbol: actor.symbol,
      x: sim.actor_observation_get_x(actor.handle),
      y: sim.actor_observation_get_y(actor.handle),
      stamina: sim.actor_vitals_get_stamina_current(actor.handle),
      kind: actor.kind,
      role: actor.role,
      aiuModuleId: actor.aiuModuleId ?? 0,
      aiuTemplateId: actor.aiuTemplateId ?? null,
    }));

    const metadataByHandle = new Map();
    const queueHandleForTelemetry = toNumber(sim.coordinator_get_dispatch_queue_handle(coordinator));
    if (Number.isFinite(queueHandleForTelemetry) && queueHandleForTelemetry > 0) {
      const entryCount = toNumber(sim.configurator_dispatch_get_entry_count(queueHandleForTelemetry));
      for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
        const actorHandleValue = toNumber(sim.configurator_dispatch_get_actor_handle(queueHandleForTelemetry, entryIndex));
        if (!Number.isFinite(actorHandleValue) || actorHandleValue === 0) continue;
        const cultivationTicks = normalizeCultivationTicks(
          toNumber(sim.configurator_dispatch_get_cultivation_ticks(queueHandleForTelemetry, entryIndex)),
        );
        metadataByHandle.set(actorHandleValue, {
          aiuMode: toNumber(sim.configurator_dispatch_get_aiu_mode(queueHandleForTelemetry, entryIndex)),
          aiuAux: toNumber(sim.configurator_dispatch_get_aiu_aux(queueHandleForTelemetry, entryIndex)),
          cultivationTicks,
          vulnerability: toNumber(sim.configurator_dispatch_get_vulnerability_ticks(queueHandleForTelemetry, entryIndex)),
        });
      }
    }

    const resultByHandle = new Map();
    const resultCount = sim.coordinator_dispatch_result_count(coordinator);
    for (let i = 0; i < resultCount; i++) {
      const actorHandleValue = toNumber(sim.coordinator_dispatch_result_get_actor(coordinator, i));
      if (!Number.isFinite(actorHandleValue) || actorHandleValue === 0) continue;
      const metadata = metadataByHandle.get(actorHandleValue);
      const cultivation = buildCultivationTelemetry(metadata?.cultivationTicks ?? 0);
      resultByHandle.set(actorHandleValue, {
        dx: toNumber(sim.coordinator_dispatch_result_get_dx(coordinator, i)),
        dy: toNumber(sim.coordinator_dispatch_result_get_dy(coordinator, i)),
        tier: toNumber(sim.coordinator_dispatch_result_get_tier(coordinator, i)),
        outcome: toNumber(sim.coordinator_dispatch_result_get_outcome(coordinator, i)),
        rejection: toNumber(sim.coordinator_dispatch_result_get_rejection(coordinator, i)),
        solver: toNumber(sim.coordinator_dispatch_result_get_solver_code(coordinator, i)),
        aiuMode: metadata?.aiuMode ?? 0,
        aiuAux: metadata?.aiuAux ?? 0,
        cultivation,
        vulnerability: metadata?.vulnerability ?? 0,
      });
    }

    const overlayMarkers = [
      ...portalMarkers.map(({ x, y, symbol }) => ({ x, y, symbol })),
      ...stairMarkers.map(({ x, y, symbol }) => ({ x, y, symbol })),
    ];
    const grid = generateAsciiFrame(width, height, actorSnapshots, overlayMarkers);
    const telemetry = {
      tick,
      seed,
      directives: actorSnapshots.map((snapshot) => {
        const record = resultByHandle.get(snapshot.handle);
        const label = snapshot.id ?? snapshot.symbol ?? `handle-${snapshot.handle}`;
        if (!record) {
          if (barrierHandleSet.has(snapshot.handle)) {
            return `${label}:barrier(stationary) stamina=${snapshot.stamina}`;
          }
          return `${label}:intent(n/a) stamina=${snapshot.stamina}`;
        }
        const tierLabel = tierLabels.get(record.tier) ?? record.tier;
        const outcomeLabel = outcomeLabels.get(record.outcome) ?? record.outcome;
        const rejectionLabel = rejectionLabels.get(record.rejection) ?? record.rejection;
        const parts = [
          `${label}:vec(${record.dx},${record.dy})`,
          `tier=${tierLabel}`,
          `out=${outcomeLabel}`,
          `stamina=${snapshot.stamina}`,
        ];
        if (snapshot.aiuTemplateId) {
          parts.push(`aiu=${snapshot.aiuTemplateId}`);
        }
        if (record.aiuMode) {
          const modeLabel = aiuModeLabels.get(record.aiuMode) ?? record.aiuMode;
          if (modeLabel !== "none") {
            parts.push(`mode=${modeLabel}`);
          }
          if (record.aiuAux && modeLabel === "patrol") {
            parts.push(`patrolStep=${record.aiuAux}`);
          }
        }
        if (record.cultivation?.isActive) {
          parts.push(`cult=${record.cultivation.ticks}`);
        }
        if (record.vulnerability > 0) {
          parts.push(`vuln=${record.vulnerability}`);
        }
        if (record.rejection !== sim.configurator_dispatch_rejection_none) {
          parts.push(`rej=${rejectionLabel}`);
        }
        if (record.solver) {
          const solverLabel = solverLabels.get(record.solver) ?? record.solver;
          parts.push(`solver=${solverLabel}`);
        }
        return parts.join(" ");
      }),
      outcomes: actorSnapshots.map((a) => {
        const label = a.id ?? a.symbol ?? `handle-${a.handle}`;
        if (barrierHandleSet.has(a.handle)) {
          return `${label}@(${a.x},${a.y}) barrier`;
        }
        return `${label}@(${a.x},${a.y}) stamina=${a.stamina}`;
      }),
      solver: actorSnapshots.map((snapshot) => {
        const record = resultByHandle.get(snapshot.handle);
        const label = snapshot.id ?? snapshot.symbol ?? `handle-${snapshot.handle}`;
        if (!record || !record.solver) {
          return `${label}:solver=none`;
        }
        const verdict = solverLabels.get(record.solver) ?? record.solver;
        return `${label}:solver=${verdict}`;
      }),
    };

    const enrichedSnapshots = actorSnapshots.map((snapshot) => {
      const record = resultByHandle.get(snapshot.handle);
      const isBarrier = barrierHandleSet.has(snapshot.handle);
      const templateInfo = snapshot.aiuModuleId ? templateById.get(snapshot.aiuModuleId) ?? null : null;
      const aiuEntries = templateInfo
        ? [
            {
              id: templateInfo.id,
              tier: templateInfo.tier ?? "standard",
              cost: templateInfo.cost,
              kind: moduleKindLabels.get(templateInfo.moduleKind) ?? "custom",
              moduleId: templateInfo.moduleId,
            },
          ]
        : snapshot.aiuTemplateId
          ? [{ id: snapshot.aiuTemplateId }]
          : undefined;
      const fallbackMetadata = metadataByHandle.get(snapshot.handle);
      const rawModeCode = record?.aiuMode ?? fallbackMetadata?.aiuMode ?? 0;
      const aiuModeLabel =
        rawModeCode && aiuModeLabels.has(rawModeCode) ? aiuModeLabels.get(rawModeCode) : rawModeCode || undefined;
      const rawAux = record?.aiuAux ?? fallbackMetadata?.aiuAux ?? 0;
      const fallbackCultivation =
        fallbackMetadata !== undefined ? buildCultivationTelemetry(fallbackMetadata.cultivationTicks ?? 0) : buildCultivationTelemetry(0);
      const rawCultivation = record?.cultivation ?? fallbackCultivation;
      const rawVulnerability = record?.vulnerability ?? fallbackMetadata?.vulnerability ?? 0;
      const solverLabel = record && record.solver ? solverLabels.get(record.solver) ?? record.solver : undefined;
      return {
        id: snapshot.id,
        symbol: snapshot.symbol,
        x: snapshot.x,
        y: snapshot.y,
        stamina: snapshot.stamina,
        intent: record ? `(${record.dx},${record.dy})` : isBarrier ? "(0,0)" : undefined,
        tier: record ? (tierLabels.get(record.tier) ?? record.tier) : isBarrier ? "barrier" : undefined,
        outcome: record ? (outcomeLabels.get(record.outcome) ?? record.outcome) : isBarrier ? "static" : undefined,
        rejection: record ? (rejectionLabels.get(record.rejection) ?? record.rejection) : undefined,
        solver: solverLabel,
        solverCode: record?.solver,
        kind: snapshot.kind ?? (isBarrier ? "barrier" : "mobile"),
        role: snapshot.role ?? (isBarrier ? "barrier" : "mobile"),
        aius: aiuEntries,
        aiuMode: aiuModeLabel !== "none" ? aiuModeLabel : undefined,
        aiuModeCode: aiuModeLabel !== undefined && aiuModeLabel !== "none" ? rawModeCode : undefined,
        aiuAux: rawAux > 0 ? rawAux : undefined,
        aiuApplied: snapshot.aiuTemplateId ? [snapshot.aiuTemplateId] : undefined,
        aiuDropped: undefined,
        cultivation: rawCultivation.isActive ? rawCultivation : undefined,
        vulnerability: rawVulnerability > 0 ? rawVulnerability : undefined,
      };
    });

    const count = sim.moderator_summary_count(moderator);
    if (count > 0) {
      summaries.push(sim.moderator_summary_get(moderator, count - 1));
    } else {
      summaries.push(`tick ${tick}: (no summary available)`);
    }

    const mobilePositions = actorSnapshots
      .filter((snapshot) => !barrierHandleSet.has(snapshot.handle))
      .map((a) => `${a.symbol}@(${a.x},${a.y}) stamina=${a.stamina}`)
      .join(" ");
    const barrierPositions = actorSnapshots
      .filter((snapshot) => barrierHandleSet.has(snapshot.handle))
      .map((a) => `${a.id}@(${a.x},${a.y}) barrier`)
      .join(" ");

    const portalPositions = portalMarkers
      .map((portal) => `${portal.type}@(${portal.x},${portal.y})`)
      .join(" ");
    const stairPositions = stairMarkers
      .map((stair) => `${stair.type}@(${stair.x},${stair.y})`)
      .join(" ");

    let summaryTail = ` | positions: ${mobilePositions}`;
    if (barrierPositions) {
      summaryTail += ` | barriers: ${barrierPositions}`;
    }
    if (portalPositions) {
      summaryTail += ` | portals: ${portalPositions}`;
    }
    if (stairPositions) {
      summaryTail += ` | stairs: ${stairPositions}`;
    }
    summaries[summaries.length - 1] += summaryTail;

    frames.push({
      tick,
      grid,
      guidance: guidanceTelemetry,
      telemetry,
      actors: enrichedSnapshots,
      portals: portalMarkers.map((portal) => ({ ...portal })),
      stairs: stairMarkers.map((stair) => ({ ...stair })),
    });
  }

  return { frames, summaries, seed };
}
