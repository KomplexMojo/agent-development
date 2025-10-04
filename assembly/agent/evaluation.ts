// Purpose: EVALUATION — decide on at most one suggested Intent (or WAIT/null).

import { AgentContext, Intent, Vec2 } from "./contracts";

export function stepEvaluation(ctx: AgentContext): Intent | null {
  ctx.evaluation.rebuild();
  return null;
}

export function evaluationResetGrid(ctx: AgentContext, width: i32, height: i32): void {
  ctx.evaluation.resetGrid(width, height);
}

export function evaluationMarkBlocked(ctx: AgentContext, x: i32, y: i32, blockedFlag: i32): void {
  const blocked = blockedFlag != 0;
  ctx.evaluation.markCandidate(x, y, blocked);
}

export function evaluationGetValidMoveCount(ctx: AgentContext): i32 {
  return ctx.evaluation.getValidMoveCount();
}

export function evaluationGetInvalidMoveCount(ctx: AgentContext): i32 {
  return ctx.evaluation.getInvalidMoveCount();
}

export function evaluationGetValidMove(ctx: AgentContext, index: i32): Vec2 {
  return ctx.evaluation.getValidMove(index);
}

export function evaluationGetInvalidMove(ctx: AgentContext, index: i32): Vec2 {
  return ctx.evaluation.getInvalidMove(index);
}

export function evaluationGetChosenMove(ctx: AgentContext): Vec2 {
  return ctx.evaluation.getChosenMove();
}
