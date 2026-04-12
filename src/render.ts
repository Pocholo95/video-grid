import JSZip from "jszip";
import { saveAs } from "file-saver";
import { els } from "./dom";
import { isProcessing, results } from "./state";
import type { OutputItem } from "./types";
import { formatTime, humanSize } from "./utils";

// ---------------------------------------------------------------------------
// Preview URL cache
// ---------------------------------------------------------------------------

const previewUrlCache = new Map<string, { url: string; blob: Blob }>();

export const getOrCreatePreviewUrl = (item: OutputItem): string | null => {
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

export const revokePreviewUrl = (id: string): void => {
  const entry = previewUrlCache.get(id);
  if (entry) { URL.revokeObjectURL(entry.url); previewUrlCache.delete(id); }
};

export const revokeAllPreviewUrls = (): void => {
  for (const [id] of previewUrlCache) revokePreviewUrl(id);
};

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export const openPreviewModal = (url: string): void => {
  els.previewModalImg.src        = url;
  els.previewModal.style.display = "flex";
};

export const closePreviewModal = (): void => {
  els.previewModal.style.display = "none";
  els.previewModalImg.src        = "";
};

// ---------------------------------------------------------------------------
// Progress bars
// ---------------------------------------------------------------------------

export const updateBatchProgress = (done: number, total: number): void => {
  const pct = total ? Math.round((done / total) * 100) : 0;
  els.batchLabel.textContent = total > 0
    ? `Batch progress (${done}/${total})`
    : "Batch progress";
  els.batchPct.textContent = `${pct}%`;
  els.batchProgress.value  = pct;
};

export const updateCurrentProgress = (pct: number): void => {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  els.currentPct.textContent = `${clamped}%`;
  els.currentProgress.value  = clamped;
};

// ---------------------------------------------------------------------------
// Download All
// ---------------------------------------------------------------------------

/** Returns all items that have a completed, downloadable output. */
const downloadableItems = () =>
  Array.from(results.values()).filter(
    (item) => item.status === "done" && item.outputBlob && item.outputName,
  );

/** Sync the "Download All" button visibility and label. Called from renderOutputs(). */
const syncDownloadAllButton = (): void => {
  const count = downloadableItems().length;
  if (count > 1) {
    els.downloadAll.style.display = "";
    els.downloadAll.textContent   = `⏬ Download All (${count})`;
  } else {
    els.downloadAll.style.display = "none";
  }
};

/** Build a ZIP of all completed outputs and trigger the browser download. */
export const downloadAllOutputs = async (): Promise<void> => {
  const items = downloadableItems();
  if (!items.length) return;

  els.downloadAll.disabled    = true;
  els.downloadAll.textContent = `⏬ Zipping…`;

  try {
    const zip = new JSZip();
    for (const item of items) {
      zip.file(item.outputName!, item.outputBlob!);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, "vidgrid-outputs.zip");
  } finally {
    els.downloadAll.disabled = false;
    syncDownloadAllButton();
  }
};

// ---------------------------------------------------------------------------
// Start button state
// ---------------------------------------------------------------------------

export const updateStartButtonState = (): void => {
  const items = Array.from(results.values());
  if (!items.length) {
    els.start.disabled = true;
    return;
  }
  const allHaveMetadata = items.every((item) => item.metadata !== undefined);
  els.start.disabled    = !allHaveMetadata || isProcessing;
};

// ---------------------------------------------------------------------------
// Output card list
// ---------------------------------------------------------------------------

export const renderOutputs = (): void => {
  const items = Array.from(results.values());

  syncDownloadAllButton();

  if (!items.length) {
    els.outputs.innerHTML = `<div class="empty">No outputs yet.</div>`;
    return;
  }

  els.outputs.innerHTML = items
    .map((item) => {
      const meta    = item.metadata;
      const details = meta
        ? [
            item.file.name,
            `Duration: ${formatTime(meta.duration)}`,
            `Resolution: ${meta.width}×${meta.height}`,
            `Bitrate: ${meta.bitrate ? `${Math.round(meta.bitrate / 1000)} kbps` : "n/a"}`,
            `Input size: ${humanSize(item.file.size)}`,
          ]
        : [item.file.name];

      const previewUrl = els.preview.checked
        ? getOrCreatePreviewUrl(item)
        : null;

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
              ${
                previewUrl
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
                ${
                  item.status === "done" && item.outputBlob && item.outputName
                    ? `<button class="button-link" data-download-id="${item.id}">⬇️ Download JPG</button>`
                    : `<span class="muted">No download</span>`
                }
              </div>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  // Bind preview images
  els.outputs
    .querySelectorAll<HTMLImageElement>("[data-preview-url]")
    .forEach((img) => {
      const url = img.getAttribute("data-preview-url")!;
      img.src     = url;
      img.onclick = () => openPreviewModal(url);
    });

  // Bind download buttons
  els.outputs
    .querySelectorAll<HTMLButtonElement>("[data-download-id]")
    .forEach((btn) => {
      btn.onclick = () => {
        const item = results.get(btn.getAttribute("data-download-id")!);
        if (!item?.outputBlob || !item.outputName) return;
        saveAs(item.outputBlob, item.outputName);
      };
    });
};
