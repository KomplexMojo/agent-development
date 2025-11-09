import type { ActorState } from "./types";

export function formatIntent(actor: ActorState): string {
  return actor.intent ?? "pending";
}

export function formatOutcome(actor: ActorState): string {
  return actor.outcome ?? "n/a";
}
