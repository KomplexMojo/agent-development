export const CELL_SIZE = 32;

export const MAX_GRID_WIDTH = 57;
export const MAX_GRID_HEIGHT = 25;
export const MIN_GRID_WIDTH = 4;
export const MIN_GRID_HEIGHT = 3;

export const RESERVED_SPECIAL_CELLS = 4; // entrance, exit, up, down
export const MAX_ADDRESSABLE_CELLS = MAX_GRID_WIDTH * MAX_GRID_HEIGHT;
export const MAX_DEMO_TICKS = 500; // Align with CLI defaults for long-running demos

export const DEFAULT_SURFACE_WIDTH = 20;
export const DEFAULT_SURFACE_HEIGHT = 20;
export const DEFAULT_BARRIER_RATIO = 0.3;
export const DEFAULT_ACTOR_RATIO = 0.15;

export function computeDefaultPopulation(width: number, height: number): { actors: number; barriers: number } {
  const safeWidth = Math.max(0, Math.floor(width));
  const safeHeight = Math.max(0, Math.floor(height));
  const totalCells = safeWidth * safeHeight;
  const availableCells = Math.max(0, totalCells - RESERVED_SPECIAL_CELLS);

  if (availableCells <= 0) {
    return { actors: 0, barriers: 0 };
  }

  const desiredActors = Math.max(1, Math.floor(totalCells * DEFAULT_ACTOR_RATIO));
  const desiredBarriers = Math.max(0, Math.floor(totalCells * DEFAULT_BARRIER_RATIO));

  let actorCount = Math.min(desiredActors, availableCells);
  let barrierCount = Math.min(desiredBarriers, Math.max(0, availableCells - actorCount));

  const overflow = actorCount + barrierCount - availableCells;
  if (overflow > 0) {
    barrierCount = Math.max(0, barrierCount - overflow);
  }

  if (actorCount <= 0 && availableCells > 0) {
    actorCount = Math.min(availableCells, 1);
  }

  if (barrierCount > availableCells - actorCount) {
    barrierCount = Math.max(0, availableCells - actorCount);
  }

  return { actors: actorCount, barriers: barrierCount };
}
