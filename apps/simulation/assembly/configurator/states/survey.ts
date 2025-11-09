import { ObservationCapability } from "../../actor/contracts";
import { ConfiguratorContext } from "../contracts";
import { surfacePoolRequestObservation, surfacePoolSize } from "../surface";

function sweepSurfacePool(ctx: ConfiguratorContext): i32 {
  const pool = ctx.surfacePool;
  if (pool === null) {
    ctx.lastObservationSweepCount = 0;
    return 0;
  }
  const count = surfacePoolSize(pool);
  for (let i = 0; i < count; i++) {
    surfacePoolRequestObservation(pool, i, ObservationCapability.Enhanced);
  }
  ctx.lastObservationSweepCount = count;
  return count;
}

export function applySurveyState(ctx: ConfiguratorContext): bool {
  sweepSurfacePool(ctx);
  // State is considered successful even if no surfaces exist (count == 0).
  return true;
}

export function collectSurveyObservations(ctx: ConfiguratorContext): i32 {
  return sweepSurfacePool(ctx);
}
