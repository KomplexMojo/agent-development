import { ChangeEvent } from "react";
import { usePlayback } from "../hooks/usePlayback";
import "./TimelineScrubber.css";

const TimelineScrubber: React.FC = () => {
  const { timelineLength, currentTick, seek } = usePlayback();

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    seek(Number(event.target.value));
  };

  return (
    <div className="timeline-scrubber">
      <input
        type="range"
        min={0}
        max={Math.max(0, timelineLength - 1)}
        value={currentTick}
        onChange={handleChange}
      />
      <span className="timeline-scrubber__label">tick {currentTick + 1} / {timelineLength}</span>
    </div>
  );
};

export default TimelineScrubber;
