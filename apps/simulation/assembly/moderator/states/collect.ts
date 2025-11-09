import { ModeratorContext } from "../contracts";

export function moderatorCollect(ctx: ModeratorContext, tick: i32, summary: string): void {
  ctx.addSummary(tick, summary);
}
