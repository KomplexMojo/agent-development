import { ModeratorContext } from "./contracts";
import { moderatorCollect } from "./states/collect";
import { moderatorAggregate } from "./states/aggregate";
import { moderatorEmit } from "./states/emit";

let nextHandle: i32 = 1;
const contexts = new Map<i32, ModeratorContext>();

function ensureContext(handle: i32): ModeratorContext {
  let ctx = contexts.get(handle);
  if (ctx === null) {
    ctx = new ModeratorContext();
    contexts.set(handle, ctx);
  }
  return changetype<ModeratorContext>(ctx);
}

export function moderator_lifecycle_create(): i32 {
  const handle = nextHandle++;
  contexts.set(handle, new ModeratorContext());
  return handle;
}

export function moderator_lifecycle_destroy(handle: i32): void {
  contexts.delete(handle);
}

export function moderator_lifecycle_initialize(handle: i32): void {
  ensureContext(handle).reset();
}

export function moderator_collect_summary(handle: i32, tick: i32, message: string): void {
  moderatorCollect(ensureContext(handle), tick, message);
}

export function moderator_lifecycle_process(handle: i32): void {
  const ctx = ensureContext(handle);
  moderatorAggregate(ctx);
  moderatorEmit(ctx);
}

export function moderator_summary_count(handle: i32): i32 {
  return ensureContext(handle).summaries.length;
}

export function moderator_summary_get(handle: i32, index: i32): string {
  const ctx = ensureContext(handle);
  const summary = ctx.getSummary(index);
  return summary === null ? "" : summary.message;
}
