// Purpose: Minimal shared types for the actor domains. Keep this small and stable.

export const RESOURCE_INFINITY: i32 = i32.MAX_VALUE;

export class ResourceTriple {
  constructor(public current: i32 = 0, public max: i32 = 0, public regen: i32 = 0) {}

  set(current: i32, max: i32, regen: i32): void {
    this.current = current;
    this.max = max;
    this.regen = regen;
  }
}

export class ResourceSet {
  stamina: ResourceTriple = new ResourceTriple();
  durability: ResourceTriple = new ResourceTriple();
  health: ResourceTriple = new ResourceTriple();
  mana: ResourceTriple = new ResourceTriple();

  reset(): void {
    this.stamina.set(0, 0, 0);
    this.durability.set(0, 0, 0);
    this.health.set(0, 0, 0);
    this.mana.set(0, 0, 0);
  }
}

export class ResourceTripleSnapshot {
  current: i32 = 0;
  max: i32 = 0;
  regen: i32 = 0;

  setFrom(triple: ResourceTriple): void {
    this.current = triple.current;
    this.max = triple.max;
    this.regen = triple.regen;
  }
}

export class ResourceSnapshot {
  stamina: ResourceTripleSnapshot = new ResourceTripleSnapshot();
  durability: ResourceTripleSnapshot = new ResourceTripleSnapshot();
  health: ResourceTripleSnapshot = new ResourceTripleSnapshot();
  mana: ResourceTripleSnapshot = new ResourceTripleSnapshot();

  setFrom(resources: ResourceSet): void {
    this.stamina.setFrom(resources.stamina);
    this.durability.setFrom(resources.durability);
    this.health.setFrom(resources.health);
    this.mana.setFrom(resources.mana);
  }
}

export enum ActorArchetype {
  Mobile = 0,
  StaticTile = 1,
}

export enum ObservationOccupancy {
  Unknown = 0,
  WalkableStatic = 1,
  Blocking = 2,
}

export function applyArchetypeDefaults(resources: ResourceSet, archetype: ActorArchetype): void {
  switch (archetype) {
    case ActorArchetype.StaticTile: {
      resources.stamina.set(0, 0, 0);
      resources.health.set(0, 0, 0);
      resources.mana.set(0, 0, 0);
      resources.durability.set(RESOURCE_INFINITY, RESOURCE_INFINITY, RESOURCE_INFINITY);
      break;
    }
    default: {
      // Mobile actors receive finite non-zero defaults (tunable for future balancing).
      resources.stamina.set(100, 100, 0);
      resources.health.set(100, 100, 0);
      resources.mana.set(50, 50, 0);
      resources.durability.set(100, 100, 0);
      break;
    }
  }
}

export function classifyOccupancy(resources: ResourceSet): ObservationOccupancy {
  const isStatic =
    resources.durability.max == RESOURCE_INFINITY &&
    resources.durability.current == RESOURCE_INFINITY &&
    resources.durability.regen == RESOURCE_INFINITY &&
    resources.stamina.max == 0 &&
    resources.stamina.current == 0 &&
    resources.stamina.regen == 0 &&
    resources.health.max == 0 &&
    resources.health.current == 0 &&
    resources.health.regen == 0 &&
    resources.mana.max == 0 &&
    resources.mana.current == 0 &&
    resources.mana.regen == 0;

  return isStatic ? ObservationOccupancy.WalkableStatic : ObservationOccupancy.Blocking;
}

export enum ObservationCapability {
  Basic = 0,
  Enhanced = 1,
}

export enum ObservationAdjacentStatus {
  Unknown = 0,
  Pending = 1,
  NoResponse = 2,
  Observed = 3,
}

export enum ObservationDirection {
  North = 0,
  East = 1,
  South = 2,
  West = 3,
  NorthEast = 4,
  SouthEast = 5,
  SouthWest = 6,
  NorthWest = 7,
}

export class ObservationAdjacentInfo {
  direction: i32 = 0;
  status: ObservationAdjacentStatus = ObservationAdjacentStatus.Unknown;
  requestId: i32 = 0;
  observedHandle: i32 = 0;
  record: ObservationRecord | null = null;

  constructor(direction: i32 = 0) {
    this.direction = direction;
  }

  reset(direction: i32): void {
    this.direction = direction;
    this.status = ObservationAdjacentStatus.Unknown;
    this.requestId = 0;
    this.observedHandle = 0;
    this.record = null;
  }
}

