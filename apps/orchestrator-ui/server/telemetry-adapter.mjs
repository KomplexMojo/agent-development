import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expandTelemetryDocument } from "../shared/telemetry-normalizer.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");
export const telemetryFilePath = path.resolve(projectRoot, "apps/orchestrator-ui/public/telemetry-run.json");

export async function loadTelemetryDocument() {
  try {
    const contents = await readFile(telemetryFilePath, "utf8");
    const raw = JSON.parse(contents);
    return expandTelemetryDocument(raw);
  } catch (error) {
    return {
      version: "ui.telemetry.v1",
      meta: {
        rawVersion: undefined,
        seed: undefined,
        summaries: [],
        grid: { width: 0, height: 0 },
        error: error instanceof Error ? error.message : String(error),
      },
      frames: [],
    };
  }
}
