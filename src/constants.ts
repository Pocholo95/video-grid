import type { SavedOptions } from "./types";

export const DEFAULTS: SavedOptions = {
  width:     1920,
  cols:      3,
  rows:      4,
  spacing:   0,
  position:  "top-left",
  bgColor:   "#000000",
  textColor: "#ffffff",
  header:    true,
  preview:   true,
};

// Header layout — match Python VidGrid defaults
export const HEADER_HEIGHT       = 160;
export const HEADER_PADDING_LEFT = 12;
export const HEADER_TEXT_SIZE    = 24;
export const HEADER_LINE_SPACING = 26;

export const SEEK_TIMEOUT_MS = 10_000;

/** localStorage key for app settings (presets, etc.) */
export const APP_STORAGE_KEY          = "vidgrid_settings";
/** localStorage key for upload destinations */
export const DESTINATIONS_STORAGE_KEY = "vidgrid_destinations";

export const PRESETS_DEFAULT_VALUE = "__default__";

export const DEBUG = true;
