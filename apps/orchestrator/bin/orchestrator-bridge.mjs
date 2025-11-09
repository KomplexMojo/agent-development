#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  runMvpDemo,
  DEFAULT_SIMULATION_TICKS,
  DEFAULT_SURFACE_WIDTH,
  DEFAULT_SURFACE_HEIGHT,
  computeDefaultPopulation,
} from "../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_OUTPUT = resolve(__dirname, "../../orchestrator-ui/public/telemetry-run.json");

function isBarrierActor(actor) {
  return actor?.kind === "barrier" || actor?.role === "barrier";
}

function aiusEqual(left, right) {
  const lhs = Array.isArray(left) ? left : [];
  const rhs = Array.isArray(right) ? right : [];
  if (lhs.length !== rhs.length) return false;
  for (let i = 0; i < lhs.length; i++) {
    const a = lhs[i];
    const b = rhs[i];
    if (!a || !b) return false;
    if (a.id !== b.id) return false;
    if ((a.tier ?? null) !== (b.tier ?? null)) return false;
    if ((a.cost ?? null) !== (b.cost ?? null)) return false;
  }
  return true;
}

function toActorState(actor) {
  const aiuEntries = Array.isArray(actor?.aius)
    ? actor.aius
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const id = typeof entry.id === "string" && entry.id.length > 0 ? entry.id : undefined;
          if (!id) return null;
          const normalized = { id };
          if (typeof entry.tier === "string" && entry.tier.length > 0) {
            normalized.tier = entry.tier;
          }
          if (Number.isFinite(entry.cost)) {
            normalized.cost = Number(entry.cost);
          }
          return normalized;
        })
        .filter(Boolean)
    : undefined;
  return {
    x: Number.isFinite(actor?.x) ? actor.x : 0,
    y: Number.isFinite(actor?.y) ? actor.y : 0,
    stamina: Number.isFinite(actor?.stamina) ? actor.stamina : 0,
    intent: typeof actor?.intent === "string" ? actor.intent : undefined,
    tier: typeof actor?.tier === "string" ? actor.tier : undefined,
    outcome: typeof actor?.outcome === "string" ? actor.outcome : undefined,
    rejection: typeof actor?.rejection === "string" ? actor.rejection : undefined,
    role: typeof actor?.role === "string" ? actor.role : undefined,
    kind: typeof actor?.kind === "string" ? actor.kind : undefined,
    symbol: typeof actor?.symbol === "string" ? actor.symbol : undefined,
    aius: aiuEntries && aiuEntries.length > 0 ? aiuEntries : undefined,
  };
}

function diffActorStates(previous, current) {
  const delta = {};
  if (current.x !== previous.x) delta.x = current.x;
  if (current.y !== previous.y) delta.y = current.y;
  if (current.stamina !== previous.stamina) delta.stamina = current.stamina;
  if (current.intent !== previous.intent) delta.intent = current.intent ?? null;
  if (current.tier !== previous.tier) delta.tier = current.tier ?? null;
  if (current.outcome !== previous.outcome) delta.outcome = current.outcome ?? null;
  if (current.rejection !== previous.rejection) delta.rejection = current.rejection ?? null;
  if (current.role !== previous.role) delta.role = current.role ?? null;
  if (current.kind !== previous.kind) delta.kind = current.kind ?? null;
  if (current.symbol !== previous.symbol) delta.symbol = current.symbol ?? null;
  if (!aiusEqual(previous.aius, current.aius)) {
    delta.aius = current.aius ? current.aius.map((entry) => ({ ...entry })) : null;
  }
  return delta;
}

function padRow(row, width) {
  return row.padEnd(width, ".");
}

function cloneState(state) {
  return {
    ...state,
    aius: Array.isArray(state.aius) ? state.aius.map((entry) => ({ ...entry })) : state.aius,
  };
}

