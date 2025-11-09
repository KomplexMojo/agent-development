import { describe, expect, it } from "vitest";
import {
  isBlueprintDocument,
  type BlueprintDocument,
  type BlueprintActorGroupSpec,
} from "../../shared/types/schemas";

function buildActorGroup(overrides: Partial<BlueprintActorGroupSpec> = {}): BlueprintActorGroupSpec {
  return {
    label: "opposition-guards",
    count: 3,
    faction: "opposition",
    spawn: { type: "near", target: "exit", radius: 1 },
    aius: [{ id: "defend_exit", tier: "premium", cost: 15 }],
    budget: 45,
    confidence: 0.7,
    ...overrides,
  };
}

describe("[REQ:P3-F05_1][REQ:P3-F05_2] blueprint schema guards", () => {
  it("accepts a well-formed blueprint document", () => {
    const blueprint: BlueprintDocument = {
      version: "orchestrator.blueprint.v1",
      request: {
        width: 12,
        height: 8,
        actors: 6,
        barriers: 10,
        difficulty: "normal",
        seed: 90210,
        notes: "demo scenario",
      },
      rooms: [
        { id: "room-start", bounds: { x: 0, y: 0, width: 4, height: 4 }, tags: ["start"] },
        { id: "room-exit", bounds: { x: 6, y: 0, width: 4, height: 4 }, tags: ["exit"] },
      ],
      connectors: [
        {
          id: "hall-1",
          from: "room-start",
          to: "room-exit",
          kind: "hallway",
          waypoints: [{ x: 4, y: 1 }, { x: 5, y: 1 }],
          width: 1,
        },
      ],
      anchors: {
        start: { roomId: "room-start", position: { x: 0, y: 0 } },
        exit: { roomId: "room-exit", position: { x: 6, y: 3 } },
        checkpoints: [{ roomId: "room-start", position: { x: 3, y: 3 } }],
      },
      flow: {
        sequence: ["room-start", "hall-1", "room-exit"],
        branches: [{ entry: "room-start", sequence: ["hall-1", "room-exit"] }],
      },
      constraints: {
        requiredPaths: [{ from: "start", to: "exit", maxSteps: 40 }],
        forbiddenZones: [{ x: 5, y: 2, width: 1, height: 1 }],
        notes: "keep middle cell blocked for variety",
      },
      actors: [
        buildActorGroup(),
        buildActorGroup({
          label: "player-scouts",
          faction: "player",
          spawn: { type: "room", roomId: "room-start" },
          aius: [{ id: "find_exit", tier: "standard", cost: 10 }],
          budget: 30,
          confidence: 0.9,
        }),
      ],
      budget: {
        total: 120,
        spent: 75,
        remaining: 45,
        currency: "points",
        notes: "phase 1 allocation",
      },
      confidence: { score: 0.82, explanation: "High confidence: simple two-room layout" },
      provenance: {
        model: "ollama://blueprint-v1",
        promptHash: "abc123",
        responseHash: "def456",
        generatedAt: new Date().toISOString(),
        seed: 90210,
      },
    };

    expect(isBlueprintDocument(blueprint)).toBe(true);
  });

  it("rejects malformed blueprints", () => {
    const missingRooms = {
      version: "orchestrator.blueprint.v1",
      request: { width: 12, height: 8 },
      rooms: [],
    };
    expect(isBlueprintDocument(missingRooms)).toBe(false);

    const wrongVersion = {
      version: "orchestrator.blueprint.v0",
      request: { width: 6, height: 6 },
      rooms: [{ id: "r1", bounds: { x: 0, y: 0, width: 3, height: 3 } }],
      connectors: [],
      anchors: { start: { roomId: "r1" }, exit: { roomId: "r1" } },
      flow: { sequence: ["r1"] },
      actors: [buildActorGroup()],
      budget: { total: 0, spent: 0, remaining: 0 },
    };
    expect(isBlueprintDocument(wrongVersion)).toBe(false);
  });
});
