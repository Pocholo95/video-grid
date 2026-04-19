import type { SavedOptions } from "./types";

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
};

// Header layout
export const HEADER_HEIGHT = 160;
export const HEADER_PADDING_LEFT = 12;
export const HEADER_TEXT_SIZE = 24;
export const HEADER_LINE_SPACING = 26;

export const SEEK_TIMEOUT_MS = 10_000;

/** localStorage key for all persisted app settings (presets, destinations, …) */
export const APP_STORAGE_KEY = "vidgrid_settings";

export const PRESETS_DEFAULT_VALUE = "__default__";

export const DEBUG = true;
