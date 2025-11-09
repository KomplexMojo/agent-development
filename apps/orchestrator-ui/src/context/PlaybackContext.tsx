import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { TelemetryFrame } from "../utils/types";
import type { TelemetryMeta } from "../telemetry/types";
import { useTelemetryAdapter } from "../data/telemetryAdapter";

export type PlaybackStatus = "idle" | "playing" | "paused";

const PLAYBACK_INTERVAL_MS = 450;

type PlaybackContextValue = {
  status: PlaybackStatus;
  currentTick: number;
  timelineLength: number;
  play: () => void;
  pause: () => void;
  reset: () => void;
  stepForward: () => void;
  stepBackward: () => void;
  seek: (tick: number) => void;
};

type TelemetryContextValue = {
  currentFrame: TelemetryFrame | null;
  currentTick: number;
};

export const PlaybackContext = createContext<PlaybackContextValue | null>(null);
export const TelemetryContext = createContext<TelemetryContextValue | null>(null);
type DemoDataContextValue = {
  reload: () => Promise<void>;
  isLoading: boolean;
  meta: TelemetryMeta;
};
export const DemoDataContext = createContext<DemoDataContextValue | null>(null);

export const PlaybackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { frames, meta, reload, isLoading } = useTelemetryAdapter();
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [currentTick, setCurrentTick] = useState(0);

  const timelineLength = frames.length;
  const currentFrame = frames[currentTick] ?? null;

  useEffect(() => {
    setCurrentTick((prev) => Math.min(prev, Math.max(0, timelineLength - 1)));
  }, [timelineLength]);

  useEffect(() => {
    if (status !== "playing" || timelineLength <= 0 || typeof window === "undefined") {
      return;
    }

    const timer = window.setInterval(() => {
      setCurrentTick((prev) => {
        if (timelineLength <= 0) return 0;
        const next = prev + 1;
        return next >= timelineLength ? 0 : next;
      });
    }, PLAYBACK_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [status, timelineLength]);

  const play = useCallback(() => setStatus("playing"), []);
  const pause = useCallback(() => setStatus("paused"), []);
  const reset = useCallback(() => {
    setStatus("idle");
    setCurrentTick(0);
  }, []);
  const stepForward = useCallback(() => {
    setCurrentTick((prev) => Math.min(prev + 1, Math.max(0, timelineLength - 1)));
    setStatus("paused");
  }, [timelineLength]);
  const stepBackward = useCallback(() => {
    setCurrentTick((prev) => Math.max(prev - 1, 0));
    setStatus("paused");
  }, []);
  const seek = useCallback((tick: number) => {
    setCurrentTick(() => Math.min(Math.max(tick, 0), Math.max(0, timelineLength - 1)));
    setStatus("paused");
  }, [timelineLength]);

  const playbackValue = useMemo<PlaybackContextValue>(() => ({
    status,
    currentTick,
    timelineLength,
    play,
    pause,
    reset,
    stepForward,
    stepBackward,
    seek,
  }), [status, currentTick, timelineLength, play, pause, reset, stepForward, stepBackward, seek]);

  const telemetryValue = useMemo<TelemetryContextValue>(() => ({
    currentFrame,
    currentTick,
  }), [currentFrame, currentTick]);

  return (
    <DemoDataContext.Provider value={{ reload, isLoading, meta }}>
      <PlaybackContext.Provider value={playbackValue}>
        <TelemetryContext.Provider value={telemetryValue}>{children}</TelemetryContext.Provider>
      </PlaybackContext.Provider>
    </DemoDataContext.Provider>
  );
};

export function useDemoData(): DemoDataContextValue {
  const ctx = useContext(DemoDataContext);
  if (!ctx) {
    throw new Error("useDemoData must be used within a PlaybackProvider");
  }
  return ctx;
}
