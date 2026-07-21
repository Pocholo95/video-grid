/**
 * MediaInfo WASM Service - manages the lifecycle of mediainfo.js instance.
 *
 * Replaces module-level mutable state with a proper class-based service.
 * The service maintains exactly one MediaInfo instance (singleton pattern),
 * but encapsulates all state within the class for testability.
 */

import mediaInfoFactory from "mediainfo.js";
import type { MediaInfo } from "mediainfo.js";
import type { IMediaInfoService } from "../types/service";
import type { VideoMetadata } from "../types";
import { errlog, log } from "../utils";

/** - MediaInfo Service Implementation */

export class MediaInfoService implements IMediaInfoService {
  private instance: MediaInfo | null = null;
  private loadPromise: Promise<MediaInfo> | null = null;

  /**
   * Initialize MediaInfo WASM instance. Idempotent - subsequent calls return
   * the same loading promise.
   */
  public async init(): Promise<void> {
    if (this.instance) return;
    if (!this.loadPromise) {
      this.loadPromise = this.createInstance();
    }
    try {
      this.instance = await this.loadPromise;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errlog(
        "[MediaInfo] init: load promise rejected, clearing for retry:",
        msg,
      );
      this.loadPromise = null;
      this.instance = null;
      throw new Error(`MediaInfo load failed: ${msg}`);
    }
  }

  /**
   * Read video metadata from a file or blob using MediaInfo.
   * Returns zeroed fields on failure rather than throwing.
   *
   * @param blob       - The video file/blob to analyze.
   * @param onProgress - Optional callback for progress updates (0-100, status message).
   * @returns Parsed metadata including duration, dimensions, and bitrate.
   */
  public async analyze(
    blob: Blob,
    onProgress?: (pct: number, status: string) => void,
  ): Promise<VideoMetadata> {
    onProgress?.(5, "Loading MediaInfo…");
    await this.init();
    const mi = this.instance!;
    onProgress?.(20, "Analyzing container…");

    const readChunk = async (
      chunkSize: number,
      offset: number,
    ): Promise<Uint8Array> => {
      const buf = await blob.slice(offset, offset + chunkSize).arrayBuffer();
      return new Uint8Array(buf);
    };

    try {
      const result = await mi.analyzeData(blob.size, readChunk);
      onProgress?.(90, "Parsing track info…");

      const tracks = result.media?.track ?? [];
      const general = tracks.find((t) => t["@type"] === "General") as
        | Record<string, string>
        | undefined;
      const videoTracks = tracks.filter((t) => t["@type"] === "Video");
      const audioTracks = tracks.filter((t) => t["@type"] === "Audio");
      const video = videoTracks[0] as unknown as
        | Record<string, string>
        | undefined;
      const audio = audioTracks[0] as unknown as
        | Record<string, string>
        | undefined;

      const duration =
        parseFloat(video?.Duration ?? general?.Duration ?? "0") || 0;
      const width = parseInt(video?.Width ?? "0", 10) || 0;
      const height = parseInt(video?.Height ?? "0", 10) || 0;
      const videoBitrate = parseInt(video?.BitRate ?? "0", 10) || 0;

      // Extract frame rate from the video track.
      const rawFps = video?.["FrameRate"] ?? video?.["Frame rate"];
      const fps = rawFps
        ? parseFloat(typeof rawFps === "string" ? rawFps : String(rawFps))
        : undefined;

      // Build a consolidated codec/quality profile string.
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

      // Extract audio track info (first/default track)
      const audioBitrate = audio
        ? parseInt(audio?.BitRate ?? "0", 10) || undefined
        : undefined;
      const audioCodec = audio?.Format ?? audio?.Codec_ID ?? undefined;

      // Extract rotation angle (e.g. "90°" or "90 degrees") from the video track.
      const rawRotation = video?.Rotation ?? null;
      let rotation: number | undefined;
      if (rawRotation) {
        const match = String(rawRotation).match(/^(\d+)/);
        if (match) {
          rotation = parseInt(match[1], 10);
        }
      }

      log(
        `MediaInfo: duration=${duration}s, ${width}×${height}, ` +
          `${videoBitrate}bps, ${fps ?? "N/A"}fps, codec=${codec ?? "N/A"}${rotation ? `, rotation=${rotation}°` : ""}`,
      );
      onProgress?.(100, "Metadata ready");
      return {
        duration,
        width,
        height,
        videoBitrate,
        fps,
        codec,
        videoTracks: videoTracks.length,
        audioBitrate,
        audioCodec,
        audioTracks: audioTracks.length,
        rotation,
      };
    } catch (e) {
      errlog("MediaInfo analysis failed:", e);
      onProgress?.(100, "Metadata extraction failed");
      return { duration: 0, width: 0, height: 0, videoBitrate: 0 };
    }
  }

  /** Release MediaInfo resources */
  public destroy(): void {
    if (this.instance) {
      try {
        this.instance.close();
      } catch {
        /* already closed */
      }
      this.instance = null;
    }
    this.loadPromise = null;
  }

  /** - Private Helpers */

  private async createInstance(): Promise<MediaInfo> {
    const mi = await mediaInfoFactory({
      format: "object",
      locateFile: () =>
        "https://unpkg.com/mediainfo.js/dist/MediaInfoModule.wasm",
    });
    return mi;
  }
}
