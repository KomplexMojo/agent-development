import { configurator_map_is_enterable } from "../configurator";
import {
  GuardRadiusQuery,
  ReachabilityQuery,
  SolverPathStep,
  SolverQuerySchema,
  SolverResult,
  SolverResultCode,
  WaypointQuery,
} from "./contracts";

const PATH_CAPACITY: i32 = 32;
const MAX_CACHE_ENTRIES: i32 = 32;

class SolverCacheEntry {
  constructor(public hash: i64, public result: SolverResult) {}
}

class SolverAdapterContext {
  configuratorHandle: i32 = 0;
  cache: Array<SolverCacheEntry> = new Array<SolverCacheEntry>();
  lastResult: SolverResult = SolverResult.unimplemented();
  lastQuerySeed: i32 = 0;

  clear(): void {
    this.configuratorHandle = 0;
    this.cache = new Array<SolverCacheEntry>();
    this.lastResult = SolverResult.unimplemented();
    this.lastQuerySeed = 0;
  }
}

const contexts = new Map<i32, SolverAdapterContext>();
let nextHandle: i32 = 1;

function ensureContext(handle: i32): SolverAdapterContext {
  let ctx = contexts.get(handle);
  if (ctx === null) {
    ctx = new SolverAdapterContext();
    contexts.set(handle, ctx);
  }
  return changetype<SolverAdapterContext>(ctx);
}

export function solver_adapter_create(): i32 {
  const handle = nextHandle++;
  contexts.set(handle, new SolverAdapterContext());
  return handle;
}

export function solver_adapter_destroy(handle: i32): void {
  contexts.delete(handle);
}

export function solver_adapter_reset(handle: i32): void {
  const ctx = ensureContext(handle);
  ctx.clear();
}

export function solver_adapter_bind_map(handle: i32, configuratorHandle: i32): void {
  const ctx = ensureContext(handle);
  ctx.configuratorHandle = configuratorHandle;
}

function computeHash(schema: SolverQuerySchema, seed: i32, a: i32, b: i32, c: i32, d: i32): i64 {
  let hash: i64 = (<i64>schema & 0xffff) << 48;
  hash |= (<i64>seed & 0xffff) << 32;
  hash |= (<i64>a & 0xffff) << 16;
  hash |= (<i64>b & 0xffff);
  hash ^= (<i64>c & 0xffff) << 24;
  hash ^= (<i64>d & 0xffff) << 8;
  return hash;
}

function findCache(ctx: SolverAdapterContext, hash: i64): SolverResult | null {
  for (let i = 0, len = ctx.cache.length; i < len; i++) {
    const entry = unchecked(ctx.cache[i]);
    if (entry.hash == hash) return entry.result;
  }
  return null;
}

function storeCache(ctx: SolverAdapterContext, hash: i64, result: SolverResult): void {
  if (ctx.cache.length >= MAX_CACHE_ENTRIES) {
    ctx.cache.shift();
  }
  ctx.cache.push(new SolverCacheEntry(hash, result));
}

function createStep(dx: i32, dy: i32, level: i32, count: i32): StaticArray<SolverPathStep> {
  const length = count < PATH_CAPACITY ? count : PATH_CAPACITY;
  const steps = new StaticArray<SolverPathStep>(length);
  for (let i = 0; i < length; i++) {
    unchecked(steps[i] = new SolverPathStep(dx, dy, level));
  }
  return steps;
}

function solveReachability(ctx: SolverAdapterContext, query: ReachabilityQuery): SolverResult {
  const configurator = ctx.configuratorHandle;
  if (configurator == 0) {
    return new SolverResult(SolverResultCode.Error, null, "solver adapter has no configurator context bound");
  }

  if (query.maxSteps <= 0) {
    return SolverResult.timeout();
  }

  if (configurator_map_is_enterable(configurator, query.targetX, query.targetY, query.level) == 0) {
    return new SolverResult(SolverResultCode.Unsat, null, "target cell is not enterable");
  }

  const dx = query.targetX - query.startX;
  const dy = query.targetY - query.startY;
  const manhattan = (dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy);
  if (manhattan > query.maxSteps) {
    return SolverResult.timeout();
  }

  const steps = createStep(dx, dy, query.level, manhattan > 0 ? manhattan : 1);
  return new SolverResult(SolverResultCode.Sat, steps, "");
}

