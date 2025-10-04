// Purpose: Agent module owning the single demo context and facade functions.
// Orchestrates the five domain passes per tick and provides initialization here.
// `assembly/index.ts` should re-export these for a stable public surface.

import {
  AgentContext,
  Intent,
  Vec2,
  EmissionMessage,
  EmissionReceipt,
  ObservationCapability,
  ObservationRecord,
  ObservationAdjacentInfo,
  ObservationAdjacentStatus,
  ObservationOccupancy,
  ObservationDirection,
  AgentArchetype,
  applyArchetypeDefaults,
  RESOURCE_INFINITY,
  ResourceSnapshot,
  EmissionMessageSnapshot,
  EmissionReceiptSnapshot,
  ObservationAdjacentSnapshot,
  PositionSnapshot,
} from "./contracts";
import {
  stepIntrospection,
  introspectionEnsureMetadata,
  introspectionGetIdentity,
  introspectionGetX,
  introspectionGetY,
  introspectionGetLocation,
  introspectionGetLevel,
  introspectionGetLocationSnapshot,
  introspectionGetStaminaCurrent,
  introspectionGetStaminaMax,
  introspectionGetStaminaRegen,
  introspectionGetDurabilityCurrent,
  introspectionGetDurabilityMax,
  introspectionGetDurabilityRegen,
  introspectionGetHealthCurrent,
  introspectionGetHealthMax,
  introspectionGetHealthRegen,
  introspectionGetManaCurrent,
  introspectionGetManaMax,
  introspectionGetManaRegen,
} from "./introspection";
import {
  stepObservation,
  observationSetCapability,
  observationGetCapability,
  observationGetLatestRecord,
  observationGetRecordCount,
  observationGetRecord,
  observationSetRadarRange,
  observationGetRadarRange,
  observationConfigureMemory,
  observationGetHistoryWindow,
  observationGetRecordCapacity,
  observationResetAdjacent,
  observationMarkAdjacentPending,
  observationMarkAdjacentNoResponse,
  observationMarkAdjacentObserved,
  observationGetAdjacentInfo,
  observationRegisterContext,
  observationUnregisterContext,
} from "./observation";
import {
  stepEvaluation,
  evaluationResetGrid,
  evaluationMarkBlocked,
  evaluationGetValidMoveCount,
  evaluationGetInvalidMoveCount,
  evaluationGetValidMove,
  evaluationGetInvalidMove,
  evaluationGetChosenMove,
} from "./evaluation";
import { stepTransition, moveBy, moveLevelBy, transitionAttemptMove } from "./transition";
import {
  stepEmission,
  emissionGetMessageQueueCapacity,
  emissionSend,
  emissionReceiveNext,
  emissionRecordReceipt,
  emissionPollReceipt,
  emissionSendAdjacentRequest,
  emissionPollAdjacentResponse,
  MESSAGE_KIND_ACTION,
  MESSAGE_KIND_ADJACENT_REQUEST,
  MESSAGE_KIND_ADJACENT_RESPONSE,
} from "./emission";

// --- Context registry -------------------------------------------------------

let nextHandle: i32 = 1;
const contexts = new Map<i32, AgentContext>();

export const agent_archetype_mobile: i32 = AgentArchetype.Mobile;
export const agent_archetype_static_tile: i32 = AgentArchetype.StaticTile;
export const agent_resource_infinity: i32 = RESOURCE_INFINITY;
export const agent_observation_capability_basic: i32 = ObservationCapability.Basic;
export const agent_observation_capability_enhanced: i32 = ObservationCapability.Enhanced;
export const agent_observation_adjacent_status_unknown: i32 = ObservationAdjacentStatus.Unknown;
export const agent_observation_adjacent_status_pending: i32 = ObservationAdjacentStatus.Pending;
export const agent_observation_adjacent_status_no_response: i32 = ObservationAdjacentStatus.NoResponse;
export const agent_observation_adjacent_status_observed: i32 = ObservationAdjacentStatus.Observed;
export const agent_observation_occupancy_unknown: i32 = ObservationOccupancy.Unknown;
export const agent_observation_occupancy_walkable_static: i32 = ObservationOccupancy.WalkableStatic;
export const agent_observation_occupancy_blocking: i32 = ObservationOccupancy.Blocking;
export const agent_observation_direction_north: i32 = ObservationDirection.North;
export const agent_observation_direction_east: i32 = ObservationDirection.East;
export const agent_observation_direction_south: i32 = ObservationDirection.South;
export const agent_observation_direction_west: i32 = ObservationDirection.West;
export const agent_observation_direction_north_east: i32 = ObservationDirection.NorthEast;
export const agent_observation_direction_south_east: i32 = ObservationDirection.SouthEast;
export const agent_observation_direction_south_west: i32 = ObservationDirection.SouthWest;
export const agent_observation_direction_north_west: i32 = ObservationDirection.NorthWest;

