import { useCallback, useRef, useState } from "react";
import { saveAs } from "file-saver";
import JSZip from "jszip";

import { DEFAULTS, PROJECT_NAME } from "./constants";
import {
  loadAppSettings,
  persistAppSettings,
  persistDestinations,
} from "./presets";
import { useProcessor } from "./hooks/useProcessor";
import { useUpload } from "./hooks/useUpload";

import type {
  AppSettings,
  OutputItem,
  SavedOptions,
  UploadDestination,
} from "./types";

import ControlPanel from "./components/ControlPanel";
import OutputCard from "./components/OutputCard";
import DestinationManager from "./components/DestinationManager";
import PreviewModal from "./components/PreviewModal";
import CopyAllPanel from "./components/CopyAllPanel";
import Footer from "./components/Footer";

export default function App() {
  // - Persisted app settings
  const initialSettings = loadAppSettings();

  const [appSettings, setAppSettingsState] =
    useState<AppSettings>(initialSettings);
  const [opts, setOptsState] = useState<SavedOptions>(() => {
    const { lastUsed, entries } = initialSettings.presets;
    if (lastUsed && entries[lastUsed]) {
      return entries[lastUsed];
    }
    return { ...DEFAULTS };
  });

  const setAppSettings = useCallback((s: AppSettings) => {
    setAppSettingsState(s);
    persistAppSettings(s);
  }, []);

  // - Destinations
  const destinations = appSettings.destinations;
  const [showDestManager, setShowDestManager] = useState(false);

  const handleSaveDestinations = useCallback(
    (dests: UploadDestination[]) => {
      persistDestinations(dests);
      setAppSettings({ ...appSettings, destinations: dests });
    },
    [appSettings, setAppSettings],
  );
  const enabledDests = destinations.filter((d) => d.enabled);

  // - Output items
  const [items, setItems] = useState<OutputItem[]>([]);

  const updateItem = useCallback((id: string, patch: Partial<OutputItem>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  }, []);

  // Update per-item timestamps from the TimestampEditor.
  const handleUpdateTimestamps = useCallback(
    (id: string, mode: "auto" | "custom", markers: number[]) => {
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? { ...it, timestampMode: mode, customTimestamps: markers }
            : it,
        ),
      );
    },
    [],
  );

  // When cols or rows changes, warn user about custom timestamp reset
  const prevGridRef = useRef({ cols: opts.cols, rows: opts.rows });
  const setOpts = useCallback(
    (o: SavedOptions) => {
      const prev = prevGridRef.current;
      const gridChanged = o.cols !== prev.cols || o.rows !== prev.rows;

      if (gridChanged) {
        // Check if any items have custom timestamps
        const hasCustomTimestamps = items.some(
          (item) =>
            item.timestampMode === "custom" &&
            item.customTimestamps !== undefined &&
            item.customTimestamps.length > 0,
        );

        if (hasCustomTimestamps) {
          const confirmed = confirm(
            "Changing grid size will reset all the custom timestamps below.\n\n" +
              "Do you want to continue?",
          );

          if (!confirmed) {
            // Revert to previous grid values and don't apply other changes
            const revertedOpts = { ...o, cols: prev.cols, rows: prev.rows };
            setOptsState(revertedOpts);
            prevGridRef.current = { cols: prev.cols, rows: prev.rows };
            return;
          }
        }
      }

      // Safe to apply - update state and track previous grid
      setOptsState(o);
      prevGridRef.current = { cols: o.cols, rows: o.rows };

      // Reset custom timestamps AFTER confirmation (only if grid actually changed)
      if (gridChanged) {
        setItems((prevItems) =>
          prevItems.map((item) =>
            item.timestampMode === "custom"
              ? { ...item, timestampMode: "auto", customTimestamps: [] }
              : item,
          ),
        );
      }
    },
    [items],
  ); // Add items as dependency

  // - Processing
  const {
    isProcessing,
    status,
    analyseFiles,
    processAll,
    requestCancel,
    resetState,
  } = useProcessor(updateItem);

  const handleFilesChange = useCallback(
    async (files: File[]) => {
      setItems([]);
      const newItems = await analyseFiles(files);
      setItems(newItems);
    },
    [analyseFiles],
  );

  const handleStart = useCallback(
    () => processAll(items, opts),
    [items, opts, processAll],
  );
  const handleClear = useCallback(() => {
    setItems([]);
    resetState();
  }, [resetState]);

  // - Upload
  const { isUploadingAll, uploadProgress, uploadItem, uploadAll } = useUpload(
    items,
    setItems,
  );

  // - Download all as ZIP
  const [isZipping, setIsZipping] = useState(false);

  const downloadAll = useCallback(async () => {
    const done = items.filter(
      (i) => i.status === "done" && i.outputBlob && i.outputName,
    );
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

  // - Preview modal
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // - Derived from Outputs
  const doneItems = items.filter(
    (i) =>
      (i.status === "done" || i.status === "processing") &&
      i.outputBlob &&
      i.outputName,
  );
  const allMetaReady =
    items.length > 0 && items.every((i) => i.metadata !== undefined);

  const totalCells = Math.max(1, opts.cols) * Math.max(1, opts.rows);

  const totalPossibleUploads = doneItems.length * enabledDests.length;
  const completedUploads =
    items.filter((item) =>
      enabledDests.every((dest) => item.uploads?.[dest.id]?.status === "done"),
    ).length * enabledDests.length;
  const hasPendingUploads = completedUploads < totalPossibleUploads;

  return (
    <>
      <header className="app-header">
        <a href="/" className="brand-mark" aria-label="Go to homepage">
          <img src="favicon.svg" alt="Logo" />
        </a>
        <div className="header-text">
          <h1>{PROJECT_NAME}</h1>
          <p className="subtitle">
            Thumbnail Grids Generator for videos. Client-side only processing,
            no upload required!
          </p>
        </div>
      </header>

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

      <section className="panel">
        <div className="outputs-header">
          <h2>Outputs</h2>
          <div className="outputs-actions-col">
            <button
              className="icon-btn dest-manager-btn"
              title="Manage upload destinations"
              onClick={() => setShowDestManager(true)}
            >
              <span className="dest-manager-icon">☁️</span>
              <span className="dest-manager-text">
                Upload Destinations{" "}
                {destinations.length > 0
                  ? `(${destinations.filter((d) => d.enabled).length}/${destinations.length})`
                  : ""}
              </span>
            </button>

            <div className="outputs-bulk-actions">
              {enabledDests.length > 0 && doneItems.length > 0 && (
                <button
                  className="icon-btn primary upload-all-btn"
                  disabled={isUploadingAll || !hasPendingUploads}
                  onClick={() => uploadAll(destinations)}
                  title={`Upload all to ${enabledDests.map((d) => d.name).join(", ")} ${
                    hasPendingUploads ? "" : "(All uploads complete)"
                  }`}
                >
                  {isUploadingAll
                    ? `⏳ Uploading… (${uploadProgress.attempted}/${uploadProgress.total})`
                    : `☁️ Upload All (${completedUploads}/${totalPossibleUploads})`}
                </button>
              )}
              {doneItems.length > 1 && (
                <button
                  className="icon-btn primary"
                  disabled={isZipping}
                  onClick={downloadAll}
                >
                  {isZipping
                    ? "⏳ Zipping…"
                    : `⏬ Download All (${doneItems.length})`}
                </button>
              )}
            </div>
          </div>
        </div>

        {doneItems.length > 0 && <CopyAllPanel items={doneItems} />}

        <div className="outputs">
          {items.length === 0 ? (
            <div className="empty">No outputs yet.</div>
          ) : (
            items.map((item) => (
              <OutputCard
                key={item.id}
                item={item}
                totalCells={totalCells}
                showPreview={opts.preview}
                destinations={destinations}
                onPreview={setPreviewUrl}
                onUpload={(id) => uploadItem(id, destinations)}
                onUpdateTimestamps={handleUpdateTimestamps}
              />
            ))
          )}
        </div>
      </section>

      <PreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />

      {showDestManager && (
        <DestinationManager
          destinations={destinations}
          onSave={handleSaveDestinations}
          onClose={() => setShowDestManager(false)}
        />
      )}
      <Footer />
    </>
  );
}
