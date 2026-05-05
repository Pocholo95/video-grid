import { useEffect, useRef, useState } from "react";
import type { TaskItem, UploadDestination } from "../types";
import { formatElapsed, formatTime, humanSize } from "../utils";
import UploadLinks from "./UploadLinks";
import TimestampEditor from "./TimestampEditor";

interface Props {
  item: TaskItem;
  totalCells: number;
  showPreview: boolean;
  destinations: UploadDestination[];
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

export default function TaskCard({
  item,
  totalCells,
  showPreview,
  destinations,
  onPreview,
  onUpload,
  onUpdateTimestamps,
  onRemove,
  onRequeue,
}: Props) {
  const urlRef = useRef<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  useEffect(() => {
    if (!item.outputBlob || !showPreview) {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      setBlobUrl(null);
      return;
    }
    if (!urlRef.current) urlRef.current = URL.createObjectURL(item.outputBlob);
    setBlobUrl(urlRef.current);
    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [item.outputBlob, showPreview]);

  // Live tick to refresh the elapsed display while this item is processing.
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (item.status !== "processing" || !item.processingStartedAt) return;
    const id = setInterval(() => forceUpdate((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [item.status, item.processingStartedAt]);

  // Compute status text with timing info.
  let statusText: string;
  if (item.status === "processing" && item.processingStartedAt) {
    statusText = `processing - ${formatElapsed(Date.now() - item.processingStartedAt)}`;
  } else if (item.status === "done" && item.processingDurationMs != null) {
    statusText = `done in ${formatElapsed(item.processingDurationMs)}`;
  } else {
    statusText = item.status;
  }

  const meta = item.metadata;
  const isDone = item.status === "done";
  const enabledDests = destinations.filter((d) => d.enabled);

  const anyUploading = enabledDests.some(
    (d) => item.uploads?.[d.id]?.status === "uploading",
  );
  const allDone =
    enabledDests.length > 0 &&
    enabledDests.every((d) => item.uploads?.[d.id]?.status === "done");
  const canUpload =
    isDone &&
    !!item.outputBlob &&
    enabledDests.length > 0 &&
    !anyUploading &&
    !allDone;

  const isCustom = item.timestampMode === "custom";
  const markerCount = item.customTimestamps?.length ?? 0;

  // Timestamp mode label shown in the card.
  let tsLabel: string;
  if (!isCustom) {
    tsLabel = "Auto (evenly distributed)";
  } else if (markerCount === 0) {
    tsLabel = "Custom — no markers (uses auto)";
  } else {
    const used = Math.min(markerCount, totalCells);
    const fallback = Math.max(0, totalCells - markerCount);
    tsLabel =
      `Custom — ${used} marker${used !== 1 ? "s" : ""}` +
      (fallback > 0 ? ` + ${fallback} auto` : "");
  }

  const handleSaveMarkers = (markers: number[]) => {
    const isDoneItem = item.status === "done";
    const shouldRequeue =
      isDoneItem &&
      window.confirm(
        "This task is already done. Requeue it with the new timestamps for processing?",
      );

    if (markers.length === 0) {
      onUpdateTimestamps(item.id, "auto", []);
    } else {
      onUpdateTimestamps(item.id, "custom", markers);
    }

    if (shouldRequeue) onRequeue(item.id);
    setShowEditor(false);
  };

  // Disabled while processing - can't open editor mid-batch.
  const canEditTimestamps = item.status !== "processing" && !!item.metadata;

  // Tasks that have finished (one way or another) can be re-queued.
  const canRequeue =
    item.status === "done" ||
    item.status === "error" ||
    item.status === "cancelled";

  return (
    <>
      <article
        className={`task-card task-${item.status}${allDone ? " task-uploaded" : ""}`}
      >
        <div className="task-top">
          <div className="task-top-text">
            <h3 title={item.file.name}>{item.file.name}</h3>
            {item.warning && <p className="warning">{item.warning}</p>}
            {meta && (
              <p className="small">
                Duration: {formatTime(meta.duration)} &nbsp;·&nbsp;
                {meta.width}×{meta.height} &nbsp;·&nbsp;
                {meta.bitrate
                  ? `${Math.round(meta.bitrate / 1000)} kbps`
                  : "n/a"}{" "}
                &nbsp;·&nbsp;
                {humanSize(item.file.size)}
              </p>
            )}
          </div>
          <div className="task-top-actions">
            <div className="badge">{item.status}</div>
            <button
              className="icon-btn task-remove-btn"
              onClick={() => onRemove(item.id)}
              disabled={item.status === "processing"}
              title="Remove this task"
            >
              ✕
            </button>
          </div>
        </div>
        {/* Timestamp row */}
        <div className="ts-card-row">
          <span
            className={`ts-card-label${isCustom ? " ts-card-label--custom" : ""}`}
          >
            🎯 {tsLabel}
          </span>
          <button
            className={`icon-btn ts-card-edit-btn${isCustom ? " ts-card-edit-btn--active" : ""}`}
            disabled={!canEditTimestamps}
            onClick={() => setShowEditor(true)}
            title={
              canEditTimestamps
                ? "Edit timestamps for this file"
                : "Timestamps can be edited after analysis completes"
            }
          >
            ⏱️ Edit Timestamps
          </button>
        </div>
        <div className="task-grid">
          <div className="task-preview">
            {blobUrl ? (
              <img
                src={blobUrl}
                alt={`Preview for ${item.file.name}`}
                onClick={() => onPreview(blobUrl)}
                style={{ cursor: "zoom-in" }}
              />
            ) : (
              <div className="preview-placeholder">
                {showPreview
                  ? item.status === "processing"
                    ? "Processing…"
                    : "No preview"
                  : "Preview off"}
              </div>
            )}
          </div>
          <div className="task-info">
            <p>
              <strong>Task:</strong> {item.outputName ?? "—"}
            </p>
            <p>
              <strong>Size:</strong>{" "}
              {item.outputSize ? humanSize(item.outputSize) : "—"}
            </p>
            <p>
              <strong>Status:</strong> {statusText}
            </p>
            {item.error && <p className="error">{item.error}</p>}
            <div className="action-row">
              {isDone && item.outputBlob && item.outputName ? (
                <a
                  href={blobUrl || "#"}
                  download={item.outputName}
                  className="icon-btn button-link"
                  style={{ textDecoration: "none", display: "inline-block" }}
                >
                  🔽 Download{" "}
                  {item.outputName.endsWith(".webp") ? "WebP" : "JPG"}
                </a>
              ) : (
                <span className="muted">No task yet</span>
              )}
              {isDone && enabledDests.length > 0 && !allDone && (
                <button
                  className="icon-btn button-link upload-btn"
                  onClick={() => onUpload(item.id)}
                  disabled={!canUpload}
                  title={`Upload to ${enabledDests.map((d) => d.name).join(", ")}`}
                >
                  ☁️ Upload
                  {enabledDests.length === 1
                    ? ` to ${enabledDests[0].name}`
                    : ` (${enabledDests.length} destinations)`}
                </button>
              )}
              {canRequeue && (
                <button
                  className="icon-btn"
                  onClick={() => onRequeue(item.id)}
                  title="Requeue this task to process it again"
                >
                  ↺ Requeue
                </button>
              )}
            </div>
            {/* Per-destination upload progress */}
            {enabledDests.map((dest) => {
              const state = item.uploads?.[dest.id];
              if (!state || state.status === "idle") return null;
              return (
                <div key={dest.id} className="upload-progress-wrap">
                  {state.status === "uploading" && (
                    <>
                      <div className="progress-label">
                        <span>Uploading to {dest.name}…</span>
                        <span>{state.progress}%</span>
                      </div>
                      <progress value={state.progress} max={100} />
                    </>
                  )}
                  {state.status === "error" && state.error && (
                    <p className="error">
                      Upload to {dest.name} failed: {state.error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {/* Per-destination upload results */}
        {enabledDests.some((d) => item.uploads?.[d.id]?.status === "done") && (
          <div className="upload-results">
            {enabledDests.map((dest) => {
              const state = item.uploads?.[dest.id];
              if (state?.status !== "done" || !state.result) return null;
              return (
                <UploadLinks
                  key={dest.id}
                  destName={dest.name}
                  result={state.result}
                  filename={item.outputName ?? item.file.name}
                  metadata={item.metadata}
                />
              );
            })}
          </div>
        )}
      </article>
      {showEditor && item.metadata && (
        <TimestampEditor
          item={item}
          totalCells={totalCells}
          onSave={handleSaveMarkers}
          onClose={() => setShowEditor(false)}
        />
      )}
    </>
  );
}