function configureResources(ctx: AgentContext, archetype: AgentArchetype): void {
  ctx.self.resources.reset();
  applyArchetypeDefaults(ctx.self.resources, archetype);
  ctx.self.archetype = archetype;
}

function ensureContext(handle: i32): AgentContext {
  let ctx = contexts.get(handle);
  if (ctx === null) {
    const fresh = new AgentContext();
    configureResources(fresh, AgentArchetype.Mobile);
    replaceContext(handle, fresh);
    return fresh;
  }
  introspectionEnsureMetadata(handle, ctx);
  return ctx;
}

function getContextIfPresent(handle: i32): AgentContext | null {
  const ctx = contexts.get(handle);
  if (ctx === null) return null;
  introspectionEnsureMetadata(handle, ctx);
  return ctx;
}

function replaceContext(handle: i32, ctx: AgentContext): void {
  contexts.set(handle, ctx);
  observationRegisterContext(handle, ctx);
  introspectionEnsureMetadata(handle, ctx);
}

function getDirectionOffset(direction: i32): Vec2 {
  switch (<ObservationDirection>direction) {
    case ObservationDirection.North: return new Vec2(0, 1);
    case ObservationDirection.East: return new Vec2(1, 0);
    case ObservationDirection.South: return new Vec2(0, -1);
    case ObservationDirection.West: return new Vec2(-1, 0);
    case ObservationDirection.NorthEast: return new Vec2(1, 1);
    case ObservationDirection.SouthEast: return new Vec2(1, -1);
    case ObservationDirection.SouthWest: return new Vec2(-1, -1);
    case ObservationDirection.NorthWest: return new Vec2(-1, 1);
    default: return new Vec2(0, 0);
  }
}

// --- Lifecycle --------------------------------------------------------------

export function agent_lifecycle_create(archetype: i32 = AgentArchetype.Mobile, _legacyAmbulatory: bool = true): i32 {
  const handle = nextHandle++;
  const ctx = new AgentContext();
  configureResources(ctx, <AgentArchetype>archetype);
  replaceContext(handle, ctx);
  return handle;
}

export function agent_lifecycle_destroy(handle: i32): void {
  contexts.delete(handle);
  observationUnregisterContext(handle);
}

export function agent_lifecycle_init(handle: i32): void {
  const existing = contexts.get(handle);
  const archetype = existing !== null ? existing.self.archetype : AgentArchetype.Mobile;
  const ctx = new AgentContext();
  configureResources(ctx, archetype);
  replaceContext(handle, ctx);
}

export function agent_lifecycle_step(handle: i32): void {
  const ctx = ensureContext(handle);
  // 1) INTROSPECTION
  stepIntrospection(ctx);
  // 2) OBSERVATION
  stepObservation(ctx);
  // 3) EVALUATION
  const suggested: Intent | null = stepEvaluation(ctx);
  // 4) TRANSITION
  const finalized: Intent | null = stepTransition(ctx, suggested);
  // 5) EMISSION (optional)
  const _emitted: Intent | null = finalized === null ? stepEmission(ctx) : null;
}

// --- Observation ------------------------------------------------------------

export function agent_observation_get_x(handle: i32): i32 {
  return introspectionGetX(ensureContext(handle));
}

export function agent_observation_get_y(handle: i32): i32 {
  return introspectionGetY(ensureContext(handle));
}

export function agent_observation_get_location(handle: i32): Vec2 {
  return introspectionGetLocation(ensureContext(handle));
}

export function agent_observation_get_level(handle: i32): i32 {
  return introspectionGetLevel(ensureContext(handle));
}

export function agent_observation_get_adjacent_info(handle: i32, direction: i32): ObservationAdjacentInfo {
  return observationGetAdjacentInfo(ensureContext(handle), direction);
}

export function agent_observation_get_adjacent_snapshot(handle: i32, direction: i32): ObservationAdjacentSnapshot {
  const ctx = ensureContext(handle);
  const info = observationGetAdjacentInfo(ctx, direction);
  const snapshot = new ObservationAdjacentSnapshot();
  snapshot.setFrom(info);
  return snapshot;
}

export function agent_observation_get_location_snapshot(handle: i32): PositionSnapshot {
  return introspectionGetLocationSnapshot(ensureContext(handle));
}

