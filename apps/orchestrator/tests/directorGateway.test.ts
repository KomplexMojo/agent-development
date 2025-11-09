import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { GuidanceGateway } from "../src/guidance/gateway.js";

describe("[REQ:P3-F05][REQ:P0-F01] director guidance gateway", () => {
  const baseContext = {
    seed: 4242,
    blueprint: {
      width: 57,
      height: 25,
      actors: 213,
      barriers: 427,
      summary: "Max grid baseline",
      features: ["entrance", "exit", "stairs"],
    },
    aiuTemplates: [
      { id: "find_exit", moduleId: 1101, cost: 12, tags: ["mobility", "objective"] },
      { id: "defend_exit", moduleId: 1201, cost: 9, tags: ["defense"] },
    ],
    budget: { total: 200, remaining: 150 },
    metadata: { scenarioId: "phase-4-smoke" },
  };

  it("packages deterministic prompts and records provenance", async () => {
    const now = () => new Date("2024-05-01T00:00:00.000Z");
    const aiClient = vi.fn().mockResolvedValue({
      blueprint: { rooms: 6, corridors: 4 },
      actors: [{ faction: "raiders", aiu: "find_exit", count: 3 }],
      confidence: 0.74,
    });

    const gateway = new GuidanceGateway(aiClient, { now, maxRetries: 0 });

    const result = await gateway.requestGuidance(baseContext);

    expect(aiClient).toHaveBeenCalledTimes(1);
    const [payload] = aiClient.mock.calls[0];

    const expectedPrompt = {
      version: "director.guidance.prompt.v1",
      seed: baseContext.seed,
      blueprint: {
        width: 57,
        height: 25,
        actors: 213,
        barriers: 427,
        summary: "Max grid baseline",
        features: ["entrance", "exit", "stairs"],
      },
      aiuTemplates: [
        { id: "find_exit", moduleId: 1101, cost: 12, tags: ["mobility", "objective"] },
        { id: "defend_exit", moduleId: 1201, cost: 9, tags: ["defense"] },
      ],
      budget: { total: 200, remaining: 150, spent: 50 },
    };
    expectedPrompt.metadata = baseContext.metadata;

    const expectedPromptHash = createHash("sha256")
      .update(JSON.stringify(expectedPrompt))
      .digest("hex");

    expect(payload).toMatchObject({ requestId: `req-${expectedPromptHash}`, promptHash: expectedPromptHash });
    expect(payload.prompt).toEqual(expectedPrompt);

    expect(result.envelope).toMatchObject({
      id: `req-${expectedPromptHash}`,
      prompt: expectedPrompt,
      promptHash: expectedPromptHash,
      requestedAt: now().toISOString(),
      attempts: 1,
    });

    expect(result.response.raw).toEqual({
      blueprint: { rooms: 6, corridors: 4 },
      actors: [{ faction: "raiders", aiu: "find_exit", count: 3 }],
      confidence: 0.74,
    });

    const expectedResponseHash = createHash("sha256")
      .update(JSON.stringify(result.response.raw))
      .digest("hex");

    expect(result.response.responseHash).toBe(expectedResponseHash);
  });

  it("retries on transient errors and surfaces attempt count", async () => {
    const now = () => new Date("2024-05-01T00:00:00.000Z");
    const transient = Object.assign(new Error("timeout"), { transient: true });
    const aiClient = vi
      .fn()
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce({ blueprint: { rooms: 4 }, actors: [], confidence: 0.5 });

    const gateway = new GuidanceGateway(aiClient, { now, maxRetries: 2 });

    const result = await gateway.requestGuidance(baseContext);

    expect(aiClient).toHaveBeenCalledTimes(2);
    expect(result.envelope.attempts).toBe(2);
    expect(result.response.raw).toEqual({ blueprint: { rooms: 4 }, actors: [], confidence: 0.5 });
  });

  it("throws immediately on non-transient errors with envelope metadata", async () => {
    const now = () => new Date("2024-05-01T00:00:00.000Z");
    const aiClient = vi.fn().mockRejectedValue(new Error("bad request"));
    const gateway = new GuidanceGateway(aiClient, { now, maxRetries: 1 });

    await expect(gateway.requestGuidance(baseContext)).rejects.toMatchObject({
      message: "bad request",
      guidanceEnvelope: expect.objectContaining({
        promptHash: expect.any(String),
        attempts: 1,
      }),
    });
  });
});
