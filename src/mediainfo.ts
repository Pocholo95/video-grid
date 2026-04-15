import mediaInfoFactory from "mediainfo.js";
import type { MediaInfo } from "mediainfo.js";
import { errlog, log } from "./utils";
import type { VideoMetadata } from "./types";

// ─── Singleton ────────────────────────────────────────────────────────────────

let mediaInfoInstance: MediaInfo | null = null;
let mediaInfoLoadPromise: Promise<MediaInfo> | null = null;

const getMediaInfo = async (): Promise<MediaInfo> => {
  if (mediaInfoInstance) return mediaInfoInstance;
  if (!mediaInfoLoadPromise) {
    mediaInfoLoadPromise = (async () => {
      const mi = await mediaInfoFactory({
        format: "object",
        locateFile: () =>
          "https://unpkg.com/mediainfo.js/dist/MediaInfoModule.wasm",
      });
      mediaInfoInstance = mi;
      return mi;
    })();
  }
  return mediaInfoLoadPromise;
};

export const closeMediaInfo = (): void => {
  if (mediaInfoInstance) {
    try { mediaInfoInstance.close(); } catch { /* already closed */ }
    mediaInfoInstance = null;
  }
  mediaInfoLoadPromise = null;
};

// ─── Metadata reading ─────────────────────────────────────────────────────────

export const readMetadataMediaInfo = async (
  file: File,
  onProgress?: (pct: number, status: string) => void,
): Promise<VideoMetadata> => {
  onProgress?.(5, "Loading MediaInfo…");
  const mi = await getMediaInfo();
  onProgress?.(20, "Analysing container…");

  const readChunk = async (chunkSize: number, offset: number): Promise<Uint8Array> => {
    const buf = await file.slice(offset, offset + chunkSize).arrayBuffer();
    return new Uint8Array(buf);
  };

  try {
    const result = await mi.analyzeData(file.size, readChunk);
    onProgress?.(90, "Parsing track info…");

    const tracks  = result.media?.track ?? [];
    const general = tracks.find((t) => t["@type"] === "General") as Record<string, string> | undefined;
    const video   = tracks.find((t) => t["@type"] === "Video")   as Record<string, string> | undefined;

    const duration = parseFloat(video?.Duration ?? general?.Duration ?? "0") || 0;
    const width    = parseInt(video?.Width  ?? "0", 10) || 0;
    const height   = parseInt(video?.Height ?? "0", 10) || 0;
    const bitrate  = parseInt(general?.OverallBitRate ?? "0", 10) || 0;

    log(`MediaInfo: duration=${duration}s, ${width}x${height}, ${bitrate}bps`);
    onProgress?.(100, "Metadata ready");
    return { duration, width, height, bitrate };
  } catch (e) {
    errlog("MediaInfo analysis failed:", e);
    onProgress?.(100, "Metadata extraction failed");
    return { duration: 0, width: 0, height: 0, bitrate: 0 };
  }
};

// ─── Native decode check ──────────────────────────────────────────────────────

export const canNativelyPlay = (file: File): boolean => {
  const mime = file.type;
  if (!mime) return true;
  return document.createElement("video").canPlayType(mime) !== "";
};
