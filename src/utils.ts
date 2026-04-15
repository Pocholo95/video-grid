import { DEBUG } from "./constants";
import type { VideoMetadata } from "./types";

// ─── Logging ──────────────────────────────────────────────────────────────────
export const log    = (...a: unknown[]) => DEBUG && console.log("[VidGrid]", ...a);
export const warn   = (...a: unknown[]) => DEBUG && console.warn("[VidGrid]", ...a);
export const errlog = (...a: unknown[]) => DEBUG && console.error("[VidGrid]", ...a);

// ─── Formatting ───────────────────────────────────────────────────────────────
export const humanSize = (bytes: number): string => {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

export const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

export const makeId = (): string => crypto.randomUUID();

// ─── Metadata guard ───────────────────────────────────────────────────────────
export const hasUsableMetadata = (
  meta: VideoMetadata | undefined,
): meta is VideoMetadata =>
  meta != null && meta.duration > 0 && meta.width > 0 && meta.height > 0;
