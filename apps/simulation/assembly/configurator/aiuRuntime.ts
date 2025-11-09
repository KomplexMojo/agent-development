import { ActorPlacementEntry, ActorVisitRegistry, LevelMap } from "./contracts";
import {
  actor_vitals_get_stamina_current,
  actor_vitals_get_stamina_max,
  actor_health_get_current,
  actor_health_get_max,
  actor_mana_get_current,
  actor_mana_get_max,
  actor_durability_get_current,
  actor_durability_get_max,
  actor_resources_cultivate_tick,
} from "../actor/actor";
import {
  solver_adapter_solve_reachability,
  solver_adapter_solve_guard_radius,
  solver_adapter_solve_waypoint,
  solver_adapter_result_step_count,
  solver_adapter_result_step_get_dx,
  solver_adapter_result_step_get_dy,
  solver_adapter_result_step_get_level,
  solver_result_code_sat,
  solver_result_code_unimplemented,
} from "./solver/adapter";
import { SolverQuerySchema } from "./solver/contracts";

export const AIU_INTENT_MODE_NONE: i32 = 0;
export const AIU_INTENT_MODE_CULTIVATE: i32 = 1;
export const AIU_INTENT_MODE_PATROL: i32 = 2;

export class AiuIntent {
  constructor(
    public dx: i32,
    public dy: i32,
    public solverCode: i32 = 0,
    public mode: i32 = AIU_INTENT_MODE_NONE,
    public aux: i32 = 0,
  ) {}
}

export class AiuSolverRequest {
  constructor(
    public readonly schema: SolverQuerySchema,
    public targetX: i32 = 0,
    public targetY: i32 = 0,
    public level: i32 = 0,
    public maxSteps: i32 = 0,
    public anchorX: i32 = 0,
    public anchorY: i32 = 0,
    public radius: i32 = 0,
    public waypointCount: i32 = 0,
    public hintDx: i32 = 0,
    public hintDy: i32 = 0,
  ) {}

  static reachability(targetX: i32, targetY: i32, level: i32, maxSteps: i32, hintDx: i32, hintDy: i32): AiuSolverRequest {
    return new AiuSolverRequest(
      SolverQuerySchema.Reachability,
      targetX,
      targetY,
      level,
      maxSteps,
      0,
      0,
      0,
      0,
      hintDx,
      hintDy,
    );
  }

  static guardRadius(anchorX: i32, anchorY: i32, level: i32, radius: i32, maxSteps: i32): AiuSolverRequest {
    return new AiuSolverRequest(
      SolverQuerySchema.GuardRadius,
      0,
      0,
      level,
      maxSteps,
      anchorX,
      anchorY,
      radius,
      0,
      0,
      0,
    );
  }

  static waypoint(level: i32, waypointCount: i32, hintDx: i32, hintDy: i32): AiuSolverRequest {
    return new AiuSolverRequest(
      SolverQuerySchema.Waypoint,
      0,
      0,
      level,
      0,
      0,
      0,
      0,
      waypointCount,
      hintDx,
      hintDy,
    );
  }
}

export class AiuSolverResult {
  constructor(
    public readonly schema: SolverQuerySchema,
    public code: i32 = solver_result_code_unimplemented,
    public stepCount: i32 = 0,
    public stepDx: i32 = 0,
    public stepDy: i32 = 0,
    public stepLevel: i32 = 0,
  ) {}
}

export class AiuEvaluationContext {
  constructor(
    public readonly map: LevelMap,
    public readonly placement: ActorPlacementEntry,
    public readonly tickSeed: i32,
    public readonly aiuId: i32,
    public readonly solverHandle: i32,
    public readonly actorHandle: i32,
    public readonly visits: ActorVisitRegistry | null = null,
    public readonly patrolIndex: i32 = 0,
  ) {}

  lastSolverCode: i32 = 0;

  recordSolverCode(code: i32): void {
    this.lastSolverCode = code;
  }

