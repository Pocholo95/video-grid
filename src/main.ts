import "./style.css";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import mediaInfoFactory from "mediainfo.js";
import type { MediaInfo } from "mediainfo.js";

type Position = "top-left" | "top-right" | "bottom-left" | "bottom-right";

type OutputItem = {
  id: string;
  file: File;
  status: "queued" | "processing" | "done" | "error" | "cancelled";
  error?: string;
  warning?: string;
  outputName?: string;
  outputSize?: number;
  outputBlob?: Blob;
  metadata?: {
    duration: number;
    width: number;
    height: number;
    bitrate: number;
  };
};

// ---------------------------------------------------------------------------
// Settings persistence — localStorage
// ---------------------------------------------------------------------------
const SETTINGS_KEY = "vidgrid_options";

type SavedOptions = {
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

const saveOptions = (): void => {
  try {
    const opts: SavedOptions = {
      width:     Number(els.width.value)   || 1600,
      cols:      Number(els.cols.value)    || 4,
      rows:      Number(els.rows.value)    || 3,
      spacing:   Number(els.spacing.value) || 0,
      position:  els.position.value as Position,
      bgColor:   els.bgColor.value,
      textColor: els.textColor.value,
      header:    els.header.checked,
      preview:   els.preview.checked,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(opts));
    setStatus("✅ Options saved.");
  } catch (e) {
    setStatus("⚠️ Could not save options.");
    console.warn("localStorage write failed:", e);
  }
};

const loadOptions = (): SavedOptions | null => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as SavedOptions) : null;
  } catch {
    return null;
  }
};

const applyOptions = (opts: SavedOptions): void => {
  els.width.value   = String(opts.width   ?? 1600);
  els.cols.value    = String(opts.cols    ?? 4);
  els.rows.value    = String(opts.rows    ?? 3);
  els.spacing.value = String(opts.spacing ?? 0);
  if (opts.position)  els.position.value  = opts.position;
  if (opts.bgColor)  { els.bgColor.value    = opts.bgColor;   els.bgColorHex.textContent   = opts.bgColor; }
  if (opts.textColor){ els.textColor.value  = opts.textColor; els.textColorHex.textContent = opts.textColor; }
  els.header.checked  = opts.header  ?? true;
  els.preview.checked = opts.preview ?? true;
};

// ---------------------------------------------------------------------------
// MediaInfo.js — shared instance, loaded on demand
//
// Replaces both the native <video> metadata reader and the old FFmpeg-based
// readMetadataFFmpeg / partial-probe approach.  MediaInfo understands virtually
// every container/codec without decoding any frames, and operates purely on
// chunked File.slice() reads — no full copy into a WASM heap required.
// ---------------------------------------------------------------------------
let mediaInfoInstance: MediaInfo | null = null;
let mediaInfoLoadPromise: Promise<MediaInfo> | null = null;

const getMediaInfo = async (): Promise<MediaInfo> => {
  if (mediaInfoInstance) return mediaInfoInstance;
  if (!mediaInfoLoadPromise) {
    mediaInfoLoadPromise = (async () => {
      const mi = await mediaInfoFactory({
        format: "object",
        locateFile: () => "https://unpkg.com/mediainfo.js/dist/MediaInfoModule.wasm",
      });
      mediaInfoInstance = mi;
      return mi;
    })();
  }
  return mediaInfoLoadPromise;
};

/**
 * Close and discard the MediaInfo instance.  Cheap to recreate on next use.
 * Called on "Clear files" alongside resetFFmpeg().
 */
const closeMediaInfo = (): void => {
  if (mediaInfoInstance) {
    try { mediaInfoInstance.close(); } catch { /* already closed */ }
    mediaInfoInstance = null;
  }
  mediaInfoLoadPromise = null;
};

/**
 * Read container metadata using MediaInfo.js.
 *
 * Works for every format MediaInfo supports (MKV, AVI, WMV, MOV, MP4, TS,
 * WebM, …) regardless of whether the browser can play the file natively.
 * The file is read in 256 KB chunks — never copied into the FFmpeg WASM heap.
 */
