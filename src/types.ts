// - Grid / Video
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

// - Per-destination upload state on an OutputItem
export type DestinationUploadState = {
  status: UploadStatus;
  progress: number;
  error?: string;
  result?: UploadResult;
};

// - Queue items
export type OutputItem = {
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
};

// - Settings / Options
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
};

export type Presets = Record<string, SavedOptions>;

export type AppSettings = {
  presets: {
    entries: Presets;
    lastUsed: string | null;
  };
  /** Upload destinations stored alongside other app settings */
  destinations: UploadDestination[];
};