  currentStamina(): i32 {
    if (this.actorHandle == 0) return 0;
    return actor_vitals_get_stamina_current(this.actorHandle);
  }

  hasVisited(x: i32, y: i32, level: i32): bool {
    if (this.visits === null) return false;
    const registry = changetype<ActorVisitRegistry>(this.visits);
    return registry.hasVisited(this.actorHandle, x, y, level);
  }

  invokeSolver(request: AiuSolverRequest): AiuSolverResult {
    if (this.solverHandle == 0) {
      this.recordSolverCode(solver_result_code_unimplemented);
      return new AiuSolverResult(request.schema, solver_result_code_unimplemented);
    }

    let result: AiuSolverResult;

    switch (request.schema) {
      case SolverQuerySchema.Reachability: {
        const code = solver_adapter_solve_reachability(
          this.solverHandle,
          this.placement.x,
          this.placement.y,
          request.targetX,
          request.targetY,
          request.level,
          request.maxSteps,
        );
        result = new AiuSolverResult(request.schema, code);
        if (code == solver_result_code_sat) {
          const steps = solver_adapter_result_step_count(this.solverHandle);
          result.stepCount = steps;
          if (steps > 0) {
            result.stepDx = solver_adapter_result_step_get_dx(this.solverHandle, 0);
            result.stepDy = solver_adapter_result_step_get_dy(this.solverHandle, 0);
            result.stepLevel = solver_adapter_result_step_get_level(this.solverHandle, 0);
          } else {
            result.stepDx = request.hintDx;
            result.stepDy = request.hintDy;
            result.stepLevel = this.placement.level;
          }
        } else {
          result.stepDx = request.hintDx;
          result.stepDy = request.hintDy;
          result.stepLevel = this.placement.level;
        }
        break;
      }

      case SolverQuerySchema.GuardRadius: {
        const code = solver_adapter_solve_guard_radius(
          this.solverHandle,
          request.anchorX,
          request.anchorY,
          request.level,
          request.radius,
          request.maxSteps,
        );
        result = new AiuSolverResult(request.schema, code);
        result.stepDx = request.hintDx;
        result.stepDy = request.hintDy;
        result.stepLevel = this.placement.level;
        break;
      }

      case SolverQuerySchema.Waypoint: {
        const code = solver_adapter_solve_waypoint(
          this.solverHandle,
          this.placement.x,
          this.placement.y,
          request.level,
          request.waypointCount,
        );
        result = new AiuSolverResult(request.schema, code);
        result.stepDx = request.hintDx;
        result.stepDy = request.hintDy;
        result.stepLevel = this.placement.level;
        break;
      }

      default: {
        result = new AiuSolverResult(request.schema, solver_result_code_unimplemented);
        result.stepDx = request.hintDx;
        result.stepDy = request.hintDy;
        result.stepLevel = this.placement.level;
        break;
      }
    }

    this.recordSolverCode(result.code);
    return result;
  }

  needsCultivation(): bool {
    const handle = this.actorHandle;
    if (handle == 0) return false;
    if (actor_vitals_get_stamina_current(handle) < actor_vitals_get_stamina_max(handle)) return true;
    if (actor_health_get_current(handle) < actor_health_get_max(handle)) return true;
    if (actor_mana_get_current(handle) < actor_mana_get_max(handle)) return true;
    if (actor_durability_get_current(handle) < actor_durability_get_max(handle)) return true;
    return false;
  }
}

export enum AiuFailureReason {
  Blocked = 1,
  Unsat = 2,
  Error = 3,
}

export abstract class AiuModule {
  constructor(public readonly id: i32, public readonly name: string = "") {}

  evaluate(context: AiuEvaluationContext): AiuIntent | null {
    const request = this.prepare(context);
    if (request !== null) {
      const result = context.invokeSolver(request);
      const intent = this.interpret(context, request, result);
      if (intent !== null && intent.solverCode == 0) {
        intent.solverCode = result.code;
      }
      return intent;
    }

    const fallback = this.planWithoutSolver(context);
    if (fallback !== null && fallback.solverCode == 0) {
      fallback.solverCode = context.lastSolverCode;
    }
    return fallback;
  }

