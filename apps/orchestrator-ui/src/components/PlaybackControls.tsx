import { usePlayback } from "../hooks/usePlayback";
import "./PlaybackControls.css";

const PlaybackControls: React.FC = () => {
  const { status, play, pause, stepForward, stepBackward, reset } = usePlayback();

  return (
    <div className="playback-controls">
      <button type="button" onClick={reset}>Stop</button>
      <button type="button" onClick={stepBackward}>Step -</button>
      {status === "playing" ? (
        <button type="button" onClick={pause}>Pause</button>
      ) : (
        <button type="button" onClick={play}>Play</button>
      )}
      <button type="button" onClick={stepForward}>Step +</button>
    </div>
  );
};

export default PlaybackControls;
