import { DEBUG } from "./constants";
import type { VideoMetadata } from "./types";

// Logging - all calls are no-ops when DEBUG is false.
export const log = (...a: unknown[]) => DEBUG && console.log("[VidGrid]", ...a);
export const warn = (...a: unknown[]) =>
  DEBUG && console.warn("[VidGrid]", ...a);
export const errlog = (...a: unknown[]) =>
  DEBUG && console.error("[VidGrid]", ...a);

/**
 * Formats a byte count as a human-readable string (B, KB, MB, GB).
 *
 * @param bytes - The raw byte count.
 */
export const humanSize = (bytes: number): string => {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
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

/**
 * Formats a duration in seconds as `HH:MM:SS.f` (one decimal for tenths).
 * Useful for marker labels where sub-second precision matters.
 *
 * @param seconds - Duration in seconds.
 */
export const formatTimeExact = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00:00.0";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${s.toFixed(1).padStart(4, "0")}`;
};

/**
 * Formats elapsed milliseconds in a human-friendly way.
 * - Under 1 minute: "32.235s"
 * - Under 1 hour: "1m 30s"
 * - 1 hour or more: "2h 3m 4s"
 *
 * @param ms - Elapsed time in milliseconds.
 */
export const formatElapsed = (ms: number): string => {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const totalSeconds = ms / 1000;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}h ${m}m ${s.toFixed(0)}s`;
  }
  if (m > 0) {
    return `${m}m ${s.toFixed(0)}s`;
  }
  return `${s.toFixed(3)}s`;
};

/** Generates a random UUID string suitable for use as an item ID. */
export const makeId = (): string => crypto.randomUUID();

// Helper to generate unique filename if collision exists
export function makeUniqueName(name: string, existing: Set<string>): string {
  if (!existing.has(name)) return name;

  const lastDot = name.lastIndexOf(".");
  const hasExt = lastDot > -1;
  const base = hasExt ? name.substring(0, lastDot) : name;
  const ext = hasExt ? name.substring(lastDot) : "";

  let i = 1;
  let candidate = `${base}_${i}${ext}`;
  while (existing.has(candidate)) {
    i++;
    candidate = `${base}_${i}${ext}`;
  }
  return candidate;
}

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

/**
 * Converts a RGB Hex code (with or without # prefix) to an RGBA string.
 * Supports shorthand (#rgb) and full (#rrggbb) formats.
 *
 * @param hex - RGB Hex code string (e.g., '#ff0000' or '#f00')
 * @param alpha - Alpha value (0-1, defaults to 1)
 * @returns RGBA string
 * @throws Error for invalid hex
 */
export const hexToRgba = (hex: string, alpha: number = 1): string => {
  if (alpha < 0 || alpha > 1) {
    throw new Error("Alpha must be between 0 and 1");
  }
  const cleaned = hex.replace(/[^#a-fA-F0-9]/g, "").replace(/^#?/, "");
  if (!/^([a-f0-9]{3}){1,2}$/i.test(cleaned)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  let fullHex = cleaned;
  if (fullHex.length === 3) {
    fullHex = fullHex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(fullHex.slice(0, 2), 16);
  const g = parseInt(fullHex.slice(2, 4), 16);
  const b = parseInt(fullHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
