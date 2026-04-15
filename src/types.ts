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
  /** URL to the Cheverto viewer page */
  pageUrl: string;
  /** Direct CDN URL for the full-size image */
  directUrl: string;
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
