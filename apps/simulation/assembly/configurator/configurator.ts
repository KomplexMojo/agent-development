import { ObservationCapability, ObservationRecord, ObservationOccupancy } from "../actor/contracts";
import {
  actor_vitals_get_stamina_current,
  actor_vitals_get_stamina_max,
  actor_evaluation_reset_grid,
  actor_evaluation_mark_blocked,
  actor_evaluation_rebuild,
  actor_evaluation_get_valid_move_count,
  actor_evaluation_get_valid_move,
  actor_observation_get_record_count,
  actor_observation_get_record,
  actor_observation_get_capability,
  actor_resources_cultivate_tick,
} from "../actor/actor";
import {
  AiuEvaluationContext,
  AiuSolverRequest,
  AiuIntent,
  getAiuModule,
  AIU_INTENT_MODE_NONE,
  AIU_INTENT_MODE_CULTIVATE,
  AIU_INTENT_MODE_PATROL,
  MODULE_ID_CULTIVATION_DEFAULT,
} from "./aiuRuntime";
import {
  SurfacePool,
  createSurfacePool,
  surfacePoolGetDurability,
  surfacePoolGetHealth,
  surfacePoolGetId,
  surfacePoolGetLastObservationCapability,
  surfacePoolGetLevel,
  surfacePoolGetMana,
  surfacePoolGetStamina,
  surfacePoolGetX,
  surfacePoolGetY,
  surfacePoolIsStatic,
  surfacePoolRequestObservation,
  surfacePoolSize,
} from "./surface";
import {
  ConfiguratorState,
  SurfacePlacementEntry,
  ActorPlacementEntry,
  ConfiguratorContext,
} from "./contracts";
import { applyPlanState } from "./states/plan";
import { applyProposeState } from "./states/propose";
import { applySurveyState, collectSurveyObservations } from "./states/survey";
import { applyDispatchState } from "./states/dispatch";
import { applyVerifyState } from "./states/verify";
import { applyConfirmState } from "./states/confirm";
import {
  solver_adapter_create,
  solver_adapter_destroy,
  solver_adapter_reset,
  solver_adapter_bind_map,
  solver_result_code_sat,
  solver_result_code_unsat,
} from "./solver/adapter";

const contexts = new Array<ConfiguratorContext | null>();

const CONFIGURATOR_DISPATCH_TIER_AIU: i32 = 1;
const CONFIGURATOR_DISPATCH_TIER_LOGIC: i32 = 2;
const CONFIGURATOR_DISPATCH_TIER_INSTINCT: i32 = 3;

const CONFIGURATOR_DISPATCH_OUTCOME_PENDING: i32 = 0;
const CONFIGURATOR_DISPATCH_OUTCOME_ACCEPTED: i32 = 1;
const CONFIGURATOR_DISPATCH_OUTCOME_REJECTED: i32 = 2;

const CONFIGURATOR_DISPATCH_REJECTION_NONE: i32 = 0;
const CONFIGURATOR_DISPATCH_REJECTION_STAMINA: i32 = 1;
const CONFIGURATOR_DISPATCH_REJECTION_BLOCKED: i32 = 2;
const CONFIGURATOR_DISPATCH_REJECTION_DUPLICATE: i32 = 3;

const CONFIGURATOR_ACTOR_ROLE_MOBILE: i32 = 1;
const CONFIGURATOR_ACTOR_ROLE_BARRIER: i32 = 2;

const MIN_MEANINGFUL_ACTION_PERCENT: i32 = 4; // aligns with transition stamina cost baseline
const CULTIVATION_MIN_EXIT_STAMINA: i32 = 6;

class DispatchEntry {
  constructor(
    public actorHandle: i32,
    public priorityToken: i32,
    public initialX: i32,
    public initialY: i32,
    public initialLevel: i32,
    public stamina: i32,
    public intentDx: i32,
    public intentDy: i32,
    public intentTier: i32,
    public outcome: i32,
    public rejectionCode: i32,
  ) {}

  historyCount: i32 = 0;
  solverCode: i32 = 0;
  aiuMode: i32 = AIU_INTENT_MODE_NONE;
  aiuAux: i32 = 0;
  cultivationTicks: i32 = 0;
  vulnerabilityTicks: i32 = 0;
}

class DispatchQueue {
  constructor(
    public entries: Array<DispatchEntry>,
    public tickSeed: i32,
    public contextHandle: i32,
  ) {}
}

const dispatchQueues = new Array<DispatchQueue | null>();

function getDispatchQueue(handle: i32): DispatchQueue | null {
  const index = handle - 1;
  if (index < 0 || index >= dispatchQueues.length) return null;
  return dispatchQueues[index];
}

function getDispatchEntry(queueHandle: i32, index: i32): DispatchEntry | null {
  const queue = getDispatchQueue(queueHandle);
  if (queue === null) return null;
  if (index < 0 || index >= queue.entries.length) return null;
  return unchecked(queue.entries[index]);
}

function computePriorityToken(tickSeed: i32, actorHandle: i32): i32 {
  let seed = <u32>tickSeed ^ (<u32>actorHandle * 0x45d9f3b);
  seed ^= seed >> 16;
  seed = seed * 0x7feb352d;
  seed ^= seed >> 15;
  seed = seed * 0x846ca68b;
  seed ^= seed >> 16;
  return <i32>(seed & 0x7fffffff);
}

function compareDispatchEntries(a: DispatchEntry, b: DispatchEntry): i32 {
  if (a.priorityToken < b.priorityToken) return -1;
  if (a.priorityToken > b.priorityToken) return 1;
  if (a.actorHandle < b.actorHandle) return -1;
  if (a.actorHandle > b.actorHandle) return 1;
  return 0;
}

function isAmbulatoryRole(role: i32): bool {
  return role == CONFIGURATOR_ACTOR_ROLE_MOBILE;
}

const DISPATCH_HISTORY_CAPACITY: i32 = 8;

class DispatchHistory {
  constructor(public handle: i32) {}

  private tiers: StaticArray<i32> = new StaticArray<i32>(DISPATCH_HISTORY_CAPACITY);
  private outcomes: StaticArray<i32> = new StaticArray<i32>(DISPATCH_HISTORY_CAPACITY);
  private reasons: StaticArray<i32> = new StaticArray<i32>(DISPATCH_HISTORY_CAPACITY);
  private ticks: StaticArray<i32> = new StaticArray<i32>(DISPATCH_HISTORY_CAPACITY);
  private head: i32 = 0;
  private filled: i32 = 0;

  push(tick: i32, tier: i32, outcome: i32, reason: i32): void {
    unchecked(this.tiers[this.head] = tier);
    unchecked(this.outcomes[this.head] = outcome);
    unchecked(this.reasons[this.head] = reason);
    unchecked(this.ticks[this.head] = tick);
    this.head = (this.head + 1) % DISPATCH_HISTORY_CAPACITY;
    if (this.filled < DISPATCH_HISTORY_CAPACITY) {
      this.filled += 1;
    }
  }

