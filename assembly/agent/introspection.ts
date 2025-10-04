// Purpose: INTROSPECTION — owns self-state (identity, position, and resource pillars).

import { AgentContext, Vec2, PositionSnapshot } from "./contracts";

export function stepIntrospection(_ctx: AgentContext): void {
  // No per-tick work yet; identity/type assignments happen via ensureMetadata.
}

export function introspectionEnsureMetadata(handle: i32, ctx: AgentContext): void {
  if (ctx.self.identity == 0) ctx.self.identity = computeIdentity(handle);
}

export function introspectionGetIdentity(ctx: AgentContext): i32 {
  return ctx.self.identity;
}

export function introspectionGetX(ctx: AgentContext): i32 {
  return ctx.self.pos.x;
}

export function introspectionGetY(ctx: AgentContext): i32 {
  return ctx.self.pos.y;
}

export function introspectionGetLocation(ctx: AgentContext): Vec2 {
  return new Vec2(ctx.self.pos.x, ctx.self.pos.y);
}

export function introspectionGetLevel(ctx: AgentContext): i32 {
  return ctx.self.level;
}

export function introspectionGetLocationSnapshot(ctx: AgentContext): PositionSnapshot {
  const snapshot = new PositionSnapshot();
  snapshot.set(ctx.self.pos.x, ctx.self.pos.y);
  return snapshot;
}

export function introspectionGetStaminaCurrent(ctx: AgentContext): i32 {
  return ctx.self.resources.stamina.current;
}

export function introspectionGetStaminaMax(ctx: AgentContext): i32 {
  return ctx.self.resources.stamina.max;
}

export function introspectionGetStaminaRegen(ctx: AgentContext): i32 {
  return ctx.self.resources.stamina.regen;
}

export function introspectionGetDurabilityCurrent(ctx: AgentContext): i32 {
  return ctx.self.resources.durability.current;
}

export function introspectionGetDurabilityMax(ctx: AgentContext): i32 {
  return ctx.self.resources.durability.max;
}

export function introspectionGetDurabilityRegen(ctx: AgentContext): i32 {
  return ctx.self.resources.durability.regen;
}

export function introspectionGetHealthCurrent(ctx: AgentContext): i32 {
  return ctx.self.resources.health.current;
}

export function introspectionGetHealthMax(ctx: AgentContext): i32 {
  return ctx.self.resources.health.max;
}

export function introspectionGetHealthRegen(ctx: AgentContext): i32 {
  return ctx.self.resources.health.regen;
}

export function introspectionGetManaCurrent(ctx: AgentContext): i32 {
  return ctx.self.resources.mana.current;
}

export function introspectionGetManaMax(ctx: AgentContext): i32 {
  return ctx.self.resources.mana.max;
}

export function introspectionGetManaRegen(ctx: AgentContext): i32 {
  return ctx.self.resources.mana.regen;
}

function computeIdentity(handle: i32): i32 {
  let x = handle ^ 0x9e3779b9;
  x = (x << 7) | (x >>> 25);
  x ^= 0x7f4a7c15;
  return x;
}
