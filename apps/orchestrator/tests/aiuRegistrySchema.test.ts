import { describe, expect, it } from "vitest";
import { isAIURegistry, type AIURegistry } from "../../shared/types/schemas";

describe("[REQ:P3-F05_2][REQ:P1-F03_0] AIU registry schema guards", () => {
  it("accepts a registry with valid AIU templates", () => {
    const registry: AIURegistry = {
      version: "aiu.registry.v1",
      updatedAt: new Date().toISOString(),
      currency: "points",
      templates: [
        {
          id: "find_exit",
          version: "1.0.0",
          description: "Reach the nearest exit using solver-backed pathing.",
          cost: 10,
          solverSchema: "reachability",
          tags: ["mobility", "pathfinding"],
          prerequisites: {
            minStamina: 5,
            requiresLineOfSight: false,
            factions: ["player", "support"],
          },
          budget: {
            baseCost: 10,
            upkeepPerTick: 1,
          },
          runtime: {
            moduleId: 1001,
            moduleKind: "explore",
            hooks: {
              prepare: "reachability:first_unvisited",
              interpret: "apply_first_step",
              fallback: "random_walk",
            },
          },
        },
        {
          id: "defend_exit",
          version: "1.1.0",
          cost: 18,
          tier: "premium",
          solverSchema: "guard_radius",
          tags: ["defense"],
          prerequisites: {
            minStamina: 8,
            requiresLineOfSight: true,
            factions: ["opposition"],
            environmentTags: ["exit_hall"],
          },
          budget: {
            baseCost: 18,
            upkeepPerTick: 2,
          },
          runtime: {
            moduleId: 2001,
            moduleKind: "defend_exit",
            hooks: {
              prepare: "guard_radius:hold",
              interpret: "guard_hold",
              fallback: "instinct",
            },
          },
        },
      ],
    };

    expect(isAIURegistry(registry)).toBe(true);
  });

  it("rejects registries missing templates or version", () => {
    const emptyRegistry = { version: "aiu.registry.v1", templates: [] };
    expect(isAIURegistry(emptyRegistry)).toBe(false);

    const wrongVersion = {
      version: "aiu.registry.v0",
      templates: [{ id: "foo", version: "0.1.0", cost: 0, solverSchema: "none" }],
    };
    expect(isAIURegistry(wrongVersion)).toBe(false);
  });

  it("rejects invalid runtime metadata", () => {
    const invalidRuntime: AIURegistry = {
      version: "aiu.registry.v1",
      templates: [
        {
          id: "bad_module",
          version: "1.0.0",
          cost: 5,
          solverSchema: "reachability",
          runtime: {
            moduleId: -1,
            moduleKind: "explore",
          },
        },
      ],
    };

    expect(isAIURegistry(invalidRuntime)).toBe(false);
  });
});