  updateMostRecent(outcome: i32, reason: i32): void {
    if (this.filled == 0) return;
    const idx = (this.head - 1 + DISPATCH_HISTORY_CAPACITY) % DISPATCH_HISTORY_CAPACITY;
    unchecked(this.outcomes[idx] = outcome);
    unchecked(this.reasons[idx] = reason);
  }

  count(): i32 {
    return this.filled;
  }

  private recentIndex(index: i32): i32 {
    if (index < 0 || index >= this.filled) return -1;
    return (this.head - 1 - index + DISPATCH_HISTORY_CAPACITY) % DISPATCH_HISTORY_CAPACITY;
  }

  getTier(index: i32): i32 {
    const pos = this.recentIndex(index);
    return pos < 0 ? 0 : unchecked(this.tiers[pos]);
  }

  getOutcome(index: i32): i32 {
    const pos = this.recentIndex(index);
    return pos < 0 ? 0 : unchecked(this.outcomes[pos]);
  }

  getReason(index: i32): i32 {
    const pos = this.recentIndex(index);
    return pos < 0 ? 0 : unchecked(this.reasons[pos]);
  }

  getTick(index: i32): i32 {
    const pos = this.recentIndex(index);
    return pos < 0 ? 0 : unchecked(this.ticks[pos]);
  }
}

class DispatchHistoryEntry {
  constructor(
    public contextHandle: i32,
    public actorHandle: i32,
    public history: DispatchHistory,
  ) {}
}

const dispatchHistoryRecords = new Array<DispatchHistoryEntry>();
const EVALUATION_GRID_SIZE: i32 = 3;
const EVALUATION_CENTER_OFFSET: i32 = 1;

function canApplyIntent(ctx: ConfiguratorContext, placement: ActorPlacementEntry, dx: i32, dy: i32): bool {
  if (dx == 0 && dy == 0) return true;
  const targetX = placement.x + dx;
  const targetY = placement.y + dy;
  return ctx.map.isEnterable(targetX, targetY, placement.level);
}

function computeVulnerabilityWindow(cultivationTicks: i32): i32 {
  if (cultivationTicks <= 0) return 0;
  const window = Math.sqrt(<f64>cultivationTicks);
  const ceil = <i32>Math.ceil(window);
  return ceil < 0 ? 0 : ceil;
}

function computeMinMeaningfulActionCost(staminaMax: i32): i32 {
  if (staminaMax <= 0) return 0;
  const scaled = <i32>Math.ceil((<f64>staminaMax * <f64>MIN_MEANINGFUL_ACTION_PERCENT) / 100.0);
  if (scaled < 1) return 1;
  return scaled;
}

function computeCultivationExitThreshold(staminaMax: i32): i32 {
  if (staminaMax <= 0) return 0;
  let threshold = computeMinMeaningfulActionCost(staminaMax);
  if (CULTIVATION_MIN_EXIT_STAMINA > threshold) {
    threshold = CULTIVATION_MIN_EXIT_STAMINA;
  }
  if (threshold > staminaMax) {
    threshold = staminaMax;
  }
  return threshold;
}

function shouldForceCultivation(ctx: ConfiguratorContext, placement: ActorPlacementEntry, aiuId: i32): bool {
  if (aiuId == MODULE_ID_CULTIVATION_DEFAULT) return false;
  const actorHandle = placement.handle;
  if (actorHandle == 0) return false;
  if (ctx.getVulnerabilityTicks(actorHandle) > 0) return false;
  const staminaMax = actor_vitals_get_stamina_max(actorHandle);
  if (staminaMax <= 0) return false;
  const staminaCurrent = actor_vitals_get_stamina_current(actorHandle);
  const exitThreshold = computeCultivationExitThreshold(staminaMax);
  return staminaCurrent < exitThreshold;
}

function evaluateCultivationIntent(
  ctx: ConfiguratorContext,
  placement: ActorPlacementEntry,
  entry: DispatchEntry,
  tickSeed: i32,
): bool {
  const actorHandle = placement.handle;
  if (actorHandle == 0) return false;

  const evaluationContext = new AiuEvaluationContext(
    ctx.map,
    placement,
    tickSeed,
    MODULE_ID_CULTIVATION_DEFAULT,
    ctx.solverHandle,
    actorHandle,
    ctx.aiuVisits,
    ctx.getPatrolIndex(actorHandle),
  );

  const module = getAiuModule(MODULE_ID_CULTIVATION_DEFAULT);
  const intent = module.evaluate(evaluationContext);
  if (intent === null) return false;
  if (!canApplyIntent(ctx, placement, intent.dx, intent.dy)) {
    return false;
  }

  entry.intentDx = intent.dx;
  entry.intentDy = intent.dy;
  entry.intentTier = CONFIGURATOR_DISPATCH_TIER_AIU;
  entry.solverCode = intent.solverCode != 0 ? intent.solverCode : evaluationContext.lastSolverCode;
  applyAiuModeEffects(ctx, entry, intent);
  return true;
}

function applyAiuModeEffects(ctx: ConfiguratorContext, entry: DispatchEntry, intent: AiuIntent): void {
  entry.aiuMode = intent.mode;
  entry.aiuAux = intent.aux;
  const actorHandle = entry.actorHandle;

  if (intent.mode == AIU_INTENT_MODE_CULTIVATE) {
    const ticks = ctx.incrementCultivationTicks(actorHandle);
    entry.cultivationTicks = ticks;
    entry.vulnerabilityTicks = ctx.getVulnerabilityTicks(actorHandle);
    actor_resources_cultivate_tick(actorHandle);
  } else {
    const elapsed = ctx.resetCultivationTicks(actorHandle);
    if (elapsed > 0) {
      const window = computeVulnerabilityWindow(elapsed);
      ctx.setVulnerabilityTicks(actorHandle, window);
    }
    entry.cultivationTicks = 0;
    entry.vulnerabilityTicks = ctx.getVulnerabilityTicks(actorHandle);
    if (intent.mode == AIU_INTENT_MODE_PATROL) {
      ctx.setPatrolIndex(actorHandle, intent.aux);
    }
  }
}

function tryApplyDirectorIntent(ctx: ConfiguratorContext, placement: ActorPlacementEntry, entry: DispatchEntry): bool {
  const actorHandle = placement.handle;
  if (actorHandle == 0) return false;
  const tick = ctx.currentTickSeed;
  let dx = 0;
  let dy = 0;
  let found = false;

  const actors = ctx.directorIntentActors;
  for (let i = 0, len = actors.length; i < len; i++) {
    if (unchecked(actors[i]) != actorHandle) continue;
    if (unchecked(ctx.directorIntentTick[i]) != tick) continue;
    dx = unchecked(ctx.directorIntentDx[i]);
    dy = unchecked(ctx.directorIntentDy[i]);
    found = true;
    break;
  }

  if (!found && ctx.directorBroadcastTick == tick) {
    dx = ctx.directorBroadcastDx;
    dy = ctx.directorBroadcastDy;
    found = true;
  }

  if (!found) return false;
  if (!canApplyIntent(ctx, placement, dx, dy)) return false;

  entry.intentDx = dx;
  entry.intentDy = dy;
  entry.intentTier = CONFIGURATOR_DISPATCH_TIER_AIU;
  applyAiuModeEffects(ctx, entry, new AiuIntent(dx, dy));
  return true;
}

