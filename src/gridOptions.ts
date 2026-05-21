import { DEFAULTS } from "./constants";
import type { SavedOptions, TaskItem, VideoMetadata } from "./types";
import type {
  StaticGridRenderOptions,
  AnimatedGridRenderOptions,
  FrameExtractionOptions,
} from "./types/service";

/**
 * Build the shared frame extraction options from user settings.
 * These are the options common to both static and animated grids.
 */
export function buildFrameOptions(opts: SavedOptions): FrameExtractionOptions {
  return {
    width: Math.max(240, opts.width || DEFAULTS.width),
    cols: Math.max(1, opts.cols || DEFAULTS.cols),
    rows: Math.max(1, opts.rows || DEFAULTS.rows),
    spacing: Math.max(0, opts.spacing || DEFAULTS.spacing),
    position: opts.position ?? DEFAULTS.position,
    header: opts.header ?? DEFAULTS.header,
    bgColor: opts.bgColor || DEFAULTS.bgColor,
    textColor: opts.textColor || DEFAULTS.textColor,
    vrMode: opts.vrMode ?? DEFAULTS.vrMode,
    gridTemplate:
      opts.gridTemplate && opts.gridTemplate.cells.length > 0
        ? opts.gridTemplate
        : undefined,
    customTimestamps: undefined,
  };
}

/**
 * Build static grid render options for a single task item.
 * Incorporates per-item custom timestamps and video duration.
 */
export function buildStaticGridOptions(
  opts: SavedOptions,
  item: TaskItem,
  meta: VideoMetadata,
): StaticGridRenderOptions {
  const frameOpts = buildFrameOptions(opts);
  const customTimestamps =
    item.timestampMode === "custom" &&
    item.customTimestamps &&
    item.customTimestamps.length > 0
      ? item.customTimestamps
      : undefined;

  return {
    ...frameOpts,
    customTimestamps,
    duration: Math.max(1, meta.duration || 1),
  };
}

/**
 * Build animated grid render options for a single task item.
 * Extends static options with animation-specific settings.
 */
export function buildAnimatedGridOptions(
  opts: SavedOptions,
  item: TaskItem,
  meta: VideoMetadata,
): AnimatedGridRenderOptions {
  const staticOpts = buildStaticGridOptions(opts, item, meta);

  return {
    ...staticOpts,
    animDuration: Math.max(1, opts.animDuration ?? DEFAULTS.animDuration),
    animFps: Math.max(1, opts.animFps ?? DEFAULTS.animFps),
    webpMethod: opts.webpMethod ?? DEFAULTS.webpMethod,
    webpQuality: Math.min(
      100,
      Math.max(5, opts.webpQuality ?? DEFAULTS.webpQuality),
    ),
  };
}
