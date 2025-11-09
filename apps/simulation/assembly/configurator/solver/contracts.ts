
// Solver adapter shared types for the configurator.

export const SOLVER_RESULT_CODE_SAT: i32 = 1;
export const SOLVER_RESULT_CODE_UNSAT: i32 = 2;
export const SOLVER_RESULT_CODE_TIMEOUT: i32 = 3;
export const SOLVER_RESULT_CODE_ERROR: i32 = 4;
export const SOLVER_RESULT_CODE_UNIMPLEMENTED: i32 = 5;

export enum SolverQuerySchema {
  Reachability = 1,
  GuardRadius = 2,
  Waypoint = 3,
}

export class ReachabilityQuery {
  constructor(
    public startX: i32 = 0,
    public startY: i32 = 0,
    public targetX: i32 = 0,
    public targetY: i32 = 0,
    public level: i32 = 0,
    public maxSteps: i32 = 0,
  ) {}
}

export class GuardRadiusQuery {
  constructor(
    public anchorX: i32 = 0,
    public anchorY: i32 = 0,
    public level: i32 = 0,
    public radius: i32 = 0,
    public maxSteps: i32 = 0,
  ) {}
}

export class WaypointQuery {
  constructor(
    public startX: i32 = 0,
    public startY: i32 = 0,
    public level: i32 = 0,
    public waypointCount: i32 = 0,
  ) {}
}

export enum SolverResultCode {
  Sat = SOLVER_RESULT_CODE_SAT,
  Unsat = SOLVER_RESULT_CODE_UNSAT,
  Timeout = SOLVER_RESULT_CODE_TIMEOUT,
  Error = SOLVER_RESULT_CODE_ERROR,
  Unimplemented = SOLVER_RESULT_CODE_UNIMPLEMENTED,
}

export class SolverPathStep {
  constructor(
    public x: i32 = 0,
    public y: i32 = 0,
    public level: i32 = 0,
  ) {}
}

export class SolverResult {
  constructor(
    public code: SolverResultCode = SolverResultCode.Unimplemented,
    public steps: StaticArray<SolverPathStep> | null = null,
    public diagnostics: string = "",
  ) {}

  static unimplemented(): SolverResult {
    return new SolverResult(SolverResultCode.Unimplemented, null, "solver adapter not yet implemented");
  }

  static timeout(): SolverResult {
    return new SolverResult(SolverResultCode.Timeout, null, "solver execution timed out");
  }
}
