// Purpose: Utilities for managing pooled static surfaces used by the configuration manager.

import {
  ObservationCapability,
  ObservationOccupancy,
  ResourceSet,
  RESOURCE_INFINITY,
  classifyOccupancy,
} from "../actor/contracts";

let nextSurfaceId: i32 = 1;

class Surface {
  readonly id: i32;
  readonly resources: ResourceSet = new ResourceSet();
  readonly x: i32;
  readonly y: i32;
  readonly level: i32;
  private observationTicket: i32 = 0;
  private lastCapability: ObservationCapability = ObservationCapability.Enhanced;

  constructor(x: i32, y: i32, level: i32 = 0) {
    this.id = nextSurfaceId++;
    this.x = x;
    this.y = y;
    this.level = level;
    this.resources.stamina.set(0, 0, 0);
    this.resources.health.set(0, 0, 0);
    this.resources.mana.set(0, 0, 0);
    this.resources.durability.set(RESOURCE_INFINITY, RESOURCE_INFINITY, RESOURCE_INFINITY);
  }

  requestObservation(capability: ObservationCapability): i32 {
    this.lastCapability = capability;
    this.observationTicket += 1;
    return this.observationTicket;
  }

  getLastObservationCapability(): ObservationCapability {
    return this.lastCapability;
  }

  isStaticWalkable(): bool {
    const occupancy = classifyOccupancy(this.resources);
    return occupancy == ObservationOccupancy.WalkableStatic;
  }
}

export class SurfacePool {
  private surfaces: Array<Surface> = new Array<Surface>();
  private capability: ObservationCapability = ObservationCapability.Enhanced;

  constructor(width: i32, height: i32, level: i32 = 0) {
    this.populate(width, height, level);
  }

  private populate(width: i32, height: i32, level: i32): void {
    for (let y: i32 = 0; y < height; y += 1) {
      for (let x: i32 = 0; x < width; x += 1) {
        this.surfaces.push(new Surface(x, y, level));
      }
    }
  }

  size(): i32 {
    return this.surfaces.length;
  }

  private clampIndex(index: i32): i32 {
    const count = this.surfaces.length;
    if (count == 0) {
      return 0;
    }
    if (index < 0) return 0;
    if (index >= count) return count - 1;
    return index;
  }

  getSurface(index: i32): Surface {
    const clamped = this.clampIndex(index);
    return unchecked(this.surfaces[clamped]);
  }

  getStamina(index: i32): i32 {
    return this.getSurface(index).resources.stamina.max;
  }

  getHealth(index: i32): i32 {
    return this.getSurface(index).resources.health.max;
  }

  getMana(index: i32): i32 {
    return this.getSurface(index).resources.mana.max;
  }

  getDurability(index: i32): i32 {
    return this.getSurface(index).resources.durability.max;
  }

  getX(index: i32): i32 {
    return this.getSurface(index).x;
  }

  getY(index: i32): i32 {
    return this.getSurface(index).y;
  }

  getLevel(index: i32): i32 {
    return this.getSurface(index).level;
  }

  getId(index: i32): i32 {
    return this.getSurface(index).id;
  }

  isStatic(index: i32): bool {
    return this.getSurface(index).isStaticWalkable();
  }

  requestObservation(index: i32, capability: ObservationCapability = this.capability): i32 {
    return this.getSurface(index).requestObservation(capability);
  }

  getLastObservationCapability(index: i32): ObservationCapability {
    return this.getSurface(index).getLastObservationCapability();
  }
}

export function createSurfacePool(width: i32, height: i32, level: i32 = 0): SurfacePool {
  return new SurfacePool(width, height, level);
}

export function surfacePoolSize(pool: SurfacePool | null): i32 {
  return pool === null ? 0 : pool.size();
}

export function surfacePoolGetStamina(pool: SurfacePool | null, index: i32): i32 {
  return pool === null ? 0 : pool.getStamina(index);
}

export function surfacePoolGetHealth(pool: SurfacePool | null, index: i32): i32 {
  return pool === null ? 0 : pool.getHealth(index);
}

export function surfacePoolGetMana(pool: SurfacePool | null, index: i32): i32 {
  return pool === null ? 0 : pool.getMana(index);
}

export function surfacePoolGetDurability(pool: SurfacePool | null, index: i32): i32 {
  return pool === null ? 0 : pool.getDurability(index);
}

export function surfacePoolGetX(pool: SurfacePool | null, index: i32): i32 {
  return pool === null ? 0 : pool.getX(index);
}

export function surfacePoolGetY(pool: SurfacePool | null, index: i32): i32 {
  return pool === null ? 0 : pool.getY(index);
}

export function surfacePoolGetLevel(pool: SurfacePool | null, index: i32): i32 {
  return pool === null ? 0 : pool.getLevel(index);
}

export function surfacePoolGetId(pool: SurfacePool | null, index: i32): i32 {
  return pool === null ? 0 : pool.getId(index);
}

export function surfacePoolIsStatic(pool: SurfacePool | null, index: i32): bool {
  return pool === null ? false : pool.isStatic(index);
}

export function surfacePoolRequestObservation(
  pool: SurfacePool | null,
  index: i32,
  capability: ObservationCapability = ObservationCapability.Enhanced,
): i32 {
  return pool === null ? 0 : pool.requestObservation(index, capability);
}

export function surfacePoolGetLastObservationCapability(
  pool: SurfacePool | null,
  index: i32,
): ObservationCapability {
  return pool === null ? ObservationCapability.Enhanced : pool.getLastObservationCapability(index);
}