export function agent_observation_set_radar_range(handle: i32, range: i32): void {
  observationSetRadarRange(ensureContext(handle), range);
}

export function agent_observation_get_radar_range(handle: i32): i32 {
  return observationGetRadarRange(ensureContext(handle));
}

export function agent_observation_configure_memory(handle: i32, historyTicks: i32, capacity: i32): void {
  observationConfigureMemory(ensureContext(handle), historyTicks, capacity);
}

export function agent_observation_get_memory_window(handle: i32): i32 {
  return observationGetHistoryWindow(ensureContext(handle));
}

export function agent_observation_get_memory_capacity(handle: i32): i32 {
  return observationGetRecordCapacity(ensureContext(handle));
}

export function agent_observation_direction_get_offset(direction: i32): Vec2 {
  return getDirectionOffset(direction);
}

export function agent_vec2_read(vec: Vec2): PositionSnapshot {
  const snapshot = new PositionSnapshot();
  snapshot.set(vec.x, vec.y);
  return snapshot;
}

export function agent_vec2_write(vec: Vec2, x: i32, y: i32): void {
  vec.x = x;
  vec.y = y;
}

export function agent_observation_reset_adjacent(handle: i32): void {
  observationResetAdjacent(ensureContext(handle));
}

export function agent_observation_mark_adjacent_pending(handle: i32, direction: i32, requestId: i32): void {
  observationMarkAdjacentPending(ensureContext(handle), direction, requestId);
}

export function agent_observation_mark_adjacent_no_response(handle: i32, direction: i32, requestId: i32): void {
  observationMarkAdjacentNoResponse(ensureContext(handle), direction, requestId);
}

export function agent_observation_mark_adjacent_observed(
  handle: i32,
  direction: i32,
  requestId: i32,
  observedHandle: i32,
  recordIndex: i32,
): void {
  const ctx = ensureContext(handle);
  const record = recordIndex >= 0 ? observationGetRecord(ctx, recordIndex) : null;
  observationMarkAdjacentObserved(ctx, direction, requestId, observedHandle, record);
}

export function agent_observation_set_capability(handle: i32, capability: i32): void {
  const ctx = ensureContext(handle);
  observationSetCapability(ctx, <ObservationCapability>capability);
}

export function agent_observation_get_capability(handle: i32): i32 {
  return <i32>observationGetCapability(ensureContext(handle));
}

export function agent_observation_get_latest_record(handle: i32): ObservationRecord | null {
  return observationGetLatestRecord(ensureContext(handle));
}

export function agent_observation_get_record_count(handle: i32): i32 {
  return observationGetRecordCount(ensureContext(handle));
}

export function agent_observation_get_record(handle: i32, index: i32): ObservationRecord | null {
  return observationGetRecord(ensureContext(handle), index);
}

// --- Vitals -----------------------------------------------------------------

export function agent_vitals_get_stamina_current(handle: i32): i32 {
  return introspectionGetStaminaCurrent(ensureContext(handle));
}

export function agent_vitals_get_stamina_max(handle: i32): i32 {
  return introspectionGetStaminaMax(ensureContext(handle));
}

export function agent_vitals_get_stamina_regen(handle: i32): i32 {
  return introspectionGetStaminaRegen(ensureContext(handle));
}

export function agent_durability_get_current(handle: i32): i32 {
  return introspectionGetDurabilityCurrent(ensureContext(handle));
}

export function agent_durability_get_max(handle: i32): i32 {
  return introspectionGetDurabilityMax(ensureContext(handle));
}

export function agent_durability_get_regen(handle: i32): i32 {
  return introspectionGetDurabilityRegen(ensureContext(handle));
}

export function agent_health_get_current(handle: i32): i32 {
  return introspectionGetHealthCurrent(ensureContext(handle));
}

export function agent_health_get_max(handle: i32): i32 {
  return introspectionGetHealthMax(ensureContext(handle));
}

export function agent_health_get_regen(handle: i32): i32 {
  return introspectionGetHealthRegen(ensureContext(handle));
}

export function agent_mana_get_current(handle: i32): i32 {
  return introspectionGetManaCurrent(ensureContext(handle));
}

export function agent_mana_get_max(handle: i32): i32 {
  return introspectionGetManaMax(ensureContext(handle));
}

export function agent_mana_get_regen(handle: i32): i32 {
  return introspectionGetManaRegen(ensureContext(handle));
}

