import { ConfiguratorContext } from "../contracts";

export function applyVerifyState(ctx: ConfiguratorContext): bool {
  const size = ctx.surfaceLedger.length;
  if (size <= 1) {
    return true;
  }
  const start = unchecked(ctx.surfaceLedger[0]);
  const goal = unchecked(ctx.surfaceLedger[size - 1]);
  return ctx.map.verifySurfacePath(start.x, start.y, goal.x, goal.y, start.level);
}
