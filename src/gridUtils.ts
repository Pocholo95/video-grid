import {
  HEADER_LINE_SPACING,
  HEADER_PADDING_LEFT,
  HEADER_TEXT_SIZE,
} from "./constants";
import type { Position, VideoMetadata, VrMode } from "./types";
import { formatTime, hexToRgba, humanSize } from "./utils";

/**
 * Returns the source crop rectangle for a VR stereo frame, isolating one eye.
 *
 * @param frameW - Width of the source frame in pixels
 * @param frameH - Height of the source frame in pixels
 * @param vrMode - VR mode excluding "disabled" (sbs-left, sbs-right, tb-left, tb-right)
 * @returns Crop rectangle {sx, sy, sw, sh} for canvas drawImage
 */
export const getVrCropRect = (
  frameW: number,
  frameH: number,
  vrMode: Exclude<VrMode, "disabled">,
): { sx: number; sy: number; sh: number; sw: number } => {
  if (vrMode === "sbs-left" || vrMode === "sbs-right") {
    const sw = Math.floor(frameW / 2);
    return { sx: vrMode === "sbs-right" ? sw : 0, sy: 0, sw, sh: frameH };
  }
  const sh = Math.floor(frameH / 2);
  return { sx: 0, sy: vrMode === "tb-right" ? sh : 0, sw: frameW, sh };
};

/**
 * Returns a human-readable label for the active VR crop mode.
 *
 * @param vrMode - VR mode including "disabled"
 * @returns Human-readable label for the VR mode, empty string for "disabled"
 */
export const vrModeLabel = (vrMode: VrMode): string => {
  switch (vrMode) {
    case "sbs-left":
      return "SBS - Crop Left Eye";
    case "sbs-right":
      return "SBS - Crop Right Eye";
    case "tb-left":
      return "TB - Crop Top (Left Eye)";
    case "tb-right":
      return "TB - Crop Bottom (Right Eye)";
    default:
      return "";
  }
};

/**
 * Converts timecode position string to x/y alignment for overlay placement.
 *
 * @param position - Position excluding "disabled" (top-left, top-right, bottom-left, bottom-right)
 * @returns Object with x ("left"|"right") and y ("top"|"bottom") alignment
 */
export const getTimecodePosition = (
  position: Exclude<Position, "disabled">,
): { x: "left" | "right"; y: "top" | "bottom" } => {
  const posMap: Record<
    Exclude<Position, "disabled">,
    { x: "left" | "right"; y: "top" | "bottom" }
  > = {
    "top-left": { x: "left", y: "top" },
    "top-right": { x: "right", y: "top" },
    "bottom-left": { x: "left", y: "bottom" },
    "bottom-right": { x: "right", y: "bottom" },
  };
  return posMap[position];
};

/**
 * Creates a canvas with file information header for video thumbnails.
 *
 * @param file - File object containing name and size
 * @param meta - Video metadata with width, height, duration, bitrate
 * @param vrMode - VR mode for optional VR status display
 * @param canvasWidth - Target width of the header canvas
 * @param bgColor - Background color (hex string)
 * @param textColor - Text color (hex string)
 * @returns Canvas element with rendered header text
 */
export const createHeaderCanvas = (
  file: File,
  meta: VideoMetadata,
  vrMode: VrMode,
  canvasWidth: number,
  bgColor: string,
  textColor: string,
): HTMLCanvasElement => {
  const vrActive = vrMode !== "disabled";
  const vrHeaderNote = vrActive ? `VR Video: ${vrModeLabel(vrMode)}` : null;

  const infoLines = [
    `Filename: ${file.name}`,
    `Size: ${humanSize(file.size)}`,
    `Resolution: ${meta.width > 0 ? `${meta.width}x${meta.height}` : "Unknown"}`,
    `Duration: ${formatTime(meta.duration)}`,
    `Bitrate: ${meta.bitrate ? `${Math.round(meta.bitrate / 1000)} kbps` : "Unknown"}`,
  ];
  if (vrHeaderNote) infoLines.push(vrHeaderNote);

  const headerHeight =
    HEADER_PADDING_LEFT * 2 + infoLines.length * HEADER_LINE_SPACING;

  const headerCanvas = document.createElement("canvas");
  headerCanvas.width = canvasWidth;
  headerCanvas.height = headerHeight;

  const ctx = headerCanvas.getContext("2d")!;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvasWidth, headerHeight);
  ctx.fillStyle = textColor;
  ctx.font = `${HEADER_TEXT_SIZE}px system-ui, Arial, sans-serif`;
  ctx.textBaseline = "top";

  const maxTextWidth = canvasWidth - HEADER_PADDING_LEFT * 2;
  let yPos = HEADER_PADDING_LEFT;

  for (const line of infoLines) {
    let displayLine = line;
    if (ctx.measureText(displayLine).width > maxTextWidth) {
      while (
        displayLine.length > 0 &&
        ctx.measureText(displayLine + "…").width > maxTextWidth
      ) {
        displayLine = displayLine.slice(0, -1);
      }
      displayLine += "…";
    }
    ctx.fillText(displayLine, HEADER_PADDING_LEFT, yPos);
    yPos += HEADER_LINE_SPACING;
  }

  ctx.textBaseline = "alphabetic";
  return headerCanvas;
};

