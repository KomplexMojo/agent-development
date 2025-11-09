// Purpose: EVALUATION — decide on at most one suggested Intent (or WAIT/null).

import { ActorContext, Intent, Vec2 } from "../contracts";

export function evaluationAdvance(ctx: ActorContext): Intent | null {
  ctx.evaluation.rebuild();
  return null;
}

export function evaluationResetGrid(ctx: ActorContext, width: i32, height: i32): void {
  ctx.evaluation.resetGrid(width, height);
}

export function evaluationMarkBlocked(ctx: ActorContext, x: i32, y: i32, blockedFlag: i32): void {
  const blocked = blockedFlag != 0;
  ctx.evaluation.markCandidate(x, y, blocked);
}

export function evaluationGetValidMoveCount(ctx: ActorContext): i32 {
  return ctx.evaluation.getValidMoveCount();
}

export function evaluationGetInvalidMoveCount(ctx: ActorContext): i32 {
  return ctx.evaluation.getInvalidMoveCount();
}

export function evaluationGetValidMove(ctx: ActorContext, index: i32): Vec2 {
  return ctx.evaluation.getValidMove(index);
}

export function evaluationGetInvalidMove(ctx: ActorContext, index: i32): Vec2 {
  return ctx.evaluation.getInvalidMove(index);
}

export function evaluationGetChosenMove(ctx: ActorContext): Vec2 {
  return ctx.evaluation.getChosenMove();
}
