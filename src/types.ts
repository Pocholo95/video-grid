// - Grid / Video

/** Result of setting up a native video decoder for frame capture. */
export type VideoDecoderSetup = {
  /** The configured HTMLVideoElement ready for seeking/frame capture. */
  video: HTMLVideoElement;
  /** Cleanup function to release the ObjectURL and reset the video element. */
  videoCleanup: () => void;
  /** Whether the browser can natively decode this video file. */
  canNativelyPlay: boolean;
};

export type Position =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "disabled";

export type VideoMetadata = {
  duration: number;
  width: number;
  height: number;
  bitrate: number;
  fps?: number;
  codec?: string;
};

// - VR video
/**
 * Describes how to crop a stereo VR frame to show only one eye.
 * "sbs" = Side-by-Side (left/right halves), "tb" = Top-Bottom (top/bottom halves).
 * "disabled" means no VR processing is applied.
 */
export type VrMode =
  | "disabled"
  | "sbs-left"
  | "sbs-right"
  | "tb-left"
  | "tb-right";

/**
 * Controls how sample timestamps are chosen for a specific queued file.
 * "auto" = evenly-distributed across the video duration.
 * "custom" = user-specified markers stored in `customTimestamps`.
 */
export type ItemTimestampMode = "auto" | "custom";

// - Custom grid templates

/**
 * A single cell in a custom grid template within a schmatic representation of the
 * grid. Not to be mixed up with FrameSlot which describe theses cells but
 * geometrically (to be able to draw them).
 *
 * `y` groups cells into rows - all cells sharing a `y` value form one row.
 * `x` determines left-to-right order within that row.
 * `w` is the cell's proportional weight within its row: the pixel width assigned
 *   to this cell is `(w / sum_of_w_in_row) × available_row_width`. Equal `w`
 *   values produce equal-width cells; larger values produce wider cells.
 * `h` is always 1 in the editor as height it computed from width. The actual pixel
 *   height in the output is derived from the cell's pixel width × the video
 *   aspect ratio, so it is never stored here.
 */
export type GridCell = {
  /** Unique cell identifier (used as item key). */
  id: string;
  /** Left-to-right order within the row. */
  x: number;
  /** Row index (0-based). Cells with the same y value form one row. */
  y: number;
  /**
   * Proportional width weight within the row.
   * Values are in grid "units" column units (1–12).
   * The renderer converts weights to pixel widths proportionally.
   */
  w: number;
  /** Always 1 - height is derived from aspect ratio at render time. */
  h: number;
};

/**
 * A custom grid layout template. Cells are grouped into rows by their `y`
 * value. Each row can hold any number of cells with independent proportional
 * widths. Row heights in the output are determined by the widest cell in each
 * row multiplied by the video aspect ratio.
 *
 * When set on SavedOptions, this overrides the uniform cols×rows grid layout.
 */
export type GridTemplate = {
  /**
   * Internal column count used in the editor.
   * Cell `w` values are expressed in these units and serve as proportional
   * weights -* the renderer does not use this field directly it's used for the
   *            schematic representation of the grid to keep the cells proportional.
   */
  cols: number;
  /** Cell definitions. All cells must have non-overlapping x positions within their row. */
  cells: GridCell[];
};

// - Upload
export type UploadStatus = "idle" | "uploading" | "done" | "error";

export type UploadResult = {
  /** URL to the host viewer page */
  pageUrl: string;
  /** Direct CDN URL for the full-size image */
  directUrl: string;
  /** Direct CDN URL for the medium image, when provided by the API */
  mediumUrl?: string;
  /** Direct CDN URL for the auto-generated thumbnail */
  thumbUrl: string;
  /** One-click delete URL */
  deleteUrl: string;
};

export type DestinationType = "chevereto";

export type UploadDestination = {
  id: string;
  name: string;
  type: DestinationType;
  apiKey: string;
  /**
   * Upload endpoint URL template. Must use HTTPS.
   * Use `{key}` as a placeholder for the API key, e.g.
   * `https://api.imgbb.com/1/upload?key={key}`.
   */
  url: string;
  enabled: boolean;
};

// - FFmpeg WASM memory tracking
export type FfmpegMemoryStats = {
  /** Memory currently in use (MB) */
  usedMB: number;
  /** Total heap allocated (MB) */
  totalMB: number;
  /** Maximum heap size (MB) */
  limitMB: number;
  /** true = from performance.memory (Chrome/Edge), false = estimated (Firefox/Safari) */
  accurate: boolean;
};

// - Per-destination upload state on an TaskItem
export type DestinationUploadState = {
  status: UploadStatus;
  progress: number;
  error?: string;
  result?: UploadResult;
};

// - Task items
export type TaskItem = {
  id: string;
  file: File;
  status: "queued" | "processing" | "done" | "error" | "cancelled";
  error?: string;
  warning?: string;
  outputName?: string;
  outputSize?: number;
  outputBlob?: Blob;
  metadata?: VideoMetadata;
  processingStartedAt?: number;
  processingDurationMs?: number;
  /**
   * Upload state keyed by destination id.
   * Only populated once processing completes and an upload is attempted.
   */
  uploads?: Record<string, DestinationUploadState>;
  /**
   * Per-file timestamp mode. Defaults to "auto" when undefined.
   * Reset to "auto" whenever the grid dimensions (cols/rows) change.
   */
  timestampMode?: ItemTimestampMode;
  /**
   * User-specified marker times in seconds, sorted ascending.
   * Only used when timestampMode is "custom".
   * Cells beyond the length of this array fall back to auto-calculated times.
   */
  customTimestamps?: number[];
  /**
   * Accumulated FFmpeg WASM log lines for this task.
   * Populated when FFmpeg is used for frame extraction or encoding.
   */
  ffmpegLogs?: string[];
  /**
   * Live memory stats while FFmpeg is processing this task.
   * Cleared once processing completes.
   */
  memoryStats?: FfmpegMemoryStats;
};

// - Settings / Options

/** Persisted expanded/collapsed state of the three Control Panel fieldsets. */
export type SectionStates = {
  grid: boolean;
  style: boolean;
  modes: boolean;
};

/** Available theme options for the app. */
export type Theme = "dark" | "light" | "dimmed" | "classic";

export type SavedOptions = {
  width: number;
  cols: number;
  rows: number;
  spacing: number;
  position: Position;
  bgColor: string;
  textColor: string;
  header: boolean;
  preview: boolean;
  animated: boolean;
  animDuration: number;
  animFps: number;
  webpMethod: number;
  webpQuality: number;
  vrMode: VrMode;
  sectionStates?: SectionStates;
  gridTemplate?: GridTemplate;
};

export type Presets = Record<string, SavedOptions>;

export type AppSettings = {
  presets: {
    entries: Presets;
    lastUsed: string | null;
  };
  /** Upload destinations stored alongside other app settings */
  destinations: UploadDestination[];
  /** Current theme: "dark", "light", or "classic" */
  theme: Theme;
  /** Whether to show preview thumbnails in the tasks list (app-wide setting) */
  showPreview: boolean;
};
