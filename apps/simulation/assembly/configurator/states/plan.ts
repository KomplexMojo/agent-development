import { ConfiguratorContext } from "../contracts";

export function applyPlanState(ctx: ConfiguratorContext): bool {
  // Ensure the configuration context has a surface pool prepared.
  return ctx.surfacePool !== null;
}
