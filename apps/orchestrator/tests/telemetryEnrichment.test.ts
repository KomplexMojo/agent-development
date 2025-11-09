/**
 * [REQ:P0-F02][REQ:P2-F05_4] Orchestrator telemetry includes AIU + solver metadata per actor.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { runMvpDemo } from "../src/index.js";
import { stageGuidancePlan, resetGuidancePlans } from "../src/guidance/planStore.js";

function buildBlueprint() {
  return {
    version: "orchestrator.blueprint.v1",
    request: { width: 6, height: 4, actors: 1, barriers: 1 },
    rooms: [{ id: "start", bounds: { x: 0, y: 0, width: 3, height: 3 } }],
    connectors: [],
    anchors: { start: { roomId: "start" }, exit: { roomId: "start" } },
    flow: { sequence: ["start"] },
    actors: [],
    budget: { total: 50, spent: 10, remaining: 40 },
  };
}

beforeEach(() => {
  resetGuidancePlans();
});

describe("[REQ:P0-F02] telemetry enrichment", () => {
  it("surfaces AIU module data, solver verdicts, and directive tags in demo frames", async () => {
    stageGuidancePlan({
      blueprint: buildBlueprint(),
      groups: [{ label: "alpha", count: 1 }],
      provenance: { promptHash: "foo", responseHash: "bar", model: "ollama://test" },
    });

    const { frames, guidance } = await runMvpDemo({ ticks: 2, width: 6, height: 4, actorSymbols: ["α"] });
    expect(frames.length).toBeGreaterThan(0);

    const frame = frames[0];
    expect(frame.telemetry.directives.length).toBeGreaterThan(0);
    expect(frame.telemetry.outcomes.length).toBeGreaterThan(0);
    expect(frame.telemetry.solver?.length ?? 0).toBeGreaterThan(0);
    expect(frame.telemetry.directives.some((line) => line.includes("aiu="))).toBe(true);
    expect(frame.telemetry.solver?.some((line) => line.includes("solver="))).toBe(true);

    const mobileActor = frame.actors.find((actor) => actor.role !== "barrier");
    expect(mobileActor).toBeDefined();
    expect(mobileActor?.aius?.length ?? 0).toBeGreaterThan(0);
    expect(mobileActor?.aius?.[0]?.moduleId).toBeGreaterThan(0);
    expect(typeof mobileActor?.aius?.[0]?.kind).toBe("string");
    expect(Array.isArray(mobileActor?.aiuApplied) || mobileActor?.aiuApplied === undefined).toBe(true);
    expect(Array.isArray(mobileActor?.aiuDropped) || mobileActor?.aiuDropped === undefined).toBe(true);

    expect(guidance?.status).toBeDefined();
  });
});
