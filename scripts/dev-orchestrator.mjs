#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import net from "node:net";
import {
  DEFAULT_SIMULATION_TICKS,
  DEFAULT_SURFACE_WIDTH,
  DEFAULT_SURFACE_HEIGHT,
  computeDefaultPopulation,
} from "../apps/orchestrator/src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const uiDir = path.join(rootDir, "apps/orchestrator-ui");
const DEFAULT_POPULATION = computeDefaultPopulation(DEFAULT_SURFACE_WIDTH, DEFAULT_SURFACE_HEIGHT);
const DEFAULT_ACTOR_COUNT = DEFAULT_POPULATION.actorCount;
const DEFAULT_BARRIER_COUNT = DEFAULT_POPULATION.barrierCount;

function runSync(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with code ${result.status}`);
  }
}

function runServer(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: uiDir,
    stdio: "inherit",
    env: process.env,
    ...options,
  });
  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      const reason = signal ? `signal ${signal}` : `code ${code}`;
      console.error(`\n[${name}] exited with ${reason}. Stopping dev session.`);
      shutdown(1);
    }
  });
  return child;
}

let shuttingDown = false;
let processes = [];

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of processes) {
    try {
      child.kill("SIGINT");
    } catch (err) {
      // ignore
    }
  }
  process.exit(code);
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });
    tester.listen({ port, host: "::" });
  });
}

async function main() {
  try {
    console.log("\n[setup] Building AssemblyScript outputs...");
    runSync("pnpm", ["run", "asbuild"]);

    console.log(
      "\n[setup] Generating initial demo telemetry (testing defaults)",
      `\n         ticks=${DEFAULT_SIMULATION_TICKS}`,
      `width=${DEFAULT_SURFACE_WIDTH}`,
      `height=${DEFAULT_SURFACE_HEIGHT}`,
      `actors=${DEFAULT_ACTOR_COUNT}`,
      `barriers=${DEFAULT_BARRIER_COUNT}`,
    );
    runSync("node", [
      "apps/orchestrator/bin/orchestrator-bridge.mjs",
      "--ticks",
      String(DEFAULT_SIMULATION_TICKS),
      "--width",
      String(DEFAULT_SURFACE_WIDTH),
      "--height",
      String(DEFAULT_SURFACE_HEIGHT),
      "--actors",
      String(DEFAULT_ACTOR_COUNT),
      "--barriers",
      String(DEFAULT_BARRIER_COUNT),
    ]);

    let generatorPort = Number(process.env.ORCHESTRATOR_UI_SERVER_PORT ?? 4000);
    while (!(await isPortAvailable(generatorPort))) {
      console.log(`[setup] Port ${generatorPort} in use, trying ${generatorPort + 1}...`);
      generatorPort += 1;
    }

    console.log(`\n[servers] Starting generator API on port ${generatorPort}...`);
    const generator = runServer("generator", "pnpm", ["run", "dev:server"], {
      env: { ...process.env, ORCHESTRATOR_UI_SERVER_PORT: String(generatorPort) },
    });
    processes.push(generator);

    console.log("\n[servers] Starting Vite dev server...");
    const vite = runServer("vite", "pnpm", ["run", "dev"], {
      env: { ...process.env, ORCHESTRATOR_UI_SERVER_PORT: String(generatorPort) },
    });
    processes.push(vite);

    process.on("SIGINT", () => shutdown(0));
    process.on("SIGTERM", () => shutdown(0));
  } catch (err) {
    console.error("\n[dev-orchestrator] failed:", err);
    shutdown(1);
  }
}

main();