  protected prepare(_context: AiuEvaluationContext): AiuSolverRequest | null {
    return null;
  }

  protected interpret(
    _context: AiuEvaluationContext,
    _request: AiuSolverRequest,
    _result: AiuSolverResult,
  ): AiuIntent | null {
    return null;
  }

  protected planWithoutSolver(_context: AiuEvaluationContext): AiuIntent | null {
    return null;
  }

  shouldFallback(_reason: AiuFailureReason): bool {
    return true;
  }
}

const MODULE_ID_RANDOM_WALK_DEFAULT: i32 = 0;
const MODULE_ID_RANDOM_WALK_TEMPLATE: i32 = 1000;
const MODULE_ID_EXPLORE_DEFAULT: i32 = 1001;
const MODULE_ID_GUARD_RADIUS_DEFAULT: i32 = 1002;
const MODULE_ID_WAYPOINT_DEFAULT: i32 = 1003;
const MODULE_ID_FIND_EXIT_DEFAULT: i32 = 1101;
const MODULE_ID_DEFEND_EXIT_DEFAULT: i32 = 1201;
const MODULE_ID_PATROL_CORRIDOR_DEFAULT: i32 = 1301;
export const MODULE_ID_CULTIVATION_DEFAULT: i32 = 1401;

const registryIds = new Array<i32>();
const registryModules = new Array<AiuModule>();
let initialized = false;

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;
  registryIds.push(MODULE_ID_RANDOM_WALK_DEFAULT);
  registryModules.push(new RandomWalkAiu(MODULE_ID_RANDOM_WALK_DEFAULT, "random_walk_default"));
  registryIds.push(MODULE_ID_RANDOM_WALK_TEMPLATE);
  registryModules.push(new RandomWalkAiu(MODULE_ID_RANDOM_WALK_TEMPLATE, "random_walk_module"));
  registryIds.push(MODULE_ID_EXPLORE_DEFAULT);
  registryModules.push(new ExploreAiu(MODULE_ID_EXPLORE_DEFAULT, "explore_default"));
  registryIds.push(MODULE_ID_GUARD_RADIUS_DEFAULT);
  registryModules.push(new GuardRadiusAiu(MODULE_ID_GUARD_RADIUS_DEFAULT, "guard_radius_default"));
  registryIds.push(MODULE_ID_WAYPOINT_DEFAULT);
  registryModules.push(new WaypointAiu(MODULE_ID_WAYPOINT_DEFAULT, "waypoint_default"));
  registryIds.push(MODULE_ID_FIND_EXIT_DEFAULT);
  registryModules.push(new FindExitAiu(MODULE_ID_FIND_EXIT_DEFAULT, "find_exit_default"));
  registryIds.push(MODULE_ID_DEFEND_EXIT_DEFAULT);
  registryModules.push(new DefendExitAiu(MODULE_ID_DEFEND_EXIT_DEFAULT, "defend_exit_default"));
  registryIds.push(MODULE_ID_PATROL_CORRIDOR_DEFAULT);
  registryModules.push(new PatrolCorridorAiu(MODULE_ID_PATROL_CORRIDOR_DEFAULT, "patrol_corridor_default"));
  registryIds.push(MODULE_ID_CULTIVATION_DEFAULT);
  registryModules.push(new CultivationAiu(MODULE_ID_CULTIVATION_DEFAULT, "cultivation_default"));
}

export function registerAiuModule(module: AiuModule): void {
  ensureInitialized();
  const id = module.id;
  for (let i = 0, len = registryIds.length; i < len; i++) {
    if (unchecked(registryIds[i]) == id) {
      unchecked(registryModules[i] = module);
      return;
    }
  }
  registryIds.push(id);
  registryModules.push(module);
}

