// - Processor Status

/**
 * Status object returned by the processor hook to drive the ProcessingPanel UI.
 */
export type ProcessorStatus = {
  /** Human-readable status message displayed in the processing panel. */
  text: string;
  /**
   * Semantic kind of the current `text` message. Drives the icon shown
   * by the consumer (ProcessingPanel) so we don't have to embed emoji
   * directly in the message string. Optional; consumer treats undefined
   * as "info".
   */
  textKind?: "info" | "success" | "warning" | "cancelled";
  /** Current file progress as a percentage (0–100). */
  currentPct: number;
  /** Number of files completed in the current batch. */
  batchDone: number;
  /** Total number of files in the current batch. */
  batchTotal: number;
  /** Timestamp (ms) when the current batch started, or null if idle. */
  batchStartTime: number | null;
  /** Elapsed time in milliseconds for the current batch, or null if idle. */
  batchDurationMs: number | null;
};

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

/** Metadata extracted from a video file by the MediaInfo service. */
export type VideoMetadata = {
  /** Duration of the video in seconds. */
  duration: number;
  /** Native width of the video in pixels. */
  width: number;
  /** Native height of the video in pixels. */
  height: number;
  /** Video bitrate in bits per second. */
  videoBitrate: number;
  /** Frames per second, when detectable. */
  fps?: number;
  /** Video codec identifier, when detectable. */
  codec?: string;
  /** Number of video tracks. */
  videoTracks?: number;
  /** Audio bitrate in bits per second (first/default track). */
  audioBitrate?: number;
  /** Audio codec identifier (first/default track), when detectable. */
  audioCodec?: string;
  /** Number of audio tracks. */
  audioTracks?: number;
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
 * A single cell in a custom grid template within a schematic representation of the
 * grid. Not to be mixed up with FrameSlot which describes these cells but
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
  /** One-click delete URL (Chevereto) or file URL to delete (Catbox) */
  deleteUrl: string;
  /** Authentication token required for deletion (e.g. Catbox userhash) */
  deleteToken?: string;
};

export type DestinationType = "chevereto" | "catbox";

/** Configuration for a single upload destination. */
export type UploadDestination = {
  /** Unique identifier for the destination. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Backend type of the destination. */
  type: DestinationType;
  /** API key or token for authentication. */
  apiKey: string;
  /**
   * Upload endpoint URL template. Must use HTTPS.
   * Use `{key}` as a placeholder for the API key, e.g.
   * `https://api.imgbb.com/1/upload?key={key}`.
   */
  url: string;
  /** Whether uploads to this destination are active. */
  enabled: boolean;
  /**
   * Comma-separated list of allowed file extensions (e.g. ".jpg,.webp").
   * Output files must match one of these extensions to be uploadable.
   */
  allowedExtensions: string;
  /**
   * Maximum allowed file size in MB for uploads. 0 means no limit.
   */
  maxSizeMb: number;
};

// - Per-destination upload state on a task item
/** Upload state for a single destination on a task item. */
export type DestinationUploadState = {
  /** Current upload lifecycle state. */
  status: UploadStatus;
  /** Upload progress as a percentage (0–100). */
  progress: number;
  /** Error message when status is "error". */
  error?: string;
  /** Populated with URLs and delete link when status is "done". */
  result?: UploadResult;
};

// - Task items
/** Represents a single video file queued for grid processing. */
export type TaskItem = {
  /** Unique identifier for the task. */
  id: string;
  /** The source video file. */
  file: File;
  /** Current lifecycle state of the task. */
  status: "queued" | "processing" | "done" | "error" | "cancelled";
  /** Error message when status is "error". */
  error?: string;
  /** Non-fatal warning message, if any. */
  warning?: string;
  /** Filename of the generated grid image. */
  outputName?: string;
  /** Size of the generated grid image in bytes. */
  outputSize?: number;
  /** Blob containing the generated grid image. */
  outputBlob?: Blob;
  /** Video metadata extracted before processing. */
  metadata?: VideoMetadata;
  /** Timestamp (ms) when processing started for this task. */
  processingStartedAt?: number;
  /** Elapsed processing time in milliseconds. */
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
   * Total number of FFmpeg log lines produced before buffer trimming.
   * Shown alongside the visible line count so the user knows how much
   * output was generated even if the buffer was capped.
   */
  ffmpegTotalLines?: number;
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

/** Output format for animated modes. */
export type AnimFormat = "webp" | "mp4";

/** Grid rendering options persisted with presets. */
export type SavedOptions = {
  /** Output canvas width in pixels. */
  width: number;
  /** Number of columns in the grid. */
  cols: number;
  /** Number of rows in the grid. */
  rows: number;
  /** Spacing in pixels between cells. */
  spacing: number;
  /** Position of the timecode overlay on each cell. */
  tcPosition: Position;
  /** Background fill color for empty canvas areas. */
  bgColor: string;
  /** Text color for timecode overlay and header. */
  textColor: string;
  /** Whether to render a header row with the filename. */
  header: boolean;
  /** Whether to produce animated output instead of static JPEG. */
  animated: boolean;
  /**
   * When true (and animated is true), uses 1-cell sequence mode where each
   * segment plays sequentially instead of a grid layout. Grid controls are
   * disabled but still visible.
   */
  animSequence: boolean;
  /**
   * Number of sequential segments in sequence mode. Each segment is rendered
   * for the specified animDuration at the specified animFps.
   */
  animSegments: number;
  /**
   * Controls how segments are rendered in sequence mode.
   * "static" = one frame per segment repeated for the duration (default).
   * "video" = advances playback frame-by-frame during each segment.
   * "video_with_audio" = uses FFmpeg to cut/merge segments with audio preserved.
   */
  sequenceMode: "static" | "video" | "video_with_audio";
  /** Output format for animated modes: WebP (animated) or MP4 (H.264). */
  animFormat: AnimFormat;
  /** Duration in seconds of each cell's animation clip (animated mode only). */
  animDuration: number;
  /** Frame rate of the animated output. */
  animFps: number;
  /** WebP compression method (0-6, higher = better quality but slower). */
  webpMethod: number;
  /** WebP output quality (5-100). */
  webpQuality: number;
  /** VR mode for cropping stereo 360° video frames. */
  vrMode: VrMode;
  /** Font family for timecode overlay and header text. */
  fontFamily: string;
  /** When true (default), timecode font size scales with canvas width. */
  tcFontSizeAuto: boolean;
  /** Explicit timecode font size in pixels (used when tcFontSizeAuto is false). */
  tcFontSize: number;
  /** When true (default), header font size scales with canvas width. */
  headerFontSizeAuto: boolean;
  /** Explicit header font size in pixels (used when headerFontSizeAuto is false). */
  headerFontSize: number;
  /** Persisted expanded/collapsed state of the Control Panel sections. */
  sectionStates?: SectionStates;
  /** Custom grid layout; when set, overrides the uniform cols × rows grid. */
  gridTemplate?: GridTemplate;
};

/** Named preset configurations, keyed by display name. */
export type Presets = Record<string, SavedOptions>;

/** Root settings object persisted to localStorage. */
export type AppSettings = {
  presets: {
    /** Named preset configurations. */
    entries: Presets;
    /** Name of the most recently selected preset, or null. */
    lastUsed: string | null;
  };
  /** Upload destinations stored alongside other app settings */
  destinations: UploadDestination[];
  /** Current theme: "dark", "light", or "classic" */
  theme: Theme;
  /** Whether to show preview thumbnails in the tasks list (app-wide setting) */
  showPreview: boolean;
};