const readMetadataMediaInfo = async (
  file: File,
  onProgress?: (pct: number, status: string) => void,
): Promise<{ duration: number; width: number; height: number; bitrate: number }> => {
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

    const tracks = result.media?.track ?? [];
    // Cast to loose record so we can read any field by name without exhaustive
    // imports of every typed track interface.
    const general = tracks.find((t) => t["@type"] === "General") as Record<string, string> | undefined;
    const video   = tracks.find((t) => t["@type"] === "Video")   as Record<string, string> | undefined;

    // Duration: prefer the video-track value (more accurate for muxed files),
    // fall back to the general track.
    const duration = parseFloat(video?.Duration ?? general?.Duration ?? "0") || 0;
    const width    = parseInt(video?.Width  ?? "0", 10) || 0;
    const height   = parseInt(video?.Height ?? "0", 10) || 0;
    // OverallBitRate is in bps as a string.
    const bitrate  = parseInt(general?.OverallBitRate ?? "0", 10) || 0;

    onProgress?.(100, "Metadata ready");
    return { duration, width, height, bitrate };
  } catch (e) {
    errlog("MediaInfo analysis failed:", e);
    onProgress?.(100, "Metadata extraction failed");
    return { duration: 0, width: 0, height: 0, bitrate: 0 };
  }
};

/**
 * Quick, synchronous check: can the browser natively decode this video?
 *
 * Uses HTMLVideoElement.canPlayType() on the file's MIME type.  Returns true
 * if the browser reports "maybe" or "probably", false on "" (no support) or
 * unknown MIME.  This is used *only* to show a proactive FFmpeg warning —
 * the actual native/FFmpeg decision is made inside createGridJpg().
 */
const canNativelyPlay = (file: File): boolean => {
  const mime = file.type;
  if (!mime) return true; // unknown type — be optimistic; actual failure is caught later
  return document.createElement("video").canPlayType(mime) !== "";
};

// ---------------------------------------------------------------------------
// FFmpeg — shared instance, loaded on demand
// Used exclusively for frame extraction when the browser cannot decode natively.
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
 * Called on "Clear files".  NOT called automatically after every error.
 */
const resetFFmpeg = (): void => {
  if (ffmpeg) {
    try { ffmpeg.terminate(); } catch { /* already dead */ }
    ffmpeg = null;
  }
  ffmpegLoadPromise     = null;
  currentFFmpegInputKey = null;
};

/** Returns true for WASM heap / OOM error messages. */
const isMemoryError = (e: unknown): boolean =>
  /out.of.bounds|memory|unreachable|OOM|heap|abort/i.test(
    e instanceof Error ? e.message : String(e),
  );