function computeAiuIntent(aiuId: i32, tickSeed: i32, placement: ActorPlacementEntry, ctx: ConfiguratorContext, entry: DispatchEntry): bool {
  if (aiuId == 0) return false;

  const evaluationContext = new AiuEvaluationContext(
    ctx.map,
    placement,
    tickSeed,
    aiuId,
    ctx.solverHandle,
    placement.handle,
    ctx.aiuVisits,
    ctx.getPatrolIndex(placement.handle),
  );

  if (trySolverReachabilityIntent(ctx, placement, entry, tickSeed, aiuId, evaluationContext)) {
    entry.solverCode = evaluationContext.lastSolverCode;
    return true;
  }

  const module = getAiuModule(aiuId);
  const intent = module.evaluate(evaluationContext);
  if (intent === null) {
    return false;
  }

  if (!canApplyIntent(ctx, placement, intent.dx, intent.dy)) {
    return false;
  }

  entry.intentDx = intent.dx;
  entry.intentDy = intent.dy;
  entry.intentTier = CONFIGURATOR_DISPATCH_TIER_AIU;
  entry.solverCode = intent.solverCode != 0 ? intent.solverCode : evaluationContext.lastSolverCode;
  applyAiuModeEffects(ctx, entry, intent);
  return true;
}

function tryEvaluationIntent(ctx: ConfiguratorContext, placement: ActorPlacementEntry, entry: DispatchEntry): bool {
  const actorHandle = placement.handle;
  if (actorHandle == 0) return false;
  const count = actor_evaluation_get_valid_move_count(actorHandle);
  if (count <= 0) return false;

  let waitAvailable = false;
  for (let i = 0; i < count; i++) {
    const move = actor_evaluation_get_valid_move(actorHandle, i);
    const dx = move.x - EVALUATION_CENTER_OFFSET;
    const dy = move.y - EVALUATION_CENTER_OFFSET;
    if (dx == 0 && dy == 0) {
      waitAvailable = true;
      continue;
    }
    if (!canApplyIntent(ctx, placement, dx, dy)) continue;
    entry.intentDx = dx;
    entry.intentDy = dy;
    entry.intentTier = CONFIGURATOR_DISPATCH_TIER_LOGIC;
    applyAiuModeEffects(ctx, entry, new AiuIntent(dx, dy));
    return true;
  }

  if (waitAvailable) {
    entry.intentDx = 0;
    entry.intentDy = 0;
    entry.intentTier = CONFIGURATOR_DISPATCH_TIER_LOGIC;
    applyAiuModeEffects(ctx, entry, new AiuIntent(0, 0));
    return true;
  }

  return false;
}

const FALLBACK_DIRECTIONS: StaticArray<i32> = [
  1, 0,
  -1, 0,
  0, 1,
  0, -1,
  1, 1,
  -1, 1,
  -1, -1,
  1, -1,
];

function tryFallbackIntent(placement: ActorPlacementEntry, ctx: ConfiguratorContext, entry: DispatchEntry, tickSeed: i32): bool {
  const stride = 2;
  const directions = 4; // prioritize cardinal directions to limit collisions
  const rotation = directions > 0 ? computePriorityToken(tickSeed, placement.handle) % directions : 0;

  for (let i = 0; i < directions; i++) {
    const index = (rotation + i) % directions;
    const base = index * stride;
    const dx = unchecked(FALLBACK_DIRECTIONS[base]);
    const dy = unchecked(FALLBACK_DIRECTIONS[base + 1]);
    if (!canApplyIntent(ctx, placement, dx, dy)) continue;
    entry.intentDx = dx;
    entry.intentDy = dy;
    entry.intentTier = CONFIGURATOR_DISPATCH_TIER_LOGIC;
    applyAiuModeEffects(ctx, entry, new AiuIntent(dx, dy));
    return true;
  }
  return false;
}

function populateIntentForEntry(ctx: ConfiguratorContext, placement: ActorPlacementEntry, entry: DispatchEntry, tickSeed: i32): void {
  prepareEvaluationForPlacement(ctx, placement);
  entry.intentTier = CONFIGURATOR_DISPATCH_TIER_INSTINCT;
  entry.intentDx = 0;
  entry.intentDy = 0;
  entry.solverCode = 0;

  const aiuId = ctx.getActorAiu(placement.handle);
  if (shouldForceCultivation(ctx, placement, aiuId)) {
    if (evaluateCultivationIntent(ctx, placement, entry, tickSeed)) {
      return;
    }
  }

  if (tryApplyDirectorIntent(ctx, placement, entry)) {
    return;
  }

  if (computeAiuIntent(aiuId, tickSeed, placement, ctx, entry)) {
    return;
  }

  if (tryEvaluationIntent(ctx, placement, entry)) {
    return;
  }

  if (tryFallbackIntent(placement, ctx, entry, tickSeed)) {
    return;
  }

  entry.intentTier = CONFIGURATOR_DISPATCH_TIER_INSTINCT;
  entry.intentDx = 0;
  entry.intentDy = 0;
  applyAiuModeEffects(ctx, entry, new AiuIntent(0, 0));
}

const SOLVER_ENABLED_AIU_THRESHOLD: i32 = 9000;

function trySolverReachabilityIntent(
  ctx: ConfiguratorContext,
  placement: ActorPlacementEntry,
  entry: DispatchEntry,
  tickSeed: i32,
  aiuId: i32,
  evaluationContext: AiuEvaluationContext,
): bool {
  if (aiuId < SOLVER_ENABLED_AIU_THRESHOLD) {
    return false;
  }
  const solverHandle = ctx.solverHandle;
  if (solverHandle == 0) return false;

  const stride = 2;
  const directions = 4;
  const rotation = directions > 0 ? computePriorityToken(tickSeed, placement.handle) % directions : 0;

  for (let i = 0; i < directions; i++) {
    const index = (rotation + i) % directions;
    const base = index * stride;
    const dx = unchecked(FALLBACK_DIRECTIONS[base]);
    const dy = unchecked(FALLBACK_DIRECTIONS[base + 1]);
    const targetX = placement.x + dx;
    const targetY = placement.y + dy;
    if (!ctx.map.isEnterable(targetX, targetY, placement.level)) continue;

    const budget = computeStepBudget(dx, dy);
    const request = AiuSolverRequest.reachability(targetX, targetY, placement.level, budget, dx, dy);
    const result = evaluationContext.invokeSolver(request);
    entry.solverCode = result.code;
    if (result.code != solver_result_code_sat) {
      continue;
    }

    let stepDx = result.stepDx;
    let stepDy = result.stepDy;
    if (stepDx == 0 && stepDy == 0) {
      stepDx = dx;
      stepDy = dy;
    }
    if (!canApplyIntent(ctx, placement, stepDx, stepDy)) {
      continue;
    }

    entry.intentDx = stepDx;
   entry.intentDy = stepDy;
   entry.intentTier = CONFIGURATOR_DISPATCH_TIER_AIU;
   entry.solverCode = result.code;
    applyAiuModeEffects(ctx, entry, new AiuIntent(stepDx, stepDy, result.code));
   return true;
 }

  if (entry.solverCode == 0) {
    entry.solverCode = evaluationContext.lastSolverCode != 0 ? evaluationContext.lastSolverCode : solver_result_code_unsat;
  }
  return false;
}

