import {
  configurator_director_set_movement,
  configurator_actor_ledger_size,
  configurator_actor_ledger_get_handle,
} from "../configurator/configurator";

class DirectorContext {
  tick: i32 = 0;
}

let nextHandle: i32 = 1;
const contexts = new Map<i32, DirectorContext>();

function ensureContext(handle: i32): DirectorContext {
  let ctx = contexts.get(handle);
  if (ctx === null) {
    ctx = new DirectorContext();
    contexts.set(handle, ctx);
  }
  return changetype<DirectorContext>(ctx);
}

export function director_lifecycle_create(): i32 {
  const handle = nextHandle++;
  contexts.set(handle, new DirectorContext());
  return handle;
}

export function director_lifecycle_destroy(handle: i32): void {
  contexts.delete(handle);
}

export function director_lifecycle_initialize(handle: i32): void {
  ensureContext(handle).tick = 0;
}

function scramble(value: i32): i32 {
  let result = value ^ (value << 13);
  result = result ^ (result >> 17);
  result = result ^ (result << 5);
  return result & 0x7fffffff;
}

function computeMovementVector(tick: i32, actorHandle: i32, actorIndex: i32): Vec2 {
  const sequence = [
    new Vec2(1, 0),    // east
    new Vec2(-1, 0),   // west
    new Vec2(0, 1),    // north
    new Vec2(0, -1),   // south
    new Vec2(1, 1),    // north-east
    new Vec2(-1, 1),   // north-west
    new Vec2(-1, -1),  // south-west
    new Vec2(1, -1),   // south-east
    new Vec2(0, 0),    // wait
  ];
  const baseSeed = scramble((actorHandle << 4) ^ (actorIndex + 1));
  const offset = baseSeed % sequence.length;
  const index = (offset + (tick % sequence.length) + sequence.length) % sequence.length;
  return unchecked(sequence[index]);
}

export function director_issue_movement(handle: i32, configuratorHandle: i32): void {
  const ctx = ensureContext(handle);
  ctx.tick += 1;
  const actorCount = configurator_actor_ledger_size(configuratorHandle);
  for (let i = 0; i < actorCount; i++) {
    const actorHandle = configurator_actor_ledger_get_handle(configuratorHandle, i);
    if (actorHandle == 0) continue;
    const vector = computeMovementVector(ctx.tick, actorHandle, i);
    configurator_director_set_movement(configuratorHandle, actorHandle, vector.x, vector.y, ctx.tick);
  }
}

class Vec2 {
  constructor(public x: i32, public y: i32) {}
}