const prepareFFmpegInput = async (file: File): Promise<FFmpeg> => {
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

const cleanupFFmpeg = async (): Promise<void> => {
  if (!ffmpeg) return;
  try { await ffmpeg.deleteFile("input.mp4"); } catch { /* ignore */ }
  currentFFmpegInputKey = null;
};

/**
 * Extract ALL frames in one pass — prepareFFmpegInput is called once;
 * subsequent calls for the same file are cache hits (no second full copy).
 * Each frame has its own try/catch so one bad seek does not abort the rest.
 */
const extractFramesFFmpegBatch = async (
  file: File,
  times: number[],
  onFrameExtracted?: (index: number, total: number, error?: string) => void,
): Promise<(ImageBitmap | null)[]> => {
  const ff      = await prepareFFmpegInput(file);
  const outputs = times.map((_, i) => `frame_${i}.jpg`);
  const results: (ImageBitmap | null)[] = new Array(times.length).fill(null);

  for (let i = 0; i < times.length; i++) {
    const t    = times[i];
    const name = outputs[i];
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
      const data = await ff.readFile(name);
      const blob = new Blob([data], { type: "image/jpeg" });
      results[i] = await createImageBitmap(blob);
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

const hasUsableMetadata = (meta: {
  duration: number; width: number; height: number; bitrate: number;
}): boolean => meta != null && meta.duration > 0 && meta.width > 0 && meta.height > 0;

// ---------------------------------------------------------------------------
// Header constants — match Python VidGrid defaults
// ---------------------------------------------------------------------------
const HEADER_HEIGHT       = 160;
const HEADER_PADDING_LEFT = 12;
const HEADER_TEXT_SIZE    = 24;
const HEADER_LINE_SPACING = 26;

const DEBUG  = true;
const log    = (...a: unknown[]) => DEBUG && console.log("[VidGrid]", ...a);
const warn   = (...a: unknown[]) => DEBUG && console.warn("[VidGrid]", ...a);
const errlog = (...a: unknown[]) => DEBUG && console.error("[VidGrid]", ...a);

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root not found");

app.innerHTML = `
  <main class="app-shell">
    <header class="app-header">
      <div class="brand-mark" aria-hidden="true"><img src="public/favicon.svg" alt="Logo" /></div>
      <div>
        <h1>VidGrid-HTML</h1>
        <p class="subtitle">Client-side JPG thumbnail grid generator</p>
      </div>
    </header>

    <section class="panel">
      <div class="controls">
        <label class="field">
          <span>Video files</span>
          <input id="files" type="file" accept="video/*" multiple />
        </label>

        <label class="field">
          <span>Output width (px)</span>
          <input id="width" type="number" min="240" step="1" value="1600" />
        </label>

        <label class="field">
          <span>Grid columns</span>
          <input id="cols" type="number" min="1" step="1" value="4" />
        </label>

        <label class="field">
          <span>Grid rows</span>
          <input id="rows" type="number" min="1" step="1" value="3" />
        </label>

        <label class="field">
          <span>Frame spacing (px)</span>
          <input id="spacing" type="number" min="0" step="1" value="0" />
        </label>

        <label class="field">
          <span>Timecode position</span>
          <select id="position">
            <option value="top-left">Top-left</option>
            <option value="top-right">Top-right</option>
            <option value="bottom-left">Bottom-left</option>
            <option value="bottom-right">Bottom-right</option>
          </select>
        </label>

        <label class="field color-field">
          <span>Background color</span>
          <div class="color-input-row">
            <input id="bgColor" type="color" value="#000000" />
            <span id="bgColorHex" class="color-hex">#000000</span>
          </div>
        </label>

        <label class="field color-field">
          <span>Text color</span>
          <div class="color-input-row">
            <input id="textColor" type="color" value="#ffffff" />
            <span id="textColorHex" class="color-hex">#ffffff</span>
          </div>
        </label>

        <label class="check">
          <input id="header" type="checkbox" checked />
          <span>Show header metadata</span>
        </label>

        <label class="check">
          <input id="preview" type="checkbox" checked />
          <span>Show preview</span>
        </label>

        <div class="actions">
          <button id="start"    class="primary">▶️ Start Processing</button>
          <button id="cancel">⏹️ Cancel</button>
          <button id="clear">🗑️ Clear Files</button>
          <button id="saveOpts">💾 Save Options</button>
          <button id="loadOpts">↩️ Restore Saved Options</button>
        </div>
      </div>

      <div class="progress-area">
        <div class="progress-block">
          <div class="progress-label">
            <span>Current file</span>
            <span id="currentPct">0%</span>
          </div>
          <progress id="currentProgress" value="0" max="100"></progress>
        </div>

        <div class="progress-block">
          <div class="progress-label">
            <span>Batch progress</span>
            <span id="batchPct">0%</span>
          </div>
          <progress id="batchProgress" value="0" max="100"></progress>
        </div>

        <div id="status" class="status">Select one or more videos to begin.</div>
      </div>
    </section>

    <section class="panel">
      <h2>Outputs</h2>
      <div id="outputs" class="outputs"></div>
    </section>

    <div id="previewModal" style="
      position:fixed;inset:0;display:none;align-items:center;
      justify-content:center;background:rgba(15,23,42,0.92);z-index:9999;
    ">
      <div style="
        max-width:96vw;max-height:96vh;
        box-shadow:0 25px 80px rgba(0,0,0,0.7);
        border-radius:16px;overflow:hidden;position:relative;
        background:#020617;border:1px solid rgba(130,213,253,0.4);
      ">
        <button id="previewClose" style="
          position:absolute;top:10px;right:10px;z-index:2;
          border-radius:999px;padding:6px 10px;border:0;cursor:pointer;
          background:rgba(15,23,42,0.85);color:#e2e8f0;font-size:0.8rem;
        ">✕ Close</button>
        <img id="previewModalImg" src="" alt="Preview"
             style="display:block;max-width:100%;max-height:100%;" />
      </div>
    </div>
  </main>
`;

const els = {
  files:           document.querySelector<HTMLInputElement>("#files")!,
  width:           document.querySelector<HTMLInputElement>("#width")!,
  cols:            document.querySelector<HTMLInputElement>("#cols")!,
  rows:            document.querySelector<HTMLInputElement>("#rows")!,
  spacing:         document.querySelector<HTMLInputElement>("#spacing")!,
  position:        document.querySelector<HTMLSelectElement>("#position")!,
  bgColor:         document.querySelector<HTMLInputElement>("#bgColor")!,
  bgColorHex:      document.querySelector<HTMLSpanElement>("#bgColorHex")!,
  textColor:       document.querySelector<HTMLInputElement>("#textColor")!,
  textColorHex:    document.querySelector<HTMLSpanElement>("#textColorHex")!,
  header:          document.querySelector<HTMLInputElement>("#header")!,
  preview:         document.querySelector<HTMLInputElement>("#preview")!,
  start:           document.querySelector<HTMLButtonElement>("#start")!,
  cancel:          document.querySelector<HTMLButtonElement>("#cancel")!,
  clear:           document.querySelector<HTMLButtonElement>("#clear")!,
  saveOpts:        document.querySelector<HTMLButtonElement>("#saveOpts")!,
  loadOpts:        document.querySelector<HTMLButtonElement>("#loadOpts")!,
  currentPct:      document.querySelector<HTMLSpanElement>("#currentPct")!,
  batchPct:        document.querySelector<HTMLSpanElement>("#batchPct")!,
  currentProgress: document.querySelector<HTMLProgressElement>("#currentProgress")!,
  batchProgress:   document.querySelector<HTMLProgressElement>("#batchProgress")!,
  status:          document.querySelector<HTMLDivElement>("#status")!,
  outputs:         document.querySelector<HTMLDivElement>("#outputs")!,
  previewModal:    document.querySelector<HTMLDivElement>("#previewModal")!,
  previewModalImg: document.querySelector<HTMLImageElement>("#previewModalImg")!,
  previewClose:    document.querySelector<HTMLButtonElement>("#previewClose")!,
};

// Sync hex label next to colour picker
const syncColorHex = (input: HTMLInputElement, label: HTMLSpanElement) => {
  label.textContent = input.value;
  input.addEventListener("input", () => { label.textContent = input.value; });
};
syncColorHex(els.bgColor,   els.bgColorHex);
syncColorHex(els.textColor, els.textColorHex);

// Auto-load saved options on startup (silent — no status message)
{
  const saved = loadOptions();
  if (saved) applyOptions(saved);
}

const selectedFiles: File[] = [];
const results = new Map<string, OutputItem>();
let isProcessing    = false;
let cancelRequested = false;

// ---------------------------------------------------------------------------
// Preview URL cache
// ---------------------------------------------------------------------------
const previewUrlCache = new Map<string, { url: string; blob: Blob }>();

const getOrCreatePreviewUrl = (item: OutputItem): string | null => {
  if (!item.outputBlob) return null;
  const cached = previewUrlCache.get(item.id);
  if (cached && cached.blob !== item.outputBlob) {
    URL.revokeObjectURL(cached.url);
    previewUrlCache.delete(item.id);
  }
  if (!previewUrlCache.has(item.id)) {
    previewUrlCache.set(item.id, {
      url:  URL.createObjectURL(item.outputBlob),
      blob: item.outputBlob,
    });
  }
  return previewUrlCache.get(item.id)!.url;
};

const revokePreviewUrl = (id: string) => {
  const entry = previewUrlCache.get(id);
  if (entry) { URL.revokeObjectURL(entry.url); previewUrlCache.delete(id); }
};

const revokeAllPreviewUrls = () => {
  for (const [id] of previewUrlCache) revokePreviewUrl(id);
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
const setStatus = (text: string) => { els.status.textContent = text; };

const humanSize = (bytes: number) => {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes, i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

const safeName = (name: string) =>
  name.replace(/\.[^/.]+$/, "").replace(/[^\w.-]+/g, "_");

const makeId = () => crypto.randomUUID();

// ---------------------------------------------------------------------------
// Native video seeking (frame extraction only — metadata now via MediaInfo)
// ---------------------------------------------------------------------------
const SEEK_TIMEOUT_MS = 10_000;

const seekVideo = (video: HTMLVideoElement, t: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const tid = setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      reject(new Error(`Seek timeout at ${t.toFixed(3)}s`));
    }, SEEK_TIMEOUT_MS);

    const onSeeked = () => { clearTimeout(tid); resolve(); };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.currentTime = t;
  });

// ---------------------------------------------------------------------------
// Grid generation
//
// onFrameDone  — called after every frame (drives progress bar + status)
// onWarning    — called when something non-fatal goes wrong (shown to user)
// ---------------------------------------------------------------------------
const createGridJpg = async (
  file: File,
  meta: { duration: number; width: number; height: number; bitrate: number },
  opts: {
    width:     number;
    cols:      number;
    rows:      number;
    spacing:   number;
    position:  Position;
    header:    boolean;
    bgColor:   string;
    textColor: string;
  },
  onFrameDone: (frameIndex: number, totalFrames: number, timestampSec: number) => void,
  onWarning:   (message: string) => void,
) => {
  const totalWidth = Math.max(240, opts.width);
  const cols       = Math.max(1, opts.cols);
  const rows       = Math.max(1, opts.rows);
  const spacing    = Math.max(0, opts.spacing);
  const total      = cols * rows;
  const duration   = Math.max(1, meta.duration || 1);

  const cellWidth  = Math.floor((totalWidth - spacing * (cols - 1)) / cols);
  const aspect     = meta.width > 0 && meta.height > 0 ? meta.height / meta.width : 9 / 16;
  const cellHeight = Math.max(1, Math.floor(cellWidth * aspect));

  const headerHeight = opts.header ? HEADER_HEIGHT : 0;
  const canvasWidth  = cols * cellWidth + spacing * (cols - 1);
  const canvasHeight = headerHeight + rows * cellHeight + spacing * (rows - 1);

  const canvas = document.createElement("canvas");
  canvas.width  = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = opts.bgColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // ── Header ───────────────────────────────────────────────────────────────
  if (opts.header) {
    ctx.fillStyle    = opts.bgColor;
    ctx.fillRect(0, 0, canvasWidth, headerHeight);
    ctx.fillStyle    = opts.textColor;
    ctx.font         = `${HEADER_TEXT_SIZE}px system-ui, Arial, sans-serif`;
    ctx.textBaseline = "top";

    const infoLines = [
      `Filename: ${file.name}`,
      `Size: ${humanSize(file.size)}`,
      `Resolution: ${meta.width > 0 ? `${meta.width}x${meta.height}` : "Unknown"}`,
      `Duration: ${formatTime(meta.duration)}`,
      `Bitrate: ${meta.bitrate ? `${Math.round(meta.bitrate / 1000)} kbps` : "Unknown"}`,
    ];

    const maxTextWidth = canvasWidth - HEADER_PADDING_LEFT * 2;
    let yPos = HEADER_PADDING_LEFT;

    for (const line of infoLines) {
      let displayLine = line;
      if (ctx.measureText(displayLine).width > maxTextWidth) {
        while (displayLine.length > 0 && ctx.measureText(displayLine + "…").width > maxTextWidth)
          displayLine = displayLine.slice(0, -1);
        displayLine += "…";
      }
      ctx.fillText(displayLine, HEADER_PADDING_LEFT, yPos);
      yPos += HEADER_LINE_SPACING;
    }
    ctx.textBaseline = "alphabetic";
  }

  // ── Sample timestamps ────────────────────────────────────────────────────
  const margin = Math.max(0.5, duration * 0.02);
  const usable = Math.max(duration - 2 * margin, 0.1);
  const times  = Array.from({ length: total }, (_, i) =>
    Math.min(Math.max(0, margin + usable * ((i + 0.5) / total)), duration),
  );

  // ── Open <video> for native seeking ─────────────────────────────────────
  const videoUrl = URL.createObjectURL(file);
  const video    = document.createElement("video");
  video.muted       = true;
  video.playsInline = true;
  video.preload     = "metadata";
  video.src         = videoUrl;

  const videoCleanup = () => {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(videoUrl);
  };

  let videoUsable = true;
  try {
    await new Promise<void>((resolve, reject) => {
      const tid = setTimeout(() => reject(new Error("Video open timeout")), 15_000);
      video.addEventListener("loadedmetadata", () => { clearTimeout(tid); resolve(); }, { once: true });
      video.addEventListener("error",          () => { clearTimeout(tid); reject(new Error("Video failed to open")); }, { once: true });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warn(`Native video failed (${msg}), switching to FFmpeg`);
    onWarning(`Native decoder unavailable (${msg}) — using FFmpeg fallback`);
    videoUsable = false;
  }

  // ── Frame loop ───────────────────────────────────────────────────────────
  const posMap: Record<Position, { x: "left" | "right"; y: "top" | "bottom" }> = {
    "top-left":     { x: "left",  y: "top"    },
    "top-right":    { x: "right", y: "top"    },
    "bottom-left":  { x: "left",  y: "bottom" },
    "bottom-right": { x: "right", y: "bottom" },
  };
  const pos = posMap[opts.position];

  // FFmpeg batch results — extracted once on first need, reused per frame.
  let ffmpegBitmaps: (ImageBitmap | null)[] | null = null;
  let ffmpegFailedFrames = 0;

  const ensureFFmpegBitmaps = async (): Promise<void> => {
    if (ffmpegBitmaps !== null) return;
    log(`  Switching to FFmpeg batch extraction for all ${total} frames…`);
    ffmpegBitmaps = await extractFramesFFmpegBatch(file, times, (idx, _total, err) => {
      if (err) {
        ffmpegFailedFrames++;
        onWarning(`FFmpeg frame ${idx + 1}/${total} failed: ${err}`);
        if (ffmpegFailedFrames > 2) {
          throw new Error("FFmpeg decoding failed repeatedly — likely OOM or unsupported codec.");
        }
      }
    });
  };

  for (let i = 0; i < times.length; i++) {
    if (cancelRequested) break;

    const tSec = times[i];
    const col  = i % cols;
    const row  = Math.floor(i / cols);
    const x    = col * (cellWidth  + spacing);
    const y    = headerHeight + row * (cellHeight + spacing);

    log(`  Frame ${i + 1}/${total} — t=${tSec.toFixed(3)}s (${formatTime(tSec)}) from "${file.name}"`);

    let frameDrawn = false;

    // ── Native path ──────────────────────────────────────────────────────
    if (videoUsable) {
      try {
        await seekVideo(video, tSec);
        ctx.drawImage(video, x, y, cellWidth, cellHeight);
        frameDrawn = true;
      } catch (seekErr) {
        const msg = seekErr instanceof Error ? seekErr.message : String(seekErr);
        warn(`  Native seek failed at frame ${i + 1}: ${msg}`);
        onWarning(`Native seek failed at frame ${i + 1} (${msg}) — switching to FFmpeg`);
        videoUsable = false;
      }
    }

    // ── FFmpeg path ──────────────────────────────────────────────────────
    if (!videoUsable) {
      try {
        await ensureFFmpegBitmaps();
        const bitmap = ffmpegBitmaps![i];
        if (bitmap) {
          ctx.drawImage(bitmap, x, y, cellWidth, cellHeight);
          bitmap.close();
          ffmpegBitmaps![i] = null;
          frameDrawn = true;
        } else {
          onWarning(`FFmpeg returned no image for frame ${i + 1} — cell left blank`);
        }
      } catch (ffErr) {
        const msg = ffErr instanceof Error ? ffErr.message : String(ffErr);
        errlog(`  FFmpeg frame ${i + 1} error:`, msg);
        onWarning(`FFmpeg error at frame ${i + 1}: ${msg}`);
        if (isMemoryError(ffErr)) {
          onWarning(`⚠️ Out of memory at frame ${i + 1}. Try reducing output width, columns, or rows.`);
        }
      }
    }

    // Error placeholder if both paths failed
    if (!frameDrawn) {
      ctx.fillStyle    = opts.bgColor;
      ctx.fillRect(x, y, cellWidth, cellHeight);
      ctx.fillStyle    = "#555";
      ctx.font         = "18px system-ui";
      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("FAILED", x + cellWidth / 2, y + cellHeight / 2);
      ctx.textAlign    = "left";
      ctx.textBaseline = "alphabetic";
    }

    // ── Timecode overlay ─────────────────────────────────────────────────
    const label    = formatTime(tSec);
    const tcFontSz = Math.max(11, Math.round(totalWidth * 0.012));
    ctx.font        = `${tcFontSz}px system-ui, Arial, sans-serif`;
    ctx.textBaseline = "top";
    const textW    = ctx.measureText(label).width;
    const pad      = 6;
    const bgW      = textW + pad * 2;
    const bgH      = tcFontSz + pad * 2;
    const bgX      = pos.x === "left" ? x + pad : x + cellWidth  - bgW - pad;
    const bgY      = pos.y === "top"  ? y + pad : y + cellHeight - bgH - pad;

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(bgX, bgY, bgW, bgH);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, bgX + pad, bgY + pad);
    ctx.textBaseline = "alphabetic";

    onFrameDone(i + 1, total, tSec);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }

  videoCleanup();
  await cleanupFFmpeg();
  resetFFmpeg();

  const outputName = `${file.name}.jpg`;
  const jpgBlob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b ?? new Blob()), "image/jpeg", 0.95);
  });

  canvas.width  = 0;
  canvas.height = 0;

  return { outputName, outputSize: jpgBlob.size, outputBlob: jpgBlob };
};

