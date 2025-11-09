import { SurfacePool } from "./surface";

enum ConfiguratorState {
  Plan = 0,
  Propose = 1,
  Survey = 2,
  Dispatch = 3,
  Verify = 4,
  Confirm = 5,
}

class SurfacePlacementEntry {
  constructor(
    public id: i32,
    public x: i32,
    public y: i32,
    public level: i32,
  ) {}
}

class ActorPlacementEntry {
  constructor(
    public handle: i32,
    public x: i32,
    public y: i32,
    public level: i32,
    public role: i32,
  ) {}
}

class LevelCell {
  constructor(
    public x: i32,
    public y: i32,
    public level: i32,
  ) {}

  surfaceId: i32 = 0;
  featureHandle: i32 = 0;
  featureBlocking: bool = false;
  actorHandle: i32 = 0;
  portalType: i32 = 0;
  stairType: i32 = 0;
}

class LevelMap {
  private cells: Array<LevelCell> = new Array<LevelCell>();

  private findIndex(x: i32, y: i32, level: i32): i32 {
    for (let i = 0, len = this.cells.length; i < len; i++) {
      const cell = unchecked(this.cells[i]);
      if (cell.x == x && cell.y == y && cell.level == level) return i;
    }
    return -1;
  }

  private getOrCreate(x: i32, y: i32, level: i32): LevelCell {
    const index = this.findIndex(x, y, level);
    if (index >= 0) {
      return unchecked(this.cells[index]);
    }
    const cell = new LevelCell(x, y, level);
    this.cells.push(cell);
    return cell;
  }

  private getCell(x: i32, y: i32, level: i32): LevelCell | null {
    const index = this.findIndex(x, y, level);
    return index >= 0 ? unchecked(this.cells[index]) : null;
  }

  setSurface(surfaceId: i32, x: i32, y: i32, level: i32): void {
    const cell = this.getOrCreate(x, y, level);
    cell.surfaceId = surfaceId;
  }

  setFeature(handle: i32, x: i32, y: i32, level: i32, blocking: bool): void {
    const cell = this.getOrCreate(x, y, level);
    cell.featureHandle = handle;
    cell.featureBlocking = blocking;
  }

  clearFeature(x: i32, y: i32, level: i32): void {
    const cell = this.getCell(x, y, level);
    if (cell !== null) {
      cell.featureHandle = 0;
      cell.featureBlocking = false;
    }
  }

  setActor(handle: i32, x: i32, y: i32, level: i32): bool {
    this.clearActorByHandle(handle);
    const cell = this.getOrCreate(x, y, level);
    if (cell.actorHandle != 0 && cell.actorHandle != handle) {
      return false;
    }
    if (cell.surfaceId == 0) {
      return false;
    }
    if (cell.featureBlocking) {
      return false;
    }
    cell.actorHandle = handle;
    return true;
  }

  clearActor(x: i32, y: i32, level: i32): void {
    const cell = this.getCell(x, y, level);
    if (cell !== null) {
      cell.actorHandle = 0;
    }
  }

  clearActorByHandle(handle: i32): void {
    if (handle == 0) return;
    for (let i = 0, len = this.cells.length; i < len; i++) {
      const cell = unchecked(this.cells[i]);
      if (cell.actorHandle == handle) {
        cell.actorHandle = 0;
      }
    }
  }

  setPortal(x: i32, y: i32, level: i32, portalType: i32): bool {
    const cell = this.getOrCreate(x, y, level);
    if (cell.surfaceId == 0) {
      return false;
    }
    cell.portalType = portalType;
    return true;
  }

  getPortalType(x: i32, y: i32, level: i32): i32 {
    const cell = this.getCell(x, y, level);
    return cell === null ? 0 : cell.portalType;
  }

  clearPortal(x: i32, y: i32, level: i32): void {
    const cell = this.getCell(x, y, level);
    if (cell !== null) {
      cell.portalType = 0;
    }
  }

  findNearestPortalKey(x: i32, y: i32, level: i32, portalType: i32): i64 {
    let bestKey: i64 = -1;
    let bestDistance: i32 = i32.MAX_VALUE;
    for (let i = 0, len = this.cells.length; i < len; i++) {
      const cell = unchecked(this.cells[i]);
      if (cell.portalType != portalType) continue;
      if (cell.level != level) continue;
      const dx = cell.x - x;
      const dy = cell.y - y;
      const dist = (dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestKey = this.key(cell.x, cell.y, cell.level);
      }
    }
    return bestKey;
  }

