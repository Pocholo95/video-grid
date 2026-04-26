import { useCallback, useState } from "react";
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
  TaskItem,
  SavedOptions,
  UploadDestination,
} from "./types";

import ControlPanel from "./components/ControlPanel";
import TaskCard from "./components/TaskCard";
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

  // - Task items
  const [items, setItems] = useState<TaskItem[]>([]);

  const updateItem = useCallback((id: string, patch: Partial<TaskItem>) => {
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

  // Remove a single task from the list.
  const handleRemoveItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  // Reset a completed/failed/cancelled task back to queued so it can be reprocessed.
  const handleRequeueItem = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              status: "queued" as const,
              error: undefined,
              outputBlob: undefined,
              outputName: undefined,
              outputSize: undefined,
              processingStartedAt: undefined,
              processingDurationMs: undefined,
              uploads: undefined,
            }
          : it,
      ),
    );
  }, []);

  const setOpts = useCallback((o: SavedOptions) => setOptsState(o), []);

  // - Processing
  const {
    isProcessing,
    status,
    analyseFiles,
    processAll,
    requestCancel,
    resetState,
  } = useProcessor(updateItem);

  // Add new files as tasks - existing tasks are preserved.
  const handleFilesChange = useCallback(
    async (files: File[]) => {
      const newItems = await analyseFiles(files);
      setItems((prev) => [...prev, ...newItems]);
    },
    [analyseFiles],
  );

  // Only process tasks that are currently queued.
  const handleStart = useCallback(
    () =>
      processAll(
        items.filter((it) => it.status === "queued"),
        opts,
      ),
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

  // - Derived values
  const doneItems = items.filter(
    (i) =>
      (i.status === "done" || i.status === "processing") &&
      i.outputBlob &&
      i.outputName,
  );

  // "Start Processing" is only meaningful when there are queued tasks with metadata ready.
  const queuedItems = items.filter((i) => i.status === "queued");
  const hasQueuedFiles = queuedItems.length > 0;
  const allMetaReady =
    hasQueuedFiles && queuedItems.every((i) => i.metadata !== undefined);

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
        hasFiles={hasQueuedFiles}
        allMetadataReady={allMetaReady}
        onFilesChange={handleFilesChange}
        onStart={handleStart}
        onCancel={requestCancel}
        onClear={handleClear}
      />
      <section className="panel">
        <div className="tasks-header">
          <h2>Tasks ({items.length})</h2>
          <div className="tasks-actions-col">
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
            <div className="tasks-bulk-actions">
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
        <div className="tasks">
          {items.length === 0 ? (
            <div className="empty">
              No tasks yet. Add video files to get started.
            </div>
          ) : (
            items.map((item) => (
              <TaskCard
                key={item.id}
                item={item}
                totalCells={totalCells}
                showPreview={opts.preview}
                destinations={destinations}
                onPreview={setPreviewUrl}
                onUpload={(id) => uploadItem(id, destinations)}
                onUpdateTimestamps={handleUpdateTimestamps}
                onRemove={handleRemoveItem}
                onRequeue={handleRequeueItem}
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
