import { CoordinatorContext, CoordinatorDispatchResult } from "../contracts";
import {
  configurator_dispatch_record_outcome,
  configurator_dispatch_get_intent_dx,
  configurator_dispatch_get_intent_dy,
  configurator_dispatch_get_initial_x,
  configurator_dispatch_get_initial_y,
  configurator_dispatch_get_initial_level,
  configurator_map_set_actor,
  configurator_actor_update_position,
  configurator_dispatch_outcome_accepted,
} from "../../configurator/configurator";
import {
  actor_observation_get_x,
  actor_observation_get_y,
  actor_observation_get_level,
} from "../../actor/actor";
import { moderator_collect_summary } from "../../moderator/moderator";

export function runCommitState(ctx: CoordinatorContext): void {
  const queueHandle = ctx.dispatchQueueHandle;
  const results = ctx.dispatchResults;

  if (queueHandle != 0 && results.length > 0) {
    const summaryParts = new Array<string>();
    summaryParts.push(`tick ${ctx.tick}: commit results=${results.length}`);

    for (let i = 0, len = results.length; i < len; i++) {
      const result = unchecked(results[i]);
      configurator_dispatch_record_outcome(queueHandle, i, result.outcome, result.rejection);

      const actorHandle = result.actorHandle;
      const posX = actor_observation_get_x(actorHandle);
      const posY = actor_observation_get_y(actorHandle);
      const level = actor_observation_get_level(actorHandle);

      const intentDx = configurator_dispatch_get_intent_dx(queueHandle, i);
      const intentDy = configurator_dispatch_get_intent_dy(queueHandle, i);
      const initialX = configurator_dispatch_get_initial_x(queueHandle, i);
      const initialY = configurator_dispatch_get_initial_y(queueHandle, i);
      const initialLevel = configurator_dispatch_get_initial_level(queueHandle, i);

      let mapUpdateResult = 0;
      if (ctx.configuratorHandle != 0 && result.outcome == configurator_dispatch_outcome_accepted) {
        mapUpdateResult = configurator_map_set_actor(ctx.configuratorHandle, actorHandle, posX, posY, level);
        if (mapUpdateResult != 0) {
          configurator_actor_update_position(ctx.configuratorHandle, actorHandle, posX, posY, level);
        }
      }

      summaryParts.push(
        `actor=${actorHandle} tier=${result.tier} dx=${intentDx} dy=${intentDy} outcome=${result.outcome} rejection=${result.rejection} solver=${result.solverCode} final=(${posX},${posY},${level})`,
      );
    }

    const summary = summaryParts.join(" | ");
    ctx.summaries.push(summary);
    if (ctx.moderatorHandle != 0) {
      moderator_collect_summary(ctx.moderatorHandle, ctx.tick, summary);
    }
  } else {
    const summary = `tick ${ctx.tick}: commit (no results)`;
    ctx.summaries.push(summary);
    if (ctx.moderatorHandle != 0) {
      moderator_collect_summary(ctx.moderatorHandle, ctx.tick, summary);
    }
  }

  // Retain queue handle/results for downstream inspection; Schedule will release/reset on the next tick.
}
