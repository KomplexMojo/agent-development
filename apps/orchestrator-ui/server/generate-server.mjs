#!/usr/bin/env node
import express from "express";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadTelemetryDocument } from "./telemetry-adapter.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../..");
const bridgePath = path.resolve(rootDir, "apps/orchestrator/bin/orchestrator-bridge.mjs");
const MAX_TICKS = 500; // Keep in sync with MAX_DEMO_TICKS in src/utils/gridSettings.ts

const app = express();
app.use(express.json());

function killExistingServers() {
  const port = Number(process.env.ORCHESTRATOR_UI_SERVER_PORT ?? 4000);
  const lookup = spawnSync("lsof", ["-ti", `tcp:${port}`], { encoding: "utf8" });
  if (lookup.error && lookup.error.code !== "ENOENT") {
    console.warn(`[generator] warning: unable to check port ${port}`, lookup.error);
    return;
  }

  const pids = lookup.stdout ? lookup.stdout.split(/\s+/).filter(Boolean) : [];
  if (pids.length === 0) {
    return;
  }

  console.log(`[generator] cleaning up ${pids.length} process(es) on port ${port}`);
  for (const pid of pids) {
    const result = spawnSync("kill", ["-9", pid], { stdio: "ignore" });
    if (result.status !== 0) {
      console.warn(`[generator] warning: failed to kill PID ${pid}`);
    }
  }

  // give the OS a moment to release the socket
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
}

killExistingServers();

app.get("/api/telemetry", async (req, res) => {
  try {
    const payload = await loadTelemetryDocument();
    res.status(200).json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load telemetry.";
    res.status(500).json({ error: message });
  }
});

app.post("/api/generate", (req, res) => {
  const { ticks, width, height, actorCount, barrierCount, seed, mock } = req.body ?? {};

  const sanitizedTicks = Number.isFinite(ticks)
    ? Math.min(Math.max(1, Math.floor(ticks)), MAX_TICKS)
    : undefined;

  const args = [bridgePath];
  if (sanitizedTicks !== undefined) {
    args.push("--ticks", String(sanitizedTicks));
  }
  if (Number.isFinite(width)) {
    args.push("--width", String(width));
  }
  if (Number.isFinite(height)) {
    args.push("--height", String(height));
  }
  if (Number.isFinite(actorCount)) {
    args.push("--actors", String(actorCount));
  }
  if (Number.isFinite(barrierCount)) {
    args.push("--barriers", String(barrierCount));
  }
  if (Number.isFinite(seed)) {
    args.push("--seed", String(seed));
  }
  if (mock) {
    args.push("--mock");
  }

  const child = spawn(process.execPath, args, {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  child.on("close", (code) => {
    if (code === 0) {
      res.status(200).json({ ok: true, output: stdout.trim() });
    } else {
      res.status(500).send(stderr.trim() || `Generator exited with code ${code}`);
    }
  });
});

const port = Number(process.env.ORCHESTRATOR_UI_SERVER_PORT ?? 4000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[generator] listening on http://localhost:${port}`);
});
