const AiuModuleKindCode = Object.freeze({
  None: 0,
  RandomWalk: 1,
  Explore: 2,
  DefendExit: 3,
  PatrolCorridor: 4,
  FindExit: 5,
  Cultivation: 6,
  Custom: 1000,
});

const MODULE_KIND_CODES = {
  random_walk: AiuModuleKindCode.RandomWalk,
  explore: AiuModuleKindCode.Explore,
  find_exit: AiuModuleKindCode.FindExit,
  defend_exit: AiuModuleKindCode.DefendExit,
  patrol_corridor: AiuModuleKindCode.PatrolCorridor,
  cultivation: AiuModuleKindCode.Cultivation,
  custom: AiuModuleKindCode.Custom,
};

const DEFAULT_HOOKS = Object.freeze({
  prepare: "none",
  interpret: "none",
  fallback: "instinct",
});

function normalizeHooks(runtimeHooks) {
  if (!runtimeHooks || typeof runtimeHooks !== "object") {
    return { ...DEFAULT_HOOKS };
  }
  return {
    prepare: typeof runtimeHooks.prepare === "string" ? runtimeHooks.prepare : DEFAULT_HOOKS.prepare,
    interpret: typeof runtimeHooks.interpret === "string" ? runtimeHooks.interpret : DEFAULT_HOOKS.interpret,
    fallback: typeof runtimeHooks.fallback === "string" ? runtimeHooks.fallback : DEFAULT_HOOKS.fallback,
  };
}

function normalizeTemplate(template) {
  const runtime = template.runtime;
  const moduleKindKey = typeof runtime?.moduleKind === "string" ? runtime.moduleKind : "custom";
  const moduleKind = MODULE_KIND_CODES[moduleKindKey] ?? AiuModuleKindCode.Custom;
  const moduleId = typeof runtime?.moduleId === "number" && Number.isFinite(runtime.moduleId)
    ? runtime.moduleId
    : 0;

  const hooks = normalizeHooks(runtime?.hooks);
  const fallback =
    hooks.fallback !== DEFAULT_HOOKS.fallback
      ? hooks.fallback
      : moduleKind === AiuModuleKindCode.Explore ||
        moduleKind === AiuModuleKindCode.FindExit ||
        moduleKind === AiuModuleKindCode.RandomWalk
        ? "random_walk"
        : DEFAULT_HOOKS.fallback;

  const baseCost =
    typeof template?.budget?.baseCost === "number" && Number.isFinite(template.budget.baseCost)
      ? Number(template.budget.baseCost)
      : template.cost;

  const upkeepPerTick =
    typeof template?.budget?.upkeepPerTick === "number" && Number.isFinite(template.budget.upkeepPerTick)
      ? Number(template.budget.upkeepPerTick)
      : 0;

  return {
    id: template.id,
    version: template.version,
    description: template.description,
    cost: template.cost,
    tier: template.tier,
    solverSchema: template.solverSchema,
    moduleId,
    moduleKind,
    hooks: {
      prepare: hooks.prepare,
      interpret: hooks.interpret,
      fallback,
    },
    budget: {
      baseCost,
      upkeepPerTick,
    },
    tags: template.tags,
    prerequisites: template.prerequisites,
    metadata: template.metadata,
  };
}

export function normalizeAiuRegistry(registry) {
  return registry.templates.map(normalizeTemplate);
}

export function toModuleKindCode(kind) {
  if (!kind) return AiuModuleKindCode.Custom;
  return MODULE_KIND_CODES[kind] ?? AiuModuleKindCode.Custom;
}

export { AiuModuleKindCode };