export function getAiuModule(id: i32): AiuModule {
  ensureInitialized();
  for (let i = 0, len = registryIds.length; i < len; i++) {
    if (unchecked(registryIds[i]) == id) {
      return unchecked(registryModules[i]);
    }
  }
  return unchecked(registryModules[0]);
}

class RandomWalkAiu extends AiuModule {
  private static readonly DIRECTIONS: StaticArray<i32> = [
    1, 0,
    0, 1,
    -1, 0,
    0, -1,
    1, 1,
    -1, 1,
    -1, -1,
    1, -1,
  ];

  protected planWithoutSolver(context: AiuEvaluationContext): AiuIntent | null {
    return RandomWalkAiu.pickIntent(context);
  }

  static pickIntent(context: AiuEvaluationContext): AiuIntent | null {
    const placement = context.placement;
    const map = context.map;
    const stride = 2;
    const count = RandomWalkAiu.DIRECTIONS.length / stride;
    if (count == 0) return new AiuIntent(0, 0);

    let seed = context.aiuId ^ (placement.handle << 1) ^ context.tickSeed;
    if (seed < 0) seed = -seed;
    const rotation = count > 0 ? seed % count : 0;

    for (let i = 0; i < count; i++) {
      const index = (rotation + i) % count;
      const base = index * stride;
      const dx = unchecked(RandomWalkAiu.DIRECTIONS[base]);
      const dy = unchecked(RandomWalkAiu.DIRECTIONS[base + 1]);
      if (dx == 0 && dy == 0) continue;
      const targetX = placement.x + dx;
      const targetY = placement.y + dy;
      if (map.isEnterable(targetX, targetY, placement.level)) {
        return new AiuIntent(dx, dy);
      }
    }

    return new AiuIntent(0, 0);
  }
}

export class ExploreAiu extends AiuModule {
  private static readonly CARDINALS: StaticArray<i32> = [
    1, 0,
    0, 1,
    -1, 0,
    0, -1,
  ];

  protected prepare(context: AiuEvaluationContext): AiuSolverRequest | null {
    const placement = context.placement;
    const stride = 2;
    const count = ExploreAiu.CARDINALS.length / stride;
    if (count == 0) return null;

    let rotationSeed = context.tickSeed ^ (context.actorHandle << 2) ^ this.id;
    if (rotationSeed < 0) rotationSeed = -rotationSeed;
    const rotation = count > 0 ? rotationSeed % count : 0;

    let fallbackRequest: AiuSolverRequest | null = null;

    for (let i = 0; i < count; i++) {
      const index = (rotation + i) % count;
      const base = index * stride;
      const dx = unchecked(ExploreAiu.CARDINALS[base]);
      const dy = unchecked(ExploreAiu.CARDINALS[base + 1]);
      if (dx == 0 && dy == 0) continue;

      const targetX = placement.x + dx;
      const targetY = placement.y + dy;
      if (!context.map.isEnterable(targetX, targetY, placement.level)) {
        continue;
      }

      const request = AiuSolverRequest.reachability(
        targetX,
        targetY,
        placement.level,
        this.computeBudget(dx, dy, context),
        dx,
        dy,
      );

      if (!context.hasVisited(targetX, targetY, placement.level)) {
        return request;
      }

      if (fallbackRequest === null) {
        fallbackRequest = request;
      }
    }

    return fallbackRequest;
  }

  protected interpret(
    context: AiuEvaluationContext,
    request: AiuSolverRequest,
    result: AiuSolverResult,
  ): AiuIntent | null {
    if (result.code != solver_result_code_sat) {
      if (!this.shouldFallback(AiuFailureReason.Unsat)) {
        return null;
      }
      return this.planWithoutSolver(context);
    }

    let dx = result.stepDx;
    let dy = result.stepDy;
    if (dx == 0 && dy == 0) {
      dx = request.hintDx;
      dy = request.hintDy;
    }
    return new AiuIntent(dx, dy, result.code);
  }

