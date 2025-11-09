import { describe, expect, it } from "vitest";
import { normalizeAiuRegistry, AiuModuleKindCode } from "../src/data/aiuRegistry.js";
import { DEFAULT_AIU_REGISTRY } from "../src/data/defaultAiuRegistry.js";
import type { AIURegistry } from "../../shared/types/schemas";

describe("aiuRegistry normalizeAiuRegistry", () => {
  it("returns runtime metadata with defaults", () => {
    const registry: AIURegistry = {
      version: "aiu.registry.v1",
      templates: [
        {
          id: "explore_basic",
          version: "1.0.0",
          cost: 12,
          solverSchema: "reachability",
          runtime: {
            moduleId: 1001,
            moduleKind: "explore",
            hooks: {
              prepare: "reachability:first_unvisited",
              interpret: "apply_first_step",
            },
          },
          budget: {
            baseCost: 12,
            upkeepPerTick: 1,
          },
        },
        {
          id: "wander",
          version: "0.1.0",
          cost: 0,
          solverSchema: "none",
        },
      ],
    };

    const [explore, wander] = normalizeAiuRegistry(registry);

    expect(explore.moduleId).toBe(1001);
    expect(explore.moduleKind).toBe(AiuModuleKindCode.Explore);
    expect(explore.hooks.prepare).toBe("reachability:first_unvisited");
    expect(explore.hooks.interpret).toBe("apply_first_step");
    expect(explore.hooks.fallback).toBe("random_walk");
    expect(explore.budget.baseCost).toBe(12);
    expect(explore.budget.upkeepPerTick).toBe(1);

    expect(wander.moduleId).toBe(0);
    expect(wander.moduleKind).toBe(AiuModuleKindCode.Custom);
    expect(wander.hooks).toEqual({
      prepare: "none",
      interpret: "none",
      fallback: "instinct",
    });
    expect(wander.budget.baseCost).toBe(0);
    expect(wander.budget.upkeepPerTick).toBe(0);
  });
});

describe("default AIU registry", () => {
  it("includes find_exit, defend_exit, and patrol_corridor templates", () => {
    const entries = normalizeAiuRegistry(DEFAULT_AIU_REGISTRY);
    const byId = new Map(entries.map((entry) => [entry.id, entry]));

    const findExit = byId.get("find_exit");
    expect(findExit?.moduleId).toBe(1101);
    expect(findExit?.moduleKind).toBe(AiuModuleKindCode.FindExit);

    const defendExit = byId.get("defend_exit");
    expect(defendExit?.moduleId).toBe(1201);
    expect(defendExit?.moduleKind).toBe(AiuModuleKindCode.DefendExit);

    const patrol = byId.get("patrol_corridor");
    expect(patrol?.moduleId).toBe(1301);
    expect(patrol?.moduleKind).toBe(AiuModuleKindCode.PatrolCorridor);

    const cultivation = byId.get("cultivation_default");
    expect(cultivation?.moduleId).toBe(1401);
    expect(cultivation?.moduleKind).toBe(AiuModuleKindCode.Cultivation);
  });
});
