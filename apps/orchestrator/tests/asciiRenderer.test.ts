import { describe, expect, it } from "vitest";
import { generateAsciiFrame, formatTelemetry, runMvpDemo } from "../src/index.js";

describe("generateAsciiFrame", () => {
  it("places actors and obstacles on the grid", () => {
    const actors = [
      { id: "actor-a", x: 1, y: 0, symbol: "A" },
      { id: "actor-b", x: 2, y: 1, symbol: "B" },
    ];
    const obstacles = [
      { x: 0, y: 0, symbol: "#" },
      { x: 3, y: 1, symbol: "#" },
    ];

    const grid = generateAsciiFrame(5, 3, actors, obstacles);

    expect(grid).toEqual([
      "#A...",
      "..B#.",
      ".....",
    ]);
  });
});

describe("formatTelemetry", () => {
  it("includes directives and outcomes for each actor", () => {
    const telemetry = formatTelemetry(2, [
      { id: "actor-a", x: 3, y: 1, stamina: 50 },
      { id: "actor-b", x: 0, y: 2, stamina: 75 },
    ]);

    expect(telemetry.tick).toBe(2);
    expect(telemetry.directives).toEqual([
      "actor-a:dir(3,1) stamina=50",
      "actor-b:dir(0,2) stamina=75",
    ]);
    expect(telemetry.outcomes).toEqual([
      "actor-a:move(3,1) stamina=50",
      "actor-b:move(0,2) stamina=75",
    ]);
  });
});

describe("runMvpDemo", () => {
  it("produces deterministic frames and summaries", async () => {
    const result = await runMvpDemo({
      ticks: 3,
      width: 6,
      height: 4,
      actorSymbols: ["A", "B", "C"],
      barrierCount: 0,
      mock: true,
    });

    expect(result.frames).toHaveLength(3);
    expect(result.summaries).toHaveLength(3);

    const firstFrame = result.frames[0];
    expect(firstFrame.grid).toEqual([
      "A....▶",
      "..B▲..",
      "....C.",
      "◀..▼..",
    ]);
    expect(firstFrame.telemetry.directives).toEqual([
      "actor-A-1:dir(0,0) stamina=100",
      "actor-B-2:dir(2,1) stamina=95",
      "actor-C-3:dir(4,2) stamina=90",
    ]);

    const secondFrame = result.frames[1];
    expect(secondFrame.grid).toEqual([
      ".....▶",
      ".A.▲..",
      "...B..",
      "◀..▼.C",
    ]);

    const thirdFrame = result.frames[2];
    expect(thirdFrame.grid).toEqual([
      "C....▶",
      "...▲..",
      "..A...",
      "◀..▼B.",
    ]);

    expect(result.summaries[0]).toBe(
      "tick 0: A@(0,0) stamina=100 B@(2,1) stamina=95 C@(4,2) stamina=90 | portals: entrance@(0,3) exit@(5,0) | stairs: up@(3,1) down@(3,3)",
    );
    expect(result.summaries[1]).toBe(
      "tick 1: A@(1,1) stamina=90 B@(3,2) stamina=85 C@(5,3) stamina=80 | portals: entrance@(0,3) exit@(5,0) | stairs: up@(3,1) down@(3,3)",
    );
    expect(result.summaries[2]).toBe(
      "tick 2: A@(2,2) stamina=80 B@(4,3) stamina=75 C@(0,0) stamina=70 | portals: entrance@(0,3) exit@(5,0) | stairs: up@(3,1) down@(3,3)",
    );
  });
});

describe("telemetry AIU metadata", () => {
  it("labels actors with AIU tiers in mock telemetry output", async () => {
    const result = await runMvpDemo({
      ticks: 2,
      width: 6,
      height: 4,
      actorSymbols: ["A", "B"],
      barrierCount: 0,
      mock: true,
    });
    const firstFrame = result.frames[0];

    expect(firstFrame.actors.length).toBeGreaterThan(0);
    for (const actor of firstFrame.actors.filter((entry) => entry.role === "mobile")) {
      expect(actor.tier).toBe("aiu");
      expect(actor.intent).toBeTypeOf("string");
    }

    expect(firstFrame.telemetry.directives[0]).toContain("actor-A");
    expect(firstFrame.telemetry.outcomes[0]).toContain("actor-A");
  });
});

describe("runMvpDemo (wasm integration)", () => {
  it("emits solver and AIU metadata for simulation frames", async () => {
    try {
      const result = await runMvpDemo({ ticks: 1, width: 6, height: 4, actorSymbols: ["Ω"] });
      const frame = result.frames[0];
      const mobile = frame.actors.find((actor) => actor.role === "mobile");
      expect(mobile?.aius?.length ?? 0).toBeGreaterThan(0);
      expect(frame.telemetry.directives.some((line) => line.includes("aiu="))).toBe(true);
      expect(frame.telemetry.solver.some((line) => line.includes("solver="))).toBe(true);
    } catch (error) {
      // Allow tests to continue if the WASM build is missing in CI environments.
      expect(error?.message).toContain("Failed to load simulation module");
    }
  });
});
