import { FormEvent, useEffect, useMemo, useState } from "react";
import { useDemoData } from "../context/PlaybackContext";
import {
  CELL_SIZE,
  MAX_ADDRESSABLE_CELLS,
  MAX_DEMO_TICKS,
  MAX_GRID_HEIGHT,
  MAX_GRID_WIDTH,
  MIN_GRID_HEIGHT,
  MIN_GRID_WIDTH,
  RESERVED_SPECIAL_CELLS,
  DEFAULT_SURFACE_WIDTH,
  DEFAULT_SURFACE_HEIGHT,
  computeDefaultPopulation,
} from "../utils/gridSettings";

type Props = {
  showTitle?: boolean;
};

const MIN_ACTORS = 1;
const MIN_BARRIERS = 0;
const MAX_ACTORS = MAX_ADDRESSABLE_CELLS - RESERVED_SPECIAL_CELLS;
const MAX_BARRIERS = MAX_ADDRESSABLE_CELLS - RESERVED_SPECIAL_CELLS;
const MIN_TICKS = 1;
const MAX_TICKS = MAX_DEMO_TICKS;

const INITIAL_SURFACE_WIDTH = DEFAULT_SURFACE_WIDTH;
const INITIAL_SURFACE_HEIGHT = DEFAULT_SURFACE_HEIGHT;
const INITIAL_POPULATION = computeDefaultPopulation(INITIAL_SURFACE_WIDTH, INITIAL_SURFACE_HEIGHT);
const INITIAL_ACTORS = Math.max(MIN_ACTORS, INITIAL_POPULATION.actors);
const INITIAL_BARRIERS = Math.max(MIN_BARRIERS, INITIAL_POPULATION.barriers);

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const rounded = Math.floor(value);
  return Math.min(Math.max(rounded, min), max);
}

function parseClamped(value: string, min: number, max: number): number {
  if (!value.trim()) return min;
  return clampInt(Number(value), min, max);
}

