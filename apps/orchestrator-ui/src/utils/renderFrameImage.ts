import { CELL_SIZE, MAX_GRID_HEIGHT, MAX_GRID_WIDTH } from "./gridSettings";
import type { TelemetryFrame } from "./types";

const COLOR_PALETTE = [
  "#38bdf8",
  "#f472b6",
  "#f97316",
  "#34d399",
  "#a855f7",
  "#22d3ee",
  "#f87171",
  "#fb7185",
];

const CULTIVATION_PROGRESS_WINDOW = 6;
const CULTIVATION_MAX_BLUR_FRACTION = 0.45;
const CULTIVATION_MIN_ALPHA = 0.35;

function hashColor(key: string | undefined): string {
  if (!key) return COLOR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

export type RenderFrameOptions = {
  selectedAgentId?: string | null;
  backgroundColor?: string;
};

export type RenderFrameResult = {
  dataUrl: string;
  pixelWidth: number;
  pixelHeight: number;
};

export function renderFrameToImage(frame: TelemetryFrame, options: RenderFrameOptions): RenderFrameResult | null {
  if (typeof document === "undefined") return null;
  const { selectedAgentId, backgroundColor = "#ffffff" } = options;
  const rows = frame.grid ?? [];
  const actualWidth = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const actualHeight = rows.length;
  if (!actualWidth || !actualHeight) return null;

  const renderWidth = Math.min(Math.max(1, actualWidth), MAX_GRID_WIDTH);
  const renderHeight = Math.min(Math.max(1, actualHeight), MAX_GRID_HEIGHT);

  const canvas = document.createElement("canvas");
  canvas.width = renderWidth * CELL_SIZE;
  canvas.height = renderHeight * CELL_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cellFont = `${Math.max(10, CELL_SIZE * 0.6)}px 'JetBrains Mono', monospace`;

  for (let rowIndex = 0; rowIndex < renderHeight; rowIndex += 1) {
    const row = rows[rowIndex] ?? "";
    for (let colIndex = 0; colIndex < renderWidth; colIndex += 1) {
      const symbol = row[colIndex] ?? ".";
      const x = colIndex * CELL_SIZE;
      const y = rowIndex * CELL_SIZE;
      ctx.fillStyle = symbol === "." ? "#e2e8f0" : "#cbd5f5";
      ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
      if (symbol !== "." && rowIndex < actualHeight && colIndex < actualWidth) {
        ctx.fillStyle = "#64748b";
        ctx.font = cellFont;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(symbol, x + CELL_SIZE / 2, y + CELL_SIZE / 2);
      }
    }
  }

  const drawBadge = (x: number, y: number, label: string, color: string, paddingFactor = 0.15) => {
    if (x < 0 || x >= renderWidth || y < 0 || y >= renderHeight) return;
    const px = x * CELL_SIZE;
    const py = y * CELL_SIZE;
    const padding = CELL_SIZE * paddingFactor;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = color;
    ctx.fillRect(px + padding, py + padding, CELL_SIZE - padding * 2, CELL_SIZE - padding * 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#0f172a";
    ctx.font = `${Math.max(9, CELL_SIZE * 0.5)}px 'JetBrains Mono', monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, px + CELL_SIZE / 2, py + CELL_SIZE / 2);
    ctx.restore();
  };

  for (const portal of frame.portals) {
    const label = portal.symbol ?? (portal.type === "exit" ? "▶" : "◀");
    const color = portal.type === "exit" ? "#f472b6" : "#34d399";
    drawBadge(portal.x, portal.y, label, color);
  }

  for (const stair of frame.stairs) {
    const label = stair.symbol ?? (stair.type === "up" ? "▲" : "▼");
    const color = stair.type === "up" ? "#38bdf8" : "#f97316";
    drawBadge(stair.x, stair.y, label, color, 0.18);
  }

  for (const actor of frame.actors) {
    if (actor.x < 0 || actor.x >= renderWidth || actor.y < 0 || actor.y >= renderHeight) {
      continue;
    }
    const px = actor.x * CELL_SIZE + CELL_SIZE / 2;
    const py = actor.y * CELL_SIZE + CELL_SIZE / 2;
    const radius = Math.max(2, CELL_SIZE * 0.35);

    ctx.beginPath();
    if (actor.kind === "barrier" || actor.role === "barrier") {
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#000000";
      ctx.fillRect(actor.x * CELL_SIZE, actor.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      continue;
    }

    const isCultivating = Boolean(actor.cultivation?.isActive);
    const normalizedTicks = isCultivating ? Math.max(0, actor.cultivation?.ticks ?? 0) : 0;
    const cultivationProgress = isCultivating
      ? Math.min(normalizedTicks / CULTIVATION_PROGRESS_WINDOW, 1)
      : 1;
    const blurRadius = isCultivating
      ? (1 - cultivationProgress) * CELL_SIZE * CULTIVATION_MAX_BLUR_FRACTION
      : 0;
    const cultivationAlpha = isCultivating
      ? CULTIVATION_MIN_ALPHA + cultivationProgress * (1 - CULTIVATION_MIN_ALPHA)
      : 1;
    const actorColor = hashColor(actor.id ?? actor.symbol);

    ctx.save();
    ctx.globalAlpha = cultivationAlpha;
    if (blurRadius > 0.05) {
      ctx.filter = `blur(${blurRadius.toFixed(2)}px)`;
    }
    ctx.fillStyle = actorColor;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (isCultivating) {
      ctx.save();
      ctx.globalAlpha = 0.4 + cultivationProgress * 0.4;
      ctx.strokeStyle = "rgba(250, 204, 21, 0.9)";
      ctx.lineWidth = Math.max(1, CELL_SIZE * 0.12);
      ctx.beginPath();
      const start = -Math.PI / 2;
      ctx.arc(px, py, radius + ctx.lineWidth * 0.8, start, start + Math.PI * 2 * cultivationProgress);
      ctx.stroke();
      ctx.restore();
    }

    if (actor.id === selectedAgentId) {
      ctx.save();
      ctx.lineWidth = Math.max(1.5, CELL_SIZE * 0.1);
      ctx.strokeStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(px, py, radius + ctx.lineWidth * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (CELL_SIZE >= 10) {
      ctx.save();
      ctx.globalAlpha = cultivationAlpha;
      if (blurRadius > 0.05) {
        ctx.filter = `blur(${Math.max(blurRadius - 0.5, 0).toFixed(2)}px)`;
      }
      ctx.fillStyle = "#0f172a";
      ctx.font = `${Math.max(9, CELL_SIZE * 0.55)}px 'JetBrains Mono', monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(actor.symbol ?? "•", px, py + 0.5);
      ctx.restore();
    }
  }

  return {
    dataUrl: canvas.toDataURL("image/png"),
    pixelWidth: canvas.width,
    pixelHeight: canvas.height,
  };
}
