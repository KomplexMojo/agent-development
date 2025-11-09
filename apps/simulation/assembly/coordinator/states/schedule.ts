import { CoordinatorContext, CoordinatorDispatchResult } from "../contracts";
import {
  configurator_dispatch_process,
  configurator_dispatch_release,
  configurator_dispatch_get_entry_count,
} from "../../configurator/configurator";

export function runScheduleState(ctx: CoordinatorContext): void {
  if (ctx.configuratorHandle == 0) {
    ctx.dispatchQueueHandle = 0;
    ctx.dispatchResults = new Array<CoordinatorDispatchResult>();
    ctx.pendingRequests.push(`tick ${ctx.tick}: schedule (no configurator bound)`);
    return;
  }

  if (ctx.dispatchQueueHandle != 0) {
    configurator_dispatch_release(ctx.dispatchQueueHandle);
    ctx.dispatchQueueHandle = 0;
  }

  const seed = ctx.tick;
  const queueHandle = configurator_dispatch_process(ctx.configuratorHandle, seed);
  ctx.dispatchQueueHandle = queueHandle;
  ctx.dispatchResults = new Array<CoordinatorDispatchResult>();

  const entryCount = configurator_dispatch_get_entry_count(queueHandle);
  ctx.pendingRequests.push(`tick ${ctx.tick}: schedule queue=${queueHandle} entries=${entryCount}`);
}