function buildOptimizedTelemetryDocument(frames, summaries, seed) {
  if (!Array.isArray(frames) || frames.length === 0) {
    return {
      version: "orchestrator.telemetry.v2",
      seed,
      summaries: [],
      surface: { width: 0, height: 0 },
      terrain: { base: [], portals: [], stairs: [], barriers: [] },
      actors: { meta: {}, initial: {} },
      ticks: [],
    };
  }

  const firstFrame = frames[0];
  const baseWidth = Math.max(0, ...firstFrame.grid.map((row) => row.length));
  const baseHeight = firstFrame.grid.length;
  const surface = {
    width: baseWidth,
    height: baseHeight,
  };

  const baseCanvas = firstFrame.grid.map((row) => padRow(row, baseWidth).split(""));

  const portals = (firstFrame.portals ?? []).map((portal) => ({
    x: Number.isFinite(portal?.x) ? portal.x : 0,
    y: Number.isFinite(portal?.y) ? portal.y : 0,
    type: portal?.type === "exit" ? "exit" : "entrance",
    symbol: typeof portal?.symbol === "string" ? portal.symbol : undefined,
  }));

  const stairs = (firstFrame.stairs ?? []).map((stair) => ({
    x: Number.isFinite(stair?.x) ? stair.x : 0,
    y: Number.isFinite(stair?.y) ? stair.y : 0,
    type: stair?.type === "down" ? "down" : "up",
    symbol: typeof stair?.symbol === "string" ? stair.symbol : undefined,
  }));

  const actorMeta = {};
  const actorInitial = {};
  const barrierEntries = [];

  const initialActors = firstFrame.actors ?? [];
  for (const actor of initialActors) {
    const state = toActorState(actor);
    const id = typeof actor?.id === "string" ? actor.id : `actor-${Math.random().toString(36).slice(2, 7)}`;
    if (baseCanvas[state.y] && baseCanvas[state.y][state.x] !== undefined) {
      baseCanvas[state.y][state.x] = ".";
    }
    if (isBarrierActor(actor)) {
      barrierEntries.push({
        id,
        symbol: state.symbol ?? "█",
        x: state.x,
        y: state.y,
        stamina: state.stamina,
        intent: state.intent ?? "(0,0)",
        tier: state.tier ?? "barrier",
        outcome: state.outcome ?? "static",
        rejection: state.rejection,
        role: state.role ?? "barrier",
        kind: state.kind ?? "barrier",
      });
      continue;
    }
    actorMeta[id] = {
      symbol: state.symbol,
      role: state.role ?? "mobile",
      kind: state.kind ?? "mobile",
      aius: state.aius ? state.aius.map((entry) => ({ ...entry })) : undefined,
    };
    actorInitial[id] = {
      x: state.x,
      y: state.y,
      stamina: state.stamina,
      intent: state.intent,
      tier: state.tier,
      outcome: state.outcome,
      rejection: state.rejection,
      role: state.role,
      kind: state.kind,
      symbol: state.symbol,
      aius: state.aius ? state.aius.map((entry) => ({ ...entry })) : undefined,
    };
  }

  const baseRows = baseCanvas.map((row) => row.join(""));

  const ticks = [];
  const stateByActor = new Map(Object.entries(actorInitial).map(([id, initial]) => [id, cloneState(initial)]));

  frames.forEach((frame, index) => {
    const summary = summaries[index] ?? frame.summary;
    const telemetry = frame.telemetry
      ? {
          directives: Array.isArray(frame.telemetry.directives) ? frame.telemetry.directives : [],
          outcomes: Array.isArray(frame.telemetry.outcomes) ? frame.telemetry.outcomes : [],
        }
      : undefined;

    const actorUpdates = {};
    const presentActorIds = new Set();

    for (const actor of frame.actors ?? []) {
      if (isBarrierActor(actor)) {
        continue;
      }
      const id = typeof actor?.id === "string" ? actor.id : `actor-${Math.random().toString(36).slice(2, 7)}`;
      presentActorIds.add(id);
      const currentState = toActorState(actor);
      currentState.symbol = currentState.symbol ?? actorMeta[id]?.symbol;
      currentState.role = currentState.role ?? actorMeta[id]?.role ?? "mobile";
      currentState.kind = currentState.kind ?? actorMeta[id]?.kind ?? "mobile";

      if (!actorMeta[id]) {
        actorMeta[id] = {
          symbol: currentState.symbol,
          role: currentState.role,
          kind: currentState.kind,
        };
      }
      if (currentState.aius?.length) {
        actorMeta[id].aius = currentState.aius.map((entry) => ({ ...entry }));
      }

      if (!stateByActor.has(id)) {
        stateByActor.set(id, cloneState(currentState));
        actorUpdates[id] = {
          spawn: true,
          x: currentState.x,
          y: currentState.y,
          stamina: currentState.stamina,
          intent: currentState.intent,
          tier: currentState.tier,
          outcome: currentState.outcome,
          rejection: currentState.rejection,
          role: currentState.role,
          kind: currentState.kind,
          symbol: currentState.symbol,
          aius: currentState.aius ? currentState.aius.map((entry) => ({ ...entry })) : undefined,
        };
        continue;
      }

      const previousState = stateByActor.get(id);
      const delta = diffActorStates(previousState, currentState);
      if (Object.keys(delta).length > 0) {
        actorUpdates[id] = delta;
        const merged = { ...previousState, ...currentState };
        stateByActor.set(id, cloneState(merged));
      }
    }

    for (const [id] of stateByActor) {
      if (!presentActorIds.has(id) && !actorUpdates[id]) {
        actorUpdates[id] = { despawn: true };
        stateByActor.delete(id);
      }
    }

    ticks.push({
      tick: Number.isFinite(frame?.tick) ? frame.tick : index,
      summary,
      telemetry,
      actors: actorUpdates,
    });
  });

  return {
    version: "orchestrator.telemetry.v2",
    seed,
    summaries,
    surface,
    terrain: {
      base: baseRows,
      portals,
      stairs,
      barriers: barrierEntries,
    },
    actors: {
      meta: actorMeta,
      initial: actorInitial,
    },
    ticks,
  };
}

