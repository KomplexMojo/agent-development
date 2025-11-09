// Purpose: OBSERVATION — capture interrogation results into structured records.

import {
  ActorContext,
  ObservationCapability,
  ObservationRecord,
  ObservationAdjacentInfo,
  classifyOccupancy,
} from "../contracts";

const RADAR_DIRECTION_COUNT: i32 = 8;

const registryHandles = new Array<i32>();
const registryContextPtrs = new Array<usize>();

let nextRadarRequestId: i32 = -1;

export function observationRegisterContext(handle: i32, ctx: ActorContext): void {
  for (let i = 0, n = registryHandles.length; i < n; i++) {
    if (registryHandles[i] == handle) {
      registryContextPtrs[i] = changetype<usize>(ctx);
      return;
    }
  }
  registryHandles.push(handle);
  registryContextPtrs.push(changetype<usize>(ctx));
}

export function observationUnregisterContext(handle: i32): void {
  for (let i = 0, n = registryHandles.length; i < n; i++) {
    if (registryHandles[i] == handle) {
      const last = n - 1;
      registryHandles[i] = registryHandles[last];
      registryContextPtrs[i] = registryContextPtrs[last];
      registryHandles.pop();
      registryContextPtrs.pop();
      return;
    }
  }
}

function findHandleForContext(ctx: ActorContext): i32 {
  for (let i = 0, n = registryHandles.length; i < n; i++) {
    if (changetype<ActorContext>(registryContextPtrs[i]) === ctx) return registryHandles[i];
  }
  return 0;
}

function classifyDirection(dx: i32, dy: i32): i32 {
  if (dx == 0) {
    if (dy > 0) return 0;   // North
    if (dy < 0) return 2;   // South
    return -1;
  }
  if (dy == 0) {
    if (dx > 0) return 1;   // East
    if (dx < 0) return 3;   // West
    return -1;
  }
  if (dx > 0 && dy > 0) return 4;   // NorthEast
  if (dx > 0 && dy < 0) return 5;   // SouthEast
  if (dx < 0 && dy < 0) return 6;   // SouthWest
  if (dx < 0 && dy > 0) return 7;   // NorthWest
  return -1;
}

function performRadarScan(ctx: ActorContext): void {
  const observerHandle = findHandleForContext(ctx);
  if (observerHandle == 0) return;

  const radarRange = ctx.observation.getRadarRange();
  if (radarRange <= 0) return;

  const originX = ctx.self.pos.x;
  const originY = ctx.self.pos.y;
  const level = ctx.self.level;

  const bestDistance = new Array<i32>();
  const bestHandle = new Array<i32>();
  const bestContextPtrs = new Array<usize>();

  for (let dir = 0; dir < RADAR_DIRECTION_COUNT; dir++) {
    bestDistance.push(i32.MAX_VALUE);
    bestHandle.push(0);
    bestContextPtrs.push(0);
  }

  for (let i = 0, n = registryHandles.length; i < n; i++) {
    const targetPtr = registryContextPtrs[i];
    if (targetPtr == 0) continue;
    const targetCtx = changetype<ActorContext>(targetPtr);
    if (targetCtx === ctx) continue;
    if (targetCtx.self.level != level) continue;

    const dx = targetCtx.self.pos.x - originX;
    const dy = targetCtx.self.pos.y - originY;
    if (dx == 0 && dy == 0) continue;

    const absDx = dx < 0 ? -dx : dx;
    const absDy = dy < 0 ? -dy : dy;
    const chebyshev = absDx > absDy ? absDx : absDy;
    if (chebyshev == 0 || chebyshev > radarRange) continue;

    const dir = classifyDirection(dx, dy);
    if (dir < 0) continue;

    if (chebyshev < bestDistance[dir]) {
      bestDistance[dir] = chebyshev;
      bestHandle[dir] = registryHandles[i];
      bestContextPtrs[dir] = targetPtr;
    }
  }

  for (let dir = 0; dir < RADAR_DIRECTION_COUNT; dir++) {
    const targetHandle = bestHandle[dir];
    const targetPtr = bestContextPtrs[dir];
    if (targetHandle == 0 || targetPtr == 0) continue;
    const targetCtx = changetype<ActorContext>(targetPtr);

    const requestId = nextRadarRequestId--;
    const record = observationRecordInterrogation(
      ctx,
      observerHandle,
      targetCtx,
      targetHandle,
      requestId,
    );
    ctx.observation.markAdjacentObserved(dir, requestId, targetHandle, record);
  }

  for (let dir = 0; dir < RADAR_DIRECTION_COUNT; dir++) {
    const targetHandle = bestHandle[dir];
    if (targetHandle != 0) continue;
    const info = ctx.observation.getAdjacentInfo(dir);
    if (info.requestId < 0) {
      info.reset(dir);
    }
  }
}

