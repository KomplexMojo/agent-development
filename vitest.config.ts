import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/orchestrator/tests/**/*.test.ts"],
    environment: "node",
  },
});
