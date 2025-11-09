// Purpose: EMISSION — package messages as Emit intent under a small per-tick budget.

import {
  ActorContext,
  EmissionMessage,
  EmissionReceipt,
  Intent,
} from "../contracts";

const MESSAGE_QUEUE_CAPACITY: i32 = 8;
const RECEIPT_QUEUE_CAPACITY: i32 = 16;

export const MESSAGE_KIND_GENERIC: i32 = 0;
export const MESSAGE_KIND_ACTION: i32 = 1;
export const MESSAGE_KIND_ADJACENT_REQUEST: i32 = 4;
export const MESSAGE_KIND_ADJACENT_RESPONSE: i32 = 5;

let nextMessageId: i32 = 1;

export function emissionAdvance(_ctx: ActorContext): Intent | null {
  // Placeholder: queue management handled via explicit APIs
  return null;
}

export function emissionGetMessageQueueCapacity(): i32 {
  return MESSAGE_QUEUE_CAPACITY;
}

export function emissionSend(
  senderHandle: i32,
  sender: ActorContext,
  target: ActorContext,
  radius: f32,
  payloadA: i32,
  payloadB: i32,
  tag: i32,
): i32 {
  if (!withinRadius(sender, target, radius)) return 0;
  return deliverMessage(senderHandle, sender, target, payloadA, payloadB, tag, MESSAGE_KIND_ACTION);
}

export function emissionSendMany(
  senderHandle: i32,
  sender: ActorContext,
  targets: Array<ActorContext>,
  radius: f32,
  payloadA: i32,
  payloadB: i32,
  tag: i32,
  kind: i32 = MESSAGE_KIND_GENERIC,
): i32 {
  let deliveries: i32 = 0;
  for (let i = 0, n = targets.length; i < n; i++) {
    const target = targets[i];
    if (withinRadius(sender, target, radius)) {
      deliverMessage(senderHandle, sender, target, payloadA, payloadB, tag, kind);
      deliveries += 1;
    }
  }
  return deliveries;
}

export function emissionReceiveNext(reader: ActorContext): EmissionMessage | null {
  return reader.emission.dequeueMessage();
}

export function emissionRecordReceipt(sender: ActorContext, messageId: i32, readerHandle: i32): void {
  if (messageId === 0) return;
  sender.emission.enqueueReceipt(messageId, readerHandle, RECEIPT_QUEUE_CAPACITY);
}

export function emissionPollReceipt(ctx: ActorContext): EmissionReceipt | null {
  return ctx.emission.dequeueReceipt();
}

export function emissionSendAdjacentRequest(
  senderHandle: i32,
  sender: ActorContext,
  direction: i32,
): i32 {
  const requestId = nextMessageId++;
  sender.emission.enqueueMessage(
    requestId,
    senderHandle,
    direction,
    0,
    requestId,
    MESSAGE_KIND_ADJACENT_REQUEST,
    MESSAGE_QUEUE_CAPACITY,
  );
  return requestId;
}

export function emissionPollAdjacentResponse(ctx: ActorContext, requestId: i32): EmissionMessage | null {
  return ctx.emission.dequeueMessageByKindAndTag(MESSAGE_KIND_ADJACENT_RESPONSE, requestId);
}

function deliverMessage(
  senderHandle: i32,
  sender: ActorContext,
  target: ActorContext,
  payloadA: i32,
  payloadB: i32,
  tag: i32,
  kind: i32,
): i32 {
  const id = nextMessageId++;
  target.emission.enqueueMessage(
    id,
    senderHandle,
    payloadA,
    payloadB,
    tag,
    kind,
    MESSAGE_QUEUE_CAPACITY,
  );
  return id;
}

function withinRadius(sender: ActorContext, target: ActorContext, radius: f32): bool {
  const dx = sender.self.pos.x - target.self.pos.x;
  const dy = sender.self.pos.y - target.self.pos.y;
  const distanceSq: f32 = <f32>(dx * dx + dy * dy);
  return distanceSq <= radius * radius;
}
