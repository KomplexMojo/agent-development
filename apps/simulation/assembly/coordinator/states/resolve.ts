import { CoordinatorContext, CoordinatorDispatchResult } from "../contracts";
import {
  configurator_dispatch_get_entry_count,
  configurator_dispatch_get_actor_handle,
  configurator_dispatch_get_initial_x,
  configurator_dispatch_get_initial_y,
  configurator_dispatch_get_initial_level,
  configurator_dispatch_get_intent_dx,
  configurator_dispatch_get_intent_dy,
  configurator_dispatch_get_intent_tier,
  configurator_dispatch_get_solver_code,
  configurator_dispatch_get_aiu_mode,
  configurator_dispatch_get_aiu_aux,
  configurator_dispatch_get_cultivation_ticks,
  configurator_dispatch_get_vulnerability_ticks,
  configurator_dispatch_outcome_accepted,
  configurator_dispatch_outcome_rejected,
  configurator_dispatch_rejection_none,
  configurator_dispatch_rejection_stamina,
  configurator_dispatch_rejection_blocked,
  configurator_dispatch_rejection_duplicate,
} from "../../configurator/configurator";
import {
  actor_dispatch_apply_permit,
  actor_dispatch_get_last_rejection_code,
} from "../../actor/actor";

function makeOccupancyKey(x: i32, y: i32, level: i32): string {
  return x.toString() + "," + y.toString() + "," + level.toString();
}

function occupancyGet(keys: Array<string>, actors: Array<i32>, key: string): i32 {
  for (let i = 0, len = keys.length; i < len; i++) {
    if (unchecked(keys[i]) == key) {
      return unchecked(actors[i]);
    }
  }
  return 0;
}

function occupancySet(keys: Array<string>, actors: Array<i32>, key: string, actor: i32): void {
  for (let i = 0, len = keys.length; i < len; i++) {
    if (unchecked(keys[i]) == key) {
      unchecked(actors[i] = actor);
      return;
    }
  }
  keys.push(key);
  actors.push(actor);
}

export function runResolveState(ctx: CoordinatorContext): void {
  const queueHandle = ctx.dispatchQueueHandle;
  if (queueHandle == 0) {
    ctx.dispatchResults = new Array<CoordinatorDispatchResult>();
    ctx.resolvedActions.push(`tick ${ctx.tick}: resolve (no queue)`);
    return;
  }

  const entryCount = configurator_dispatch_get_entry_count(queueHandle);
  const results = new Array<CoordinatorDispatchResult>();
  const occupiedKeys = new Array<string>();
  const occupiedActors = new Array<i32>();

  for (let i = 0; i < entryCount; i++) {
    const actorHandle = configurator_dispatch_get_actor_handle(queueHandle, i);
    if (actorHandle == 0) continue;
    const initialKey = makeOccupancyKey(
      configurator_dispatch_get_initial_x(queueHandle, i),
      configurator_dispatch_get_initial_y(queueHandle, i),
      configurator_dispatch_get_initial_level(queueHandle, i),
    );
    occupancySet(occupiedKeys, occupiedActors, initialKey, actorHandle);
  }

  for (let i = 0; i < entryCount; i++) {
    const actorHandle = configurator_dispatch_get_actor_handle(queueHandle, i);
    if (actorHandle == 0) continue;

    const initialX = configurator_dispatch_get_initial_x(queueHandle, i);
    const initialY = configurator_dispatch_get_initial_y(queueHandle, i);
    const initialLevel = configurator_dispatch_get_initial_level(queueHandle, i);
    const initialKey = makeOccupancyKey(initialX, initialY, initialLevel);

    const dx = configurator_dispatch_get_intent_dx(queueHandle, i);
    const dy = configurator_dispatch_get_intent_dy(queueHandle, i);
    const tier = configurator_dispatch_get_intent_tier(queueHandle, i);
    const solverCode = configurator_dispatch_get_solver_code(queueHandle, i);
    const targetX = initialX + dx;
    const targetY = initialY + dy;
    const targetKey = makeOccupancyKey(targetX, targetY, initialLevel);
    const aiuMode = configurator_dispatch_get_aiu_mode(queueHandle, i);
    const aiuAux = configurator_dispatch_get_aiu_aux(queueHandle, i);
    const cultivationTicks = configurator_dispatch_get_cultivation_ticks(queueHandle, i);
    const vulnerabilityTicks = configurator_dispatch_get_vulnerability_ticks(queueHandle, i);

    const targetOccupant = occupancyGet(occupiedKeys, occupiedActors, targetKey);
    if ((dx != 0 || dy != 0) && targetOccupant != 0 && targetOccupant != actorHandle) {
      const rejection = configurator_dispatch_rejection_blocked;
      results.push(
        new CoordinatorDispatchResult(
          actorHandle,
          dx,
          dy,
          tier,
          configurator_dispatch_outcome_rejected,
          rejection,
          solverCode,
          aiuMode,
          aiuAux,
          cultivationTicks,
          vulnerabilityTicks,
        ),
      );
      ctx.resolvedActions.push(
        `tick ${ctx.tick}: resolve actor=${actorHandle} outcome=${configurator_dispatch_outcome_rejected} rejection=${rejection} solver=${solverCode}`,
      );
      continue;
    }

    const outcome = actor_dispatch_apply_permit(actorHandle, ctx.tick, dx, dy, tier);

    let rejection = configurator_dispatch_rejection_none;
    if (outcome != configurator_dispatch_outcome_accepted) {
      rejection = actor_dispatch_get_last_rejection_code(actorHandle);
      if (
        rejection != configurator_dispatch_rejection_stamina &&
        rejection != configurator_dispatch_rejection_blocked &&
        rejection != configurator_dispatch_rejection_duplicate
      ) {
        rejection = configurator_dispatch_rejection_none;
      }
    }

    if (outcome == configurator_dispatch_outcome_accepted && (dx != 0 || dy != 0)) {
      occupancySet(occupiedKeys, occupiedActors, initialKey, 0);
      occupancySet(occupiedKeys, occupiedActors, targetKey, actorHandle);
    }

    results.push(
      new CoordinatorDispatchResult(
        actorHandle,
        dx,
        dy,
        tier,
        outcome,
        rejection,
        solverCode,
        aiuMode,
        aiuAux,
        cultivationTicks,
        vulnerabilityTicks,
      ),
    );
    ctx.resolvedActions.push(
      `tick ${ctx.tick}: resolve actor=${actorHandle} outcome=${outcome} rejection=${rejection} solver=${solverCode}`,
    );
  }

  ctx.dispatchResults = results;
}