  decodeKeyX(key: i64): i32 {
    return this.decodeComponent(key, 16);
  }

  decodeKeyY(key: i64): i32 {
    return this.decodeComponent(key, 0);
  }

  decodeKeyLevel(key: i64): i32 {
    return this.decodeComponent(key, 32);
  }

  setStair(x: i32, y: i32, level: i32, stairType: i32): bool {
    const cell = this.getOrCreate(x, y, level);
    if (cell.surfaceId == 0) {
      return false;
    }
    cell.stairType = stairType;
    return true;
  }

  getStairType(x: i32, y: i32, level: i32): i32 {
    const cell = this.getCell(x, y, level);
    return cell === null ? 0 : cell.stairType;
  }

  clearStair(x: i32, y: i32, level: i32): void {
    const cell = this.getCell(x, y, level);
    if (cell !== null) {
      cell.stairType = 0;
    }
  }

  isEnterable(x: i32, y: i32, level: i32): bool {
    const cell = this.getCell(x, y, level);
    if (cell === null) return false;
    if (cell.surfaceId == 0) return false;
    if (cell.featureBlocking) return false;
    if (cell.actorHandle != 0) return false;
    return true;
  }

  private key(x: i32, y: i32, level: i32): i64 {
    return ((<i64>level & 0xFFFF) << 32) | ((<i64>x & 0xFFFF) << 16) | (<i64>y & 0xFFFF);
  }

  private decodeComponent(key: i64, shift: i32): i32 {
    const raw = <i32>((key >> shift) & 0xFFFF);
    return (raw << 16) >> 16;
  }

  verifySurfacePath(startX: i32, startY: i32, endX: i32, endY: i32, level: i32): bool {
    const start = this.getCell(startX, startY, level);
    const goal = this.getCell(endX, endY, level);
    if (start === null || goal === null) return false;
    if (start.surfaceId == 0 || goal.surfaceId == 0) return false;

    const queueX = new Array<i32>();
    const queueY = new Array<i32>();
    const visitedKeys = new Array<i64>();

    queueX.push(startX);
    queueY.push(startY);
    visitedKeys.push(this.key(startX, startY, level));

    let head = 0;
    while (head < queueX.length) {
      const x = unchecked(queueX[head]);
      const y = unchecked(queueY[head]);
      head += 1;

      if (x == endX && y == endY) return true;

      for (let i = 0; i < 4; i++) {
        const dx = i == 0 ? 1 : i == 1 ? -1 : 0;
        const dy = i == 2 ? 1 : i == 3 ? -1 : 0;
        const nx = x + dx;
        const ny = y + dy;
        const cell = this.getCell(nx, ny, level);
        if (cell === null || cell.surfaceId == 0) continue;
        const key = this.key(nx, ny, level);
        if (this.hasVisited(visitedKeys, key)) continue;
        visitedKeys.push(key);
        queueX.push(nx);
        queueY.push(ny);
      }
    }

    return false;
  }

  private hasVisited(list: Array<i64>, key: i64): bool {
    for (let i = 0, len = list.length; i < len; i++) {
      if (unchecked(list[i]) == key) return true;
    }
    return false;
  }
}

class ActorPool {
  private available: Array<i32> = new Array<i32>();
  private borrowed: Array<i32> = new Array<i32>();

  register(handle: i32): void {
    if (handle == 0) return;
    if (this.contains(this.available, handle)) return;
    if (this.contains(this.borrowed, handle)) return;
    this.available.push(handle);
  }

  borrow(): i32 {
    const length = this.available.length;
    if (length == 0) return 0;
    const index = length - 1;
    const handle = unchecked(this.available[index]);
    this.available.length = index;
    this.borrowed.push(handle);
    return handle;
  }

  release(handle: i32): bool {
    const idx = this.indexOf(this.borrowed, handle);
    if (idx < 0) return false;
    this.swapRemove(this.borrowed, idx);
    if (!this.contains(this.available, handle)) {
      this.available.push(handle);
    }
    return true;
  }

  availableCount(): i32 { return this.available.length; }
  borrowedCount(): i32 { return this.borrowed.length; }

  private contains(arr: Array<i32>, value: i32): bool {
    for (let i = 0, len = arr.length; i < len; i++) {
      if (unchecked(arr[i]) == value) return true;
    }
    return false;
  }

  private indexOf(arr: Array<i32>, value: i32): i32 {
    for (let i = 0, len = arr.length; i < len; i++) {
      if (unchecked(arr[i]) == value) return i;
    }
    return -1;
  }