export class ObservationAdjacentSnapshot {
  direction: i32 = 0;
  status: ObservationAdjacentStatus = ObservationAdjacentStatus.Unknown;
  requestId: i32 = 0;
  observedHandle: i32 = 0;
  record: ObservationRecord | null = null;

  setFrom(info: ObservationAdjacentInfo): void {
    this.direction = info.direction;
    this.status = info.status;
    this.requestId = info.requestId;
    this.observedHandle = info.observedHandle;
    this.record = info.record;
  }
}

export class PositionSnapshot {
  x: i32 = 0;
  y: i32 = 0;

  set(x: i32, y: i32): void {
    this.x = x;
    this.y = y;
  }
}

export class ObservationRecord {
  tick: i32 = 0;
  requestId: i32 = 0;
  observerHandle: i32 = 0;
  observerX: i32 = 0;
  observerY: i32 = 0;
  observerLevel: i32 = 0;
  observedHandle: i32 = 0;
  observedX: i32 = 0;
  observedY: i32 = 0;
  observedLevel: i32 = 0;
  observedOccupancy: ObservationOccupancy = ObservationOccupancy.Unknown;
  hasEnhancedDetailsFlag: i32 = 0;
  staminaCurrent: i32 = 0;
  staminaMax: i32 = 0;
  staminaRegen: i32 = 0;
  priority: i32 = 0;
}

export class Observation {
  capability: ObservationCapability = ObservationCapability.Basic;
  private tickCounter: i32 = 0;
  private records: Array<ObservationRecord> = new Array<ObservationRecord>();
  private latest: ObservationRecord | null = null;
  private maxRecords: i32 = 32;
  private historyTicks: i32 = 1;
  private radarRange: i32 = 1;
  private adjacentInfos: Array<ObservationAdjacentInfo> = new Array<ObservationAdjacentInfo>();

  constructor() {
    for (let dir = 0; dir < 8; dir++) {
      this.adjacentInfos.push(new ObservationAdjacentInfo(dir));
    }
  }

  advanceTick(): void {
    this.tickCounter += 1;
  }

  getTick(): i32 {
    return this.tickCounter;
  }

  addRecord(record: ObservationRecord): void {
    this.records.push(record);
    while (this.records.length > this.maxRecords) {
      this.records.shift();
    }
    this.latest = record;
  }

  getRecordCount(): i32 {
    return this.records.length;
  }

  getRecord(index: i32): ObservationRecord | null {
    if (index < 0 || index >= this.records.length) return null;
    return this.records[index];
  }

  getLatest(): ObservationRecord | null {
    return this.latest;
  }

  setRadarRange(range: i32): void {
    this.radarRange = range < 1 ? 1 : range;
  }

  getRadarRange(): i32 {
    return this.radarRange;
  }

  setHistoryTicks(ticks: i32): void {
    this.historyTicks = ticks < 1 ? 1 : ticks;
  }

  getHistoryTicks(): i32 {
    return this.historyTicks;
  }

  setMaxRecords(capacity: i32): void {
    this.maxRecords = capacity < 1 ? 1 : capacity;
    while (this.records.length > this.maxRecords) {
      this.records.shift();
    }
  }

  getMaxRecords(): i32 {
    return this.maxRecords;
  }

  resetAdjacentSlots(): void {
    for (let i = 0, n = this.adjacentInfos.length; i < n; i++) {
      this.adjacentInfos[i].reset(i);
    }
  }

  getAdjacentInfo(direction: i32): ObservationAdjacentInfo {
    if (direction < 0 || direction >= this.adjacentInfos.length) {
      return new ObservationAdjacentInfo(direction);
    }
    return this.adjacentInfos[direction];
  }

  markAdjacentPending(direction: i32, requestId: i32): void {
    const info = this.getAdjacentInfo(direction);
    info.status = ObservationAdjacentStatus.Pending;
    info.requestId = requestId;
    info.observedHandle = 0;
    info.record = null;
  }

  markAdjacentNoResponse(direction: i32, requestId: i32): void {
    const info = this.getAdjacentInfo(direction);
    info.status = ObservationAdjacentStatus.NoResponse;
    info.requestId = requestId;
    info.observedHandle = 0;
    info.record = null;
  }

  markAdjacentObserved(direction: i32, requestId: i32, observedHandle: i32, record: ObservationRecord | null): void {
    const info = this.getAdjacentInfo(direction);
    info.status = ObservationAdjacentStatus.Observed;
    info.requestId = requestId;
    info.observedHandle = observedHandle;
    info.record = record;
  }
}