// ---------------------------------------------------------------------------
// Progress helpers
// ---------------------------------------------------------------------------
const updateBatchProgress = (done: number, total: number) => {
  const pct = total ? Math.round((done / total) * 100) : 0;
  els.batchPct.textContent = `${pct}%`;
  els.batchProgress.value  = pct;
};

const updateCurrentProgress = (pct: number) => {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  els.currentPct.textContent = `${clamped}%`;
  els.currentProgress.value  = clamped;
};

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
const renderOutputs = () => {
  const items = Array.from(results.values());
  if (!items.length) {
    els.outputs.innerHTML = `<div class="empty">No outputs yet.</div>`;
    return;
  }

  els.outputs.innerHTML = items.map((item) => {
    const meta    = item.metadata;
    const details = meta ? [
      item.file.name,
      `Duration: ${formatTime(meta.duration)}`,
      `Resolution: ${meta.width}×${meta.height}`,
      `Bitrate: ${meta.bitrate ? `${Math.round(meta.bitrate / 1000)} kbps` : "n/a"}`,
      `Input size: ${humanSize(item.file.size)}`,
    ] : [item.file.name];

    const previewUrl = els.preview.checked ? getOrCreatePreviewUrl(item) : null;

    return `
      <article class="output-card output-${item.status}">
        <div class="output-top">
          <div class="output-top-text">
            <h3>${item.file.name}</h3>
            ${item.warning ? `<p class="warning">${item.warning}</p>` : ""}
            <p class="small">${details.join("<br />")}</p>
          </div>
          <div class="badge">${item.status}</div>
        </div>
        <div class="output-grid">
          <div class="output-preview">
            ${previewUrl
              ? `<img data-preview-url="${previewUrl}" alt="Preview for ${item.file.name}" />`
              : `<div class="preview-placeholder">${els.preview.checked ? "No preview" : "Preview off"}</div>`
            }
          </div>
          <div class="output-info">
            <p><strong>Output:</strong> ${item.outputName ?? "—"}</p>
            <p><strong>Size:</strong> ${item.outputSize ? humanSize(item.outputSize) : "—"}</p>
            <p><strong>Status:</strong> ${item.status}</p>
            ${item.error ? `<p class="error">${item.error}</p>` : ""}
            <div class="download-row">
              ${item.status === "done" && item.outputBlob && item.outputName
                ? `<button class="button-link" data-download-id="${item.id}">⬇️ Download JPG</button>`
                : `<span class="muted">No download</span>`
              }
            </div>
          </div>
        </div>
      </article>
    `;
  }).join("");

  els.outputs.querySelectorAll<HTMLImageElement>("[data-preview-url]").forEach((img) => {
    const url = img.getAttribute("data-preview-url")!;
    img.src = url;
    img.onclick = () => openPreviewModal(url);
  });

  els.outputs.querySelectorAll<HTMLButtonElement>("[data-download-id]").forEach((btn) => {
    btn.onclick = () => {
      const item = results.get(btn.getAttribute("data-download-id")!);
      if (!item?.outputBlob || !item.outputName) return;
      const url = URL.createObjectURL(item.outputBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.outputName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  });
};

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
const openPreviewModal = (url: string) => {
  els.previewModalImg.src = url;
  els.previewModal.style.display = "flex";
};
const closePreviewModal = () => {
  els.previewModal.style.display = "none";
  els.previewModalImg.src = "";
};
els.previewClose.addEventListener("click", closePreviewModal);
els.previewModal.addEventListener("click", (e) => {
  if (e.target === els.previewModal) closePreviewModal();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && els.previewModal.style.display === "flex") closePreviewModal();
});

// ---------------------------------------------------------------------------
// File queueing
// ---------------------------------------------------------------------------
const addFile = async (file: File) => {
  const id   = makeId();
  const item: OutputItem = { id, file, status: "queued" };
  results.set(id, item);
  renderOutputs();

  // ── Metadata via MediaInfo.js (always reliable, all formats) ─────────────
  // Run the native-play check in parallel so it adds no extra latency.
  const [meta] = await Promise.all([
    readMetadataMediaInfo(file),
    // Side-effect only: result used below after awaiting meta
    Promise.resolve(canNativelyPlay(file)),
  ]);

  item.metadata = meta;

  // Determine if FFmpeg WASM will be needed for frame extraction and warn early.
  if (!canNativelyPlay(file)) {
    item.warning =
      "⚠️ Browser cannot decode this format natively — FFmpeg WASM will be used for frame extraction " +
      "(expect slower processing and higher memory usage for large files).";
    log(`Early FFmpeg warning for "${file.name}": canPlayType returned empty string`);
  } else if (!hasUsableMetadata(meta)) {
    // MediaInfo returned nothing useful — very rare (corrupt file, unknown format).
    item.warning =
      "⚠️ Could not read metadata from this file. Processing may fail or produce incorrect output.";
    log(`Metadata warning for "${file.name}": MediaInfo returned no usable data`);
  }

  renderOutputs();
};

const queueSelectedFiles = async () => {
  revokeAllPreviewUrls();
  const files = Array.from(els.files.files ?? []);
  selectedFiles.splice(0, selectedFiles.length, ...files);
  results.clear();
  for (const file of selectedFiles) await addFile(file);
  setStatus(`${selectedFiles.length} file(s) queued. Press ▶️ Start Processing when ready.`);
  renderOutputs();
};

// ---------------------------------------------------------------------------
// Main processing loop
// ---------------------------------------------------------------------------
const processAll = async () => {
  if (isProcessing) return;
  if (!selectedFiles.length) { setStatus("Please select at least one video file."); return; }

  isProcessing    = true;
  cancelRequested = false;
  els.start.disabled  = true;
  els.cancel.disabled = false;
  setStatus("Starting…");
  updateCurrentProgress(0);
  updateBatchProgress(0, selectedFiles.length);

  try {
    const width     = Math.max(240, Number(els.width.value)   || 1600);
    const cols      = Math.max(1,   Number(els.cols.value)    || 4);
    const rows      = Math.max(1,   Number(els.rows.value)    || 3);
    const spacing   = Math.max(0,   Number(els.spacing.value) || 0);
    const position  = els.position.value as Position;
    const header    = els.header.checked;
    const bgColor   = els.bgColor.value   || "#000000";
    const textColor = els.textColor.value || "#ffffff";

    let done  = 0;
    const items = Array.from(results.values());

    for (const item of items) {
      if (cancelRequested) {
        item.status = "cancelled";
        renderOutputs();
        continue;
      }

      item.status  = "processing";
      item.error   = undefined;
      // Preserve the early FFmpeg/metadata warning set during queueing.
      // It will be overwritten only if createGridJpg produces a more specific one.
      renderOutputs();
      updateCurrentProgress(0);
      setStatus(`"${item.file.name}" — opening…`);
      log(`Starting "${item.file.name}"`);

      const onFrameDone = (frameIdx: number, totalFrames: number, tSec: number) => {
        updateCurrentProgress((frameIdx / totalFrames) * 100);
        setStatus(`"${item.file.name}" — frame ${frameIdx}/${totalFrames} @ ${formatTime(tSec)}`);
      };

      const onWarning = (message: string) => {
        item.warning = message;
        renderOutputs();
        warn(`[${item.file.name}] ${message}`);
      };

      try {
        // Metadata was already read by addFile() via MediaInfo.js.
        // Re-read only if somehow missing (e.g., file queued before MediaInfo loaded).
        let meta = item.metadata;

        if (!meta) {
          setStatus(`"${item.file.name}" — reading metadata…`);
          meta = await readMetadataMediaInfo(item.file, (pct, msg) => {
            updateCurrentProgress(pct);
            setStatus(`"${item.file.name}" — ${msg}`);
          });
          item.metadata = meta;
        }

        if (!hasUsableMetadata(meta)) {
          throw new Error(
            "MediaInfo could not determine video dimensions or duration. " +
            "The file may be corrupt or in an unrecognised format.",
          );
        }

        renderOutputs();

        const res = await createGridJpg(
          item.file, meta,
          { width, cols, rows, spacing, position, header, bgColor, textColor },
          onFrameDone,
          onWarning,
        );

        item.outputName = res.outputName;
        item.outputSize = res.outputSize;
        item.outputBlob = res.outputBlob;
        item.status     = cancelRequested ? "cancelled" : "done";
        item.error      = undefined;

        log(`Finished "${item.file.name}" → ${humanSize(res.outputSize)}`);
        setStatus(cancelRequested ? "Cancelled." : `Finished "${item.file.name}"`);
        updateCurrentProgress(100);

      } catch (e) {
        item.status = cancelRequested ? "cancelled" : "error";
        item.error  = e instanceof Error ? e.message : "Unknown error";
        errlog(`Failed "${item.file.name}":`, e);
        setStatus(`Error on "${item.file.name}": ${item.error}`);
      }

      done++;
      updateBatchProgress(done, items.length);
      renderOutputs();
    }

    setStatus(cancelRequested ? "Processing cancelled." : `Done — ${done} file(s) processed.`);

  } catch (e) {
    errlog("Batch failed:", e);
    setStatus(e instanceof Error ? e.message : "Batch failed");
  } finally {
    isProcessing        = false;
    els.start.disabled  = false;
    els.cancel.disabled = true;
    updateCurrentProgress(0);
  }
};

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------
els.files.addEventListener("change",  () => void queueSelectedFiles());
els.start.addEventListener("click",   () => void processAll());

els.cancel.addEventListener("click", () => {
  cancelRequested = true;
  setStatus("Cancelling…");
  warn("Cancel requested by user");
});

els.clear.addEventListener("click", () => {
  if (isProcessing) return;
  revokeAllPreviewUrls();
  resetFFmpeg();
  closeMediaInfo(); // release MediaInfo WASM memory too — will reload on next use
  selectedFiles.splice(0, selectedFiles.length);
  results.clear();
  els.files.value            = "";
  els.currentPct.textContent = "0%";
  els.batchPct.textContent   = "0%";
  els.currentProgress.value  = 0;
  els.batchProgress.value    = 0;
  setStatus("Selection cleared.");
  renderOutputs();
});

els.saveOpts.addEventListener("click", () => saveOptions());

els.loadOpts.addEventListener("click", () => {
  const saved = loadOptions();
  if (saved) {
    applyOptions(saved);
    setStatus("↩️ Saved options restored.");
  } else {
    setStatus("⚠️ No saved options found.");
  }
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
renderOutputs();
els.cancel.disabled = true;