  private swapRemove(arr: Array<i32>, index: i32): void {
    const lastIndex = arr.length - 1;
    if (index < 0 || index > lastIndex) return;
    if (index != lastIndex) {
      arr[index] = unchecked(arr[lastIndex]);
    }
    arr.length = lastIndex;
  }
}

class ActorVisitRegistry {
  private handles: Array<i32> = new Array<i32>();
  private visits: Array<Array<i64>> = new Array<Array<i64>>();

  reset(): void {
    this.handles = new Array<i32>();
    this.visits = new Array<Array<i64>>();
  }

  private makeKey(x: i32, y: i32, level: i32): i64 {
    return ((<i64>level & 0xFFFF) << 32) | ((<i64>x & 0xFFFF) << 16) | (<i64>y & 0xFFFF);
  }

  private indexOf(handle: i32): i32 {
    for (let i = 0, len = this.handles.length; i < len; i++) {
      if (unchecked(this.handles[i]) == handle) {
        return i;
      }
    }
    return -1;
  }

  private ensureBucket(handle: i32): Array<i64> {
    let index = this.indexOf(handle);
    if (index >= 0) {
      return unchecked(this.visits[index]);
    }
    this.handles.push(handle);
    const bucket = new Array<i64>();
    this.visits.push(bucket);
    index = this.handles.length - 1;
    return unchecked(this.visits[index]);
  }

  record(handle: i32, x: i32, y: i32, level: i32): void {
    if (handle == 0) return;
    const bucket = this.ensureBucket(handle);
    const key = this.makeKey(x, y, level);
    for (let i = 0, len = bucket.length; i < len; i++) {
      if (unchecked(bucket[i]) == key) {
        return;
      }
    }
    bucket.push(key);
  }

  hasVisited(handle: i32, x: i32, y: i32, level: i32): bool {
    if (handle == 0) return false;
    const index = this.indexOf(handle);
    if (index < 0) return false;
    const bucket = unchecked(this.visits[index]);
    const key = this.makeKey(x, y, level);
    for (let i = 0, len = bucket.length; i < len; i++) {
      if (unchecked(bucket[i]) == key) {
        return true;
      }
    }
    return false;
  }
}

class ConfiguratorContext {
  surfacePool: SurfacePool | null = null;
  state: ConfiguratorState = ConfiguratorState.Plan;
  surfaceLedger: Array<SurfacePlacementEntry> = new Array<SurfacePlacementEntry>();
  actorLedger: Array<ActorPlacementEntry> = new Array<ActorPlacementEntry>();
  map: LevelMap = new LevelMap();
  actorPool: ActorPool = new ActorPool();
  lastObservationSweepCount: i32 = 0;
  dispatchEntries: Array<string> = new Array<string>();
  solverHandle: i32 = 0;
  aiuVisits: ActorVisitRegistry = new ActorVisitRegistry();

  aiuCatalog: Array<i32> = new Array<i32>();
  aiuModuleKinds: Array<i32> = new Array<i32>();
  aiuBudgetBase: Array<i32> = new Array<i32>();
  aiuBudgetUpkeep: Array<i32> = new Array<i32>();
  aiuPrereqMinStamina: Array<i32> = new Array<i32>();
  aiuPrereqRequiresEnhanced: Array<i32> = new Array<i32>();
  actorAiuHandles: Array<i32> = new Array<i32>();
  actorAiuAssignments: Array<i32> = new Array<i32>();
  actorCultivationHandles: Array<i32> = new Array<i32>();
  actorCultivationTicks: Array<i32> = new Array<i32>();
  actorVulnerabilityHandles: Array<i32> = new Array<i32>();
  actorVulnerabilityTicks: Array<i32> = new Array<i32>();
  actorPatrolHandles: Array<i32> = new Array<i32>();
  actorPatrolIndices: Array<i32> = new Array<i32>();
  directorBroadcastDx: i32 = 0;
  directorBroadcastDy: i32 = 0;
  directorBroadcastTick: i32 = -1;
  directorIntentActors: Array<i32> = new Array<i32>();
  directorIntentDx: Array<i32> = new Array<i32>();
  directorIntentDy: Array<i32> = new Array<i32>();
  directorIntentTick: Array<i32> = new Array<i32>();
  currentTickSeed: i32 = 0;