class MoveCandidate {
  constructor(public x: i32 = 0, public y: i32 = 0, public blocked: bool = false) {}
}

export class EmissionMessage {
  constructor(
    public id: i32 = 0,
    public fromHandle: i32 = 0,
    public actionDx: i32 = 0,
    public actionDy: i32 = 0,
    public tag: i32 = 0,
    public kind: i32 = 0,
  ) {}
}

export class EmissionReceipt {
  constructor(
    public messageId: i32 = 0,
    public readerHandle: i32 = 0,
  ) {}
}

export class EmissionMessageSnapshot {
  id: i32 = 0;
  fromHandle: i32 = 0;
  actionDx: i32 = 0;
  actionDy: i32 = 0;
  tag: i32 = 0;

  setFrom(message: EmissionMessage): void {
    this.id = message.id;
    this.fromHandle = message.fromHandle;
    this.actionDx = message.actionDx;
    this.actionDy = message.actionDy;
    this.tag = message.tag;
  }
}

export class EmissionReceiptSnapshot {
  messageId: i32 = 0;
  readerHandle: i32 = 0;

  setFrom(receipt: EmissionReceipt): void {
    this.messageId = receipt.messageId;
    this.readerHandle = receipt.readerHandle;
  }
}

export class EmissionState {
  private messageData: Array<i32> = new Array<i32>();
  private receiptData: Array<i32> = new Array<i32>();

  enqueueMessage(
    id: i32,
    fromHandle: i32,
    actionDx: i32,
    actionDy: i32,
    tag: i32,
    kind: i32,
    capacity: i32,
  ): void {
    const stride = 6;
    const limit = capacity * stride;
    if (this.messageData.length >= limit) {
      for (let i = stride, n = this.messageData.length; i < n; i++) {
        this.messageData[i - stride] = this.messageData[i];
      }
      this.messageData.length = limit - stride;
    }
    this.messageData.push(id);
    this.messageData.push(fromHandle);
    this.messageData.push(actionDx);
    this.messageData.push(actionDy);
    this.messageData.push(tag);
    this.messageData.push(kind);
  }

  dequeueMessage(): EmissionMessage | null {
    if (this.messageData.length == 0) return null;
    return this.removeMessageAt(0);
  }

  dequeueMessageByKindAndTag(kind: i32, tag: i32): EmissionMessage | null {
    const stride = 6;
    for (let offset = 0, n = this.messageData.length; offset < n; offset += stride) {
      if (this.messageData[offset + 5] == kind && (tag < 0 || this.messageData[offset + 4] == tag)) {
        return this.removeMessageAt(offset / stride);
      }
    }
    return null;
  }

  enqueueReceipt(messageId: i32, readerHandle: i32, capacity: i32): void {
    const stride = 2;
    const limit = capacity * stride;
    if (this.receiptData.length >= limit) {
      for (let i = stride, n = this.receiptData.length; i < n; i++) {
        this.receiptData[i - stride] = this.receiptData[i];
      }
      this.receiptData.length = limit - stride;
    }
    this.receiptData.push(messageId);
    this.receiptData.push(readerHandle);
  }

  dequeueReceipt(): EmissionReceipt | null {
    const stride = 2;
    if (this.receiptData.length == 0) return null;

    const receipt = new EmissionReceipt();
    receipt.messageId = this.receiptData[0];
    receipt.readerHandle = this.receiptData[1];

    const remaining = this.receiptData.length - stride;
    for (let i = 0; i < remaining; i++) {
      this.receiptData[i] = this.receiptData[i + stride];
    }
    this.receiptData.length = remaining;

    return receipt;
  }

  private removeMessageAt(index: i32): EmissionMessage {
    const stride = 6;
    const base = index * stride;
    const msg = new EmissionMessage();
    msg.id = this.messageData[base];
    msg.fromHandle = this.messageData[base + 1];
    msg.actionDx = this.messageData[base + 2];
    msg.actionDy = this.messageData[base + 3];
    msg.tag = this.messageData[base + 4];
    msg.kind = this.messageData[base + 5];

    for (let i = base + stride, n = this.messageData.length; i < n; i++) {
      this.messageData[i - stride] = this.messageData[i];
    }
    this.messageData.length -= stride;
    return msg;
  }
}

export class EvaluationState {
  width: i32 = 0;
  height: i32 = 0;
  private candidates: Array<MoveCandidate> = new Array<MoveCandidate>();
  private validMoves: Array<Vec2> = new Array<Vec2>();
  private invalidMoves: Array<Vec2> = new Array<Vec2>();
  private chosen: Vec2 = new Vec2(0, 0);