function computeStepBudget(dx: i32, dy: i32): i32 {
  const absDx = dx < 0 ? -dx : dx;
  const absDy = dy < 0 ? -dy : dy;
  const manhattan = absDx + absDy;
  return manhattan <= 0 ? 1 : manhattan;
}

function prepareEvaluationForPlacement(ctx: ConfiguratorContext, placement: ActorPlacementEntry): void {
  const actorHandle = placement.handle;
  if (actorHandle == 0) return;

  actor_evaluation_reset_grid(actorHandle, EVALUATION_GRID_SIZE, EVALUATION_GRID_SIZE);

  const observationBlocks = collectObservedBlockedKeys(actorHandle, placement);

  for (let gx = 0; gx < EVALUATION_GRID_SIZE; gx++) {
    for (let gy = 0; gy < EVALUATION_GRID_SIZE; gy++) {
      const dx = gx - EVALUATION_CENTER_OFFSET;
      const dy = gy - EVALUATION_CENTER_OFFSET;
      let blocked = false;
      if (!(dx == 0 && dy == 0)) {
        const targetX = placement.x + dx;
        const targetY = placement.y + dy;
        blocked = !canApplyIntent(ctx, placement, dx, dy);
        if (!blocked) {
          const key = makeCellKey(targetX, targetY, placement.level);
          blocked = containsCellKey(observationBlocks, key);
        }
      }
      actor_evaluation_mark_blocked(actorHandle, gx, gy, blocked ? 1 : 0);
    }
  }

  actor_evaluation_rebuild(actorHandle);
}

function collectObservedBlockedKeys(actorHandle: i32, placement: ActorPlacementEntry): Array<i64> {
  const results = new Array<i64>();
  const recordCount = actor_observation_get_record_count(actorHandle);

  for (let i = 0; i < recordCount; i++) {
    const record = actor_observation_get_record(actorHandle, i);
    if (record === null) continue;
    if (record.observedLevel != placement.level) continue;
    if (record.observedHandle == actorHandle) continue;

    let isBlocked = record.observedOccupancy == ObservationOccupancy.Blocking;
    if (!isBlocked && record.observedHandle != 0) {
      isBlocked = true;
    }
    if (!isBlocked) continue;

    const key = makeCellKey(record.observedX, record.observedY, record.observedLevel);
    if (!containsCellKey(results, key)) {
      results.push(key);
    }
  }

  return results;
}

function containsCellKey(list: Array<i64>, key: i64): bool {
  for (let i = 0, n = list.length; i < n; i++) {
    if (unchecked(list[i]) == key) return true;
  }
  return false;
}

function formatDispatchEntry(entry: DispatchEntry): string {
  return "actor:" + entry.actorHandle.toString() +
    ":tier=" + entry.intentTier.toString() +
    ":dx=" + entry.intentDx.toString() +
    ":dy=" + entry.intentDy.toString() +
    ":outcome=" + entry.outcome.toString() +
    ":reason=" + entry.rejectionCode.toString() +
    ":solver=" + entry.solverCode.toString() +
    ":mode=" + entry.aiuMode.toString() +
    ":cult=" + entry.cultivationTicks.toString() +
    ":vuln=" + entry.vulnerabilityTicks.toString();
}

function getHistoryRecord(contextHandle: i32, actorHandle: i32, create: bool): DispatchHistory | null {
  for (let i = 0, len = dispatchHistoryRecords.length; i < len; i++) {
    const bucket = unchecked(dispatchHistoryRecords[i]);
    if (bucket.contextHandle == contextHandle && bucket.actorHandle == actorHandle) {
      return bucket.history;
    }
  }
  if (!create) return null;
  const history = new DispatchHistory(actorHandle);
  dispatchHistoryRecords.push(new DispatchHistoryEntry(contextHandle, actorHandle, history));
  return history;
}

function recordDispatchHistory(contextHandle: i32, actorHandle: i32, tick: i32, tier: i32, outcome: i32, reason: i32): void {
  const history = getHistoryRecord(contextHandle, actorHandle, true);
  if (history !== null) {
    history.push(tick, tier, outcome, reason);
  }
}

function updateDispatchHistoryLatest(contextHandle: i32, actorHandle: i32, outcome: i32, reason: i32): void {
  const history = getHistoryRecord(contextHandle, actorHandle, false);
  if (history !== null) {
    history.updateMostRecent(outcome, reason);
  }
}

function getDispatchHistoryCount(contextHandle: i32, actorHandle: i32): i32 {
  const history = getHistoryRecord(contextHandle, actorHandle, false);
  return history === null ? 0 : history.count();
}

function getDispatchHistoryTier(contextHandle: i32, actorHandle: i32, historyIndex: i32): i32 {
  const history = getHistoryRecord(contextHandle, actorHandle, false);
  return history === null ? 0 : history.getTier(historyIndex);
}

function getDispatchHistoryOutcome(contextHandle: i32, actorHandle: i32, historyIndex: i32): i32 {
  const history = getHistoryRecord(contextHandle, actorHandle, false);
  return history === null ? 0 : history.getOutcome(historyIndex);
}

function getDispatchHistoryReason(contextHandle: i32, actorHandle: i32, historyIndex: i32): i32 {
  const history = getHistoryRecord(contextHandle, actorHandle, false);
  return history === null ? 0 : history.getReason(historyIndex);
}

function ensureContext(handle: i32): ConfiguratorContext {
  let index = handle - 1;
  if (index < 0) {
    index = contexts.length;
  }
  while (index >= contexts.length) {
    contexts.push(null);
  }
  let ctx = contexts[index];
  if (ctx === null) {
    ctx = new ConfiguratorContext();
    contexts[index] = ctx;
  }
  return changetype<ConfiguratorContext>(ctx);
}

function getContext(handle: i32): ConfiguratorContext | null {
  const index = handle - 1;
  if (index < 0 || index >= contexts.length) {
    return null;
  }
  return contexts[index];
}

function getSurfacePool(handle: i32): SurfacePool | null {
  const ctx = getContext(handle);
  return ctx === null ? null : ctx.surfacePool;
}

export function configurator_lifecycle_create(): i32 {
  const ctx = new ConfiguratorContext();
  ctx.solverHandle = solver_adapter_create();
  contexts.push(ctx);
  return contexts.length;
}

