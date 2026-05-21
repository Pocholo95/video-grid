// Service interfaces for the refactored architecture

import type {
  AppSettings,
  VideoMetadata,
  VrMode,
  GridTemplate,
  Position,
} from "../types";

/** Interface for FFmpeg service lifecycle and operations */
export interface IFFmpegService {
  /** Initialize FFmpeg WASM instance. Resolves when ready. Idempotent. */
  init(): Promise<void>;
  /** Check if instance is loaded and functional */
  isReady(): boolean;
  /** Execute an FFmpeg command */
  exec(args: string[]): Promise<void>;
  /** Write data to FFmpeg virtual filesystem */
  writeData(path: string, data: Uint8Array): Promise<void>;
  /** Read data from FFmpeg virtual filesystem */
  readData(path: string): Promise<Uint8Array>;
  /** List files in FFmpeg virtual filesystem */
  listDir(path: string): Promise<unknown[]>;
  /** Delete a file from virtual filesystem */
  deleteFile(path: string): Promise<void>;
  /** Terminate and release all resources */
  destroy(): Promise<void>;
  /** Re-initialize after termination */
  reinit(): Promise<void>;
  /** Register callback for FFmpeg stderr log lines (passes full array) */
  onLog(callback: ((taskId: string, logs: string[]) => void) | null): void;
  /** Register callback for FFmpeg progress events ({ progress: number }) */
  onProgress(callback: ((data: { progress: number }) => void) | null): void;
  /** Remove a previously registered progress callback */
  offProgress(callback: ((data: { progress: number }) => void) | null): void;
  /** Terminate FFmpeg instance (for between-task cleanup) */
  reset(): Promise<void>;
  /** Current task ID for log attribution */
  setTaskId(id: string | null): void;
  /** Get accumulated logs for a task and clear them */
  getAndClearLogs(taskId: string): string[];
  /** Check if FFmpeg is currently busy (for stale detection) */
  getBusyState(): boolean;
  /** Set abort controller for current operation; returns the controller */
  setAbortController(): AbortController;
  /** Abort current FFmpeg operation */
  abortCurrent(): void;
}

/** Interface for MediaInfo service */
export interface IMediaInfoService {
  /** Initialize MediaInfo WASM instance. Idempotent. */
  init(): Promise<void>;
  /** Read video metadata from a File */
  analyze(
    file: File,
    onProgress?: (pct: number, status: string) => void,
  ): Promise<VideoMetadata>;
  /** Release resources */
  destroy(): void;
}

/** Interface for persistent storage backend */
export interface IStorageProvider {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Schema version for stored settings */
export interface VersionedSettings {
  schemaVersion: number;
  data: AppSettings;
}

/** Processor sub-state for batch tracking */
export interface BatchState {
  batchDone: number;
  batchTotal: number;
  batchStartTime: number | null;
  batchDurationMs: number | null;
  succeeded: number;
  errored: number;
  cancelled: number;
}

/** Processor UI status (split from mixed concerns) */
export interface ProcessorUIState {
  text: string;
  textKind?: "info" | "success" | "warning" | "cancelled";
  currentPct: number;
  isProcessing: boolean;
  isStale: boolean;
  staleTaskId: string | null;
}

/** Result from grid rendering */
export interface GridRenderResult {
  outputName: string;
  outputSize: number;
  outputBlob: Blob;
}

/** Common frame rendering callback */
export type FrameDoneCallback = (
  frameIdx: number,
  totalFrames: number,
  timestampSec: number,
) => void;

/** Common warning callback */
export type WarningCallback = (message: string) => void;

/** Grid frame extraction options (shared between JPEG and WebP) */
export interface FrameExtractionOptions {
  width: number;
  cols: number;
  rows: number;
  spacing: number;
  position: Position;
  header: boolean;
  bgColor: string;
  textColor: string;
  vrMode: VrMode;
  gridTemplate: GridTemplate | undefined;
  customTimestamps: number[] | undefined;
}

/** Static JPEG grid rendering options */
export interface StaticGridRenderOptions extends FrameExtractionOptions {
  /** Duration of source video in seconds (used for fallback) */
  duration: number;
}

/** Animated WebP grid rendering options */
export interface AnimatedGridRenderOptions extends StaticGridRenderOptions {
  /** Duration in seconds of each cell's animation clip */
  animDuration: number;
  /** Output frame rate of the animated WebP */
  animFps: number;
  /** WebP compression method (0-6) */
  webpMethod: number;
  /** WebP output quality (5-100) */
  webpQuality: number;
}

/** Result from grid rendering operations */
export interface GridRenderOutput {
  outputName: string;
  outputSize: number;
  outputBlob: Blob;
}

/** Callback for static grid frame progress */
export type StaticFrameCallback = (
  frameIndex: number,
  totalFrames: number,
  timestampSec: number,
) => void;

/** Callback for animated grid frame progress */
export type AnimatedFrameCallback = (
  composedFrame: number,
  totalFrames: number,
) => void;

/** Callback for animated grid encoding progress (0-1 ratio) */
export type EncodeProgressCallback = (ratio: number) => void;

/** Interface for GridRenderer service */
export interface IGridRenderer {
  /**
   * Render a static JPEG contact sheet for a single video file.
   * Tries native browser seeking first, falls back to FFmpeg WASM.
   */
  renderStaticGrid(
    file: File,
    meta: VideoMetadata,
    opts: StaticGridRenderOptions,
    isCancelled: () => boolean,
    onFrameDone: StaticFrameCallback,
    onWarning: WarningCallback,
  ): Promise<GridRenderOutput>;

  /**
   * Render an animated WebP contact sheet for a single video file.
   * Requires native browser video support.
   */
  renderAnimatedGrid(
    file: File,
    meta: VideoMetadata,
    opts: AnimatedGridRenderOptions,
    isCancelled: () => boolean,
    onFrameDone: AnimatedFrameCallback,
    onEncodeProgress: EncodeProgressCallback,
    onWarning: WarningCallback,
  ): Promise<GridRenderOutput>;

  /** Release resources (async to clean up cached FFmpeg virtual filesystem files) */
  destroy(): Promise<void>;
}
