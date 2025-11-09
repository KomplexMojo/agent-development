// Purpose: Coordinator lifecycle — coordinates persona ticks.

import { CoordinatorContext, CoordinatorDispatchResult } from "./contracts";
import { runScheduleState } from "./states/schedule";
import { runResolveState } from "./states/resolve";
import { runCommitState } from "./states/commit";
import { director_issue_movement } from "../director/director";

let nextHandle: i32 = 1;
const contexts = new Map<i32, CoordinatorContext>();

function createContext(): CoordinatorContext {
  return new CoordinatorContext();
}

function ensureContext(handle: i32): CoordinatorContext {
  let ctx = contexts.get(handle);
  if (ctx === null) {
    ctx = createContext();
    contexts.set(handle, ctx);
  }
  return changetype<CoordinatorContext>(ctx);
}

export function coordinator_lifecycle_create(): i32 {
  const handle = nextHandle++;
  contexts.set(handle, createContext());
  return handle;
}

export function coordinator_lifecycle_destroy(handle: i32): void {
  contexts.delete(handle);
}

export function coordinator_lifecycle_initialize(handle: i32): void {
  const ctx = ensureContext(handle);
  ctx.reset();
}

export function coordinator_lifecycle_process(handle: i32): void {
  const ctx = ensureContext(handle);
  ctx.tick += 1;

  if (ctx.directorHandle != 0 && ctx.configuratorHandle != 0) {
    director_issue_movement(ctx.directorHandle, ctx.configuratorHandle);
  }

  runScheduleState(ctx);
  runResolveState(ctx);
  runCommitState(ctx);
}

export function coordinator_bind_configurator(handle: i32, configuratorHandle: i32): void {
  const ctx = ensureContext(handle);
  ctx.configuratorHandle = configuratorHandle;
}

export function coordinator_bind_director(handle: i32, directorHandle: i32): void {
  const ctx = ensureContext(handle);
  ctx.directorHandle = directorHandle;
}

export function coordinator_bind_moderator(handle: i32, moderatorHandle: i32): void {
  const ctx = ensureContext(handle);
  ctx.moderatorHandle = moderatorHandle;
}

export function coordinator_get_dispatch_queue_handle(handle: i32): i32 {
  return ensureContext(handle).dispatchQueueHandle;
}

function getDispatchResult(ctx: CoordinatorContext, index: i32): CoordinatorDispatchResult | null {
  if (index < 0 || index >= ctx.dispatchResults.length) return null;
  return unchecked(ctx.dispatchResults[index]);
}

export function coordinator_dispatch_result_count(handle: i32): i32 {
  return ensureContext(handle).dispatchResults.length;
}

export function coordinator_dispatch_result_get_actor(handle: i32, index: i32): i32 {
  const ctx = ensureContext(handle);
  const result = getDispatchResult(ctx, index);
  return result === null ? 0 : result.actorHandle;
}

export function coordinator_dispatch_result_get_dx(handle: i32, index: i32): i32 {
  const ctx = ensureContext(handle);
  const result = getDispatchResult(ctx, index);
  return result === null ? 0 : result.dx;
}

export function coordinator_dispatch_result_get_dy(handle: i32, index: i32): i32 {
  const ctx = ensureContext(handle);
  const result = getDispatchResult(ctx, index);
  return result === null ? 0 : result.dy;
}

export function coordinator_dispatch_result_get_tier(handle: i32, index: i32): i32 {
  const ctx = ensureContext(handle);
  const result = getDispatchResult(ctx, index);
  return result === null ? 0 : result.tier;
}

export function coordinator_dispatch_result_get_outcome(handle: i32, index: i32): i32 {
  const ctx = ensureContext(handle);
  const result = getDispatchResult(ctx, index);
  return result === null ? 0 : result.outcome;
}

export function coordinator_dispatch_result_get_rejection(handle: i32, index: i32): i32 {
  const ctx = ensureContext(handle);
  const result = getDispatchResult(ctx, index);
  return result === null ? 0 : result.rejection;
}

export function coordinator_dispatch_result_get_solver_code(handle: i32, index: i32): i32 {
  const ctx = ensureContext(handle);
  const result = getDispatchResult(ctx, index);
  return result === null ? 0 : result.solverCode;
}

export function coordinator_dispatch_result_get_aiu_mode(handle: i32, index: i32): i32 {
  const ctx = ensureContext(handle);
  const result = getDispatchResult(ctx, index);
  return result === null ? 0 : result.aiuMode;
}

export function coordinator_dispatch_result_get_aiu_aux(handle: i32, index: i32): i32 {
  const ctx = ensureContext(handle);
  const result = getDispatchResult(ctx, index);
  return result === null ? 0 : result.aiuAux;
}

export function coordinator_dispatch_result_get_cultivation_ticks(handle: i32, index: i32): i32 {
  const ctx = ensureContext(handle);
  const result = getDispatchResult(ctx, index);
  return result === null ? 0 : result.cultivationTicks;
}

export function coordinator_dispatch_result_get_vulnerability_ticks(handle: i32, index: i32): i32 {
  const ctx = ensureContext(handle);
  const result = getDispatchResult(ctx, index);
  return result === null ? 0 : result.vulnerabilityTicks;
}

export function coordinator_summary_count(handle: i32): i32 {
  return ensureContext(handle).summaries.length;
}

export function coordinator_summary_get(handle: i32, index: i32): string {
  const ctx = ensureContext(handle);
  if (index < 0 || index >= ctx.summaries.length) return "";
  return unchecked(ctx.summaries[index]);
}
