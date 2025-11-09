import { useCallback, useEffect, useState } from "react";
import type { TelemetryFrame } from "../utils/types";
import type { TelemetryMeta } from "../telemetry/types";
import { fetchTelemetryDocument } from "../telemetry/api";

export type TelemetryAdapterResult = {
  frames: TelemetryFrame[];
  meta: TelemetryMeta;
  reload: () => Promise<void>;
  isLoading: boolean;
};

const EMPTY_META: TelemetryMeta = {
  summaries: [],
  grid: { width: 0, height: 0 },
};

export function useTelemetryAdapter(): TelemetryAdapterResult {
  const [frames, setFrames] = useState<TelemetryFrame[]>([]);
  const [meta, setMeta] = useState<TelemetryMeta>(EMPTY_META);
  const [isLoading, setIsLoading] = useState(false);

  const fetchTelemetry = useCallback(async () => {
    setIsLoading(true);
    try {
      const document = await fetchTelemetryDocument();
      setFrames(document.frames);
      setMeta(document.meta);
    } catch {
      setFrames([]);
      setMeta(EMPTY_META);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTelemetry();
  }, [fetchTelemetry]);

  return { frames, meta, reload: fetchTelemetry, isLoading };
}
