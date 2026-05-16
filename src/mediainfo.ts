import mediaInfoFactory from "mediainfo.js";
import type { MediaInfo } from "mediainfo.js";
import { errlog, log } from "./utils";
import type { VideoMetadata } from "./types";

// Singleton instance and load promise, shared across the module.
let mediaInfoInstance: MediaInfo | null = null;
let mediaInfoLoadPromise: Promise<MediaInfo> | null = null;

/** Returns the shared MediaInfo instance, initialising it on first call. */
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

/** Closes the MediaInfo instance and clears the singleton state. */
export const closeMediaInfo = (): void => {
  if (mediaInfoInstance) {
    try {
      mediaInfoInstance.close();
    } catch {
      /* already closed */
    }
    mediaInfoInstance = null;
  }
  mediaInfoLoadPromise = null;
};

/**
 * Reads video metadata from a file using MediaInfo.
 * Returns zeroed fields on failure rather than throwing.
 *
 * @param file       - The video file to analyze.
 * @param onProgress - Optional callback for progress updates (0-100, status message).
 * @returns Parsed metadata including duration, dimensions, and bitrate.
 */
export const readMetadataMediaInfo = async (
  file: File,
  onProgress?: (pct: number, status: string) => void,
): Promise<VideoMetadata> => {
  onProgress?.(5, "Loading MediaInfo…");
  const mi = await getMediaInfo();
  onProgress?.(20, "Analyzing container…");

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
    const general = tracks.find((t) => t["@type"] === "General") as
      | Record<string, string>
      | undefined;
    const video = tracks.find((t) => t["@type"] === "Video") as
      | Record<string, string>
      | undefined;

    const duration =
      parseFloat(video?.Duration ?? general?.Duration ?? "0") || 0;
    const width = parseInt(video?.Width ?? "0", 10) || 0;
    const height = parseInt(video?.Height ?? "0", 10) || 0;
    const bitrate = parseInt(general?.OverallBitRate ?? "0", 10) || 0;

    // Extract frame rate from the video track.
    const rawFps = video?.["FrameRate"] ?? video?.["Frame rate"];
    const fps = rawFps
      ? parseFloat(typeof rawFps === "string" ? rawFps : String(rawFps))
      : undefined;

    // Build a consolidated codec/quality profile string.
    // E.g. "H.264 / High Profile / 8-bit / SDR" or "HEVC / Main 10 / 10-bit / HDR"
    const parts: string[] = [];

    // 1. Codec family name
    const format = video?.Format ?? video?.Codec_ID ?? null;
    if (format) parts.push(format);

    // 2. Profile (e.g. "High", "Main 10", "Constrained Baseline")
    const profile = video?.Format_Profile ?? null;
    if (profile) parts.push(`${profile} Profile`);

    // 3. Bit depth (e.g. "8", "10")
    const bitDepth = video?.BitDepth ?? video?.["Bit depth"] ?? null;
    if (bitDepth) parts.push(`${bitDepth}-bit`);

    // 4. HDR / SDR indicator
    const dynamicRange =
      video?.Dynamic_Range ?? video?.["Dynamic range"] ?? null;
    if (dynamicRange) parts.push(dynamicRange);

    // 5. Scan order (VFR flag — useful quality indicator)
    const scanOrder = video?.ScanOrder ?? video?.Scan_Type ?? null;
    if (scanOrder && scanOrder !== "Progressive") parts.push(scanOrder);

    const codec = parts.length > 0 ? parts.join(" / ") : undefined;

    log(
      `MediaInfo: duration=${duration}s, ${width}×${height}, ` +
        `${bitrate}bps, ${fps ?? "N/A"}fps, codec=${codec ?? "N/A"}`,
    );
    onProgress?.(100, "Metadata ready");
    return { duration, width, height, bitrate, fps, codec };
  } catch (e) {
    errlog("MediaInfo analysis failed:", e);
    onProgress?.(100, "Metadata extraction failed");
    return { duration: 0, width: 0, height: 0, bitrate: 0 };
  }
};
