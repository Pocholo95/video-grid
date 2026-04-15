import { useCallback, useState } from "react";
import { saveAs } from "file-saver";
import JSZip from "jszip";

import { DEFAULTS } from "./constants";
import { loadAppSettings, persistAppSettings } from "./presets";
import { loadDestinations, saveDestinations, uploadBlob } from "./upload";

import type { AppSettings, OutputItem, SavedOptions, UploadDestination, UploadResult } from "./types";

import { useProcessor } from "./hooks/useProcessor";

import ControlPanel        from "./components/ControlPanel";
import OutputCard          from "./components/OutputCard";
import DestinationManager  from "./components/DestinationManager";
import PreviewModal        from "./components/PreviewModal";

// ─── Helper: sequential delay between uploads ─────────────────────────────────
const UPLOAD_DELAY_MS = 1200;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  // ── Persisted settings ────────────────────────────────────────────────────
  const [appSettings,   setAppSettingsState] = useState<AppSettings>(() => loadAppSettings());
  const [opts,          setOptsState]        = useState<SavedOptions>(() => {
    const s = loadAppSettings();
    if (s.presets.lastUsed && s.presets.entries[s.presets.lastUsed]) {
      return s.presets.entries[s.presets.lastUsed];
    }
    return { ...DEFAULTS };
  });

  const setAppSettings = useCallback((s: AppSettings) => {
    setAppSettingsState(s);
    persistAppSettings(s);
  }, []);

  const setOpts = useCallback((o: SavedOptions) => setOptsState(o), []);

  // ── Upload destinations ───────────────────────────────────────────────────
  const [destinations,     setDestinationsState] = useState<UploadDestination[]>(() => loadDestinations());
  const [activeDestId,     setActiveDestId]      = useState<string>(() => loadDestinations()[0]?.id ?? "");
  const [showDestManager,  setShowDestManager]   = useState(false);

  const persistDestinations = useCallback((dests: UploadDestination[]) => {
    setDestinationsState(dests);
    saveDestinations(dests);
    if (dests.length > 0 && !dests.find((d) => d.id === activeDestId)) {
      setActiveDestId(dests[0].id);
    }
    if (dests.length === 0) setActiveDestId("");
  }, [activeDestId]);

  // ── Queue items ───────────────────────────────────────────────────────────
  const [items, setItems] = useState<OutputItem[]>([]);

  const updateItem = useCallback((id: string, patch: Partial<OutputItem>) => {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, ...patch } : it));
  }, []);

  // ── Processor ─────────────────────────────────────────────────────────────
  const { isProcessing, status, analyseFiles, processAll, requestCancel, resetState } =
    useProcessor(updateItem);

  const handleFilesChange = useCallback(async (files: File[]) => {
    setItems([]);
    const newItems = await analyseFiles(files);
    setItems(newItems);
  }, [analyseFiles]);

  const handleStart = useCallback(() => {
    processAll(items, opts);
  }, [items, opts, processAll]);

  const handleClear = useCallback(() => {
    setItems([]);
    resetState();
  }, [resetState]);

  // ── Preview modal ─────────────────────────────────────────────────────────
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // ── Upload single item ────────────────────────────────────────────────────
  const uploadItem = useCallback(async (id: string, destId: string) => {
    const dest = destinations.find((d) => d.id === destId);
    if (!dest) return;

    const item = items.find((i) => i.id === id);
    if (!item?.outputBlob || !item.outputName) return;

    updateItem(id, { uploadStatus: "uploading", uploadProgress: 0, uploadError: undefined });

    try {
      const result: UploadResult = await uploadBlob(
        item.outputBlob,
        item.outputName,
        dest,
        (pct) => updateItem(id, { uploadProgress: pct }),
      );
      updateItem(id, { uploadStatus: "done", uploadProgress: 100, uploadResult: result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      updateItem(id, { uploadStatus: "error", uploadError: msg });
    }
  }, [destinations, items, updateItem]);

  // ── Upload all — sequential with delay to avoid rate limiting ────────────
  const [isUploadingAll, setIsUploadingAll] = useState(false);

  const uploadAll = useCallback(async (destId: string) => {
    if (isUploadingAll) return;
    const dest = destinations.find((d) => d.id === destId);
    if (!dest) return;

    const pending = items.filter(
      (i) => i.status === "done" && i.outputBlob && i.outputName &&
             i.uploadStatus !== "done" && i.uploadStatus !== "uploading",
    );
    if (!pending.length) return;

    setIsUploadingAll(true);

    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      updateItem(item.id, { uploadStatus: "uploading", uploadProgress: 0, uploadError: undefined });

      try {
        const result: UploadResult = await uploadBlob(
          item.outputBlob!,
          item.outputName!,
          dest,
          (pct) => updateItem(item.id, { uploadProgress: pct }),
        );
        updateItem(item.id, { uploadStatus: "done", uploadProgress: 100, uploadResult: result });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Upload failed";
        updateItem(item.id, { uploadStatus: "error", uploadError: msg });
      }

      // Delay between uploads, but not after the last one
      if (i < pending.length - 1) await sleep(UPLOAD_DELAY_MS);
    }

    setIsUploadingAll(false);
  }, [destinations, isUploadingAll, items, updateItem]);

  // ── Download all as ZIP ───────────────────────────────────────────────────
  const [isZipping, setIsZipping] = useState(false);

  const downloadAll = useCallback(async () => {
    const done = items.filter((i) => i.status === "done" && i.outputBlob && i.outputName);
    if (!done.length) return;
    setIsZipping(true);
    try {
      const zip = new JSZip();
      for (const item of done) zip.file(item.outputName!, item.outputBlob!);
      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, "vidgrid-outputs.zip");
    } finally {
      setIsZipping(false);
    }
  }, [items]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const doneItems       = items.filter((i) => i.status === "done" && i.outputBlob && i.outputName);
  const uploadableItems = doneItems.filter((i) => i.uploadStatus !== "done" && i.uploadStatus !== "uploading");
  const allMetaReady    = items.length > 0 && items.every((i) => i.metadata !== undefined);

  // Active destination for "Upload All" button
  const activeDestForAll = destinations.find((d) => d.id === activeDestId) ?? destinations[0];

  return (
    <>
      {/* ── Header ── */}
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">
          <img src="favicon.svg" alt="Logo" />
        </div>
        <div className="header-text">
          <h1>VidGrid-HTML</h1>
          <p className="subtitle">Client-side JPG thumbnail grid generator</p>
        </div>
        <div className="header-actions">
          <button
            className="icon-btn dest-manager-btn"
            title="Manage upload destinations"
            onClick={() => setShowDestManager(true)}
          >
            ☁️ Destinations {destinations.length > 0 ? `(${destinations.length})` : ""}
          </button>
        </div>
      </header>

      {/* ── Controls panel ── */}
      <ControlPanel
        opts={opts}
        setOpts={setOpts}
        presets={appSettings.presets}
        setPresets={(p) => setAppSettings({ ...appSettings, presets: p })}
        status={status}
        isProcessing={isProcessing}
        hasFiles={items.length > 0}
        allMetadataReady={allMetaReady}
        onFilesChange={handleFilesChange}
        onStart={handleStart}
        onCancel={requestCancel}
        onClear={handleClear}
      />

      {/* ── Outputs panel ── */}
      <section className="panel">
        <div className="outputs-header">
          <h2>Outputs</h2>

          <div className="outputs-bulk-actions">
            {/* Destination selector shown when there are multiple */}
            {destinations.length > 1 && doneItems.length > 1 && (
              <select
                className="dest-select"
                value={activeDestId}
                onChange={(e) => setActiveDestId(e.target.value)}
                disabled={isUploadingAll}
              >
                {destinations.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            )}

            {/* Upload All */}
            {uploadableItems.length > 1 && destinations.length > 0 && (
              <button
                className="primary upload-all-btn"
                disabled={isUploadingAll}
                onClick={() => uploadAll(activeDestId || destinations[0]?.id)}
                title={activeDestForAll ? `Upload all to ${activeDestForAll.name}` : "Upload all"}
              >
                {isUploadingAll
                  ? "⏳ Uploading…"
                  : `☁️ Upload All${activeDestForAll ? ` to ${activeDestForAll.name}` : ""} (${uploadableItems.length})`
                }
              </button>
            )}

            {/* Download All */}
            {doneItems.length > 1 && (
              <button
                className="primary"
                disabled={isZipping}
                onClick={downloadAll}
              >
                {isZipping ? "⏳ Zipping…" : `⏬ Download All (${doneItems.length})`}
              </button>
            )}
          </div>
        </div>

        <div className="outputs">
          {items.length === 0 ? (
            <div className="empty">No outputs yet.</div>
          ) : (
            items.map((item) => (
              <OutputCard
                key={item.id}
                item={item}
                showPreview={opts.preview}
                destinations={destinations}
                activeDestId={activeDestId}
                onPreview={setPreviewUrl}
                onUpload={uploadItem}
              />
            ))
          )}
        </div>
      </section>

      {/* ── Modals ── */}
      <PreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />

      {showDestManager && (
        <DestinationManager
          destinations={destinations}
          onSave={persistDestinations}
          onClose={() => setShowDestManager(false)}
        />
      )}
    </>
  );
}