  reset(): void {
    this.surfaceLedger = new Array<SurfacePlacementEntry>();
    this.actorLedger = new Array<ActorPlacementEntry>();
    this.map = new LevelMap();
    this.actorPool = new ActorPool();
    this.lastObservationSweepCount = 0;
    this.dispatchEntries = new Array<string>();
    this.aiuCatalog = new Array<i32>();
    this.aiuModuleKinds = new Array<i32>();
    this.aiuBudgetBase = new Array<i32>();
   this.aiuBudgetUpkeep = new Array<i32>();
    this.aiuPrereqMinStamina = new Array<i32>();
    this.aiuPrereqRequiresEnhanced = new Array<i32>();
    this.actorAiuHandles = new Array<i32>();
    this.actorAiuAssignments = new Array<i32>();
    this.actorCultivationHandles = new Array<i32>();
    this.actorCultivationTicks = new Array<i32>();
    this.actorVulnerabilityHandles = new Array<i32>();
    this.actorVulnerabilityTicks = new Array<i32>();
    this.actorPatrolHandles = new Array<i32>();
    this.actorPatrolIndices = new Array<i32>();
    this.state = ConfiguratorState.Plan;
    this.aiuVisits.reset();
    this.directorBroadcastDx = 0;
    this.directorBroadcastDy = 0;
    this.directorBroadcastTick = -1;
    this.directorIntentActors = new Array<i32>();
    this.directorIntentDx = new Array<i32>();
    this.directorIntentDy = new Array<i32>();
    this.directorIntentTick = new Array<i32>();
    this.currentTickSeed = 0;
  }

  updateActorPlacement(handle: i32, x: i32, y: i32, level: i32): void {
    for (let i = 0, len = this.actorLedger.length; i < len; i++) {
      const entry = unchecked(this.actorLedger[i]);
      if (entry.handle == handle) {
        entry.x = x;
        entry.y = y;
        entry.level = level;
        this.aiuVisits.record(handle, x, y, level);
        return;
      }
    }
    this.aiuVisits.record(handle, x, y, level);
  }

  private findAiuIndex(id: i32): i32 {
    for (let i = 0, len = this.aiuCatalog.length; i < len; i++) {
      if (unchecked(this.aiuCatalog[i]) == id) {
        return i;
      }
    }
    return -1;
  }

  private findHandleIndex(handles: Array<i32>, handle: i32): i32 {
    for (let i = 0, len = handles.length; i < len; i++) {
      if (unchecked(handles[i]) == handle) {
        return i;
      }
    }
    return -1;
  }

  private getMappedValue(handles: Array<i32>, values: Array<i32>, handle: i32): i32 {
    const index = this.findHandleIndex(handles, handle);
    return index >= 0 ? unchecked(values[index]) : 0;
  }

  private setMappedValue(handles: Array<i32>, values: Array<i32>, handle: i32, value: i32): void {
    const index = this.findHandleIndex(handles, handle);
    if (index >= 0) {
      values[index] = value;
      return;
    }
    handles.push(handle);
    values.push(value);
  }

  incrementCultivationTicks(handle: i32): i32 {
    const next = this.getCultivationTicks(handle) + 1;
    this.setMappedValue(this.actorCultivationHandles, this.actorCultivationTicks, handle, next);
    return next;
  }

  resetCultivationTicks(handle: i32): i32 {
    const current = this.getCultivationTicks(handle);
    if (current > 0) {
      this.setMappedValue(this.actorCultivationHandles, this.actorCultivationTicks, handle, 0);
    }
    return current;
  }

  getCultivationTicks(handle: i32): i32 {
    return this.getMappedValue(this.actorCultivationHandles, this.actorCultivationTicks, handle);
  }

  setVulnerabilityTicks(handle: i32, ticks: i32): void {
    const value = ticks < 0 ? 0 : ticks;
    this.setMappedValue(this.actorVulnerabilityHandles, this.actorVulnerabilityTicks, handle, value);
  }

  getVulnerabilityTicks(handle: i32): i32 {
    return this.getMappedValue(this.actorVulnerabilityHandles, this.actorVulnerabilityTicks, handle);
  }

  decrementVulnerabilityCounters(): void {
    for (let i = 0, len = this.actorVulnerabilityTicks.length; i < len; i++) {
      const remaining = unchecked(this.actorVulnerabilityTicks[i]);
      if (remaining > 0) {
        unchecked(this.actorVulnerabilityTicks[i] = remaining - 1);
      }
    }
  }

  getPatrolIndex(handle: i32): i32 {
    return this.getMappedValue(this.actorPatrolHandles, this.actorPatrolIndices, handle);
  }