export function configurator_lifecycle_destroy(handle: i32): void {
  const index = handle - 1;
  if (index < 0 || index >= contexts.length) {
    return;
  }
  const ctx = contexts[index];
  if (ctx !== null) {
    if (ctx.solverHandle != 0) {
      solver_adapter_destroy(ctx.solverHandle);
      ctx.solverHandle = 0;
    }
  }
  contexts[index] = null;
}

export function configurator_lifecycle_initialize(handle: i32, width: i32, height: i32, level: i32): void {
  const ctx = ensureContext(handle);
  ctx.surfacePool = createSurfacePool(width, height, level);
  ctx.reset();
  if (ctx.solverHandle != 0) {
    solver_adapter_reset(ctx.solverHandle);
    solver_adapter_bind_map(ctx.solverHandle, handle);
  }
}

// -- state machine ---------------------------------------------------------

export function configurator_lifecycle_get_state(handle: i32): i32 {
  return ensureContext(handle).state;
}

export function configurator_lifecycle_transition_state(handle: i32, target: i32): i32 {
  const ctx = ensureContext(handle);
  if (target < <i32>ConfiguratorState.Plan || target > <i32>ConfiguratorState.Confirm) {
    return 0;
  }
  if (target == <i32>ctx.state || target == (<i32>ctx.state + 1)) {
    ctx.state = <ConfiguratorState>target;
    return 1;
  }
  return 0;
}

export function configurator_lifecycle_advance_state(handle: i32): i32 {
  const ctx = ensureContext(handle);
  if (ctx.state == ConfiguratorState.Confirm) return ctx.state;
  ctx.state = <ConfiguratorState>(<i32>ctx.state + 1);
  return ctx.state;
}

// -- automatic state progression -------------------------------------------

export function configurator_lifecycle_process(handle: i32): i32 {
  const ctx = ensureContext(handle);

  // Attempt to progress through states in order during a single call,
  // stopping when a guard fails. This mirrors the actor lifecycle pipeline.
  let advanced = true;
  while (advanced) {
    advanced = false;
    switch (ctx.state) {
      case ConfiguratorState.Plan: {
        if (applyPlanState(ctx)) {
          ctx.state = ConfiguratorState.Propose;
          advanced = true;
        }
        break;
      }
      case ConfiguratorState.Propose: {
        if (applyProposeState(ctx)) {
          ctx.state = ConfiguratorState.Survey;
          advanced = true;
        }
        break;
      }
      case ConfiguratorState.Survey: {
        if (applySurveyState(ctx)) {
          ctx.state = ConfiguratorState.Dispatch;
          advanced = true;
        }
        break;
      }
      case ConfiguratorState.Dispatch: {
        if (applyDispatchState(ctx)) {
          ctx.state = ConfiguratorState.Verify;
          advanced = true;
        }
        break;
      }
      case ConfiguratorState.Verify: {
        if (applyVerifyState(ctx)) {
          ctx.state = ConfiguratorState.Confirm;
          advanced = true;
        }
        break;
      }
      case ConfiguratorState.Confirm: {
        // Terminal state; run optional finalize logic and stop.
        applyConfirmState(ctx);
        break;
      }
    }
  }

  return <i32>ctx.state;
}

// -- surface pool proxies --------------------------------------------------

export function configurator_surface_pool_size(handle: i32): i32 {
  return surfacePoolSize(getSurfacePool(handle));
}

export function configurator_surface_pool_get_stamina(handle: i32, index: i32): i32 {
  return surfacePoolGetStamina(getSurfacePool(handle), index);
}

export function configurator_surface_pool_get_health(handle: i32, index: i32): i32 {
  return surfacePoolGetHealth(getSurfacePool(handle), index);
}

export function configurator_surface_pool_get_mana(handle: i32, index: i32): i32 {
  return surfacePoolGetMana(getSurfacePool(handle), index);
}

export function configurator_surface_pool_get_durability(handle: i32, index: i32): i32 {
  return surfacePoolGetDurability(getSurfacePool(handle), index);
}

export function configurator_surface_pool_get_position_x(handle: i32, index: i32): i32 {
  return surfacePoolGetX(getSurfacePool(handle), index);
}

export function configurator_surface_pool_get_position_y(handle: i32, index: i32): i32 {
  return surfacePoolGetY(getSurfacePool(handle), index);
}

export function configurator_surface_pool_get_level(handle: i32, index: i32): i32 {
  return surfacePoolGetLevel(getSurfacePool(handle), index);
}

export function configurator_surface_pool_get_id(handle: i32, index: i32): i32 {
  return surfacePoolGetId(getSurfacePool(handle), index);
}

export function configurator_surface_pool_is_static(handle: i32, index: i32): i32 {
  return surfacePoolIsStatic(getSurfacePool(handle), index) ? 1 : 0;
}

export function configurator_surface_pool_request_observation(handle: i32, index: i32): i32 {
  return surfacePoolRequestObservation(getSurfacePool(handle), index, ObservationCapability.Enhanced);
}

export function configurator_surface_pool_get_last_observation_capability(handle: i32, index: i32): i32 {
  return surfacePoolGetLastObservationCapability(getSurfacePool(handle), index);
}

// -- ledgers ---------------------------------------------------------------

export function configurator_surface_ledger_record(handle: i32, surfaceId: i32, x: i32, y: i32, level: i32): void {
  const ctx = ensureContext(handle);
  ctx.surfaceLedger.push(new SurfacePlacementEntry(surfaceId, x, y, level));
  ctx.map.setSurface(surfaceId, x, y, level);
}

export function configurator_surface_ledger_size(handle: i32): i32 {
  return ensureContext(handle).surfaceLedger.length;
}

export function configurator_surface_ledger_get_id(handle: i32, index: i32): i32 {
  const ctx = ensureContext(handle);
  return index < ctx.surfaceLedger.length ? unchecked(ctx.surfaceLedger[index]).id : 0;
}

export function configurator_surface_ledger_get_x(handle: i32, index: i32): i32 {
  const ctx = ensureContext(handle);
  return index < ctx.surfaceLedger.length ? unchecked(ctx.surfaceLedger[index]).x : 0;
}

export function configurator_surface_ledger_get_y(handle: i32, index: i32): i32 {
  const ctx = ensureContext(handle);
  return index < ctx.surfaceLedger.length ? unchecked(ctx.surfaceLedger[index]).y : 0;
}

export function configurator_surface_ledger_get_level(handle: i32, index: i32): i32 {
  const ctx = ensureContext(handle);
  return index < ctx.surfaceLedger.length ? unchecked(ctx.surfaceLedger[index]).level : 0;
}

export function configurator_actor_ledger_record(handle: i32, actorHandle: i32, x: i32, y: i32, level: i32, role: i32): i32 {
  const ctx = ensureContext(handle);
  if (!ctx.map.setActor(actorHandle, x, y, level)) {
    return 0;
  }
  ctx.actorLedger.push(new ActorPlacementEntry(actorHandle, x, y, level, role));
  ctx.aiuVisits.record(actorHandle, x, y, level);
  return 1;
}