const GenerationControls: React.FC<Props> = ({ showTitle = true }) => {
  const { reload, isLoading } = useDemoData();
  const [ticks, setTicks] = useState(String(MAX_TICKS));
  const [width, setWidth] = useState(String(INITIAL_SURFACE_WIDTH));
  const [height, setHeight] = useState(String(INITIAL_SURFACE_HEIGHT));
  const [actorCount, setActorCount] = useState(String(INITIAL_ACTORS));
  const [barriers, setBarriers] = useState(String(INITIAL_BARRIERS));
  const [seed, setSeed] = useState("");
  const [mock, setMock] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const derived = useMemo(() => {
    const widthValue = parseClamped(width, MIN_GRID_WIDTH, MAX_GRID_WIDTH);
    const heightValue = parseClamped(height, MIN_GRID_HEIGHT, MAX_GRID_HEIGHT);
    const totalCells = widthValue * heightValue;

    const rawActors = clampInt(Number(actorCount), MIN_ACTORS, MAX_ACTORS);
    const rawBarriers = clampInt(Number(barriers), MIN_BARRIERS, MAX_BARRIERS);

    const maxActorsFromTotal = Math.max(MIN_ACTORS, totalCells - MIN_BARRIERS - RESERVED_SPECIAL_CELLS);
    const maxBarriersFromTotal = Math.max(MIN_BARRIERS, totalCells - MIN_ACTORS - RESERVED_SPECIAL_CELLS);

    let actorValue = Math.min(rawActors, maxActorsFromTotal);
    let barrierValue = Math.min(rawBarriers, maxBarriersFromTotal);

    const actorCapByBarriers = Math.max(MIN_ACTORS, totalCells - barrierValue - RESERVED_SPECIAL_CELLS);
    actorValue = clampInt(actorValue, MIN_ACTORS, actorCapByBarriers);

    const barrierCapByActors = Math.max(MIN_BARRIERS, totalCells - actorValue - RESERVED_SPECIAL_CELLS);
    barrierValue = clampInt(barrierValue, MIN_BARRIERS, barrierCapByActors);

    const usedCells = actorValue + barrierValue + RESERVED_SPECIAL_CELLS;
    const remainingCells = totalCells - usedCells;
    const maxActorsAllowed = Math.max(MIN_ACTORS, Math.min(actorCapByBarriers, MAX_ACTORS));
    const maxBarriersAllowed = Math.max(MIN_BARRIERS, Math.min(barrierCapByActors, MAX_BARRIERS));

    return {
      widthValue,
      heightValue,
      totalCells,
      actorValue,
      barrierValue,
      usedCells,
      remainingCells,
      maxActorsAllowed,
      maxBarriersAllowed,
      hasOverflow: remainingCells < 0,
    };
  }, [width, height, actorCount, barriers]);

  useEffect(() => {
    const nextActors = derived.actorValue.toString();
    if (actorCount !== nextActors) {
      setActorCount(nextActors);
    }
  }, [derived.actorValue, actorCount]);

  useEffect(() => {
    const nextBarriers = derived.barrierValue.toString();
    if (barriers !== nextBarriers) {
      setBarriers(nextBarriers);
    }
  }, [derived.barrierValue, barriers]);

  useEffect(() => {
    if (!width.trim()) return;
    const nextWidth = Math.min(Math.max(parseClamped(width, MIN_GRID_WIDTH, MAX_GRID_WIDTH), MIN_GRID_WIDTH), MAX_GRID_WIDTH).toString();
    if (width !== nextWidth) {
      setWidth(nextWidth);
    }
  }, [width]);

  useEffect(() => {
    if (!height.trim()) return;
    const nextHeight = Math.min(Math.max(parseClamped(height, MIN_GRID_HEIGHT, MAX_GRID_HEIGHT), MIN_GRID_HEIGHT), MAX_GRID_HEIGHT).toString();
    if (height !== nextHeight) {
      setHeight(nextHeight);
    }
  }, [height]);

  const occupancyMessage = derived.hasOverflow
    ? `Over capacity by ${Math.abs(derived.remainingCells)} cell(s).`
    : `${derived.remainingCells} cell(s) available.`;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setStatus(null);

    try {
      if (derived.hasOverflow) {
        throw new Error("Configuration exceeds available cells.");
      }

      const payload: Record<string, unknown> = {};
      if (ticks.trim()) {
        payload.ticks = parseClamped(ticks, MIN_TICKS, MAX_TICKS);
      }
      payload.width = derived.widthValue;
      payload.height = derived.heightValue;
      payload.actorCount = derived.actorValue;
      payload.barrierCount = derived.barrierValue;
      if (seed.trim()) {
        const value = Number(seed);
        if (Number.isFinite(value)) payload.seed = value;
      }
      if (mock) payload.mock = true;

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || `Generator failed (${res.status})`);
      }

      setStatus("Simulation generated.");
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to generate simulation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="generation-controls">
      {showTitle && <h2>Generate Simulation</h2>}
      <form onSubmit={handleSubmit} className="generation-controls__form">
        <div className="generation-controls__grid">
          <label>
            <span>Width</span>
            <input
              type="number"
              min={MIN_GRID_WIDTH}
              max={MAX_GRID_WIDTH}
              value={width}
              onChange={(event) => setWidth(event.target.value)}
            />
          </label>
          <label>
            <span>Height</span>
            <input
              type="number"
              min={MIN_GRID_HEIGHT}
              max={MAX_GRID_HEIGHT}
              value={height}
              onChange={(event) => setHeight(event.target.value)}
            />
          </label>
          <label>
            <span>Actors</span>
            <input
              type="number"
              min={MIN_ACTORS}
              max={derived.maxActorsAllowed}
              value={actorCount}
              onChange={(event) => setActorCount(event.target.value)}
            />
          </label>
          <label>
            <span>Barriers</span>
            <input
              type="number"
              min={MIN_BARRIERS}
              max={derived.maxBarriersAllowed}
              value={barriers}
              onChange={(event) => setBarriers(event.target.value)}
            />
          </label>
          <label>
            <span>Ticks (max {MAX_TICKS})</span>
            <input
              type="number"
              min={MIN_TICKS}
              max={MAX_TICKS}
              value={ticks}
              onChange={(event) => {
                const { value } = event.target;
                if (!value.trim()) {
                  setTicks("");
                  return;
                }
                const clamped = clampInt(Number(value), MIN_TICKS, MAX_TICKS);
                setTicks(clamped.toString());
              }}
            />
          </label>
          <label>
            <span>Seed</span>
            <input type="number" value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="auto" />
          </label>
        </div>
        <div className={`generation-controls__occupancy ${derived.hasOverflow ? "is-error" : ""}`}>
          <span>
            Grid: {derived.widthValue} × {derived.heightValue} = {derived.totalCells} cells
          </span>
          <span>
            Reserved (entrance, exit, stairs): {RESERVED_SPECIAL_CELLS} • Actors: {derived.actorValue} • Barriers: {derived.barrierValue}
          </span>
          <span className="generation-controls__occupancy-remaining">{occupancyMessage}</span>
        </div>
        <label className="generation-controls__mock">
          <input type="checkbox" checked={mock} onChange={(event) => setMock(event.target.checked)} />
          Use mock demo
        </label>
        <button type="submit" disabled={isSubmitting || isLoading || derived.hasOverflow}>
          {isSubmitting ? "Generating..." : "Generate"}
        </button>
        {status && <p className="generation-controls__status">{status}</p>}
        <p className="generation-controls__hint">
          Icons render at {CELL_SIZE}×{CELL_SIZE}px across a {MAX_GRID_WIDTH}×{MAX_GRID_HEIGHT} surface (max {MAX_ADDRESSABLE_CELLS} cells).
        </p>
      </form>
    </section>
  );
};

export default GenerationControls;