export function observationAdvance(ctx: ActorContext): void {
  performRadarScan(ctx);
  ctx.observation.advanceTick();
}

export function observationSetCapability(ctx: ActorContext, capability: ObservationCapability): void {
  ctx.observation.capability = capability;
}

export function observationGetCapability(ctx: ActorContext): ObservationCapability {
  return ctx.observation.capability;
}

export function observationSetRadarRange(ctx: ActorContext, range: i32): void {
  ctx.observation.setRadarRange(range);
}

export function observationGetRadarRange(ctx: ActorContext): i32 {
  return ctx.observation.getRadarRange();
}

export function observationConfigureMemory(ctx: ActorContext, historyTicks: i32, capacity: i32): void {
  ctx.observation.setHistoryTicks(historyTicks);
  ctx.observation.setMaxRecords(capacity);
}

export function observationGetHistoryWindow(ctx: ActorContext): i32 {
  return ctx.observation.getHistoryTicks();
}

export function observationGetRecordCapacity(ctx: ActorContext): i32 {
  return ctx.observation.getMaxRecords();
}

export function observationResetAdjacent(ctx: ActorContext): void {
  ctx.observation.resetAdjacentSlots();
}

export function observationMarkAdjacentPending(ctx: ActorContext, direction: i32, requestId: i32): void {
  ctx.observation.markAdjacentPending(direction, requestId);
}

export function observationMarkAdjacentNoResponse(ctx: ActorContext, direction: i32, requestId: i32): void {
  ctx.observation.markAdjacentNoResponse(direction, requestId);
}

export function observationMarkAdjacentObserved(
  ctx: ActorContext,
  direction: i32,
  requestId: i32,
  observedHandle: i32,
  record: ObservationRecord | null,
): void {
  ctx.observation.markAdjacentObserved(direction, requestId, observedHandle, record);
}

export function observationGetAdjacentInfo(ctx: ActorContext, direction: i32): ObservationAdjacentInfo {
  return ctx.observation.getAdjacentInfo(direction);
}

function observationRecordInterrogation(
  observer: ActorContext,
  observerHandle: i32,
  target: ActorContext,
  targetHandle: i32,
  requestId: i32,
): ObservationRecord {
  const record = new ObservationRecord();
  record.tick = observer.observation.getTick();
  record.requestId = requestId;
  record.observerHandle = observerHandle;
  record.observerX = observer.self.pos.x;
  record.observerY = observer.self.pos.y;
  record.observerLevel = observer.self.level;
  record.observedHandle = targetHandle;
  record.observedX = target.self.pos.x;
  record.observedY = target.self.pos.y;
  record.observedLevel = target.self.level;
  record.observedOccupancy = classifyOccupancy(target.self.resources);

  if (observer.observation.capability == ObservationCapability.Enhanced) {
    record.hasEnhancedDetailsFlag = 1;
    record.staminaCurrent = target.self.resources.stamina.current;
    record.staminaMax = target.self.resources.stamina.max;
    record.staminaRegen = target.self.resources.stamina.regen;
  } else {
    record.hasEnhancedDetailsFlag = 0;
    record.staminaCurrent = 0;
    record.staminaMax = 0;
    record.staminaRegen = 0;
  }

  observer.observation.addRecord(record);
  return record;
}

export function observationGetLatestRecord(ctx: ActorContext): ObservationRecord | null {
  return ctx.observation.getLatest();
}

export function observationGetRecordCount(ctx: ActorContext): i32 {
  return ctx.observation.getRecordCount();
}

export function observationGetRecord(ctx: ActorContext, index: i32): ObservationRecord | null {
  return ctx.observation.getRecord(index);
}