  protected planWithoutSolver(context: AiuEvaluationContext): AiuIntent | null {
    const fallback = RandomWalkAiu.pickIntent(context);
    if (fallback === null) return null;
    fallback.solverCode = context.lastSolverCode;
    return fallback;
  }

  private computeBudget(dx: i32, dy: i32, context: AiuEvaluationContext): i32 {
    const absDx = dx < 0 ? -dx : dx;
    const absDy = dy < 0 ? -dy : dy;
    const distance = absDx + absDy;
    const stamina = context.currentStamina();
    if (stamina > 0 && stamina < distance) {
      return stamina;
    }
    return distance <= 0 ? 1 : distance;
  }
}

export class GuardRadiusAiu extends AiuModule {
  protected prepare(context: AiuEvaluationContext): AiuSolverRequest | null {
    const placement = context.placement;
    const radius: i32 = 1;
    const maxSteps: i32 = 1;
    return AiuSolverRequest.guardRadius(placement.x, placement.y, placement.level, radius, maxSteps);
  }

  protected interpret(
    _context: AiuEvaluationContext,
    _request: AiuSolverRequest,
    result: AiuSolverResult,
  ): AiuIntent | null {
    // Guarding currently holds position; just surface solver verdict.
    return new AiuIntent(0, 0, result.code);
  }

  protected planWithoutSolver(context: AiuEvaluationContext): AiuIntent | null {
    // Default to holding position when solver cannot assist.
    const intent = new AiuIntent(0, 0, context.lastSolverCode);
    return intent;
  }
}

export class WaypointAiu extends AiuModule {
  protected prepare(context: AiuEvaluationContext): AiuSolverRequest | null {
    const hintDx = 0;
    const hintDy = 0;
    return AiuSolverRequest.waypoint(context.placement.level, 1, hintDx, hintDy);
  }

  protected interpret(
    _context: AiuEvaluationContext,
    _request: AiuSolverRequest,
    result: AiuSolverResult,
  ): AiuIntent | null {
    return new AiuIntent(0, 0, result.code);
  }

  protected planWithoutSolver(context: AiuEvaluationContext): AiuIntent | null {
    return new AiuIntent(0, 0, context.lastSolverCode);
  }
}

class CultivationAiu extends AiuModule {
  evaluate(context: AiuEvaluationContext): AiuIntent | null {
    if (!context.needsCultivation()) {
      return null;
    }
    return new AiuIntent(0, 0, context.lastSolverCode, AIU_INTENT_MODE_CULTIVATE);
  }
}

const PORTAL_TYPE_ENTRANCE: i32 = 1;
const PORTAL_TYPE_EXIT: i32 = 2;

class FindExitAiu extends AiuModule {
  protected prepare(context: AiuEvaluationContext): AiuSolverRequest | null {
    const key = context.map.findNearestPortalKey(
      context.placement.x,
      context.placement.y,
      context.placement.level,
      PORTAL_TYPE_EXIT,
    );
    if (key < 0) return null;

    const targetX = context.map.decodeKeyX(key);
    const targetY = context.map.decodeKeyY(key);
    const targetLevel = context.map.decodeKeyLevel(key);
    const dx = targetX - context.placement.x;
    const dy = targetY - context.placement.y;
    if (dx == 0 && dy == 0 && targetLevel == context.placement.level) {
      return null;
    }
    const distance = manhattan(dx, dy);
    if (distance <= 0) return null;
    const budget = this.computeBudget(distance, context);
    const hintDx = clampStepComponent(dx);
    const hintDy = clampStepComponent(dy);
    return AiuSolverRequest.reachability(targetX, targetY, targetLevel, budget, hintDx, hintDy);
  }

