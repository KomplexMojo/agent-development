import { describe, expect, it } from "vitest";
import {
  isRawTelemetryDocument,
  isUITelemetryDocument,
  type RawTelemetryDocument,
  type UITelemetryDocument,
} from "../../shared/types/schemas";

describe("[REQ:P0-F04][REQ:P2-F05_4] telemetry schema guards", () => {
  it("validates optimized raw telemetry documents", () => {
    const rawDoc: RawTelemetryDocument = {
      version: "orchestrator.telemetry.v2",
      seed: 12345,
      summaries: ["tick 0: example summary"],
      surface: { width: 10, height: 8 },
      terrain: {
        base: Array.from({ length: 8 }, () => ".".repeat(10)),
        portals: [
          { x: 0, y: 7, type: "entrance", symbol: "◀" },
          { x: 9, y: 0, type: "exit", symbol: "▶" },
        ],
        stairs: [{ x: 5, y: 3, type: "up", symbol: "▲" }],
        barriers: [
          { id: "barrier-1", x: 4, y: 4, symbol: "█", role: "barrier", kind: "barrier" },
        ],
      },
      actors: {
        meta: {
          "actor-alpha": {
            symbol: "α",
            role: "mobile",
            kind: "mobile",
            faction: "player",
            aius: [{ id: "find_exit", tier: "standard", cost: 10, moduleId: 1101, moduleKind: "find_exit" }],
          },
        },
        initial: {
          "actor-alpha": { x: 1, y: 1, stamina: 90, role: "mobile", kind: "mobile", symbol: "α" },
        },
      },
      ticks: [
        {
          tick: 0,
          summary: "tick 0: α@(1,1)",
          telemetry: { directives: ["α:dir(1,1)", "α:mode=cultivate"], outcomes: ["α:move(1,1)"], solver: ["α:solver=sat"] },
          actors: {
            "actor-alpha": {
              x: 2,
              y: 1,
              stamina: 85,
              intent: "(1,0)",
              tier: "aiu",
              solverCode: 1,
              solver: { verdict: "sat", code: 1 },
              aiuMode: "cultivate",
              aiuModeCode: 1,
              aiuAux: 0,
              cultivation: { isActive: true, ticks: 3 },
              vulnerability: 2,
            },
          },
        },
      ],
      budget: { total: 100, spent: 10, remaining: 90 },
      guidance: {
        planId: "plan-1",
        status: "applied",
        promptHash: "abc",
        responseHash: "def",
        model: "ollama://test-model",
        appliedOptions: { width: 12, height: 8, actorCount: 4, barrierCount: 5, ticks: 10 },
      },
      provenance: {
        model: "ollama://telemetry-v1",
        promptHash: "123",
        responseHash: "456",
        generatedAt: new Date().toISOString(),
      },
    };

    expect(isRawTelemetryDocument(rawDoc)).toBe(true);
  });

  it("validates normalized UI telemetry documents", () => {
    const uiDoc: UITelemetryDocument = {
      version: "ui.telemetry.v1",
      meta: {
        rawVersion: "orchestrator.telemetry.v2",
        seed: 12345,
        summaries: ["tick 0: α@(1,1)"],
        grid: { width: 10, height: 8 },
        budget: { total: 100, spent: 10, remaining: 90 },
        guidance: {
          planId: "plan-1",
          status: "applied",
          promptHash: "abc",
          responseHash: "def",
          model: "ollama://test-model",
          appliedOptions: { width: 12, height: 8, actorCount: 4, barrierCount: 5, ticks: 10 },
        },
      },
      frames: [
        {
          tick: 0,
          grid: [".........."],
          summary: "tick 0: α@(1,1)",
          actors: [
            {
              id: "actor-alpha",
              x: 1,
              y: 1,
              stamina: 90,
              intent: "(1,0)",
              tier: "aiu",
              outcome: "accepted",
              solver: "sat",
              solverCode: 1,
              role: "mobile",
              kind: "mobile",
              faction: "player",
              aiuMode: "cultivate",
              aiuModeCode: 1,
              cultivation: { isActive: true, ticks: 3 },
              vulnerability: 2,
              aius: [{ id: "find_exit", tier: "standard", cost: 10, moduleId: 1101, kind: "find_exit" }],
            },
          ],
          portals: [{ x: 0, y: 7, type: "entrance", symbol: "◀" }],
          stairs: [],
          telemetry: { directives: ["α:dir(1,1)", "α:mode=cultivate"], outcomes: ["α:move(1,1)"], solver: ["α:solver=sat"] },
        },
      ],
    };

    expect(isUITelemetryDocument(uiDoc)).toBe(true);
  });

  it("rejects malformed telemetry documents", () => {
    const missingSurface = {
      version: "orchestrator.telemetry.v2",
      terrain: {},
      actors: { meta: {}, initial: {} },
      ticks: [],
    };
    expect(isRawTelemetryDocument(missingSurface)).toBe(false);

    const wrongUiVersion = {
      version: "ui.telemetry.v0",
      meta: { summaries: [], grid: { width: 0, height: 0 } },
      frames: [],
    };
    expect(isUITelemetryDocument(wrongUiVersion)).toBe(false);
  });
});
