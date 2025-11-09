export const DEFAULT_AIU_REGISTRY = {
  version: "aiu.registry.v1",
  updatedAt: "2024-05-01T00:00:00.000Z",
  currency: "points",
  templates: [
    {
      id: "random_walk_default",
      version: "1.0.0",
      cost: 0,
      solverSchema: "none",
      runtime: {
        moduleId: 1000,
        moduleKind: "random_walk",
        hooks: {
          fallback: "random_walk",
        },
      },
      budget: {
        baseCost: 0,
        upkeepPerTick: 0,
      },
    },
    {
      id: "explore_basic",
      version: "1.0.0",
      description: "Move toward previously unseen tiles using the solver stub.",
      cost: 10,
      solverSchema: "reachability",
      tags: ["mobility", "exploration"],
      prerequisites: {
        minStamina: 5,
      },
      runtime: {
        moduleId: 1001,
        moduleKind: "explore",
        hooks: {
          prepare: "reachability:first_unvisited",
          interpret: "apply_first_step",
        },
      },
      budget: {
        baseCost: 10,
        upkeepPerTick: 1,
      },
    },
    {
      id: "find_exit",
      version: "1.0.0",
      description: "Path toward known exit locations using solver reachability.",
      cost: 12,
      solverSchema: "reachability",
      tags: ["mobility", "objective"],
      prerequisites: {
        minStamina: 8,
      },
      runtime: {
        moduleId: 1101,
        moduleKind: "find_exit",
        hooks: {
          prepare: "reachability:exit",
          interpret: "apply_first_step",
          fallback: "random_walk",
        },
      },
      budget: {
        baseCost: 12,
        upkeepPerTick: 2,
      },
    },
    {
      id: "defend_exit",
      version: "1.0.0",
      description: "Hold position near an exit and report UNSAT when leaving the guard radius.",
      cost: 9,
      solverSchema: "guard_radius",
      tags: ["defense"],
      prerequisites: {
        minStamina: 6,
      },
      runtime: {
        moduleId: 1201,
        moduleKind: "defend_exit",
        hooks: {
          prepare: "guard_radius:exit",
          interpret: "hold_position",
          fallback: "instinct",
        },
      },
      budget: {
        baseCost: 9,
        upkeepPerTick: 1,
      },
    },
    {
      id: "patrol_corridor",
      version: "1.0.0",
      description: "Cycle through configured corridor waypoints.",
      cost: 7,
      solverSchema: "waypoint",
      tags: ["patrol"],
      prerequisites: {
        minStamina: 5,
      },
      runtime: {
        moduleId: 1301,
        moduleKind: "patrol_corridor",
        hooks: {
          prepare: "waypoint:sequence",
          interpret: "follow_waypoint",
          fallback: "random_walk",
        },
      },
      budget: {
        baseCost: 7,
        upkeepPerTick: 1,
      },
    },
    {
      id: "cultivation_default",
      version: "1.0.0",
      description: "Regenerate vitals while remaining stationary; applies post-cultivation vulnerability windows.",
      cost: 5,
      solverSchema: "none",
      tags: ["recovery", "defense"],
      prerequisites: {
        minStamina: 0,
      },
      runtime: {
        moduleId: 1401,
        moduleKind: "cultivation",
        hooks: {
          prepare: "cultivation:enter",
          interpret: "cultivation:stay",
          fallback: "instinct",
        },
      },
      budget: {
        baseCost: 5,
        upkeepPerTick: 0,
      },
    },
  ],
};
