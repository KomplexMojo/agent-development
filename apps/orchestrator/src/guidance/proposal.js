import { isBlueprintDocument } from "../../../shared/types/schemas.ts";
import { normalizeAiuRegistry } from "../data/aiuRegistry.js";

export function parseGuidanceResponse(response) {
  if (!response || typeof response !== "object") {
    throw new TypeError("Guidance response must be an object");
  }
  const blueprint = response.blueprint;
  if (!isBlueprintDocument(blueprint)) {
    throw new Error("Invalid blueprint document in guidance response");
  }
  const provenance = normalizeProvenance(response.provenance);
  return { blueprint, actors: Array.isArray(blueprint.actors) ? blueprint.actors : [], provenance };
}

export class GuidanceValidationError extends Error {
  constructor(message, issues) {
    super(message);
    this.name = "GuidanceValidationError";
    this.issues = Array.isArray(issues) ? issues : [];
  }
}

export function validateAiuRecommendations(blueprint, registry, options = {}) {
  if (!isBlueprintDocument(blueprint)) {
    throw new Error("Cannot validate AIU recommendations without a valid blueprint");
  }

  const normalizedRegistry = Array.isArray(registry)
    ? registry
    : normalizeAiuRegistry(registry ?? { version: "aiu.registry.v1", templates: [] });

  const templateById = new Map(normalizedRegistry.map((entry) => [entry.id, entry]));
  const issues = [];
  let totalCost = 0;
  const normalizedGroups = [];

  const actorGroups = Array.isArray(blueprint.actors) ? blueprint.actors : [];
  actorGroups.forEach((group, index) => {
    const label = getGroupLabel(group, index);
    const count = Math.max(1, Number.isFinite(group?.count) ? Math.floor(group.count) : 1);
    const faction = typeof group?.faction === "string" ? group.faction : "neutral";
    const metadata = typeof group?.metadata === "object" && group.metadata !== null ? group.metadata : undefined;
    const groupBudget = readBudgetValue(group?.budget);
    let groupCost = 0;
    const validatedAius = [];

    const aiuRefs = Array.isArray(group?.aius) ? group.aius : [];
    for (const aiu of aiuRefs) {
      if (!aiu || typeof aiu.id !== "string" || aiu.id.length === 0) continue;
      const template = templateById.get(aiu.id);
      if (!template) {
        issues.push({ type: "unknown_aiu", group: label, aiuId: aiu.id });
        continue;
      }

      if (!satisfiesMinStamina(template, group)) {
        issues.push({
          type: "prereq_min_stamina",
          group: label,
          aiuId: template.id,
          required: template.prerequisites?.minStamina ?? 0,
          available: getGroupStaminaCapacity(group),
        });
        continue;
      }

      if (!satisfiesObservation(template, group)) {
        issues.push({
          type: "prereq_enhanced_observation",
          group: label,
          aiuId: template.id,
        });
        continue;
      }

      const baseCost = toNumericCost(template?.budget?.baseCost ?? template?.cost ?? aiu.cost ?? 0);
      const appliedCost = baseCost * count;
      groupCost += appliedCost;
      validatedAius.push({
        id: template.id,
        cost: baseCost,
        totalCost: appliedCost,
        template,
      });
    }

    totalCost += groupCost;

    if (typeof groupBudget === "number" && groupBudget >= 0 && groupCost > groupBudget) {
      issues.push({
        type: "group_budget",
        group: label,
        required: groupCost,
        budget: groupBudget,
      });
    }

    normalizedGroups.push({
      label,
      faction,
      count,
      budget: groupBudget,
      cost: groupCost,
      aius: validatedAius,
      metadata,
    });
  });

  const scenarioBudget = readBudgetValue(blueprint?.budget?.remaining);
  if (typeof scenarioBudget === "number" && scenarioBudget >= 0 && totalCost > scenarioBudget) {
    issues.push({
      type: "scenario_budget",
      required: totalCost,
      remaining: scenarioBudget,
    });
  }

  if (issues.length > 0) {
    throw new GuidanceValidationError("AIU recommendation validation failed", issues);
  }

  return {
    totalCost,
    remainingBudget: typeof scenarioBudget === "number" ? Math.max(0, scenarioBudget - totalCost) : undefined,
    groups: normalizedGroups,
  };
}

function normalizeProvenance(provenance) {
  if (!provenance || typeof provenance !== "object") {
    return { model: undefined, promptHash: undefined, responseHash: undefined };
  }
  const model = typeof provenance.model === "string" ? provenance.model : undefined;
  const promptHash = typeof provenance.promptHash === "string" ? provenance.promptHash : undefined;
  const responseHash = typeof provenance.responseHash === "string" ? provenance.responseHash : undefined;
  return { model, promptHash, responseHash };
}

function toNumericCost(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return value;
}

function readBudgetValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function getGroupLabel(group, index) {
  if (group && typeof group.label === "string" && group.label.length > 0) {
    return group.label;
  }
  return `group-${index + 1}`;
}

function getGroupStaminaCapacity(group) {
  const metadata = group?.metadata;
  if (!metadata || typeof metadata !== "object") return Number.POSITIVE_INFINITY;
  const candidates = [
    metadata.staminaMax,
    metadata.stamina,
    metadata.resources?.staminaMax,
    metadata.stats?.staminaMax,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return Number.POSITIVE_INFINITY;
}

function satisfiesMinStamina(template, group) {
  const minStamina = template?.prerequisites?.minStamina;
  if (typeof minStamina !== "number" || minStamina <= 0) {
    return true;
  }
  return getGroupStaminaCapacity(group) >= minStamina;
}

function hasEnhancedObservation(group) {
  const metadata = group?.metadata;
  if (!metadata || typeof metadata !== "object") return false;
  if (typeof metadata.enhancedObservation === "boolean") {
    return metadata.enhancedObservation;
  }
  if (typeof metadata.observation === "string") {
    return metadata.observation.toLowerCase() === "enhanced";
  }
  return false;
}

function satisfiesObservation(template, group) {
  const requiresEnhanced = Boolean(template?.prerequisites?.requiresEnhancedObservation);
  if (!requiresEnhanced) {
    return true;
  }
  return hasEnhancedObservation(group);
}
