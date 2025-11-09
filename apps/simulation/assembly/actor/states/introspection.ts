// Purpose: INTROSPECTION — owns self-state (identity, position, and resource pillars).

import { ActorContext, Vec2, PositionSnapshot, ResourceTriple, RESOURCE_INFINITY } from "../contracts";

export function introspectionAdvance(_ctx: ActorContext): void {
  // No per-tick work yet; identity/type assignments happen via ensureMetadata.
}

export function introspectionEnsureMetadata(handle: i32, ctx: ActorContext): void {
  if (ctx.self.identity == 0) ctx.self.identity = computeIdentity(handle);
}

export function introspectionGetIdentity(ctx: ActorContext): i32 {
  return ctx.self.identity;
}

export function introspectionGetX(ctx: ActorContext): i32 {
  return ctx.self.pos.x;
}

export function introspectionGetY(ctx: ActorContext): i32 {
  return ctx.self.pos.y;
}

export function introspectionGetLocation(ctx: ActorContext): Vec2 {
  return new Vec2(ctx.self.pos.x, ctx.self.pos.y);
}

export function introspectionGetLevel(ctx: ActorContext): i32 {
  return ctx.self.level;
}

export function introspectionGetLocationSnapshot(ctx: ActorContext): PositionSnapshot {
  const snapshot = new PositionSnapshot();
  snapshot.set(ctx.self.pos.x, ctx.self.pos.y);
  return snapshot;
}

export function introspectionGetStaminaCurrent(ctx: ActorContext): i32 {
  return ctx.self.resources.stamina.current;
}

export function introspectionGetStaminaMax(ctx: ActorContext): i32 {
  return ctx.self.resources.stamina.max;
}

export function introspectionGetStaminaRegen(ctx: ActorContext): i32 {
  return ctx.self.resources.stamina.regen;
}

export function introspectionGetDurabilityCurrent(ctx: ActorContext): i32 {
  return ctx.self.resources.durability.current;
}

export function introspectionGetDurabilityMax(ctx: ActorContext): i32 {
  return ctx.self.resources.durability.max;
}

export function introspectionGetDurabilityRegen(ctx: ActorContext): i32 {
  return ctx.self.resources.durability.regen;
}

export function introspectionGetHealthCurrent(ctx: ActorContext): i32 {
  return ctx.self.resources.health.current;
}

export function introspectionGetHealthMax(ctx: ActorContext): i32 {
  return ctx.self.resources.health.max;
}

export function introspectionGetHealthRegen(ctx: ActorContext): i32 {
  return ctx.self.resources.health.regen;
}

export function introspectionGetManaCurrent(ctx: ActorContext): i32 {
  return ctx.self.resources.mana.current;
}

export function introspectionGetManaMax(ctx: ActorContext): i32 {
  return ctx.self.resources.mana.max;
}

export function introspectionGetManaRegen(ctx: ActorContext): i32 {
  return ctx.self.resources.mana.regen;
}

const MIN_MEANINGFUL_ACTION_PERCENT: i32 = 4; // keep in sync with transition + configurator stamina costs
const CULTIVATION_REGEN_ACTION_MULTIPLIER: i32 = 2;

function computeMinMeaningfulActionCost(max: i32): i32 {
  if (max <= 0) return 0;
  const scaled = <i32>Math.ceil((<f64>max * <f64>MIN_MEANINGFUL_ACTION_PERCENT) / 100.0);
  return scaled < 1 ? 1 : scaled;
}

function applyCultivationRegen(resource: ResourceTriple): void {
  const max = resource.max;
  if (max <= 0 || max == RESOURCE_INFINITY) return;
  if (resource.current >= max) return;
  const minActionCost = computeMinMeaningfulActionCost(max);
  const gainBase = minActionCost <= 0 ? 1 : minActionCost;
  const gain = gainBase * CULTIVATION_REGEN_ACTION_MULTIPLIER;
  const next = resource.current + (gain <= 0 ? 1 : gain);
  resource.current = next > max ? max : next;
}

export function introspectionApplyCultivationTick(ctx: ActorContext): void {
  applyCultivationRegen(ctx.self.resources.stamina);
  applyCultivationRegen(ctx.self.resources.health);
  applyCultivationRegen(ctx.self.resources.mana);
  applyCultivationRegen(ctx.self.resources.durability);
}

function computeIdentity(handle: i32): i32 {
  let x = handle ^ 0x9e3779b9;
  x = (x << 7) | (x >>> 25);
  x ^= 0x7f4a7c15;
  return x;
}
