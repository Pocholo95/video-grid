export type Position =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "disabled";

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
};

export type VideoMetadata = {
  duration: number;
  width: number;
  height: number;
  bitrate: number;
};

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

/**
 * Root structure persisted under APP_STORAGE_KEY.
 * New top-level settings can be added here alongside `presets`.
 */
export type AppSettings = {
  presets: {
    /** Named preset entries keyed by preset name. */
    entries: Presets;
    /** The last preset the user switched to; null means <Default Preset>. */
    lastUsed: string | null;
  };
};