export function configurator_actor_ledger_size(handle: i32): i32 {
  return ensureContext(handle).actorLedger.length;
}

export function configurator_actor_ledger_get_handle(handle: i32, index: i32): i32 {
  const ctx = ensureContext(handle);
  return index < ctx.actorLedger.length ? unchecked(ctx.actorLedger[index]).handle : 0;
}

export function configurator_actor_ledger_get_x(handle: i32, index: i32): i32 {
  const ctx = ensureContext(handle);
  return index < ctx.actorLedger.length ? unchecked(ctx.actorLedger[index]).x : 0;
}

export function configurator_actor_ledger_get_y(handle: i32, index: i32): i32 {
  const ctx = ensureContext(handle);
  return index < ctx.actorLedger.length ? unchecked(ctx.actorLedger[index]).y : 0;
}

export function configurator_actor_ledger_get_level(handle: i32, index: i32): i32 {
  const ctx = ensureContext(handle);
  return index < ctx.actorLedger.length ? unchecked(ctx.actorLedger[index]).level : 0;
}

export function configurator_actor_ledger_get_role(handle: i32, index: i32): i32 {
  const ctx = ensureContext(handle);
  return index < ctx.actorLedger.length ? unchecked(ctx.actorLedger[index]).role : 0;
}

export function configurator_actor_role_mobile(): i32 {
  return CONFIGURATOR_ACTOR_ROLE_MOBILE;
}

export function configurator_actor_role_barrier(): i32 {
  return CONFIGURATOR_ACTOR_ROLE_BARRIER;
}

// -- map layer helpers -----------------------------------------------------

export function configurator_map_set_feature(handle: i32, x: i32, y: i32, level: i32, featureHandle: i32, blocking: i32): void {
  const ctx = ensureContext(handle);
  ctx.map.setFeature(featureHandle, x, y, level, blocking != 0);
}

export function configurator_map_clear_feature(handle: i32, x: i32, y: i32, level: i32): void {
  const ctx = ensureContext(handle);
  ctx.map.clearFeature(x, y, level);
}

export function configurator_map_set_actor(handle: i32, actorHandle: i32, x: i32, y: i32, level: i32): i32 {
  const ctx = ensureContext(handle);
  return ctx.map.setActor(actorHandle, x, y, level) ? 1 : 0;
}

export function configurator_map_clear_actor(handle: i32, x: i32, y: i32, level: i32): void {
  const ctx = ensureContext(handle);
  ctx.map.clearActor(x, y, level);
}

export function configurator_map_is_enterable(handle: i32, x: i32, y: i32, level: i32): i32 {
  const ctx = ensureContext(handle);
  return ctx.map.isEnterable(x, y, level) ? 1 : 0;
}

export function configurator_map_set_portal(handle: i32, x: i32, y: i32, level: i32, portalType: i32): i32 {
  const ctx = ensureContext(handle);
  return ctx.map.setPortal(x, y, level, portalType) ? 1 : 0;
}

export function configurator_map_get_portal(handle: i32, x: i32, y: i32, level: i32): i32 {
  const ctx = ensureContext(handle);
  return ctx.map.getPortalType(x, y, level);
}

export function configurator_map_clear_portal(handle: i32, x: i32, y: i32, level: i32): void {
  const ctx = ensureContext(handle);
  ctx.map.clearPortal(x, y, level);
}

export function configurator_map_set_stair(handle: i32, x: i32, y: i32, level: i32, stairType: i32): i32 {
  const ctx = ensureContext(handle);
  return ctx.map.setStair(x, y, level, stairType) ? 1 : 0;
}

export function configurator_map_get_stair(handle: i32, x: i32, y: i32, level: i32): i32 {
  const ctx = ensureContext(handle);
  return ctx.map.getStairType(x, y, level);
}

export function configurator_map_clear_stair(handle: i32, x: i32, y: i32, level: i32): void {
  const ctx = ensureContext(handle);
  ctx.map.clearStair(x, y, level);
}

// -- observation aggregation ----------------------------------------------

export function configurator_observation_sweep(handle: i32): i32 {
  const ctx = ensureContext(handle);
  return collectSurveyObservations(ctx);
}

export function configurator_observation_last_sweep_count(handle: i32): i32 {
  return ensureContext(handle).lastObservationSweepCount;
}

// -- actor pooling ---------------------------------------------------------

export function configurator_actor_pool_register(handle: i32, actorHandle: i32): void {
  const ctx = ensureContext(handle);
  ctx.actorPool.register(actorHandle);
}

export function configurator_actor_pool_borrow(handle: i32): i32 {
  const ctx = ensureContext(handle);
  return ctx.actorPool.borrow();
}

export function configurator_actor_pool_return(handle: i32, actorHandle: i32): i32 {
  const ctx = ensureContext(handle);
  return ctx.actorPool.release(actorHandle) ? 1 : 0;
}

export function configurator_actor_pool_available_count(handle: i32): i32 {
  return ensureContext(handle).actorPool.availableCount();
}

export function configurator_actor_pool_borrowed_count(handle: i32): i32 {
  return ensureContext(handle).actorPool.borrowedCount();
}

// -- AIU catalog & assignments --------------------------------------------

export function configurator_aiu_register(handle: i32, aiuId: i32): i32 {
  const ctx = ensureContext(handle);
  return ctx.registerAiu(aiuId) ? 1 : 0;
}

export function configurator_aiu_register_template(handle: i32, aiuId: i32, moduleKind: i32, baseCost: i32, upkeepCost: i32): i32 {
  const ctx = ensureContext(handle);
  return ctx.registerAiuTemplate(aiuId, moduleKind, baseCost, upkeepCost) ? 1 : 0;
}

export function configurator_aiu_is_registered(handle: i32, aiuId: i32): i32 {
  const ctx = ensureContext(handle);
  return ctx.isAiuRegistered(aiuId) ? 1 : 0;
}

export function configurator_aiu_set_prerequisites(handle: i32, aiuId: i32, minStamina: i32, requiresEnhancedObservation: i32): i32 {
  const ctx = ensureContext(handle);
  if (!ctx.isAiuRegistered(aiuId)) {
    return 0;
  }
  const normalizedMin = minStamina < 0 ? 0 : minStamina;
  ctx.setAiuPrerequisites(aiuId, normalizedMin, requiresEnhancedObservation != 0);
  return 1;
}

export function configurator_actor_assign_aiu(handle: i32, actorHandle: i32, aiuId: i32): i32 {
  const ctx = ensureContext(handle);
  if (aiuId != 0 && !ctx.isAiuRegistered(aiuId)) {
    ctx.setActorAiu(actorHandle, 0);
    return 0;
  }
  if (aiuId != 0) {
    const minStamina = ctx.getAiuMinStamina(aiuId);
    if (minStamina > 0) {
      const staminaMax = actor_vitals_get_stamina_max(actorHandle);
      if (staminaMax < minStamina) {
        ctx.setActorAiu(actorHandle, 0);
        return 0;
      }
    }
    if (ctx.requiresEnhancedObservation(aiuId)) {
      const capability = actor_observation_get_capability(actorHandle);
      if (capability < ObservationCapability.Enhanced) {
        ctx.setActorAiu(actorHandle, 0);
        return 0;
      }
    }
  }
  ctx.setActorAiu(actorHandle, aiuId);
  return aiuId == 0 ? 0 : 1;
}

