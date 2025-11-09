/**
 * [REQ:P1-F05_1] Simple message passing
 * Goal: Nearby actors exchange messages with queue limits, read receipts, and
 * optional actions that apply when read. Out-of-range actors must not receive
 * or overhear the transmission.
 *
 * Verification per requirement:
 *  - unit: emit from one actor, ingest from another, observe queue behaviour,
 *          read receipts, and action side effects.
 *
 * Run:
 *   npm run asbuild
 *   npm test
 */

import assert from "node:assert/strict";

(async () => {
  let mod;
  try { mod = await import("../build/release.js"); } catch { mod = await import("../build/debug.js"); }

  const expectedExports = {
    actor_lifecycle_create: "function",
    actor_lifecycle_destroy: "function",
    actor_lifecycle_init: "function",
    actor_lifecycle_process: "function",
    actor_transition_move_by: "function",
    actor_observation_get_x: "function",
    actor_observation_get_y: "function",
    actor_emission_get_message_queue_capacity: "function",
    actor_emission_send: "function",
    actor_emission_receive_next: "function",
    actor_emission_poll_receipt: "function",
  };

  for (const [name, type] of Object.entries(expectedExports)) {
    assert.equal(typeof mod[name], type, `${name} export should be a ${type}`);
  }

  const sender = mod.actor_lifecycle_create();
  const receiver = mod.actor_lifecycle_create();
  const outsider = mod.actor_lifecycle_create();

  try {
    // Initialise actors and set positions
    mod.actor_lifecycle_init(sender);
    mod.actor_lifecycle_init(receiver);
    mod.actor_lifecycle_init(outsider);
    mod.actor_lifecycle_process(sender);
    mod.actor_lifecycle_process(receiver);
    mod.actor_lifecycle_process(outsider);

    mod.actor_transition_move_by(receiver, 3, 0);
    mod.actor_lifecycle_process(receiver);
    mod.actor_transition_move_by(outsider, 12, 0);
    mod.actor_lifecycle_process(outsider);

    const initialReceiverPos = readPos(receiver);

    const radius = 6;

    // Out-of-range actors must not receive messages
    const outOfRangeId = mod.actor_emission_send(sender, outsider, radius, 0, 0, 42);
    assert.equal(outOfRangeId, 0, "message should not deliver outside radius");

    const capacity = mod.actor_emission_get_message_queue_capacity();
    const sentIds = [];

    // Saturate the receiver queue (capacity + 1 messages should drop the oldest)
    for (let i = 0; i < capacity + 1; i++) {
      const id = mod.actor_emission_send(sender, receiver, radius, 0, 0, 100 + i);
      assert.ok(id > 0, "messages within range should enqueue");
      sentIds.push(id);
    }

    // Send an action-oriented message that should move the receiver when read
    const actionId = mod.actor_emission_send(sender, receiver, radius, 2, 1, 999);
    assert.ok(actionId > 0, "action message should enqueue");
    sentIds.push(actionId);

    const expectedQueueIds = sentIds.slice(sentIds.length - capacity);

    // Drain the queue and record received messages
    const received = [];
    while (true) {
      const message = mod.actor_emission_receive_next(receiver);
      if (message === null) break;
      received.push(message);
    }

    const receivedIds = received.map((msg) => msg.id);
    assert.deepEqual(receivedIds, expectedQueueIds, "queue should retain the most recent messages only");
    assert.ok(receivedIds.includes(actionId), "action message should be received");

    // A lifecycle tick brings observation in sync after action-induced movement
    mod.actor_lifecycle_process(receiver);
    const updatedPos = readPos(receiver);
    assert.equal(updatedPos.x, initialReceiverPos.x + 2, "action message should move receiver on x axis");
    assert.equal(updatedPos.y, initialReceiverPos.y + 1, "action message should move receiver on y axis");

    // Receipts should exist for each consumed message, including the action message
    const receipts = [];
    while (true) {
      const receipt = mod.actor_emission_poll_receipt(sender);
      if (receipt === null) break;
      receipts.push(receipt);
    }
    assert.equal(receipts.length, received.length, "each read message should produce a receipt");
    const receiptForAction = receipts.find((r) => r.messageId === actionId);
    assert.ok(receiptForAction, "sender should be notified when action message is read");
    assert.equal(receiptForAction.readerHandle, receiver, "receipt should identify the reader");

    // Outsider should still have no messages
    const outsiderMsg = mod.actor_emission_receive_next(outsider);
    assert.strictEqual(outsiderMsg, null, "outsider should not see in-range messages");

    console.log("[REQ:P1-F05_1] simple message passing tests: ok");
  } finally {
    for (const handle of [sender, receiver, outsider]) {
      try { mod.actor_lifecycle_destroy(handle); } catch { /* ignore */ }
    }
  }

  function readPos(handle) {
    return {
      x: mod.actor_observation_get_x(handle),
      y: mod.actor_observation_get_y(handle),
    };
  }

})();
