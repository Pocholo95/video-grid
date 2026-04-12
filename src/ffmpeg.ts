import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { errlog, humanSize, log } from "./utils";

// ---------------------------------------------------------------------------
// Singleton — loaded on demand
// ---------------------------------------------------------------------------

let ffmpeg: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;
let currentFFmpegInputKey: string | null = null;

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

/**
 * Fully tear down the FFmpeg instance and clear all cached state.
 * Called on "Clear files". NOT called automatically after every error.
 */
export const resetFFmpeg = (): void => {
  if (ffmpeg) {
    try { ffmpeg.terminate(); } catch { /* already dead */ }
    ffmpeg = null;
  }
  ffmpegLoadPromise     = null;
  currentFFmpegInputKey = null;
};

// ---------------------------------------------------------------------------
// Input file management
// ---------------------------------------------------------------------------

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

export const cleanupFFmpeg = async (): Promise<void> => {
  if (!ffmpeg) return;
  try { await ffmpeg.deleteFile("input.mp4"); } catch { /* ignore */ }
  currentFFmpegInputKey = null;
};

// ---------------------------------------------------------------------------
// Frame extraction
// ---------------------------------------------------------------------------

/** Returns true for WASM heap / OOM error messages. */
export const isMemoryError = (e: unknown): boolean =>
  /out.of.bounds|memory|unreachable|OOM|heap|abort/i.test(
    e instanceof Error ? e.message : String(e),
  );

/**
 * Extract all frames in one pass using FFmpeg.
 *
 * prepareFFmpegInput() is called once; subsequent calls for the same file
 * are cache hits (no second full copy). Each frame has its own try/catch so
 * one bad seek does not abort the rest.
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
