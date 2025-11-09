import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTelemetryFeed } from "../hooks/useTelemetryFeed";
import { renderFrameToImage, type RenderFrameResult } from "../utils/renderFrameImage";
import { CELL_SIZE, MAX_GRID_HEIGHT, MAX_GRID_WIDTH } from "../utils/gridSettings";
import "./GridViewport.css";

type Props = {
  selectedAgentId: string | null;
  onSelectAgent: (id: string | null) => void;
};

const GridViewport: React.FC<Props> = ({ selectedAgentId, onSelectAgent }) => {
  const { currentFrame } = useTelemetryFeed();
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [renderedFrame, setRenderedFrame] = useState<RenderFrameResult | null>(null);

  const gridSize = useMemo(() => {
    if (!currentFrame?.grid) {
      return { width: 0, height: 0 };
    }
    const width = Math.min(
      MAX_GRID_WIDTH,
      currentFrame.grid.reduce((max, row) => Math.max(max, row.length), 0),
    );
    const height = Math.min(MAX_GRID_HEIGHT, currentFrame.grid.length);
    return { width, height };
  }, [currentFrame]);

  useEffect(() => {
    if (!currentFrame || gridSize.width === 0 || gridSize.height === 0) {
      setRenderedFrame(null);
      return;
    }
    const result = renderFrameToImage(currentFrame, {
      selectedAgentId,
    });
    setRenderedFrame(result);
  }, [currentFrame, gridSize, selectedAgentId]);

  const handleImageClick = useCallback((event: React.MouseEvent<HTMLImageElement>) => {
    if (!currentFrame || !renderedFrame) return;
    const target = imageRef.current;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    if (clickX < 0 || clickY < 0 || clickX > rect.width || clickY > rect.height) return;

    const scaleX = renderedFrame.pixelWidth / rect.width;
    const scaleY = renderedFrame.pixelHeight / rect.height;
    const cellX = Math.floor((clickX * scaleX) / CELL_SIZE);
    const cellY = Math.floor((clickY * scaleY) / CELL_SIZE);
    if (cellX < 0 || cellX >= gridSize.width || cellY < 0 || cellY >= gridSize.height) {
      return;
    }
    const actor = (currentFrame.actors ?? []).find(
      (item) => item.x === cellX && item.y === cellY && item.kind !== "barrier" && item.role !== "barrier",
    );
    if (actor) {
      onSelectAgent(actor.id === selectedAgentId ? null : actor.id);
    }
  }, [currentFrame, gridSize, renderedFrame, onSelectAgent, selectedAgentId]);

  return (
    <div className="grid-viewport">
      <div className="grid-viewport__stage-wrapper">
        <div className="grid-viewport__stage">
          {renderedFrame ? (
            <div
              className="grid-viewport__canvas"
              style={{ width: renderedFrame.pixelWidth, height: renderedFrame.pixelHeight }}
            >
              <img
                ref={imageRef}
                className="grid-viewport__image"
                src={renderedFrame.dataUrl}
                alt="Telemetry frame"
                width={renderedFrame.pixelWidth}
                height={renderedFrame.pixelHeight}
                draggable={false}
                onClick={handleImageClick}
              />
            </div>
          ) : (
            <div className="grid-viewport__empty">No frame loaded</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GridViewport;
