import { isBlueprintDocument } from "../../../shared/types/schemas.ts";

const plans = [];
let sequence = 1;

function timestamp() {
  return new Date().toISOString();
}

function ensureBlueprint(blueprint) {
  if (!isBlueprintDocument(blueprint)) {
    throw new TypeError("Guidance plan requires a valid blueprint document");
  }
  return blueprint;
}

function normalizeGroups(groups) {
  if (!Array.isArray(groups)) return [];
  return groups.map((group, index) => {
    const label = typeof group?.label === "string" && group.label.length > 0 ? group.label : `group-${index + 1}`;
    const count = Number.isFinite(group?.count) ? Math.max(0, Math.floor(group.count)) : undefined;
    const faction = typeof group?.faction === "string" ? group.faction : undefined;
    const metadata = group?.metadata && typeof group.metadata === "object" ? { ...group.metadata } : undefined;
    const aius = Array.isArray(group?.aius)
      ? group.aius.map((aiu) => ({
          id: typeof aiu?.id === "string" ? aiu.id : undefined,
          cost: Number.isFinite(aiu?.cost) ? aiu.cost : undefined,
          totalCost: Number.isFinite(aiu?.totalCost) ? aiu.totalCost : undefined,
        }))
      : [];
    return {
      label,
      faction,
      count,
      cost: Number.isFinite(group?.cost) ? group.cost : undefined,
      budget: Number.isFinite(group?.budget) ? group.budget : undefined,
      aius,
      metadata,
      raw: group,
    };
  });
}

export function stageGuidancePlan(payload) {
  if (!payload || typeof payload !== "object") {
    throw new TypeError("Guidance plan payload must be an object");
  }
  const blueprint = ensureBlueprint(payload.blueprint);
  const id = typeof payload.id === "string" && payload.id.length > 0 ? payload.id : `plan-${sequence++}`;
  const record = {
    id,
    blueprint,
    groups: normalizeGroups(payload.groups),
    provenance: payload.provenance && typeof payload.provenance === "object" ? { ...payload.provenance } : undefined,
    costs: payload.costs && typeof payload.costs === "object" ? { ...payload.costs } : undefined,
    status: "staged",
    stagedAt: timestamp(),
    startedAt: undefined,
    completedAt: undefined,
    feedback: undefined,
  };
  plans.push(record);
  return { ...record };
}

export function consumeGuidancePlan() {
  const record = plans.find((plan) => plan.status === "staged");
  if (!record) return null;
  record.status = "in_progress";
  record.startedAt = timestamp();
  return { ...record };
}

export function recordGuidancePlanFeedback(id, feedback) {
  const record = plans.find((plan) => plan.id === id);
  if (!record) return false;
  record.status = feedback?.status ?? "completed";
  record.completedAt = timestamp();
  record.feedback = feedback ? { ...feedback } : undefined;
  return true;
}

export function peekGuidancePlans() {
  return plans.map((plan) => ({ ...plan }));
}

export function resetGuidancePlans() {
  plans.length = 0;
  sequence = 1;
}