  protected interpret(
    context: AiuEvaluationContext,
    request: AiuSolverRequest,
    result: AiuSolverResult,
  ): AiuIntent | null {
    if (result.code != solver_result_code_sat) {
      return this.planWithFallback(context, result.code);
    }

    let dx = result.stepDx;
    let dy = result.stepDy;
    if (dx == 0 && dy == 0) {
      dx = request.hintDx;
      dy = request.hintDy;
    }
    if (dx == 0 && dy == 0) {
      return this.planWithFallback(context, result.code);
    }

    dx = clampStepComponent(dx);
    dy = clampStepComponent(dy);

    if (dx != 0 && dy != 0) {
      const absDx = dx < 0 ? -dx : dx;
      const absDy = dy < 0 ? -dy : dy;
      if (absDx >= absDy) {
        dy = 0;
      } else {
        dx = 0;
      }
    }

    if (dx == 0 && dy == 0) {
      return this.planWithFallback(context, result.code);
    }

    return new AiuIntent(dx, dy, result.code);
  }

  protected planWithoutSolver(context: AiuEvaluationContext): AiuIntent | null {
    return this.planWithFallback(context, context.lastSolverCode);
  }

  private planWithFallback(context: AiuEvaluationContext, solverCode: i32): AiuIntent | null {
    const fallback = RandomWalkAiu.pickIntent(context);
    if (fallback !== null) {
      fallback.solverCode = solverCode != 0 ? solverCode : context.lastSolverCode;
    }
    return fallback;
  }

  private computeBudget(distance: i32, context: AiuEvaluationContext): i32 {
    if (distance <= 0) {
      return 1;
    }
    const stamina = context.currentStamina();
    if (stamina <= 0) {
      return 0;
    }
    if (stamina > 0 && stamina < distance) {
      return stamina;
    }
    return distance;
  }
}

class DefendExitAiu extends AiuModule {
  protected prepare(context: AiuEvaluationContext): AiuSolverRequest | null {
    const key = context.map.findNearestPortalKey(
      context.placement.x,
      context.placement.y,
      context.placement.level,
      PORTAL_TYPE_EXIT,
    );
    if (key < 0) return null;
    const anchorX = context.map.decodeKeyX(key);
    const anchorY = context.map.decodeKeyY(key);
    const anchorLevel = context.map.decodeKeyLevel(key);
    const radius: i32 = 1;
    const maxSteps: i32 = 1;
    return AiuSolverRequest.guardRadius(anchorX, anchorY, anchorLevel, radius, maxSteps);
  }

  protected interpret(
    _context: AiuEvaluationContext,
    _request: AiuSolverRequest,
    result: AiuSolverResult,
  ): AiuIntent | null {
    return new AiuIntent(0, 0, result.code);
  }

  protected planWithoutSolver(context: AiuEvaluationContext): AiuIntent | null {
    return new AiuIntent(0, 0, context.lastSolverCode);
  }
}

const PATROL_SEQUENCE: StaticArray<i32> = [
  1, 0,
  0, 1,
  -1, 0,
  0, -1,
];
const PATROL_SEQUENCE_LENGTH: i32 = PATROL_SEQUENCE.length / 2;

class PatrolCorridorAiu extends AiuModule {
  protected prepare(context: AiuEvaluationContext): AiuSolverRequest | null {
    const index = this.findAvailableDirectionIndex(context);
    let hintDx: i32 = 0;
    let hintDy: i32 = 0;
    if (index >= 0) {
      const base = index * 2;
      hintDx = clampStepComponent(unchecked(PATROL_SEQUENCE[base]));
      hintDy = clampStepComponent(unchecked(PATROL_SEQUENCE[base + 1]));
    }
    return AiuSolverRequest.waypoint(context.placement.level, PATROL_SEQUENCE_LENGTH, hintDx, hintDy);
  }

