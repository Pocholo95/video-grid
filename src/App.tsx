import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import { Settings as SettingsIcon } from "lucide-react";

import { DEFAULTS, PROJECT_NAME } from "./constants";
import type {
  AppSettings,
  SavedOptions,
  TaskItem,
  UploadDestination,
} from "./types";
import { useAppSettings } from "./hooks/useAppSettings";
import { useProcessor } from "./hooks/useProcessor";
import { useUpload } from "./hooks/useUpload";

import ControlPanel from "./components/ControlPanel";
import ProcessingPanel from "./components/ProcessingPanel";
import TaskList from "./components/TaskList";
import DestinationManager from "./components/DestinationManager";
import PreviewModal from "./components/PreviewModal";
import Footer from "./components/Footer";
import Settings from "./components/Settings";
import { makeUniqueName } from "./utils";

export default function App() {
  const {
    savedSettings,
    getCurrentSettings,
    updateSettings,
    saveSettings,
    resetPending,
    updateDestinations,
    updateSettingAndPersist,
  } = useAppSettings();

  // Initialize opts from current presets or defaults
  const [opts, setOptsState] = useState<SavedOptions>(() => {
    const { lastUsed, entries } = savedSettings.presets;
    if (lastUsed && entries[lastUsed]) {
      return structuredClone(entries[lastUsed]);
    }
    return structuredClone(DEFAULTS);
  });

  // Track original app settings for revert on cancel
  const [originalAppSettings, setOriginalAppSettings] = useState<AppSettings>();

  // Theme handling with immediate class application (using getCurrentSettings for preview)
  const applyTheme = useCallback(
    (theme: "dark" | "light" | "dimmed" | "classic") => {
      document.documentElement.className = theme;
    },
    [],
  );

  const currentTheme = getCurrentSettings().theme;
  useEffect(() => {
    applyTheme(currentTheme);
  }, [applyTheme, currentTheme]);

  // Settings dialog handlers - preview mode changes don't persist to localStorage
  const handleOpenThemeDialog = useCallback(() => {
    if (!originalAppSettings) {
      setOriginalAppSettings(structuredClone(savedSettings));
    }
    setShowThemeDialog(true);
  }, [savedSettings, originalAppSettings]);

  const handleThemeChange = useCallback(
    (newTheme: "dark" | "light" | "dimmed" | "classic") => {
      updateSettings({ theme: newTheme });
    },
    [],
  );

  const handleShowPreviewChange = useCallback((newShow: boolean) => {
    updateSettings({ showPreview: newShow });
  }, []);

  // Save merged settings (saved + pending) to localStorage and UI
  const handleSaveAndClose = useCallback(() => {
    saveSettings(getCurrentSettings());
    setShowThemeDialog(false);
  }, [getCurrentSettings]);

  const handleCancelSettings = useCallback(() => {
    resetPending();
    setShowThemeDialog(false);
  }, []);

  // Destinations - always use saved (not preview) state for this dialog
  const destinations = getCurrentSettings().destinations;
  const [showDestManager, setShowDestManager] = useState(false);

  const handleSaveDestinations = useCallback(
    (dests: UploadDestination[]) => {
      updateDestinations(dests);
    },
    [updateDestinations],
  );

  // Task items
  const [showThemeDialog, setShowThemeDialog] = useState(false);

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

  // Processing
  const {
    isProcessing,
    status,
    analyzeFiles: analyzeFiles,
    processAll,
    requestCancel,
    resetState,
  } = useProcessor(updateItem);

  // File input ref - lifted here so Clear All can reset it.
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add new files as tasks - existing tasks are preserved.
  const handleFilesChange = useCallback(
    async (files: File[]) => {
      const newItems = await analyzeFiles(files);
      setItems((prev) => [...prev, ...newItems]);
    },
    [analyzeFiles],
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

  // Upload
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
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [resetState, resetUploadState]);

  const handleUploadItem = useCallback(
    (id: string) => uploadItem(id, destinations),
    [uploadItem, destinations],
  );

  const handleUploadAll = useCallback(
    () => uploadAll(destinations),
    [uploadAll, destinations],
  );

  // Download all as ZIP
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

  // Preview dialog
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const handleClosePreview = useCallback(() => setPreviewUrl(null), []);

  // Destination manager handlers
  const handleEnablePreviews = useCallback(
    () => updateSettingAndPersist("showPreview", true),
    [updateSettingAndPersist],
  );

  const handleOpenDestManager = useCallback(() => setShowDestManager(true), []);
  const handleCloseDestManager = useCallback(
    () => setShowDestManager(false),
    [],
  );

  // Derived values
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
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <header className="bg-card text-card-foreground flex items-center gap-4 rounded-xl border p-6 shadow-sm">
        <a
          href="/"
          aria-label="Go to homepage"
          className="focus-visible:ring-ring/50 inline-flex shrink-0 rounded-md focus-visible:ring-2 focus-visible:outline-none"
        >
          <img src="favicon.svg" alt="Logo" className="size-14 rounded-md" />
        </a>
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <h1 className="text-2xl font-semibold leading-none tracking-tight">
            {PROJECT_NAME}
          </h1>
          <p className="text-muted-foreground text-sm">
            Thumbnail Grids Generator for videos. Client-side only processing,
            no upload required!
          </p>
        </div>

        <button
          onClick={handleOpenThemeDialog}
          className="self-start bg-secondary hover:bg-secondary/80 text-secondary-foreground p-2 rounded-md transition-colors focus-visible:ring-ring/50 inline-flex items-center justify-center"
          aria-label="Open settings"
        >
          <SettingsIcon className="size-4" />
        </button>
      </header>

      {/* Control Panel - passes preset-related callbacks for save */}
      <ControlPanel
        opts={opts}
        setOpts={setOptsState}
        presets={getCurrentSettings().presets}
        setPresets={(p: AppSettings["presets"]) => {
          updateSettings({ presets: p as Partial<AppSettings>["presets"] });
        }}
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
        showPreview={getCurrentSettings().showPreview}
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
        handleEnablePreviews={handleEnablePreviews}
      />

      {previewUrl && (
        <PreviewModal url={previewUrl} onClose={handleClosePreview} />
      )}

      <DestinationManager
        open={showDestManager}
        destinations={destinations}
        onSave={handleSaveDestinations}
        onUpdate={handleSaveDestinations}
        onClose={handleCloseDestManager}
      />

      <Footer />

      {/* Settings Dialog */}
      <Settings
        open={showThemeDialog}
        theme={getCurrentSettings().theme}
        showPreview={getCurrentSettings().showPreview}
        onThemeChange={handleThemeChange}
        onShowPreviewChange={handleShowPreviewChange}
        onSave={handleSaveAndClose}
        onCancel={handleCancelSettings}
      />
    </div>
  );
}
