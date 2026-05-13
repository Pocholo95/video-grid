import type { SavedOptions } from "./types";

export const PROJECT_NAME = import.meta.env.VITE_PROJECT_NAME || "VidGrid-HTML";
export const PROJECT_URL =
  import.meta.env.VITE_PROJECT_URL ||
  "https://gitlab.com/aknott001/vidgrid-html";
export const AUTHOR_URL =
  import.meta.env.VITE_AUTHOR_URL || "https://gitlab.com/aknott00";
export const AUTHOR_NAME = import.meta.env.VITE_AUTHOR_NAME || "aknott";

export const DEFAULTS: SavedOptions = {
  width: 1920,
  cols: 3,
  rows: 4,
  spacing: 0,
  position: "top-left",
  bgColor: "#000000",
  textColor: "#ffffff",
  header: true,
  preview: true,
  animated: false,
  animDuration: 3,
  animFps: 10,
  webpMethod: 5,
  webpQuality: 85,
  vrMode: "disabled",
  sectionStates: { grid: true, style: true, modes: true },
  gridTemplate: undefined,
};

// Header layout
export const HEADER_PADDING_LEFT = 12;
export const HEADER_TEXT_SIZE = 24;
export const HEADER_LINE_SPACING = 26;

export const SEEK_TIMEOUT_MS = 10_000;

/** Timeout for the native video element to become ready for decoding. */
export const VIDEO_OPEN_TIMEOUT_MS = 15_000;

/** Timeout for a single FFmpeg WASM exec() call (e.g., frame extraction, encoding). */
export const FFMPEG_EXEC_TIMEOUT_MS = 45_000;

/**
 * If per-file progress does not advance for longer than this threshold,
 * the UI considers the operation stale and offers a Force Kill button.
 */
export const FFMPEG_STALE_THRESHOLD_MS = 10_000;

/** localStorage key for all persisted app settings (presets, destinations, …) */
export const APP_STORAGE_KEY = "vidgrid_settings";

export const PRESETS_DEFAULT_VALUE = "__default__";

export const DEBUG = true;
