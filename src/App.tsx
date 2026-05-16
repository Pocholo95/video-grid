import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { autoAnimate } from "@formkit/auto-animate";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import { Settings as SettingsIcon } from "lucide-react";

import { DEFAULTS, PROJECT_NAME } from "./constants";
import type { AppSettings, SavedOptions, TaskItem } from "./types";
import { useAppSettings } from "./hooks/useAppSettings";
import { useProcessor } from "./hooks/useProcessor";
import { useUpload } from "./hooks/useUpload";

import ControlPanel from "./components/ControlPanel";
import TaskList from "./components/TaskList";
import PreviewModal from "./components/PreviewModal";
import Footer from "./components/Footer";
import Settings from "./components/Settings";
import { makeUniqueName } from "./utils";
import { yieldToBrowser } from "./lib/utils";
import { Button } from "./components/ui/button";

export default function App() {
  const {
    savedSettings,
    getCurrentSettings,
    updateSettings,
    saveSettings,
    resetPending,
    updateSettingAndPersist,
    updateDestinations,
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

  // Settings
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);

  // Settings dialog handlers - preview mode changes don't persist to localStorage
  const handleOpenSettingsDialog = useCallback(() => {
    if (!originalAppSettings) {
      setOriginalAppSettings(structuredClone(savedSettings));
    }
    setShowSettingsDialog(true);
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

  const handleCancelSettings = useCallback(() => {
    resetPending();
    setShowSettingsDialog(false);
  }, [resetPending]);

  // Destinations - always use saved (not preview) state for this dialog
  const destinations = getCurrentSettings().destinations;

  const [items, setItems] = useState<TaskItem[]>([]);

  // Ref to the current items list, used by the processor to check if a task
  // was removed mid-batch (closures capture stale state in async loops).
  const itemsRef = useRef(items);
  itemsRef.current = items;

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
    isStale,
    staleTaskId,
    status,
    analyzeFiles,
    processAll,
    requestCancel,
    forceCancel,
    resetState,
  } = useProcessor(updateItem);

  // File input ref - lifted here so Clear All can reset it.
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add new files as tasks one-by-one: delegate analysis to useProcessor.analyzeFiles
  // with an onItemReady callback so each item is added individually after its analysis
  // completes, triggering a distinct enter animation per file.
  // We yield to the browser after each addition so React commits in a separate render
  // frame — this gives auto-animate time to detect the new DOM node and start its
  // enter animation before the next item arrives.
  const handleFilesChange = useCallback(
    async (files: File[]) => {
      await analyzeFiles(files, (item) => {
        setItems((prev) => [...prev, item]);
        return yieldToBrowser();
      });
    },
    [analyzeFiles],
  );

  // Only process tasks that are currently queued.
  const handleStart = useCallback(
    () =>
      processAll(
        items.filter((it) => it.status === "queued"),
        opts,
        // Check if a task is still in the current items list (not removed).
        // Uses a ref so the async loop always reads the latest state.
        (id: string) => itemsRef.current.some((it) => it.id === id),
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

  /**
   * Clear all items. auto-animate handles the exit animation for items
   * disappearing from the list and the layout shift for the container.
   * We yield to the browser after clearing so auto-animate can detect the
   * removed DOM nodes and play exit animations before other state resets.
   */
  const onClear = useCallback(async () => {
    setItems([]);
    await yieldToBrowser();
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

  // Enable previews callback - used by TaskList to trigger showPreview setting
  const handleEnablePreviews = useCallback(
    () => updateSettingAndPersist("showPreview", true),
    [updateSettingAndPersist],
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

  // All batch progress stats derived from items state so removed tasks are
  // reflected correctly at every stage (during processing, after, and on requeue).
  // Only "done" and "error" count as processed (actual work was performed).
  // "cancelled" tasks are excluded from the done count since no real work was done.
  const effectiveBatchDone = items.filter(
    (i) => i.status === "done" || i.status === "error",
  ).length;
  // Total includes all terminal states plus in-flight tasks, so cancelled tasks
  // still count toward the batch denominator (they were part of the original batch).
  const cancelledCount = items.filter((i) => i.status === "cancelled").length;
  const inFlight = items.filter(
    (i) => i.status === "queued" || i.status === "processing",
  ).length;
  const effectiveBatchTotal = isProcessing
    ? effectiveBatchDone + cancelledCount + inFlight
    : effectiveBatchDone + cancelledCount;

  // auto-animate on the main container so sibling elements (TaskList, ControlPanel,
  // Footer) shift smoothly when the TaskList card grows or shrinks.
  const mainRef = useCallback((el: HTMLDivElement | null) => {
    if (el) {
      autoAnimate(el);
    }
  }, []);

  return (
    <div ref={mainRef} className="mx-auto flex max-w-6xl flex-col gap-3 p-4">
      <header className="bg-card text-card-foreground flex items-start justify-between gap-4 rounded-xl border p-4 shadow-sm">
        <div className="flex items-center gap-4 flex-1">
          <a
            href="/"
            aria-label="Go to homepage"
            className="focus-visible:ring-ring/50 inline-flex shrink-0 rounded-md focus-visible:ring-2 focus-visible:outline-none"
          >
            <img src="favicon.svg" alt="Logo" className="size-14 rounded-md" />
          </a>
          <div className="min-w-0 flex flex-col gap-1">
            <h1 className="text-base min-[360px]:text-xl font-semibold leading-none tracking-tight text-nowrap">
              {PROJECT_NAME}
            </h1>
            <p className="text-muted-foreground text-sm hidden min-[360px]:block">
              Thumbnail Grids for Videos
            </p>
            <p className="text-muted-foreground text-sm hidden sm:block">
              Client-side only processing, no upload required!
            </p>
          </div>
        </div>

        <Button
          onClick={handleOpenSettingsDialog}
          variant={"outline"}
          size={"icon"}
          aria-label="Open settings"
        >
          <SettingsIcon className="size-4" />
        </Button>
      </header>

      <TaskList
        items={items}
        totalCells={totalCells}
        showPreview={getCurrentSettings().showPreview}
        destinations={destinations}
        onFilesChange={handleFilesChange}
        isUploadingAll={isUploadingAll}
        uploadProgress={uploadProgress}
        isZipping={isZipping}
        onUploadAll={handleUploadAll}
        onDownloadAll={downloadAll}
        onPreview={setPreviewUrl}
        onUpload={handleUploadItem}
        onUpdateTimestamps={handleUpdateTimestamps}
        onRemove={handleRemoveItem}
        onRequeue={handleRequeueItem}
        handleEnablePreviews={handleEnablePreviews}
        status={status}
        isProcessing={isProcessing}
        isStale={isStale}
        staleTaskId={staleTaskId}
        hasFiles={hasQueuedFiles}
        allMetadataReady={allMetaReady}
        hasRequeuableItems={hasRequeuableItems}
        effectiveBatchTotal={effectiveBatchTotal}
        effectiveBatchDone={effectiveBatchDone}
        onStart={handleStart}
        onCancel={requestCancel}
        onForceCancel={forceCancel}
        onClear={onClear}
        onRequeueAll={handleRequeueAll}
      />

      <ControlPanel
        opts={opts}
        setOpts={setOptsState}
        presets={getCurrentSettings().presets}
        setPresets={(p: AppSettings["presets"]) => {
          updateSettings({ presets: p as Partial<AppSettings>["presets"] });
        }}
      />

      {previewUrl && (
        <PreviewModal url={previewUrl} onClose={handleClosePreview} />
      )}

      <Footer />

      {/* Settings Dialog with nested Upload Destinations */}
      <Settings
        open={showSettingsDialog}
        theme={getCurrentSettings().theme}
        showPreview={getCurrentSettings().showPreview}
        destinations={destinations}
        onThemeChange={handleThemeChange}
        onShowPreviewChange={handleShowPreviewChange}
        onSaveAndClose={() => {
          // Save pending settings (theme/preview) and close dialog
          saveSettings();
          setShowSettingsDialog(false);
        }}
        onCancel={handleCancelSettings}
        updateDestinations={updateDestinations}
      />
    </div>
  );
}
