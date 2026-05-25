import { useMemo, useCallback, useRef, useEffect, useState } from "react";
import { autoAnimate } from "@formkit/auto-animate";
import { Download, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskStore } from "@/store/taskStore";
import { useProcessingStore } from "@/store/processingStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useUploadStore } from "@/store/uploadStore";
import { useUiStore } from "@/store/uiStore";
import TaskCard from "./TaskCard";
import { ErrorBoundary } from "./ErrorBoundary";
import CopyAllPanel from "./CopyAllPanel";
import ProcessingPanel from "./ProcessingPanel";
import CompactBar from "./CompactBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import FilePicker from "./control/FilePicker";

interface Props {
  // --- Callbacks that require processor/upload hooks (cannot be in stores) ---
  onFilesChange: (files: File[]) => void;
  onUploadAll: () => void;
  onDownloadAll: () => void;
  onPreview: (url: string) => void;
  onUpload: (id: string) => void;
  onStart: () => void;
  onCancel: () => void;
  onForceCancel: () => void;
  onClear: () => void;
}

/**
 * Renders the tasks panel: the header row with bulk-action buttons, the
 * copy-all links bar for completed uploads, and the individual TaskCard list.
 *
 * Derived values (doneItems, enabledDests, upload counts) are computed here
 * via useMemo so the parent stays free of view-layer concerns.
 *
 * @param items - All current task items.
 * @param totalCells - Grid cols x rows; forwarded to each TaskCard.
 * @param showPreview - Whether thumbnail previews are enabled.
 * @param destinations - Full list of upload destinations (enabled and disabled).
 * @param isUploadingAll - True while a bulk-upload batch is in progress.
 * @param uploadProgress - Attempted and total upload counts for the current bulk run.
 * @param isZipping - True while the ZIP archive is being generated.
 * @param onOpenDestManager - Opens the destination manager modal.
 * @param onUploadAll - Starts uploading all completed items to all enabled destinations.
 * @param onDownloadAll - Downloads all completed items as a ZIP archive.
 * @param onPreview - Opens the full-size preview modal for a given blob URL.
 * @param onUpload - Uploads a single item (by id) to all enabled destinations.
 * @param onUpdateTimestamps - Updates per-file timestamp mode and marker list.
 * @param onRemove - Removes a task from the list.
 * @param onRequeue - Resets a finished task back to queued status.
 */
