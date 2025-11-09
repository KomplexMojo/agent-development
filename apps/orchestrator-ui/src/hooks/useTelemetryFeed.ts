import { useContext } from "react";
import { TelemetryContext } from "../context/PlaybackContext";

export function useTelemetryFeed() {
  const ctx = useContext(TelemetryContext);
  if (!ctx) {
    throw new Error("useTelemetryFeed must be used within a PlaybackProvider");
  }
  return ctx;
}
