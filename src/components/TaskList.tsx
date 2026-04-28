import { useMemo } from "react";
import type { TaskItem, UploadDestination } from "../types";
import TaskCard from "./TaskCard";
import CopyAllPanel from "./CopyAllPanel";

interface Props {
  items: TaskItem[];
  totalCells: number;
  showPreview: boolean;
  destinations: UploadDestination[];
  isUploadingAll: boolean;
  uploadProgress: { attempted: number; total: number };
  isZipping: boolean;
  onOpenDestManager: () => void;
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
  onOpenDestManager,
  onUploadAll,
  onDownloadAll,
  onPreview,
  onUpload,
  onUpdateTimestamps,
  onRemove,
  onRequeue,
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
    <section className="panel">
      <div className="tasks-header">
        <h2>Tasks ({items.length})</h2>
        <div className="tasks-actions-col">
          <button
            className="icon-btn dest-manager-btn"
            title="Manage upload destinations"
            onClick={onOpenDestManager}
          >
            <span className="dest-manager-icon">☁️</span>
            <span className="dest-manager-text">
              Upload Destinations{" "}
              {destinations.length > 0
                ? `(${enabledDests.length}/${destinations.length})`
                : ""}
            </span>
          </button>
          <div className="tasks-bulk-actions">
            {enabledDests.length > 0 && doneItems.length > 0 && (
              <button
                className="icon-btn primary upload-all-btn"
                disabled={isUploadingAll || !hasPendingUploads}
                onClick={onUploadAll}
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
                onClick={onDownloadAll}
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
              showPreview={showPreview}
              destinations={destinations}
              onPreview={onPreview}
              onUpload={onUpload}
              onUpdateTimestamps={onUpdateTimestamps}
              onRemove={onRemove}
              onRequeue={onRequeue}
            />
          ))
        )}
      </div>
    </section>
  );
}
