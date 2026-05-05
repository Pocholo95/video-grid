import { useCallback, useMemo, useRef, useState } from "react";
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
import ProcessingPanel from "./components/ProcessingPanel";
import TaskList from "./components/TaskList";
import DestinationManager from "./components/DestinationManager";
import PreviewModal from "./components/PreviewModal";
import Footer from "./components/Footer";
import { makeUniqueName } from "./utils";

// - Persisted app settings
const initialSettings = loadAppSettings();

export default function App() {
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

  const handleSetPresets = useCallback(
    (p: AppSettings["presets"]) =>
      setAppSettings({ ...appSettings, presets: p }),
    [appSettings, setAppSettings],
  );

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

  // Requeue all completed/failed/cancelled tasks back to queued.
  const handleRequeueAll = useCallback(() => {
    setItems((prev) =>
      prev.map((it) =>
        it.status === "done" ||
        it.status === "error" ||
        it.status === "cancelled"
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

  // File input ref - lifted here so Clear All can reset it.
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // - Upload
  const {
    isUploadingAll,
    uploadProgress,
    uploadItem,
    uploadAll,
    resetUploadState,
  } = useUpload(items, setItems);

  const handleClear = useCallback(() => {
    setItems([]);
    resetState();
    resetUploadState();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [resetState, resetUploadState]);

  const handleUploadItem = useCallback(
    (id: string) => uploadItem(id, destinations),
    [uploadItem, destinations],
  );

  const handleUploadAll = useCallback(
    () => uploadAll(destinations),
    [uploadAll, destinations],
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
      const existingNames = new Set<string>();

      for (const item of done) {
        const uniqueName = makeUniqueName(item.outputName!, existingNames);
        existingNames.add(uniqueName);
        zip.file(uniqueName, item.outputBlob!);
      }

      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, "vidgrid-outputs.zip");
    } finally {
      setIsZipping(false);
    }
  }, [items]);

  // - Preview modal
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleClosePreview = useCallback(() => setPreviewUrl(null), []);

  // - Destination manager handlers
  const handleOpenDestManager = useCallback(() => setShowDestManager(true), []);

  const handleCloseDestManager = useCallback(
    () => setShowDestManager(false),
    [],
  );

  // - Derived values

  // "Start Processing" is only meaningful when there are queued tasks with metadata ready.
  const queuedItems = useMemo(
    () => items.filter((i) => i.status === "queued"),
    [items],
  );
  const hasQueuedFiles = queuedItems.length > 0;
  const allMetaReady =
    hasQueuedFiles && queuedItems.every((i) => i.metadata !== undefined);

  // When a custom grid template is active the effective cell count is the
  // number of cells defined in it, not cols×rows. This feeds into the
  // timestamp editor so marker counts and auto-fallback counts are correct.
  const totalCells =
    opts.gridTemplate && opts.gridTemplate.cells.length > 0
      ? opts.gridTemplate.cells.length
      : Math.max(1, opts.cols) * Math.max(1, opts.rows);

  const hasRequeuableItems = useMemo(
    () =>
      items.some(
        (i) =>
          i.status === "done" ||
          i.status === "error" ||
          i.status === "cancelled",
      ),
    [items],
  );

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
        setPresets={handleSetPresets}
        fileInputRef={fileInputRef}
        onFilesChange={handleFilesChange}
      />
      <ProcessingPanel
        status={status}
        isProcessing={isProcessing}
        hasFiles={hasQueuedFiles}
        allMetadataReady={allMetaReady}
        hasRequeuableItems={hasRequeuableItems}
        onStart={handleStart}
        onCancel={requestCancel}
        onClear={handleClear}
        onRequeueAll={handleRequeueAll}
      />
      <TaskList
        items={items}
        totalCells={totalCells}
        showPreview={opts.preview}
        destinations={destinations}
        isUploadingAll={isUploadingAll}
        uploadProgress={uploadProgress}
        isZipping={isZipping}
        onOpenDestManager={handleOpenDestManager}
        onUploadAll={handleUploadAll}
        onDownloadAll={downloadAll}
        onPreview={setPreviewUrl}
        onUpload={handleUploadItem}
        onUpdateTimestamps={handleUpdateTimestamps}
        onRemove={handleRemoveItem}
        onRequeue={handleRequeueItem}
      />
      {previewUrl && (
        <PreviewModal url={previewUrl} onClose={handleClosePreview} />
      )}
      {showDestManager && (
        <DestinationManager
          destinations={destinations}
          onSave={handleSaveDestinations}
          onClose={handleCloseDestManager}
        />
      )}
      <Footer />
    </>
  );
}