function solveGuardRadius(_ctx: SolverAdapterContext, _query: GuardRadiusQuery): SolverResult {
  return new SolverResult(SolverResultCode.Unsat, null, "guard radius solver stub");
}

function solveWaypoint(_ctx: SolverAdapterContext, query: WaypointQuery): SolverResult {
  if (query.waypointCount <= 0) {
    return SolverResult.unimplemented();
  }
  return new SolverResult(SolverResultCode.Unsat, null, "waypoint solver stub");
}

function setLastResult(ctx: SolverAdapterContext, result: SolverResult): i32 {
  ctx.lastResult = result;
  return result.code;
}

export function solver_adapter_solve_reachability(
  handle: i32,
  startX: i32,
  startY: i32,
  targetX: i32,
  targetY: i32,
  level: i32,
  maxSteps: i32,
): i32 {
  const ctx = ensureContext(handle);
  ctx.lastQuerySeed += 1;
  const hash = computeHash(
    SolverQuerySchema.Reachability,
    ctx.lastQuerySeed,
    startX,
    startY,
    targetX,
    targetY,
  );
  const cached = findCache(ctx, hash);
  if (cached !== null) {
    return setLastResult(ctx, cached);
  }
  const query = new ReachabilityQuery(startX, startY, targetX, targetY, level, maxSteps);
  const result = solveReachability(ctx, query);
  storeCache(ctx, hash, result);
  return setLastResult(ctx, result);
}

export function solver_adapter_solve_guard_radius(
  handle: i32,
  anchorX: i32,
  anchorY: i32,
  level: i32,
  radius: i32,
  maxSteps: i32,
): i32 {
  const ctx = ensureContext(handle);
  ctx.lastQuerySeed += 1;
  const hash = computeHash(
    SolverQuerySchema.GuardRadius,
    ctx.lastQuerySeed,
    anchorX,
    anchorY,
    radius,
    maxSteps,
  );
  const cached = findCache(ctx, hash);
  if (cached !== null) {
    return setLastResult(ctx, cached);
  }
  const query = new GuardRadiusQuery(anchorX, anchorY, level, radius, maxSteps);
  const result = solveGuardRadius(ctx, query);
  storeCache(ctx, hash, result);
  return setLastResult(ctx, result);
}

export function solver_adapter_solve_waypoint(
  handle: i32,
  startX: i32,
  startY: i32,
  level: i32,
  waypointCount: i32,
): i32 {
  const ctx = ensureContext(handle);
  ctx.lastQuerySeed += 1;
  const hash = computeHash(
    SolverQuerySchema.Waypoint,
    ctx.lastQuerySeed,
    startX,
    startY,
    level,
    waypointCount,
  );
  const cached = findCache(ctx, hash);
  if (cached !== null) {
    return setLastResult(ctx, cached);
  }
  const query = new WaypointQuery(startX, startY, level, waypointCount);
  const result = solveWaypoint(ctx, query);
  storeCache(ctx, hash, result);
  return setLastResult(ctx, result);
}

export function solver_adapter_result_code(handle: i32): i32 {
  return ensureContext(handle).lastResult.code;
}

export function solver_adapter_result_step_count(handle: i32): i32 {
  const steps = ensureContext(handle).lastResult.steps;
  return steps === null ? 0 : steps.length;
}

export function solver_adapter_result_step_get_dx(handle: i32, index: i32): i32 {
  const steps = ensureContext(handle).lastResult.steps;
  if (steps === null || index < 0 || index >= steps.length) return 0;
  return unchecked(steps[index]).x;
}

export function solver_adapter_result_step_get_dy(handle: i32, index: i32): i32 {
  const steps = ensureContext(handle).lastResult.steps;
  if (steps === null || index < 0 || index >= steps.length) return 0;
  return unchecked(steps[index]).y;
}

export function solver_adapter_result_step_get_level(handle: i32, index: i32): i32 {
  const steps = ensureContext(handle).lastResult.steps;
  if (steps === null || index < 0 || index >= steps.length) return 0;
  return unchecked(steps[index]).level;
}

export const solver_result_code_sat: i32 = SolverResultCode.Sat;
export const solver_result_code_unsat: i32 = SolverResultCode.Unsat;
export const solver_result_code_timeout: i32 = SolverResultCode.Timeout;
export const solver_result_code_error: i32 = SolverResultCode.Error;
export const solver_result_code_unimplemented: i32 = SolverResultCode.Unimplemented;