  resetGrid(width: i32, height: i32): void {
    this.width = width;
    this.height = height;
    this.candidates.length = 0;
    this.validMoves.length = 0;
    this.invalidMoves.length = 0;
    this.chosen = new Vec2(0, 0);
  }

  markCandidate(x: i32, y: i32, blocked: bool): void {
    this.candidates.push(new MoveCandidate(x, y, blocked));
  }

  rebuild(): void {
    this.validMoves.length = 0;
    this.invalidMoves.length = 0;
    let chosenSet = false;

    for (let i = 0, n = this.candidates.length; i < n; i++) {
      const cand = this.candidates[i];
      const pos = new Vec2(cand.x, cand.y);
      const inBounds = cand.x >= 0 && cand.y >= 0 && cand.x < this.width && cand.y < this.height;
      if (!cand.blocked && inBounds) {
        this.validMoves.push(pos);
        if (!chosenSet) {
          this.chosen = pos;
          chosenSet = true;
        }
      } else {
        this.invalidMoves.push(pos);
      }
    }

    if (!chosenSet) {
      this.chosen = new Vec2(0, 0);
    }
  }

  getValidMoveCount(): i32 { return this.validMoves.length; }
  getInvalidMoveCount(): i32 { return this.invalidMoves.length; }

  getValidMove(index: i32): Vec2 {
    if (index < 0 || index >= this.validMoves.length) return new Vec2(0, 0);
    return this.validMoves[index];
  }

  getInvalidMove(index: i32): Vec2 {
    if (index < 0 || index >= this.invalidMoves.length) return new Vec2(0, 0);
    return this.invalidMoves[index];
  }

  getChosenMove(): Vec2 {
    return this.chosen;
  }
}

export enum IntentKind {
  Move = 0,
  Attack = 1,
  Use = 2,
  Emit = 3,
  Wait = 4,
}

export class Intent {
  kind: IntentKind = IntentKind.Wait;
  dir: i8 = 0;
}

export class Vec2 {
  constructor(public x: i32 = 0, public y: i32 = 0) {}

  set(x: i32, y: i32): void {
    this.x = x;
    this.y = y;
  }
}

// --- Transition telemetry (scaffold) ---
// Purpose: Authoritative log of applied transitions (movement), owned by SelfState.
// This enables OBSERVATION to project recent transitions without coupling to internals.
export class TransitionEvent {
  tick: i32 = 0;    // optional tick counter (0 until wired)
  dx: i16 = 0;
  dy: i16 = 0;
  dz: i16 = 0;
  fromX: i32 = 0;
  fromY: i32 = 0;
  fromLevel: i32 = 0;
  toX: i32 = 0;
  toY: i32 = 0;
  toLevel: i32 = 0;
}

export class TransitionLog {
  private cap: i32 = 32; // fixed-size ring for determinism
  private head: i32 = 0;
  private filled: i32 = 0;
  private buf: StaticArray<TransitionEvent> = new StaticArray<TransitionEvent>(32);

  push(ev: TransitionEvent): void {
    this.buf[this.head] = ev;
    this.head = (this.head + 1) % this.cap;
    if (this.filled < this.cap) this.filled += 1;
  }

  size(): i32 { return this.filled; }

  // 0 = most recent; returns null if out of range or empty
  getRecent(i: i32): TransitionEvent | null {
    if (this.filled == 0) return null;
    if (i < 0 || i >= this.filled) return null;
    const idx = (this.head - 1 - i + this.cap) % this.cap;
    return this.buf[idx];
  }
}

export class SelfState {
  resources: ResourceSet = new ResourceSet();
  pos: Vec2 = new Vec2(0, 0);
  level: i32 = 0;
  identity: i32 = 0;
  archetype: ActorArchetype = ActorArchetype.Mobile;
  // Transition history (authoritative)
  moves: TransitionLog = new TransitionLog();
}

export class DerivedView {
  // placeholder derived fields
}

export class ActorContext {
  self: SelfState = new SelfState();
  derived: DerivedView = new DerivedView();
  // Read-only snapshot updated by observationAdvance
  observation: Observation = new Observation();
  evaluation: EvaluationState = new EvaluationState();
  emission: EmissionState = new EmissionState();
  dispatchLastTick: i32 = i32.MIN_VALUE;
  dispatchLastRejectionCode: i32 = 0;
  dispatchLastTier: i32 = 0;
}