export function configurator_actor_get_aiu(handle: i32, actorHandle: i32): i32 {
  const ctx = ensureContext(handle);
  return ctx.getActorAiu(actorHandle);
}

export function configurator_actor_get_cultivation_ticks(handle: i32, actorHandle: i32): i32 {
  const ctx = ensureContext(handle);
  return ctx.getCultivationTicks(actorHandle);
}

export function configurator_actor_get_vulnerability_ticks(handle: i32, actorHandle: i32): i32 {
  const ctx = ensureContext(handle);
  return ctx.getVulnerabilityTicks(actorHandle);
}

export function configurator_actor_get_patrol_index(handle: i32, actorHandle: i32): i32 {
  const ctx = ensureContext(handle);
  return ctx.getPatrolIndex(actorHandle);
}

export function configurator_aiu_get_module_kind(handle: i32, aiuId: i32): i32 {
  const ctx = ensureContext(handle);
  return ctx.getAiuModuleKind(aiuId);
}

export function configurator_aiu_get_base_cost(handle: i32, aiuId: i32): i32 {
  const ctx = ensureContext(handle);
  return ctx.getAiuBaseCost(aiuId);
}

export function configurator_aiu_get_upkeep_cost(handle: i32, aiuId: i32): i32 {
  const ctx = ensureContext(handle);
  return ctx.getAiuUpkeepCost(aiuId);
}

export function configurator_actor_update_position(handle: i32, actorHandle: i32, x: i32, y: i32, level: i32): void {
  const ctx = ensureContext(handle);
  ctx.updateActorPlacement(actorHandle, x, y, level);
  ctx.aiuVisits.record(actorHandle, x, y, level);
}

// -- solver / verification -------------------------------------------------

export function configurator_solver_verify(handle: i32, startX: i32, startY: i32, endX: i32, endY: i32, level: i32): i32 {
  const ctx = ensureContext(handle);
  return ctx.map.verifySurfacePath(startX, startY, endX, endY, level) ? 1 : 0;
}

// -- strategy guidance -----------------------------------------------------

export function configurator_director_apply_patch(handle: i32, targetX: i32, targetY: i32, level: i32, startX: i32, startY: i32, endX: i32, endY: i32): i32 {
  const ctx = ensureContext(handle);
  if (!ctx.map.isEnterable(targetX, targetY, level)) {
    return 0;
  }
  if (!ctx.map.verifySurfacePath(startX, startY, endX, endY, level)) {
    return 0;
  }
  return 1;
}

export function configurator_director_set_movement(handle: i32, actorHandle: i32, dx: i32, dy: i32, tickSeed: i32): void {
  const ctx = ensureContext(handle);
  ctx.setDirectorIntent(actorHandle, dx, dy, tickSeed);
}

// -- dispatch queue ---------------------------------------------------------

export function configurator_dispatch_process(handle: i32, tickSeed: i32): i32 {
  const ctx = ensureContext(handle);
  ctx.currentTickSeed = tickSeed;
  ctx.decrementVulnerabilityCounters();
  const entries = new Array<DispatchEntry>();
  const ledger = ctx.actorLedger;

  for (let i = 0, len = ledger.length; i < len; i++) {
    const placement = unchecked(ledger[i]);
    const actorHandle = placement.handle;
    if (actorHandle == 0) continue;
    if (!isAmbulatoryRole(placement.role)) continue;

    const staminaSnapshot = actor_vitals_get_stamina_current(actorHandle);
    const token = computePriorityToken(tickSeed, actorHandle);
    const entry = new DispatchEntry(
      actorHandle,
      token,
      placement.x,
      placement.y,
      placement.level,
      staminaSnapshot,
      0,
      0,
      CONFIGURATOR_DISPATCH_TIER_INSTINCT,
      CONFIGURATOR_DISPATCH_OUTCOME_PENDING,
      CONFIGURATOR_DISPATCH_REJECTION_NONE,
    );
    entry.historyCount = getDispatchHistoryCount(handle, actorHandle);
    populateIntentForEntry(ctx, placement, entry, tickSeed);
    recordDispatchHistory(handle, actorHandle, tickSeed, entry.intentTier, entry.outcome, entry.rejectionCode);
    entry.historyCount = getDispatchHistoryCount(handle, actorHandle);
    entries.push(entry);
  }

  if (entries.length > 1) {
    entries.sort(compareDispatchEntries);
  }

  ctx.dispatchEntries = new Array<string>();
  for (let i = 0, len = entries.length; i < len; i++) {
    const e = unchecked(entries[i]);
    ctx.dispatchEntries.push(formatDispatchEntry(e));
  }

  const queue = new DispatchQueue(entries, tickSeed, handle);
  dispatchQueues.push(queue);
  return dispatchQueues.length;
}

export function configurator_dispatch_release(queueHandle: i32): void {
  const index = queueHandle - 1;
  if (index < 0 || index >= dispatchQueues.length) return;
  dispatchQueues[index] = null;
}

export function configurator_dispatch_get_entry_count(queueHandle: i32): i32 {
  const queue = getDispatchQueue(queueHandle);
  return queue === null ? 0 : queue.entries.length;
}

export function configurator_dispatch_get_actor_handle(queueHandle: i32, index: i32): i32 {
  const entry = getDispatchEntry(queueHandle, index);
  return entry === null ? 0 : entry.actorHandle;
}

export function configurator_dispatch_get_priority_token(queueHandle: i32, index: i32): i32 {
  const entry = getDispatchEntry(queueHandle, index);
  return entry === null ? 0 : entry.priorityToken;
}

export function configurator_dispatch_get_initial_x(queueHandle: i32, index: i32): i32 {
  const entry = getDispatchEntry(queueHandle, index);
  return entry === null ? 0 : entry.initialX;
}

export function configurator_dispatch_get_initial_y(queueHandle: i32, index: i32): i32 {
  const entry = getDispatchEntry(queueHandle, index);
  return entry === null ? 0 : entry.initialY;
}

export function configurator_dispatch_get_initial_level(queueHandle: i32, index: i32): i32 {
  const entry = getDispatchEntry(queueHandle, index);
  return entry === null ? 0 : entry.initialLevel;
}

export function configurator_dispatch_get_stamina(queueHandle: i32, index: i32): i32 {
  const entry = getDispatchEntry(queueHandle, index);
  return entry === null ? 0 : entry.stamina;
}

export function configurator_dispatch_get_intent_dx(queueHandle: i32, index: i32): i32 {
  const entry = getDispatchEntry(queueHandle, index);
  return entry === null ? 0 : entry.intentDx;
}

