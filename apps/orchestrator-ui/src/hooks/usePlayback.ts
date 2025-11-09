import { useContext } from "react";
import { PlaybackContext } from "../context/PlaybackContext";

export function usePlayback() {
  const ctx = useContext(PlaybackContext);
  if (!ctx) {
    throw new Error("usePlayback must be used within a PlaybackProvider");
  }
  return ctx;
}
