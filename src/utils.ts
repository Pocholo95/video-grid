import { DEBUG } from "./constants";
import type { VideoMetadata } from "./types";

// Logging - all calls are no-ops when DEBUG is false.
export const log    = (...a: unknown[]) => DEBUG && console.log("[VidGrid]", ...a);
export const warn   = (...a: unknown[]) => DEBUG && console.warn("[VidGrid]", ...a);
export const errlog = (...a: unknown[]) => DEBUG && console.error("[VidGrid]", ...a);

/**
 * Formats a byte count as a human-readable string (B, KB, MB, GB).
 *
 * @param bytes - The raw byte count.
 */
export const humanSize = (bytes: number): string => {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

/**
 * Formats a duration in seconds as `HH:MM:SS`.
 * Returns `"00:00:00"` for non-finite or negative values.
 *
 * @param seconds - Duration in seconds.
 */
export const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

/** Generates a random UUID string suitable for use as an item ID. */
export const makeId = (): string => crypto.randomUUID();

/**
 * Type guard that returns true when `meta` contains valid, usable video dimensions
 * and a positive duration. Use this before passing metadata to grid generation.
 *
 * @param meta - The VideoMetadata object to check (may be undefined).
 */
export const hasUsableMetadata = (
  meta: VideoMetadata | undefined,
): meta is VideoMetadata =>
  meta != null && meta.duration > 0 && meta.width > 0 && meta.height > 0;