export default function TaskList({
  onFilesChange,
  onUploadAll,
  onDownloadAll,
  onPreview,
  onUpload,
  onStart,
  onCancel,
  onForceCancel,
  onClear,
}: Props) {
  // --- Store actions (read directly to reduce props drilling) ---
  const handleUpdateTimestamps = useTaskStore((s) => s.handleUpdateTimestamps);
  const handleRemoveItem = useTaskStore((s) => s.handleRemoveItem);
  const handleRequeueItem = useTaskStore((s) => s.handleRequeueItem);
  const handleRequeueAll = useTaskStore((s) => s.handleRequeueAll);
  const handleShowPreviewChange = useSettingsStore(
    (s) => s.handleShowPreviewChange,
  );
  // --- Read from Zustand stores directly ---
  const items = useTaskStore((s) => s.items);
  const destinations = useSettingsStore((s) => s.settings.destinations);
  const status = useProcessingStore((s) => s.status);
  const isProcessing = useProcessingStore((s) => s.isProcessing);
  const isStale = useProcessingStore((s) => s.isStale);
  const staleTaskId = useProcessingStore((s) => s.staleTaskId);

  // Upload state from uploadStore
  const isUploadingAll = useUploadStore((s) => s.isUploadingAll);
  const uploadProgress = useUploadStore((s) => s.uploadProgress);

  // ZIP state from uiStore
  const isZipping = useUiStore((s) => s.isZipping);

  // --- Derived values ---
  const hasFiles = items.some((i) => i.status === "queued");
  const allMetadataReady = items.length > 0 && items.every((i) => !!i.metadata);
  const hasRequeuableItems = items.some(
    (i) =>
      i.status === "done" || i.status === "error" || i.status === "cancelled",
  );

  const enabledDests = useMemo(
    () => destinations.filter((d) => d.enabled),
    [destinations],
  );

  const doneItems = useMemo(
    () =>
      items.filter(
        (i) =>
          (i.status === "done" || i.status === "processing") &&
          i.outputBlob &&
          i.outputName,
      ),
    [items],
  );

  const totalPossibleUploads = doneItems.length * enabledDests.length;

  const completedUploads = useMemo(
    () =>
      items.filter((item) =>
        enabledDests.every(
          (dest) => item.uploads?.[dest.id]?.status === "done",
        ),
      ).length * enabledDests.length,
    [items, enabledDests],
  );

  const hasPendingUploads = completedUploads < totalPossibleUploads;

  // True when every possible upload across all done items is complete.
  const allDone =
    totalPossibleUploads > 0 && completedUploads >= totalPossibleUploads;

  // effective batch progress (for CompactBar / ProcessingPanel)
  // Computed dynamically from actual item states so that:
  // 1. Requeued tasks don't carry stale counters from previous runs.
  // 2. Deleting a task during processing immediately updates progress.
  // 3. Already-done tasks count as "completed" for the current batch.
  const effectiveBatchDone = items.filter(
    (i) =>
      i.status === "done" || i.status === "error" || i.status === "cancelled",
  ).length;
  const inFlight = items.filter(
    (i) => i.status === "queued" || i.status === "processing",
  ).length;
  const effectiveBatchTotal = isProcessing
    ? effectiveBatchDone + inFlight
    : effectiveBatchDone;

  // auto-animate ref for smooth layout transitions when items are added/removed.
  // Configured with duration so enter/exit animations are visible even when
  // items are added quickly by the MutationObserver.
  const listRef = useCallback((el: HTMLDivElement | null) => {
    if (el) {
      autoAnimate(el, { duration: 300 });
    }
  }, []);

  // IntersectionObserver to detect when the controls header scrolls offscreen
  const headerRef = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsCompact(!entry.isIntersecting);
      },
      {
        rootMargin: "0px",
        threshold: 0.25,
      },
    );

    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Compact bar shown when controls scroll offscreen */}
      <div className="fixed top-0 left-0 right-0 z-45">
        <div
          className={cn(
            "transition-transform duration-250 ease-out",
            isCompact ? "translate-y-0" : "-translate-y-full",
          )}
        >
          <CompactBar
            status={status}
            isProcessing={isProcessing}
            hasFiles={hasFiles}
            allMetadataReady={allMetadataReady}
            hasRequeuableItems={hasRequeuableItems}
            effectiveBatchTotal={effectiveBatchTotal}
            effectiveBatchDone={effectiveBatchDone}
            isCompact={isCompact}
            onFilesChange={onFilesChange}
            onStart={onStart}
            onCancel={onCancel}
            onClear={onClear}
            onRequeueAll={handleRequeueAll}
          />
        </div>
      </div>

      <Card className="task-list-card overflow-hidden">
        <CardContent className="flex flex-col gap-4 opacity-100">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-lg font-semibold">Tasks ({items.length})</h2>

            <div className="flex flex-col sm:flex-row gap-4 w-full">
              <div className="w-full sm:w-1/3">
                <FilePicker onFilesChange={onFilesChange} />
              </div>
              <div className="w-full sm:w-2/3" ref={headerRef}>
                <ProcessingPanel
                  status={status}
                  isProcessing={isProcessing}
                  hasFiles={hasFiles}
                  allMetadataReady={allMetadataReady}
                  hasRequeuableItems={hasRequeuableItems}
                  effectiveBatchTotal={effectiveBatchTotal}
                  effectiveBatchDone={effectiveBatchDone}
                  onStart={onStart}
                  onCancel={onCancel}
                  onClear={onClear}
                  onRequeueAll={handleRequeueAll}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 justify-end w-full">
              {enabledDests.length > 0 && doneItems.length > 0 && (
                <Button
                  variant="default"
                  disabled={isUploadingAll || !hasPendingUploads}
                  onClick={onUploadAll}
                  title={`Upload all to ${enabledDests.map((d) => d.name).join(", ")} ${
                    hasPendingUploads ? "" : "(All uploads complete)"
                  }`}
                >
                  {isUploadingAll ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Uploading… ({uploadProgress.attempted}/
                      {uploadProgress.total})
                    </>
                  ) : (
                    <>
                      <Upload className="size-4" />
                      Upload All ({completedUploads}/{totalPossibleUploads})
                    </>
                  )}
                </Button>
              )}
              {doneItems.length > 1 && (
                <Button
                  variant="default"
                  disabled={isZipping}
                  onClick={onDownloadAll}
                >
                  {isZipping ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Zipping…
                    </>
                  ) : (
                    <>
                      <Download className="size-4" />
                      Download All ({doneItems.length})
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
          {items.some((i) => i.metadata) && (
            <CopyAllPanel items={items} allDone={allDone} />
          )}

          <div ref={listRef} className="flex flex-col gap-4 overflow-hidden">
            {items.length === 0 ? (
              <div className="text-muted-foreground py-2 text-center text-sm">
                No tasks yet. Add video files to get started.
              </div>
            ) : (
              items.map((item, idx) => (
                <ErrorBoundary key={item.id}>
                  <TaskCard
                    position={idx + 1}
                    item={item}
                    onPreview={onPreview}
                    onUpload={onUpload}
                    onUpdateTimestamps={handleUpdateTimestamps}
                    onRemove={handleRemoveItem}
                    onRequeue={handleRequeueItem}
                    handleEnablePreviews={() => handleShowPreviewChange(true)}
                    isStale={isStale && item.id === staleTaskId}
                    onForceCancel={
                      item.status === "processing" ? onForceCancel : undefined
                    }
                  />
                </ErrorBoundary>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