/**
 * Draws timecode overlay with background in specified cell position.
 *
 * @param ctx - 2D canvas rendering context
 * @param tSec - Time in seconds to display
 * @param x - Cell X position
 * @param y - Cell Y position
 * @param cellWidth - Cell width
 * @param cellHeight - Cell height
 * @param totalWidth - Total canvas width (for font scaling)
 * @param position - Timecode position (disabled skips drawing)
 * @param bgColor - Background color (hex string)
 * @param textColor - Text color (hex string)
 */
export const drawTimecodeOverlay = (
  ctx: CanvasRenderingContext2D,
  tSec: number,
  x: number,
  y: number,
  cellWidth: number,
  cellHeight: number,
  totalWidth: number,
  position: Position,
  bgColor: string,
  textColor: string,
): void => {
  if (position === "disabled") return;

  const label = formatTime(tSec);
  const tcFontSz = Math.max(11, Math.round(totalWidth * 0.012));
  ctx.font = `${tcFontSz}px system-ui, Arial, sans-serif`;
  ctx.textBaseline = "top";

  const textW = ctx.measureText(label).width;
  const pad = 6;
  const bgW = textW + pad * 2;
  const bgH = tcFontSz + pad * 2;
  const pos = getTimecodePosition(position as Exclude<Position, "disabled">);
  const bgX = pos.x === "left" ? x + pad : x + cellWidth - bgW - pad;
  const bgY = pos.y === "top" ? y + pad : y + cellHeight - bgH - pad;

  ctx.fillStyle = hexToRgba(bgColor, 0.6);
  ctx.fillRect(bgX, bgY, bgW, bgH);
  ctx.fillStyle = textColor;
  ctx.fillText(label, bgX + pad, bgY + pad);
  ctx.textBaseline = "alphabetic";
};

/**
 * Draws error placeholder text centered in a cell.
 *
 * @param ctx - 2D canvas rendering context
 * @param x - Cell X position
 * @param y - Cell Y position
 * @param cellWidth - Cell width
 * @param cellHeight - Cell height
 * @param bgColor - Background color (hex string)
 */
export const drawErrorPlaceholder = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cellWidth: number,
  cellHeight: number,
  bgColor: string,
): void => {
  ctx.fillStyle = bgColor;
  ctx.fillRect(x, y, cellWidth, cellHeight);
  ctx.fillStyle = "#555";
  ctx.font = "18px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("FAILED", x + cellWidth / 2, y + cellHeight / 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
};

/**
 * Calculates evenly distributed sample timestamps across video duration with margins.
 *
 * @param totalCells - Number of thumbnail cells to generate
 * @param duration - Total video duration in seconds
 * @returns Array of timestamp positions in seconds
 */
export const calculateSampleTimes = (
  totalCells: number,
  duration: number,
): number[] => {
  const margin = Math.max(0.5, duration * 0.02);
  const usable = Math.max(duration - 2 * margin, 0.1);
  return Array.from({ length: totalCells }, (_, i) =>
    Math.min(Math.max(0, margin + usable * ((i + 0.5) / totalCells)), duration),
  );
};

/**
 * Resolves the final list of cell timestamps, prioritizing custom markers.
 *
 * Custom markers are always used first (up to totalCells). Remaining cells are
 * filled with auto timestamps not already in custom markers, then the result
 * is sorted chronologically. All timestamps clamped to [0, duration - 0.001].
 *
 * @param custom - User-supplied marker timestamps in seconds.
 * @param totalCells - Number of cells in the grid (cols * rows).
 * @param duration - Video duration in seconds.
 * @returns Array of exactly `totalCells` timestamps in seconds, sorted ascending.
 */
export const resolveTimestamps = (
  custom: number[],
  totalCells: number,
  duration: number,
): number[] => {
  const maxT = Math.max(0, duration - 0.001);
  const clamped = custom
    .map((t) => Math.min(Math.max(0, t), maxT))
    .sort((a, b) => a - b);

  if (clamped.length >= totalCells) {
    return clamped.slice(0, totalCells);
  }

  const auto = calculateSampleTimes(totalCells, duration);
  const used = new Set(clamped.map((t) => Number(t.toFixed(6))));
  const result: number[] = [...clamped];

  for (const t of auto) {
    if (result.length >= totalCells) break;
    if (!used.has(Number(t.toFixed(6)))) {
      result.push(t);
    }
  }

  return result.sort((a, b) => a - b);
};
