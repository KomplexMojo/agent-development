import type { TelemetryDocument } from "./types";
import { expandTelemetryDocument } from "../../shared/telemetry-normalizer.mjs";

const TELEMETRY_ENDPOINT = "/api/telemetry";
const TELEMETRY_FALLBACK = "/telemetry-run.json";

async function fetchJson(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load telemetry (${response.status})`);
  }
  return response.json();
}

export async function fetchTelemetryDocument(): Promise<TelemetryDocument> {
  try {
    const fromApi = await fetchJson(TELEMETRY_ENDPOINT);
    return expandTelemetryDocument(fromApi);
  } catch (error) {
    const fallback = await fetchJson(TELEMETRY_FALLBACK);
    const doc = expandTelemetryDocument(fallback);
    const message = error instanceof Error ? error.message : String(error);
    doc.meta.error = doc.meta.error ? `${doc.meta.error}; ${message}` : message;
    return doc;
  }
}
