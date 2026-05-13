import { useMemo } from "react";
import { Download, Loader2, Upload } from "lucide-react";
import type { TaskItem, UploadDestination } from "../types";
import type { ProcessorStatus } from "../hooks/useProcessor";
import TaskCard from "./TaskCard";
import CopyAllPanel from "./CopyAllPanel";
import ProcessingPanel from "./ProcessingPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import FilePicker from "./control/FilePicker";

interface Props {
  items: TaskItem[];
  totalCells: number;
  showPreview: boolean;
  destinations: UploadDestination[];
  isUploadingAll: boolean;
  uploadProgress: { attempted: number; total: number };
  isZipping: boolean;
  onFilesChange: (files: File[]) => void;
  onUploadAll: () => void;
  onDownloadAll: () => void;
  onPreview: (url: string) => void;
  onUpload: (id: string) => void;
  onUpdateTimestamps: (
    id: string,
    mode: "auto" | "custom",
    markers: number[],
  ) => void;
  onRemove: (id: string) => void;
  onRequeue: (id: string) => void;
  handleEnablePreviews: () => void;
  // ProcessingPanel props
  status: ProcessorStatus;
  isProcessing: boolean;
  isStale: boolean;
  staleTaskId: string | null;
  hasFiles: boolean;
  allMetadataReady: boolean;
  hasRequeuableItems: boolean;
  onStart: () => void;
  onCancel: () => void;
  onForceCancel: () => void;
  onClear: () => void;
  onRequeueAll: () => void;
  /** Effective batch total computed from items state for dynamic progress. */
  effectiveBatchTotal: number;
  /** Number of items that reached a terminal state (done/error/cancelled). */
  effectiveBatchDone: number;
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
  items,
  totalCells,
  showPreview,
  destinations,
  isUploadingAll,
  uploadProgress,
  isZipping,
  onFilesChange,
  onUploadAll,
  onDownloadAll,
  onPreview,
  onUpload,
  onUpdateTimestamps,
  onRemove,
  onRequeue,
  handleEnablePreviews,
  status,
  isProcessing,
  isStale,
  staleTaskId,
  hasFiles,
  allMetadataReady,
  hasRequeuableItems,
  onStart,
  onCancel,
  onForceCancel,
  onClear,
  onRequeueAll,
  effectiveBatchTotal,
  effectiveBatchDone,
}: Props) {
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

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">Tasks ({items.length})</h2>

          <div className="flex flex-col sm:flex-row gap-4 w-full">
            <div className="w-full sm:w-1/3">
              <FilePicker onFilesChange={onFilesChange} />
            </div>
            <div className="w-full sm:w-2/3">
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
                onRequeueAll={onRequeueAll}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
        {doneItems.length > 0 && <CopyAllPanel items={doneItems} />}
        <div className="flex flex-col gap-3">
          {items.length === 0 ? (
            <div className="text-muted-foreground py-2 text-center text-sm">
              No tasks yet. Add video files to get started.
            </div>
          ) : (
            items.map((item) => (
              <TaskCard
                key={item.id}
                item={item}
                totalCells={totalCells}
                showPreview={showPreview}
                destinations={destinations}
                onPreview={onPreview}
                onUpload={onUpload}
                onUpdateTimestamps={onUpdateTimestamps}
                onRemove={onRemove}
                onRequeue={onRequeue}
                handleEnablePreviews={handleEnablePreviews}
                isStale={isStale && item.id === staleTaskId}
                onForceCancel={
                  isStale && item.id === staleTaskId ? onForceCancel : undefined
                }
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
