#!/usr/bin/env node
import process from "node:process";
import { runMvpDemo } from "../src/index.js";

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--ticks" || arg === "-t") {
      options.ticks = Number(argv[++i]);
    } else if (arg === "--width" || arg === "-w") {
      options.width = Number(argv[++i]);
    } else if (arg === "--height" || arg === "-h") {
      options.height = Number(argv[++i]);
    } else if (arg === "--seed" || arg === "-s") {
      options.seed = Number(argv[++i]);
    } else if (arg === "--actors" || arg === "-a") {
      const value = argv[++i] ?? "";
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        options.actorCount = numeric;
      } else {
        options.actorSymbols = value.split("").filter(Boolean);
      }
    } else if (arg === "--actor-count") {
      const value = Number(argv[++i]);
      options.actorCount = Number.isFinite(value) ? value : undefined;
    } else if (arg === "--barriers" || arg === "-b") {
      const value = Number(argv[++i]);
      options.barrierCount = Number.isFinite(value) ? value : 0;
    } else if (arg === "--help" || arg === "-?" || arg === "-H") {
      options.help = true;
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage: orchestrator [options]\n\nOptions:\n  -t, --ticks <n>        Number of ticks to simulate (default: 3)\n  -w, --width <n>        Width of the ASCII grid (default: 8)\n  -h, --height <n>       Height of the ASCII grid (default: 4)\n  -a, --actors <n>       Number of actors to spawn (default: 3)\n      --actor-count <n>  Alias for --actors\n  -b, --barriers <n>     Number of internal barriers to place (default: 0)\n  -s, --seed <n>         Seed for deterministic actor placement (default: current time)\n  -?, -H, --help         Show this help text`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const result = await runMvpDemo(args);

  if (typeof result.seed === "number" && !Number.isNaN(result.seed)) {
    console.log(`Seed: ${result.seed}`);
    console.log();
  }

  for (const frame of result.frames) {
    console.log("".padEnd(frame.grid[0]?.length ?? 0, "="));
    console.log(`Tick ${frame.tick}`);
    for (const row of frame.grid) {
      console.log(row);
    }
    console.log("Telemetry:");
    console.log(`  directives: ${frame.telemetry.directives.join(", ")}`);
    console.log(`  outcomes:   ${frame.telemetry.outcomes.join(", ")}`);
    console.log("".padEnd(frame.grid[0]?.length ?? 0, "="));
    console.log();
  }

  console.log("Summaries:");
  for (const summary of result.summaries) {
    console.log(`  ${summary}`);
  }
}

main().catch((err) => {
  console.error("[orchestrator] demo failed", err);
  process.exitCode = 1;
});
