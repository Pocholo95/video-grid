import mediaInfoFactory from "mediainfo.js";
import type { MediaInfo } from "mediainfo.js";
import { errlog, log } from "./utils";
import type { VideoMetadata } from "./types";

// ---------------------------------------------------------------------------
// Singleton — loaded on demand, released on "Clear files"
// ---------------------------------------------------------------------------

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

/**
 * Close and discard the MediaInfo instance.
 * Called on "Clear files" alongside resetFFmpeg().
 */
export const closeMediaInfo = (): void => {
  if (mediaInfoInstance) {
    try { mediaInfoInstance.close(); } catch { /* already closed */ }
    mediaInfoInstance = null;
  }
  mediaInfoLoadPromise = null;
};

// ---------------------------------------------------------------------------
// Metadata reading
// ---------------------------------------------------------------------------

/**
 * Read container metadata using MediaInfo.js.
 *
 * Works for every format MediaInfo supports (MKV, AVI, WMV, MOV, MP4, TS,
 * WebM, …) regardless of whether the browser can play the file natively.
 * The file is read in 256 KB chunks — never copied into the FFmpeg WASM heap.
 */
export const readMetadataMediaInfo = async (
  file: File,
  onProgress?: (pct: number, status: string) => void,
): Promise<VideoMetadata> => {
  onProgress?.(5, "Loading MediaInfo…");
  const mi = await getMediaInfo();
  onProgress?.(20, "Analysing container…");

  const readChunk = async (
    chunkSize: number,
    offset: number,
  ): Promise<Uint8Array> => {
    const buf = await file.slice(offset, offset + chunkSize).arrayBuffer();
    return new Uint8Array(buf);
  };

  try {
    const result = await mi.analyzeData(file.size, readChunk);
    onProgress?.(90, "Parsing track info…");

    const tracks = result.media?.track ?? [];
    // Cast to loose record — avoids exhaustive imports of every typed track
    // interface while still letting us read any field by name.
    const general = tracks.find(
      (t) => t["@type"] === "General",
    ) as Record<string, string> | undefined;
    const video = tracks.find(
      (t) => t["@type"] === "Video",
    ) as Record<string, string> | undefined;

    const duration =
      parseFloat(video?.Duration ?? general?.Duration ?? "0") || 0;
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

// ---------------------------------------------------------------------------
// Native decode check
// ---------------------------------------------------------------------------

/**
 * Quick synchronous check: can the browser natively decode this video?
 * Used only to show a proactive FFmpeg warning in the UI.
 */
export const canNativelyPlay = (file: File): boolean => {
  const mime = file.type;
  if (!mime) return true; // unknown type — be optimistic
  return document.createElement("video").canPlayType(mime) !== "";
};
