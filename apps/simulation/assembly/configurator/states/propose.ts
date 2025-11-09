import { ConfiguratorContext } from "../contracts";

export function applyProposeState(ctx: ConfiguratorContext): bool {
  // A proposal exists once at least one surface placement was recorded.
  return ctx.surfaceLedger.length > 0;
}
