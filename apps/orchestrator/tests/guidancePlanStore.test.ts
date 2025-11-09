import { beforeEach, describe, expect, it } from "vitest";
import {
  stageGuidancePlan,
  consumeGuidancePlan,
  recordGuidancePlanFeedback,
  peekGuidancePlans,
  resetGuidancePlans,
} from "../src/guidance/planStore.js";
import { runMvpDemo } from "../src/index.js";

function buildBlueprint(overrides = {}) {
  return {
    version: "orchestrator.blueprint.v1",
    request: {
      width: 12,
      height: 8,
      actors: 4,
      barriers: 5,
      difficulty: "normal",
      seed: 42,
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
    actors: [],
    budget: { total: 100, spent: 10, remaining: 90 },
    ...overrides,
  };
}

beforeEach(() => {
  resetGuidancePlans();
});

describe("guidance plan store", () => {
  it("stages and consumes plans in order", () => {
    const blueprint = buildBlueprint();
    const staged = stageGuidancePlan({ blueprint, groups: [{ label: "alpha", count: 2 }] });
    expect(staged.id).toBeDefined();

    const peeked = peekGuidancePlans();
    expect(peeked).toHaveLength(1);
    expect(peeked[0].status).toBe("staged");

    const consumed = consumeGuidancePlan();
    expect(consumed).not.toBeNull();
    expect(consumed.id).toBe(staged.id);

    const afterConsume = peekGuidancePlans();
    expect(afterConsume[0].status).toBe("in_progress");
  });

  it("records feedback for completed plans", () => {
    const blueprint = buildBlueprint();
    const staged = stageGuidancePlan({ blueprint, groups: [] });
    consumeGuidancePlan();
    const recorded = recordGuidancePlanFeedback(staged.id, { status: "applied", note: "ok" });
    expect(recorded).toBe(true);
    const peeked = peekGuidancePlans();
    expect(peeked[0].status).toBe("applied");
    expect(peeked[0].feedback).toEqual({ status: "applied", note: "ok" });
  });

  it("overrides demo dimensions when a plan is staged", async () => {
    const blueprint = buildBlueprint({
      request: { width: 14, height: 6, actors: 3, barriers: 2 },
    });
    stageGuidancePlan({
      blueprint,
      groups: [
        { label: "bravo", count: 2 },
        { label: "charlie", count: 1 },
      ],
    });

    await runMvpDemo({ ticks: 2, mock: true });
    const plans = peekGuidancePlans();
    expect(plans[0].status).toBe("applied");
    expect(plans[0].feedback?.appliedOptions?.width).toBe(14);
    expect(plans[0].feedback?.appliedOptions?.actorCount).toBe(3);
  });

  it("stores failure feedback when recorded manually", () => {
    const blueprint = buildBlueprint();
    const staged = stageGuidancePlan({ blueprint, groups: [{ label: "fallback", count: 1 }] });
    const recorded = recordGuidancePlanFeedback(staged.id, { status: "failed", error: "boom" });
    expect(recorded).toBe(true);
    const plans = peekGuidancePlans();
    expect(plans[0].status).toBe("failed");
    expect(plans[0].feedback?.error).toBe("boom");
  });
});
