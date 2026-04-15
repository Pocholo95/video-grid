import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { errlog, humanSize, log } from "./utils";

// Singleton instance and load promise, shared across the module.
let ffmpeg: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;
let currentFFmpegInputKey: string | null = null;

/** Returns the shared FFmpeg instance, initialising it on first call. */
const getFFmpeg = async (): Promise<FFmpeg> => {
  if (ffmpeg) return ffmpeg;
  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const inst = new FFmpeg();
      await inst.load();
      ffmpeg = inst;
      return inst;
    })();
  }
  return ffmpegLoadPromise;
};

/** Terminates the FFmpeg instance and clears all cached state. */
export const resetFFmpeg = (): void => {
  if (ffmpeg) {
    try { ffmpeg.terminate(); } catch { /* already dead */ }
    ffmpeg = null;
  }
  ffmpegLoadPromise     = null;
  currentFFmpegInputKey = null;
};

/**
 * Ensures the given file is written to the FFmpeg virtual filesystem as
 * `input.mp4`, reusing the cached entry when the file identity matches.
 *
 * @param file - The video file to prepare.
 * @returns The ready-to-use FFmpeg instance.
 */
export const prepareFFmpegInput = async (file: File): Promise<FFmpeg> => {
  const ff  = await getFFmpeg();
  const key = `${file.name}:${file.size}:${file.lastModified}`;

  if (currentFFmpegInputKey !== key) {
    try { await ff.deleteFile("input.mp4"); } catch { /* ignore */ }
    log(`  Writing "${file.name}" (${humanSize(file.size)}) into FFmpeg FS…`);
    await ff.writeFile("input.mp4", await fetchFile(file));
    currentFFmpegInputKey = key;
    log("  FFmpeg FS write complete.");
  } else {
    log("  Reusing cached FFmpeg FS entry.");
  }

  return ff;
};

/** Removes `input.mp4` from the FFmpeg virtual filesystem and clears the cache key. */
export const cleanupFFmpeg = async (): Promise<void> => {
  if (!ffmpeg) return;
  try { await ffmpeg.deleteFile("input.mp4"); } catch { /* ignore */ }
  currentFFmpegInputKey = null;
};

/**
 * Returns true if the error looks like a WASM out-of-memory or abort condition.
 *
 * @param e - The caught error value.
 */
export const isMemoryError = (e: unknown): boolean =>
  /out.of.bounds|memory|unreachable|OOM|heap|abort/i.test(
    e instanceof Error ? e.message : String(e),
  );

/**
 * Extracts a batch of frames from a video file using FFmpeg WASM.
 * Each frame is decoded at the given timestamp and returned as an ImageBitmap.
 * Failed frames are returned as null and reported via `onFrameExtracted`.
 *
 * @param file             - The source video file.
 * @param times            - Array of timestamps (seconds) at which to extract frames.
 * @param onFrameExtracted - Optional callback invoked after each attempt with the
 *                           frame index, total count, and an error string if it failed.
 * @returns An array of ImageBitmap (or null for failed frames) in the same order as `times`.
 */
export const extractFramesFFmpegBatch = async (
  file: File,
  times: number[],
  onFrameExtracted?: (index: number, total: number, error?: string) => void,
): Promise<(ImageBitmap | null)[]> => {
  const ff      = await prepareFFmpegInput(file);
  const results: (ImageBitmap | null)[] = new Array(times.length).fill(null);

  for (let i = 0; i < times.length; i++) {
    const t    = times[i];
    const name = `frame_${i}.jpg`;
    log(`  [FFmpeg] Frame ${i + 1}/${times.length} at t=${t.toFixed(3)}s`);
    try {
      await ff.exec([
        "-ss", String(t),
        "-i", "input.mp4",
        "-frames:v", "1",
        "-q:v", "1",
        "-loglevel", "error",
        name,
      ]);
      const data        = await ff.readFile(name);
      const arrayBuffer = new Uint8Array(
        typeof data === "string" ? new TextEncoder().encode(data) : data,
      ).buffer;
      const blob        = new Blob([arrayBuffer], { type: "image/jpeg" });
      results[i]        = await createImageBitmap(blob);
      onFrameExtracted?.(i, times.length);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errlog(`  [FFmpeg] Frame ${i + 1} failed:`, msg);
      onFrameExtracted?.(i, times.length, msg);
    } finally {
      try { await ff.deleteFile(name); } catch { /* ignore */ }
    }
  }

  return results;
};