  protected interpret(
    context: AiuEvaluationContext,
    request: AiuSolverRequest,
    result: AiuSolverResult,
  ): AiuIntent | null {
    if (result.code != solver_result_code_sat) {
      return this.planFromSequence(context, result.code);
    }

    let dx = result.stepDx;
    let dy = result.stepDy;
    if (dx == 0 && dy == 0) {
      dx = request.hintDx;
      dy = request.hintDy;
    }
    if (dx == 0 && dy == 0) {
      return this.planFromSequence(context, result.code);
    }

    dx = clampStepComponent(dx);
    dy = clampStepComponent(dy);
    if (dx != 0 && dy != 0) {
      const absDx = dx < 0 ? -dx : dx;
      const absDy = dy < 0 ? -dy : dy;
      if (absDx >= absDy) {
        dy = 0;
      } else {
        dx = 0;
      }
    }

    const currentIndex = this.directionIndex(dx, dy);
    if (currentIndex < 0) {
      return this.planFromSequence(context, result.code);
    }
    const nextIndex = (currentIndex + 1) % PATROL_SEQUENCE_LENGTH;
    return new AiuIntent(dx, dy, result.code, AIU_INTENT_MODE_PATROL, nextIndex);
  }

  protected planWithoutSolver(context: AiuEvaluationContext): AiuIntent | null {
    return this.planFromSequence(context, context.lastSolverCode);
  }

  private planFromSequence(context: AiuEvaluationContext, solverCode: i32): AiuIntent | null {
    const index = this.findAvailableDirectionIndex(context);
    const normalized = this.normalizeIndex(context.patrolIndex);
    if (index >= 0) {
      const base = index * 2;
      const dx = unchecked(PATROL_SEQUENCE[base]);
      const dy = unchecked(PATROL_SEQUENCE[base + 1]);
      const nextIndex = (index + 1) % PATROL_SEQUENCE_LENGTH;
      return new AiuIntent(dx, dy, solverCode, AIU_INTENT_MODE_PATROL, nextIndex);
    }
    return new AiuIntent(0, 0, solverCode, AIU_INTENT_MODE_PATROL, normalized);
  }

  private findAvailableDirectionIndex(context: AiuEvaluationContext): i32 {
    if (PATROL_SEQUENCE_LENGTH <= 0) return -1;
    const startIndex = this.normalizeIndex(context.patrolIndex);
    const level = context.placement.level;
    for (let offset = 0; offset < PATROL_SEQUENCE_LENGTH; offset++) {
      const dirIndex = (startIndex + offset) % PATROL_SEQUENCE_LENGTH;
      const base = dirIndex * 2;
      const dx = unchecked(PATROL_SEQUENCE[base]);
      const dy = unchecked(PATROL_SEQUENCE[base + 1]);
      const targetX = context.placement.x + dx;
      const targetY = context.placement.y + dy;
      if (context.map.isEnterable(targetX, targetY, level)) {
        return dirIndex;
      }
    }
    return -1;
  }

  private normalizeIndex(index: i32): i32 {
    if (PATROL_SEQUENCE_LENGTH <= 0) return 0;
    if (index <= 0) return 0;
    let normalized = index % PATROL_SEQUENCE_LENGTH;
    if (normalized < 0) {
      normalized += PATROL_SEQUENCE_LENGTH;
    }
    return normalized;
  }

  private directionIndex(dx: i32, dy: i32): i32 {
    for (let i = 0; i < PATROL_SEQUENCE_LENGTH; i++) {
      const base = i * 2;
      if (unchecked(PATROL_SEQUENCE[base]) == dx && unchecked(PATROL_SEQUENCE[base + 1]) == dy) {
        return i;
      }
    }
    return -1;
  }
}

function clampStepComponent(value: i32): i32 {
  if (value > 1) return 1;
  if (value < -1) return -1;
  return value;
}

function manhattan(dx: i32, dy: i32): i32 {
  const absDx = dx < 0 ? -dx : dx;
  const absDy = dy < 0 ? -dy : dy;
  const sum = absDx + absDy;
  return sum <= 0 ? 1 : sum;
}