function printHelp() {
  const defaults = computeDefaultPopulation(DEFAULT_SURFACE_WIDTH, DEFAULT_SURFACE_HEIGHT);
  console.log(
    `Usage: orchestrator-bridge [options]\n\nOptions:\n  -t, --ticks <n>        Number of ticks to simulate (default: ${DEFAULT_SIMULATION_TICKS})\n  -w, --width <n>        Width of the surface (default: ${DEFAULT_SURFACE_WIDTH})\n  -h, --height <n>       Height of the surface (default: ${DEFAULT_SURFACE_HEIGHT})\n  -a, --actors <n>       Number of actors to spawn (default: ${defaults.actorCount})\n      --actor-count <n>  Alias for --actors\n  -b, --barriers <n>     Number of internal barriers to place (default: ${defaults.barrierCount})\n  -s, --seed <n>         Seed for deterministic placement\n  --mock                 Use mock demo instead of running the WASM simulation\n  -o, --output <path>    Destination JSON file (default: orchestrator-ui/public/telemetry-run.json)\n  -?, --help             Show this help text`,
  );
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
  switch (arg) {
      case "--ticks":
      case "-t":
        options.ticks = Number(argv[++i]);
        break;
      case "--width":
      case "-w":
        options.width = Number(argv[++i]);
        break;
      case "--height":
      case "-h":
        options.height = Number(argv[++i]);
        break;
      case "--actors":
      case "-a": {
        const value = argv[++i] ?? "";
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
          options.actorCount = numeric;
        } else {
          options.actorSymbols = value.split("").filter(Boolean);
        }
        break;
      }
      case "--actor-count": {
        const value = Number(argv[++i]);
        options.actorCount = Number.isFinite(value) ? value : undefined;
        break;
      }
      case "--barriers":
      case "-b": {
        const value = Number(argv[++i]);
        options.barrierCount = Number.isFinite(value) ? value : 0;
        break;
      }
      case "--seed":
      case "-s":
        options.seed = Number(argv[++i]);
        break;
      case "--mock":
        options.mock = true;
        break;
      case "--output":
      case "-o":
        options.output = argv[++i];
        break;
      case "--help":
      case "-?":
        options.help = true;
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option: ${arg}`);
        }
    }
  }
  return options;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const outputPath = resolve(args.output ?? DEFAULT_OUTPUT);
  const { frames, summaries, seed } = await runMvpDemo(args);
  const payload = buildOptimizedTelemetryDocument(frames, summaries, seed);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");
  process.stdout.write(`orchestrator-bridge: wrote ${payload.ticks.length} tick(s) to ${outputPath}\n`);
}

main().catch((err) => {
  console.error("[orchestrator-bridge] failed", err);
  process.exitCode = 1;
});