export function agent_resources_snapshot(handle: i32): ResourceSnapshot {
  const ctx = ensureContext(handle);
  const snapshot = new ResourceSnapshot();
  snapshot.setFrom(ctx.self.resources);
  return snapshot;
}

// --- Transition -------------------------------------------------------------

export function agent_transition_move_by(handle: i32, dx: i32, dy: i32): void {
  const ctx = ensureContext(handle);
  moveBy(ctx, dx, dy);
}

export function agent_transition_move_level(handle: i32, dz: i32): void {
  const ctx = ensureContext(handle);
  moveLevelBy(ctx, dz);
}

export function agent_transition_attempt_move(
  moverHandle: i32,
  targetHandle: i32,
  dx: i32,
  dy: i32,
): bool {
  const mover = ensureContext(moverHandle);
  const target = ensureContext(targetHandle);
  return transitionAttemptMove(mover, target, dx, dy);
}

export function agent_transition_set_obstacle(handle: i32, flag: bool): void {
  const ctx = ensureContext(handle);
  configureResources(ctx, flag ? AgentArchetype.Mobile : AgentArchetype.StaticTile);
}

// --- Evaluation -------------------------------------------------------------

export function agent_evaluation_reset_grid(handle: i32, width: i32, height: i32): void {
  evaluationResetGrid(ensureContext(handle), width, height);
}

export function agent_evaluation_mark_blocked(handle: i32, x: i32, y: i32, blocked_flag: i32): void {
  evaluationMarkBlocked(ensureContext(handle), x, y, blocked_flag);
}

export function agent_evaluation_get_valid_move_count(handle: i32): i32 {
  return evaluationGetValidMoveCount(ensureContext(handle));
}

export function agent_evaluation_get_invalid_move_count(handle: i32): i32 {
  return evaluationGetInvalidMoveCount(ensureContext(handle));
}

export function agent_evaluation_get_valid_move(handle: i32, index: i32): Vec2 {
  return evaluationGetValidMove(ensureContext(handle), index);
}

export function agent_evaluation_get_invalid_move(handle: i32, index: i32): Vec2 {
  return evaluationGetInvalidMove(ensureContext(handle), index);
}

export function agent_evaluation_get_chosen_move(handle: i32): Vec2 {
  return evaluationGetChosenMove(ensureContext(handle));
}

// --- Emission ---------------------------------------------------------------

export function agent_emission_get_message_queue_capacity(): i32 {
  return emissionGetMessageQueueCapacity();
}

export function agent_emission_send(
  senderHandle: i32,
  targetHandle: i32,
  radius: f32,
  actionDx: i32,
  actionDy: i32,
  tag: i32,
): i32 {
  const sender = getContextIfPresent(senderHandle);
  const target = getContextIfPresent(targetHandle);
  if (sender === null || target === null) return 0;
  return emissionSend(senderHandle, sender, target, radius, actionDx, actionDy, tag);
}

export function agent_emission_receive_next(handle: i32): EmissionMessageSnapshot | null {
  const ctx = getContextIfPresent(handle);
  if (ctx === null) return null;

  const message = emissionReceiveNext(ctx);
  if (message === null) return null;

  if (message.kind == MESSAGE_KIND_ACTION && (message.actionDx !== 0 || message.actionDy !== 0)) {
    moveBy(ctx, message.actionDx, message.actionDy);
  }

  const senderCtx = getContextIfPresent(message.fromHandle);
  if (senderCtx !== null) {
    emissionRecordReceipt(senderCtx, message.id, handle);
  }

  const snapshot = new EmissionMessageSnapshot();
  snapshot.setFrom(message);
  return snapshot;
}

export function agent_emission_poll_receipt(handle: i32): EmissionReceiptSnapshot | null {
  const ctx = getContextIfPresent(handle);
  if (ctx === null) return null;
  const receipt = emissionPollReceipt(ctx);
  if (receipt === null) return null;
  const snapshot = new EmissionReceiptSnapshot();
  snapshot.setFrom(receipt);
  return snapshot;
}

export function agent_emission_send_request_adjacent(handle: i32, direction: i32): i32 {
  const ctx = getContextIfPresent(handle);
  if (ctx === null) return 0;
  return emissionSendAdjacentRequest(handle, ctx, direction);
}

export function agent_emission_poll_response(handle: i32, requestId: i32): EmissionMessage | null {
  const ctx = getContextIfPresent(handle);
  if (ctx === null) return null;
  return emissionPollAdjacentResponse(ctx, requestId);
}

// --- Identity & Type --------------------------------------------------------

export function agent_identity_get(handle: i32): i32 {
  return introspectionGetIdentity(ensureContext(handle));
}
