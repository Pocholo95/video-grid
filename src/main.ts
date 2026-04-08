import "./style.css";

// ---------------------------------------------------------------------------
// NOTE: FFmpeg is no longer used for frame extraction.
// The browser's native <video> element seeks and hardware-decodes each frame
// directly onto the output canvas — no full-file load, no WASM heap pressure.
// FFmpeg imports are intentionally removed; the package.json deps can stay for
// other potential uses, or be pruned if you want a leaner build.
// ---------------------------------------------------------------------------

type Position = "top-left" | "top-right" | "bottom-left" | "bottom-right";

type OutputItem = {
  id: string;
  file: File;
  status: "queued" | "processing" | "done" | "error" | "cancelled";
  error?: string;
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
// Header constants — mirrors the Python implementation exactly:
//   HEADER_HEIGHT       = 160
//   HEADER_PADDING_LEFT = 12
//   HEADER_TEXT_SIZE    = 24
//   HEADER_LINE_SPACING = 26
// ---------------------------------------------------------------------------
const HEADER_HEIGHT       = 160;
const HEADER_PADDING_LEFT = 12;
const HEADER_TEXT_SIZE    = 24;
const HEADER_LINE_SPACING = 26;

const DEBUG = true;
const log    = (...a: unknown[]) => DEBUG && console.log("[VidGrid]", ...a);
const warn   = (...a: unknown[]) => DEBUG && console.warn("[VidGrid]", ...a);
const errlog = (...a: unknown[]) => DEBUG && console.error("[VidGrid]", ...a);

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root not found");

app.innerHTML = `
  <main class="app-shell">
    <header class="app-header">
      <div class="brand-mark" aria-hidden="true"></div>
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
          <button id="start" class="primary">Start processing</button>
          <button id="cancel">Cancel current processing</button>
          <button id="clear">Clear selected files</button>
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
        ">Close</button>
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

const selectedFiles: File[] = [];
const results = new Map<string, OutputItem>();
let isProcessing  = false;
let cancelRequested = false;

// ---------------------------------------------------------------------------
// Preview URL cache
// ---------------------------------------------------------------------------
const previewUrlCache = new Map<string, string>();

const getOrCreatePreviewUrl = (item: OutputItem): string | null => {
  if (!item.outputBlob) return null;
  if (!previewUrlCache.has(item.id))
    previewUrlCache.set(item.id, URL.createObjectURL(item.outputBlob));
  return previewUrlCache.get(item.id)!;
};

const revokePreviewUrl = (id: string) => {
  const url = previewUrlCache.get(id);
  if (url) { URL.revokeObjectURL(url); previewUrlCache.delete(id); }
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
  const h  = Math.floor(seconds / 3600);
  const m  = Math.floor((seconds % 3600) / 60);
  const s  = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

const safeName = (name: string) =>
  name.replace(/\.[^/.]+$/, "").replace(/[^\w.-]+/g, "_");

const makeId = () => crypto.randomUUID();

// ---------------------------------------------------------------------------
// Metadata via <video> element (unchanged — fast, no full-file load)
// ---------------------------------------------------------------------------
const readMetadata = async (file: File) => {
  const objectURL = URL.createObjectURL(file);
  return new Promise<{ duration: number; width: number; height: number; bitrate: number }>((resolve) => {
    const video = document.createElement("video");
    video.preload  = "metadata";
    video.muted    = true;
    video.playsInline = true;
    video.src      = objectURL;
    const cleanup  = () => {
      video.removeAttribute("src");
      video.load();
      setTimeout(() => URL.revokeObjectURL(objectURL), 250);
    };
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      resolve({
        duration,
        width:   video.videoWidth  || 0,
        height:  video.videoHeight || 0,
        bitrate: file.size && duration ? Math.round((file.size * 8) / duration) : 0,
      });
      cleanup();
    };
    video.onerror = () => { cleanup(); resolve({ duration: 0, width: 0, height: 0, bitrate: 0 }); };
  });
};

// ---------------------------------------------------------------------------
// Native video seeking – no FFmpeg, no full-file copy
//
// seekVideo(video, t) sets currentTime and resolves when the browser has
// decoded the frame at that timestamp.  A per-frame timeout catches stalls.
// ---------------------------------------------------------------------------
const SEEK_TIMEOUT_MS = 10_000;

const seekVideo = (video: HTMLVideoElement, t: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const tid = setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      reject(new Error(`Seek timeout at ${t.toFixed(3)}s`));
    }, SEEK_TIMEOUT_MS);

    const onSeeked = () => {
      clearTimeout(tid);
      resolve();
    };

    video.addEventListener("seeked", onSeeked, { once: true });
    video.currentTime = t;
  });

// ---------------------------------------------------------------------------
// Grid generation
//
// Uses the browser's <video> element for frame seeking — the browser reads
// only the keyframes it needs, using hardware decoding. No file is loaded
// into WASM/JS memory. This is equivalent to Python's `ffmpeg -ss <t> -i`.
//
// onFrameDone(frameIndex, totalFrames, timestampSec) fires after every frame.
// ---------------------------------------------------------------------------
const createGridJpg = async (
  file: File,
  meta: { duration: number; width: number; height: number; bitrate: number },
  opts: {
    width:    number;
    cols:     number;
    rows:     number;
    spacing:  number;
    position: Position;
    header:   boolean;
    bgColor:  string;
    textColor:string;
  },
  onFrameDone: (frameIndex: number, totalFrames: number, timestampSec: number) => void,
) => {
  const totalWidth = Math.max(240, opts.width);
  const cols       = Math.max(1, opts.cols);
  const rows       = Math.max(1, opts.rows);
  const spacing    = Math.max(0, opts.spacing);
  const total      = cols * rows;
  const duration   = Math.max(1, meta.duration || 1);

  // Cell dimensions — spacing shrinks cells so total width is always respected.
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

  // Fill entire canvas with background colour.
  ctx.fillStyle = opts.bgColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // ── Header ──────────────────────────────────────────────────────────────
  // Matches the Python create_header():
  //   background: black (already filled above)
  //   font: 24px, white
  //   lines: Filename / Size / Resolution / Duration / Bitrate
  //   x = HEADER_PADDING_LEFT (12), y starts at HEADER_PADDING_LEFT (12)
  //   line spacing = HEADER_LINE_SPACING (26)
  if (opts.header) {
    // Black header background (even if bgColor differs for the frame area)
    ctx.fillStyle = opts.bgColor;
    ctx.fillRect(0, 0, canvasWidth, headerHeight);

    ctx.fillStyle  = opts.textColor;
    ctx.font       = `${HEADER_TEXT_SIZE}px system-ui, Arial, sans-serif`;
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
      // Truncate with ellipsis if too wide (mirrors draw_single_line_text)
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
  // Mirrors Python compute_sample_times() for freeze mode:
  //   margin = max(0.5, duration * 0.02)
  //   t = margin + (usable_duration * (i + 0.5) / total_slots)
  const margin   = Math.max(0.5, duration * 0.02);
  const usable   = Math.max(duration - 2 * margin, 0.1);
  const times    = Array.from({ length: total }, (_, i) =>
    Math.min(Math.max(0, margin + usable * ((i + 0.5) / total)), duration)
  );

  // ── Open the video for seeking (browser streams only what it needs) ──────
  const videoUrl = URL.createObjectURL(file);
  const video    = document.createElement("video");
  video.muted        = true;
  video.playsInline  = true;
  video.preload      = "metadata";
  video.src          = videoUrl;

  const videoCleanup = () => {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(videoUrl);
  };

  // Wait for the browser to be ready to seek (very fast — metadata only).
  await new Promise<void>((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error("Video open timeout")), 15_000);
    video.addEventListener("loadedmetadata", () => { clearTimeout(tid); resolve(); }, { once: true });
    video.addEventListener("error",          () => { clearTimeout(tid); reject(new Error("Video failed to open")); }, { once: true });
  });

  // ── Frame loop ───────────────────────────────────────────────────────────
  const posMap: Record<Position, { x: "left" | "right"; y: "top" | "bottom" }> = {
    "top-left":     { x: "left",  y: "top"    },
    "top-right":    { x: "right", y: "top"    },
    "bottom-left":  { x: "left",  y: "bottom" },
    "bottom-right": { x: "right", y: "bottom" },
  };
  const pos = posMap[opts.position];

  for (let i = 0; i < times.length; i++) {
    if (cancelRequested) break;

    const tSec = times[i];
    const col  = i % cols;
    const row  = Math.floor(i / cols);
    const x    = col * (cellWidth  + spacing);
    const y    = headerHeight + row * (cellHeight + spacing);

    log(`  Frame ${i + 1}/${total} — seeking to ${formatTime(tSec)} (${tSec.toFixed(3)}s) from "${file.name}"`);

    try {
      await seekVideo(video, tSec);

      // Draw decoded video frame directly — zero copy, hardware accelerated.
      ctx.drawImage(video, x, y, cellWidth, cellHeight);

      // Timecode overlay (semi-transparent background pill)
      const label     = formatTime(tSec);
      const tcFontSz  = Math.max(11, Math.round(totalWidth * 0.012));
      ctx.font        = `${tcFontSz}px system-ui, Arial, sans-serif`;
      ctx.textBaseline = "top";
      const textW     = ctx.measureText(label).width;
      const pad       = 6;
      const bgW       = textW + pad * 2;
      const bgH       = tcFontSz + pad * 2;
      const bgX       = pos.x === "left"
        ? x + pad
        : x + cellWidth - bgW - pad;
      const bgY       = pos.y === "top"
        ? y + pad
        : y + cellHeight - bgH - pad;

      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(bgX, bgY, bgW, bgH);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, bgX + pad, bgY + pad);
      ctx.textBaseline = "alphabetic";

    } catch (frameErr) {
      errlog(`  Frame ${i + 1}/${total} FAILED at t=${tSec.toFixed(3)}s:`, frameErr);

      // Fill the cell with an error indicator in the background colour.
      ctx.fillStyle = opts.bgColor;
      ctx.fillRect(x, y, cellWidth, cellHeight);
      ctx.fillStyle   = "#555555";
      ctx.font        = "18px system-ui, Arial, sans-serif";
      ctx.textAlign   = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("FAILED", x + cellWidth / 2, y + cellHeight / 2);
      ctx.textAlign   = "left";
      ctx.textBaseline = "alphabetic";
    }

    onFrameDone(i + 1, total, tSec);

    // Yield to the event loop for GC and UI repaints.
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }

  videoCleanup();

  // Encode output JPEG.
  const outputName = `${safeName(file.name)}.jpg`;
  const jpgBlob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b ?? new Blob()), "image/jpeg", 0.95);
  });

  // Free canvas pixel buffer — we only need the blob now.
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
          <div>
            <h3>${item.file.name}</h3>
            <p class="small">${details.join("<br />")}</p>
          </div>
          <div class="badge">${item.status}</div>
        </div>
        <div class="output-grid">
          <div class="output-preview">
            ${previewUrl
              ? `<img data-preview-url="${previewUrl}" alt="Preview for ${item.file.name}" width="240" />`
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
                ? `<button class="button-link" data-download-id="${item.id}">Download JPG</button>`
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
els.previewModal.addEventListener("click", (e) => { if (e.target === els.previewModal) closePreviewModal(); });
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
  item.metadata = await readMetadata(file);
  renderOutputs();
};

const queueSelectedFiles = async () => {
  revokeAllPreviewUrls();
  const files = Array.from(els.files.files ?? []);
  selectedFiles.splice(0, selectedFiles.length, ...files);
  results.clear();
  for (const file of selectedFiles) await addFile(file);
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

      item.status = "processing";
      item.error  = undefined;
      renderOutputs();
      updateCurrentProgress(0);
      setStatus(`"${item.file.name}" — opening…`);
      log(`Starting "${item.file.name}"`);

      const onFrameDone = (frameIdx: number, totalFrames: number, tSec: number) => {
        updateCurrentProgress((frameIdx / totalFrames) * 100);
        setStatus(`"${item.file.name}" — frame ${frameIdx}/${totalFrames} @ ${formatTime(tSec)}`);
      };

      try {
        const meta = item.metadata ?? (await readMetadata(item.file));
        const res  = await createGridJpg(item.file, meta,
          { width, cols, rows, spacing, position, header, bgColor, textColor },
          onFrameDone,
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
  selectedFiles.splice(0, selectedFiles.length);
  results.clear();
  els.files.value          = "";
  els.currentPct.textContent  = "0%";
  els.batchPct.textContent    = "0%";
  els.currentProgress.value   = 0;
  els.batchProgress.value     = 0;
  setStatus("Selection cleared.");
  renderOutputs();
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
renderOutputs();
els.cancel.disabled = true;