import { createHash } from "node:crypto";

const DEFAULT_MAX_RETRIES = 2;

export class GuidanceGateway {
  constructor(aiClient, options = {}) {
    if (typeof aiClient !== "function") {
      throw new TypeError("GuidanceGateway requires an AI client function");
    }
    this.aiClient = aiClient;
    this.maxRetries = Number.isFinite(options.maxRetries) ? Math.max(0, options.maxRetries) : DEFAULT_MAX_RETRIES;
    this.now = typeof options.now === "function" ? options.now : () => new Date();
  }

  async requestGuidance(context) {
    const prompt = this.#buildPrompt(context);
    const promptHash = hashJson(prompt);
    const id = `req-${promptHash}`;
    const requestedAt = this.now().toISOString();

    const envelope = {
      id,
      prompt,
      promptHash,
      requestedAt,
      attempts: 0,
    };

    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      attempt += 1;
      envelope.attempts = attempt;

      try {
        const response = await this.aiClient({
          requestId: id,
          prompt,
          promptHash,
          requestedAt,
        });
        const normalizedResponse = response ?? null;
        const responseHash = hashJson(normalizedResponse);
        return {
          envelope: { ...envelope },
          response: { raw: normalizedResponse, responseHash },
        };
      } catch (error) {
        if (error && typeof error === "object" && !Array.isArray(error)) {
          error.guidanceEnvelope = { ...envelope };
        }

        const isTransient = Boolean(error && typeof error === "object" && error.transient);
        const hasRetriesLeft = attempt <= this.maxRetries;
        if (isTransient && hasRetriesLeft) {
          continue;
        }
        throw error;
      }
    }
  }

  #buildPrompt(context) {
    if (!context || typeof context !== "object") {
      throw new TypeError("Guidance context must be an object");
    }

    const seed = Number.isFinite(context.seed) ? Math.floor(context.seed) : 0;
    const metadata = context.metadata && typeof context.metadata === "object" ? { ...context.metadata } : undefined;

    const blueprint = normalizeBlueprint(context.blueprint);
    const aiuTemplates = normalizeAiuTemplates(context.aiuTemplates);
    const budget = normalizeBudget(context.budget);

    const prompt = {
      version: "director.guidance.prompt.v1",
      seed,
      blueprint,
      aiuTemplates,
      budget,
    };

    if (metadata) {
      prompt.metadata = pruneUndefined(metadata);
    }

    return pruneUndefined(prompt);
  }
}

function normalizeBlueprint(input) {
  const source = input && typeof input === "object" ? input : {};
  const width = Number.isFinite(source.width) ? Math.floor(source.width) : 0;
  const height = Number.isFinite(source.height) ? Math.floor(source.height) : 0;
  const actors = Number.isFinite(source.actors) ? Math.floor(source.actors) : 0;
  const barriers = Number.isFinite(source.barriers) ? Math.floor(source.barriers) : 0;
  const summary = typeof source.summary === "string" ? source.summary : "";
  const features = Array.isArray(source.features) ? source.features.filter(isNonEmptyString) : [];

  return {
    width,
    height,
    actors,
    barriers,
    summary,
    features,
  };
}

function normalizeAiuTemplates(templates) {
  if (!Array.isArray(templates)) return [];
  return templates.map((template) => {
    const id = typeof template?.id === "string" ? template.id : "";
    const moduleId = Number.isFinite(template?.moduleId) ? Math.floor(template.moduleId) : 0;
    const cost = Number.isFinite(template?.cost) ? template.cost : 0;
    const tags = Array.isArray(template?.tags) ? template.tags.filter(isNonEmptyString) : [];
    return pruneUndefined({ id, moduleId, cost, tags });
  });
}

function normalizeBudget(budget) {
  const source = budget && typeof budget === "object" ? budget : {};
  const total = Number.isFinite(source.total) ? source.total : 0;
  const remaining = Number.isFinite(source.remaining) ? source.remaining : 0;
  const spent = Number.isFinite(source.spent) ? source.spent : Math.max(0, total - remaining);
  return { total, remaining, spent };
}

function pruneUndefined(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => pruneUndefined(entry));
  }
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) continue;
      result[key] = pruneUndefined(entry);
    }
    return result;
  }
  return value;
}

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

export default GuidanceGateway;
