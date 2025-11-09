import { describe, expect, it } from "vitest";
import { parseGuidanceResponse, validateAiuRecommendations, GuidanceValidationError } from "../src/guidance/proposal.js";
import { type BlueprintDocument } from "../../shared/types/schemas";

function buildBlueprint(overrides: Partial<BlueprintDocument> = {}): BlueprintDocument {
  return {
    version: "orchestrator.blueprint.v1",
    request: {
      width: 10,
      height: 6,
      actors: 4,
      barriers: 8,
      seed: 1234,
      difficulty: "normal",
    },
    rooms: [
      { id: "start", bounds: { x: 0, y: 0, width: 3, height: 3 }, tags: ["start"] },
      { id: "exit", bounds: { x: 6, y: 0, width: 3, height: 3 }, tags: ["exit"] },
    ],
    connectors: [
      {
        id: "hall-1",
        from: "start",
        to: "exit",
        kind: "hallway",
        waypoints: [
          { x: 3, y: 1 },
          { x: 5, y: 1 },
        ],
        width: 1,
      },
    ],
    anchors: {
      start: { roomId: "start" },
      exit: { roomId: "exit" },
    },
    flow: {
      sequence: ["start", "hall-1", "exit"],
    },
    actors: [
      {
        label: "guards",
        count: 2,
        faction: "opposition",
        spawn: { type: "room", roomId: "exit" },
        aius: [{ id: "defend_exit", cost: 9 }],
        budget: 20,
      },
    ],
    budget: {
      total: 90,
      spent: 40,
      remaining: 50,
    },
    confidence: { score: 0.8 },
    provenance: {
      model: "ollama://blueprint-v1",
      promptHash: "abc",
      responseHash: "def",
      generatedAt: new Date().toISOString(),
      seed: 1234,
    },
    ...overrides,
  };
}

describe("[REQ:P3-F05][REQ:P3-F05_1] guidance blueprint parsing", () => {
  it("accepts AI responses with valid blueprint documents", () => {
    const blueprint = buildBlueprint();
    const payload = {
      blueprint,
      provenance: {
        model: "ollama://guidance",
        promptHash: "123",
        responseHash: "456",
      },
    };

    const result = parseGuidanceResponse(payload);

    expect(result.blueprint).toBe(blueprint);
    expect(result.provenance).toEqual({
      model: "ollama://guidance",
      promptHash: "123",
      responseHash: "456",
    });
  });

  it("rejects malformed blueprints before they reach downstream personas", () => {
    const payload = {
      blueprint: {
        version: "orchestrator.blueprint.v1",
        request: { width: 0 },
        rooms: [],
      },
    };

    expect(() => parseGuidanceResponse(payload)).toThrow(/Invalid blueprint document/);
  });
});

describe("[REQ:P3-F05_2] AIU budget enforcement", () => {
  const registryEntries = [
    { id: "find_exit", cost: 12, budget: { baseCost: 12 }, prerequisites: { minStamina: 8 } },
    { id: "defend_exit", cost: 9, budget: { baseCost: 9 }, prerequisites: { minStamina: 6 } },
    { id: "survey_enhanced", cost: 15, budget: { baseCost: 15 }, prerequisites: { requiresEnhancedObservation: true } },
  ];

  it("accepts AIU recommendations that stay within group and scenario budgets", () => {
    const blueprint = buildBlueprint({
      actors: [
        {
          label: "scouts",
          count: 1,
          faction: "player",
          spawn: { type: "room", roomId: "start" },
          aius: [{ id: "find_exit" }],
          budget: 20,
          metadata: { staminaMax: 10 },
        },
      ],
      budget: { total: 80, spent: 20, remaining: 40 },
    });

    const result = validateAiuRecommendations(blueprint, registryEntries);
    expect(result.totalCost).toBe(12);
    expect(result.remainingBudget).toBe(28);
  });

  it("rejects unknown AIU ids before forwarding to configurator", () => {
    const blueprint = buildBlueprint({
      actors: [
        {
          label: "unknown-stack",
          count: 1,
          faction: "neutral",
          spawn: { type: "room", roomId: "start" },
          aius: [{ id: "shadow_walk" }],
          budget: 15,
        },
      ],
      budget: { total: 60, spent: 10, remaining: 30 },
    });

    expect(() => validateAiuRecommendations(blueprint, registryEntries)).toThrow(GuidanceValidationError);
    try {
      validateAiuRecommendations(blueprint, registryEntries);
    } catch (error) {
      expect(error).toBeInstanceOf(GuidanceValidationError);
      expect(error.issues?.some((issue) => issue.type === "unknown_aiu")).toBe(true);
    }
  });

  it("rejects blueprints whose AIU costs exceed group or scenario budgets", () => {
    const blueprint = buildBlueprint({
      actors: [
        {
          label: "guards",
          count: 3,
          faction: "opposition",
          spawn: { type: "room", roomId: "exit" },
          aius: [{ id: "defend_exit" }],
          budget: 20,
          metadata: { staminaMax: 10 },
        },
      ],
      budget: { total: 50, spent: 5, remaining: 18 },
    });

    expect(() => validateAiuRecommendations(blueprint, registryEntries)).toThrow(GuidanceValidationError);
    try {
      validateAiuRecommendations(blueprint, registryEntries);
    } catch (error) {
      expect(error.issues?.some((issue) => issue.type === "group_budget")).toBe(true);
      expect(error.issues?.some((issue) => issue.type === "scenario_budget")).toBe(true);
    }
  });

  it("detects groups that fail minimum stamina prerequisites", () => {
    const blueprint = buildBlueprint({
      actors: [
        {
          label: "tired-scout",
          count: 1,
          faction: "player",
          spawn: { type: "room", roomId: "start" },
          aius: [{ id: "find_exit" }],
          budget: 30,
          metadata: { staminaMax: 4 },
        },
      ],
      budget: { total: 100, spent: 10, remaining: 70 },
    });

    expect(() => validateAiuRecommendations(blueprint, registryEntries)).toThrow(GuidanceValidationError);
    try {
      validateAiuRecommendations(blueprint, registryEntries);
    } catch (error) {
      expect(error.issues?.some((issue) => issue.type === "prereq_min_stamina")).toBe(true);
    }
  });

  it("requires enhanced observation when AIUs declare the prerequisite", () => {
    const blueprint = buildBlueprint({
      actors: [
        {
          label: "survey-team",
          count: 1,
          faction: "player",
          spawn: { type: "room", roomId: "start" },
          aius: [{ id: "survey_enhanced" }],
          budget: 40,
          metadata: { observation: "basic" },
        },
      ],
      budget: { total: 120, spent: 20, remaining: 90 },
    });

    expect(() => validateAiuRecommendations(blueprint, registryEntries)).toThrow(GuidanceValidationError);
    try {
      validateAiuRecommendations(blueprint, registryEntries);
    } catch (error) {
      expect(error.issues?.some((issue) => issue.type === "prereq_enhanced_observation")).toBe(true);
    }
  });
});