  setPatrolIndex(handle: i32, index: i32): void {
    let normalized = index;
    if (normalized < 0) {
      normalized = 0;
    }
    this.setMappedValue(this.actorPatrolHandles, this.actorPatrolIndices, handle, normalized);
  }

  registerAiu(id: i32): bool {
    return this.registerAiuTemplate(id, 0, 0, 0);
  }

  registerAiuTemplate(id: i32, moduleKind: i32, baseCost: i32, upkeepCost: i32): bool {
    if (id == 0) return false;
    const index = this.findAiuIndex(id);
    if (index >= 0) {
      this.aiuModuleKinds[index] = moduleKind;
      this.aiuBudgetBase[index] = baseCost;
      this.aiuBudgetUpkeep[index] = upkeepCost;
      return false;
    }
    this.aiuCatalog.push(id);
    this.aiuModuleKinds.push(moduleKind);
    this.aiuBudgetBase.push(baseCost);
    this.aiuBudgetUpkeep.push(upkeepCost);
    this.aiuPrereqMinStamina.push(0);
    this.aiuPrereqRequiresEnhanced.push(0);
    return true;
  }

  isAiuRegistered(id: i32): bool {
    if (id == 0) return false;
    return this.findAiuIndex(id) >= 0;
  }

  setActorAiu(handle: i32, aiuId: i32): void {
    for (let i = 0, len = this.actorAiuHandles.length; i < len; i++) {
      if (unchecked(this.actorAiuHandles[i]) == handle) {
        this.actorAiuAssignments[i] = aiuId;
        return;
      }
    }
    this.actorAiuHandles.push(handle);
    this.actorAiuAssignments.push(aiuId);
  }

  getActorAiu(handle: i32): i32 {
    for (let i = 0, len = this.actorAiuHandles.length; i < len; i++) {
      if (unchecked(this.actorAiuHandles[i]) == handle) {
        return unchecked(this.actorAiuAssignments[i]);
      }
    }
    return 0;
  }

  getAiuModuleKind(id: i32): i32 {
    const index = this.findAiuIndex(id);
    return index >= 0 ? unchecked(this.aiuModuleKinds[index]) : 0;
  }

  getAiuBaseCost(id: i32): i32 {
    const index = this.findAiuIndex(id);
    return index >= 0 ? unchecked(this.aiuBudgetBase[index]) : 0;
  }

  getAiuUpkeepCost(id: i32): i32 {
    const index = this.findAiuIndex(id);
    return index >= 0 ? unchecked(this.aiuBudgetUpkeep[index]) : 0;
  }

  setAiuPrerequisites(id: i32, minStamina: i32, requiresEnhancedObservation: bool): void {
    const index = this.findAiuIndex(id);
    if (index < 0) return;
    const staminaValue = minStamina < 0 ? 0 : minStamina;
    this.aiuPrereqMinStamina[index] = staminaValue;
    this.aiuPrereqRequiresEnhanced[index] = requiresEnhancedObservation ? 1 : 0;
  }

  getAiuMinStamina(id: i32): i32 {
    const index = this.findAiuIndex(id);
    return index >= 0 ? unchecked(this.aiuPrereqMinStamina[index]) : 0;
  }

  requiresEnhancedObservation(id: i32): bool {
    const index = this.findAiuIndex(id);
    if (index < 0) return false;
    return unchecked(this.aiuPrereqRequiresEnhanced[index]) != 0;
  }

  setDirectorIntent(actorHandle: i32, dx: i32, dy: i32, tick: i32): void {
    if (actorHandle == 0) {
      this.directorBroadcastDx = dx;
      this.directorBroadcastDy = dy;
      this.directorBroadcastTick = tick;
      return;
    }
    for (let i = 0, len = this.directorIntentActors.length; i < len; i++) {
      if (unchecked(this.directorIntentActors[i]) == actorHandle) {
        this.directorIntentDx[i] = dx;
        this.directorIntentDy[i] = dy;
        this.directorIntentTick[i] = tick;
        return;
      }
    }
    this.directorIntentActors.push(actorHandle);
    this.directorIntentDx.push(dx);
    this.directorIntentDy.push(dy);
    this.directorIntentTick.push(tick);
  }

}

export {
  ConfiguratorState,
  SurfacePlacementEntry,
  ActorPlacementEntry,
  LevelMap,
  ActorPool,
  ConfiguratorContext,
  ActorVisitRegistry,
};