export function configurator_dispatch_get_intent_dy(queueHandle: i32, index: i32): i32 {
  const entry = getDispatchEntry(queueHandle, index);
  return entry === null ? 0 : entry.intentDy;
}

export function configurator_dispatch_get_intent_tier(queueHandle: i32, index: i32): i32 {
  const entry = getDispatchEntry(queueHandle, index);
  return entry === null ? CONFIGURATOR_DISPATCH_TIER_INSTINCT : entry.intentTier;
}

export function configurator_dispatch_get_outcome(queueHandle: i32, index: i32): i32 {
  const entry = getDispatchEntry(queueHandle, index);
  return entry === null ? CONFIGURATOR_DISPATCH_OUTCOME_PENDING : entry.outcome;
}

export function configurator_dispatch_get_rejection_code(queueHandle: i32, index: i32): i32 {
  const entry = getDispatchEntry(queueHandle, index);
  return entry === null ? CONFIGURATOR_DISPATCH_REJECTION_NONE : entry.rejectionCode;
}

export function configurator_dispatch_get_solver_code(queueHandle: i32, index: i32): i32 {
  const entry = getDispatchEntry(queueHandle, index);
  return entry === null ? 0 : entry.solverCode;
}

export function configurator_dispatch_get_aiu_mode(queueHandle: i32, index: i32): i32 {
  const entry = getDispatchEntry(queueHandle, index);
  return entry === null ? AIU_INTENT_MODE_NONE : entry.aiuMode;
}

export function configurator_dispatch_get_aiu_aux(queueHandle: i32, index: i32): i32 {
  const entry = getDispatchEntry(queueHandle, index);
  return entry === null ? 0 : entry.aiuAux;
}

export function configurator_dispatch_get_cultivation_ticks(queueHandle: i32, index: i32): i32 {
  const entry = getDispatchEntry(queueHandle, index);
  return entry === null ? 0 : entry.cultivationTicks;
}

export function configurator_dispatch_get_vulnerability_ticks(queueHandle: i32, index: i32): i32 {
  const entry = getDispatchEntry(queueHandle, index);
  return entry === null ? 0 : entry.vulnerabilityTicks;
}

export function configurator_dispatch_get_history_count(queueHandle: i32, index: i32): i32 {
  const queue = getDispatchQueue(queueHandle);
  if (queue === null) return 0;
  if (index < 0 || index >= queue.entries.length) return 0;
  const entry = unchecked(queue.entries[index]);
  return getDispatchHistoryCount(queue.contextHandle, entry.actorHandle);
}

export function configurator_dispatch_get_history_tier(queueHandle: i32, index: i32, historyIndex: i32): i32 {
  const queue = getDispatchQueue(queueHandle);
  if (queue === null) return 0;
  if (index < 0 || index >= queue.entries.length) return 0;
  const entry = unchecked(queue.entries[index]);
  return getDispatchHistoryTier(queue.contextHandle, entry.actorHandle, historyIndex);
}

export function configurator_dispatch_get_history_outcome(queueHandle: i32, index: i32, historyIndex: i32): i32 {
  const queue = getDispatchQueue(queueHandle);
  if (queue === null) return 0;
  if (index < 0 || index >= queue.entries.length) return 0;
  const entry = unchecked(queue.entries[index]);
  return getDispatchHistoryOutcome(queue.contextHandle, entry.actorHandle, historyIndex);
}

export function configurator_dispatch_get_history_reason(queueHandle: i32, index: i32, historyIndex: i32): i32 {
  const queue = getDispatchQueue(queueHandle);
  if (queue === null) return 0;
  if (index < 0 || index >= queue.entries.length) return 0;
  const entry = unchecked(queue.entries[index]);
  return getDispatchHistoryReason(queue.contextHandle, entry.actorHandle, historyIndex);
}

export function configurator_dispatch_record_outcome(queueHandle: i32, index: i32, outcome: i32, rejection: i32): void {
  const queue = getDispatchQueue(queueHandle);
  if (queue === null) return;
  if (index < 0 || index >= queue.entries.length) return;
  const entry = unchecked(queue.entries[index]);

  let normalizedOutcome = outcome;
  if (normalizedOutcome != CONFIGURATOR_DISPATCH_OUTCOME_ACCEPTED &&
      normalizedOutcome != CONFIGURATOR_DISPATCH_OUTCOME_REJECTED) {
    normalizedOutcome = CONFIGURATOR_DISPATCH_OUTCOME_PENDING;
  }

  let normalizedReason = rejection;
  if (normalizedOutcome != CONFIGURATOR_DISPATCH_OUTCOME_REJECTED) {
    normalizedReason = CONFIGURATOR_DISPATCH_REJECTION_NONE;
  } else {
    if (normalizedReason != CONFIGURATOR_DISPATCH_REJECTION_STAMINA &&
        normalizedReason != CONFIGURATOR_DISPATCH_REJECTION_BLOCKED &&
        normalizedReason != CONFIGURATOR_DISPATCH_REJECTION_DUPLICATE) {
      normalizedReason = CONFIGURATOR_DISPATCH_REJECTION_NONE;
    }
  }

  entry.outcome = normalizedOutcome;
  entry.rejectionCode = normalizedReason;

  const ctx = getContext(queue.contextHandle);
  if (ctx !== null && index < ctx.dispatchEntries.length) {
    ctx.dispatchEntries[index] = formatDispatchEntry(entry);
  }

  updateDispatchHistoryLatest(queue.contextHandle, entry.actorHandle, entry.outcome, entry.rejectionCode);
}

export const configurator_dispatch_tier_aiu: i32 = CONFIGURATOR_DISPATCH_TIER_AIU;
export const configurator_dispatch_tier_logic: i32 = CONFIGURATOR_DISPATCH_TIER_LOGIC;
export const configurator_dispatch_tier_instinct: i32 = CONFIGURATOR_DISPATCH_TIER_INSTINCT;

export const configurator_dispatch_outcome_pending: i32 = CONFIGURATOR_DISPATCH_OUTCOME_PENDING;
export const configurator_dispatch_outcome_accepted: i32 = CONFIGURATOR_DISPATCH_OUTCOME_ACCEPTED;
export const configurator_dispatch_outcome_rejected: i32 = CONFIGURATOR_DISPATCH_OUTCOME_REJECTED;

export const configurator_dispatch_rejection_none: i32 = CONFIGURATOR_DISPATCH_REJECTION_NONE;
export const configurator_dispatch_rejection_stamina: i32 = CONFIGURATOR_DISPATCH_REJECTION_STAMINA;
export const configurator_dispatch_rejection_blocked: i32 = CONFIGURATOR_DISPATCH_REJECTION_BLOCKED;
export const configurator_dispatch_rejection_duplicate: i32 = CONFIGURATOR_DISPATCH_REJECTION_DUPLICATE;
function makeCellKey(x: i32, y: i32, level: i32): i64 {
  return ((<i64>level & 0xFFFF) << 32) | ((<i64>x & 0xFFFF) << 16) | (<i64>y & 0xFFFF);
}
