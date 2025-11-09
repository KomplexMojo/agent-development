// Purpose: TRANSITION — validate suggestion with guards & costs, yield finalized Intent.

import {
  ActorContext,
  Intent,
  TransitionEvent,
  ObservationOccupancy,
  classifyOccupancy,
  ResourceTriple,
} from "../contracts";

const STAMINA_PERCENT_NUMERATOR: i32 = 4; // 4% baseline per cardinal step
const DIAGONAL_COST_MULTIPLIER: f64 = 1.4142135623730951; // sqrt(2)
const DESCEND_COST_MULTIPLIER: f64 = 1.7320508075688772; // sqrt(3)

function computeUnitStaminaCost(max: i32, multiplier: f64): i32 {
  if (max <= 0) return 0;
  const scaledBase =
    (<f64>(<i64>max * STAMINA_PERCENT_NUMERATOR) / 100.0) * multiplier;
  const ceiled = <i32>Math.ceil(scaledBase);
  return ceiled < 1 ? 1 : ceiled;
}

function computeHorizontalStaminaCost(max: i32, dx: i32, dy: i32): i32 {
  const absDx = dx < 0 ? -dx : dx;
  const absDy = dy < 0 ? -dy : dy;
  if (absDx == 0 && absDy == 0) return 0;

  const diagSteps = absDx < absDy ? absDx : absDy;
  const straightSteps = (absDx > absDy ? absDx : absDy) - diagSteps;

  let total: i64 = 0;
  if (diagSteps > 0) {
    const diagUnit = computeUnitStaminaCost(max, DIAGONAL_COST_MULTIPLIER);
    if (diagUnit == i32.MAX_VALUE) return i32.MAX_VALUE;
    total += <i64>diagSteps * <i64>diagUnit;
  }
  if (straightSteps > 0) {
    const straightUnit = computeUnitStaminaCost(max, 1.0);
    if (straightUnit == i32.MAX_VALUE) return i32.MAX_VALUE;
    total += <i64>straightSteps * <i64>straightUnit;
  }

  if (total <= 0) {
    const fallback = computeUnitStaminaCost(max, 1.0);
    return fallback == i32.MAX_VALUE ? i32.MAX_VALUE : fallback;
  }

  return total >= i32.MAX_VALUE ? i32.MAX_VALUE : <i32>total;
}

function computeVerticalStaminaCost(max: i32, dz: i32): i32 {
  const steps = dz < 0 ? -dz : dz;
  if (steps == 0) return 0;
  const multiplier = dz < 0 ? DESCEND_COST_MULTIPLIER : 1.0;
  const unit = computeUnitStaminaCost(max, multiplier);
  if (unit == i32.MAX_VALUE) return i32.MAX_VALUE;
  const total = <i64>steps * <i64>unit;
  return total >= i32.MAX_VALUE ? i32.MAX_VALUE : <i32>total;
}

function consumeStamina(stamina: ResourceTriple, cost: i32): bool {
  if (cost <= 0) return true;
  if (cost == i32.MAX_VALUE) return false;
  const available = stamina.current;
  if (available <= 0 || available < cost) return false;
  stamina.current = available - cost;
  return true;
}

export function transitionAdvance(ctx: ActorContext, suggested: Intent | null): Intent | null {
  // Placeholder: accept nothing yet; return null
  return null;
}

// REQ:P1-F04_1 — unconstrained movement (with stamina costs per P1-F04_3)
// Applies a raw delta to the authoritative position when sufficient stamina exists.
export function moveBy(ctx: ActorContext, dx: i32, dy: i32): bool {
  if (dx == 0 && dy == 0) return true;

  const stamina = ctx.self.resources.stamina;
  const cost = computeHorizontalStaminaCost(stamina.max, dx, dy);
  if (!consumeStamina(stamina, cost)) return false;

  const fromX = ctx.self.pos.x;
  const fromY = ctx.self.pos.y;
  const fromLevel = ctx.self.level;

  const toX = fromX + dx;
  const toY = fromY + dy;
  const toLevel = fromLevel;
  ctx.self.pos.x = toX;
  ctx.self.pos.y = toY;

  const ev = new TransitionEvent();
  ev.dx = <i16>dx; ev.dy = <i16>dy; ev.dz = 0;
  ev.fromX = fromX; ev.fromY = fromY; ev.fromLevel = fromLevel;
  ev.toX = toX;     ev.toY = toY;     ev.toLevel = toLevel;
  ctx.self.moves.push(ev);
  return true;
}

export function moveLevelBy(ctx: ActorContext, dz: i32): bool {
  if (dz == 0) return true;

  const stamina = ctx.self.resources.stamina;
  const cost = computeVerticalStaminaCost(stamina.max, dz);
  if (!consumeStamina(stamina, cost)) return false;

  const fromLevel = ctx.self.level;
  const toLevel = fromLevel + dz;
  ctx.self.level = toLevel;

  const ev = new TransitionEvent();
  ev.dx = 0;
  ev.dy = 0;
  ev.dz = <i16>dz;
  ev.fromX = ctx.self.pos.x;
  ev.fromY = ctx.self.pos.y;
  ev.fromLevel = fromLevel;
  ev.toX = ctx.self.pos.x;
  ev.toY = ctx.self.pos.y;
  ev.toLevel = toLevel;
  ctx.self.moves.push(ev);
  return true;
}

export function transitionAttemptMove(
  mover: ActorContext,
  target: ActorContext,
  dx: i32,
  dy: i32,
): bool {
  const occupancy = classifyOccupancy(target.self.resources);
  if (occupancy == ObservationOccupancy.WalkableStatic) {
    return moveBy(mover, dx, dy);
  }
  return false;
}

export function teleportTo(ctx: ActorContext, x: i32, y: i32, level: i32): void {
  const fromX = ctx.self.pos.x;
  const fromY = ctx.self.pos.y;
  const fromLevel = ctx.self.level;

  if (fromX == x && fromY == y && fromLevel == level) {
    return;
  }

  ctx.self.pos.x = x;
  ctx.self.pos.y = y;
  ctx.self.level = level;

  const ev = new TransitionEvent();
  ev.dx = <i16>(x - fromX);
  ev.dy = <i16>(y - fromY);
  ev.dz = <i16>(level - fromLevel);
  ev.fromX = fromX;
  ev.fromY = fromY;
  ev.fromLevel = fromLevel;
  ev.toX = x;
  ev.toY = y;
  ev.toLevel = level;
  ctx.self.moves.push(ev);
}
