import { useEffect, useState } from "react";
import type { ProcessorStatus } from "../hooks/useProcessor";
import { formatElapsed } from "../utils";

interface Props {
  status: ProcessorStatus;
  isProcessing: boolean;
  hasFiles: boolean;
  allMetadataReady: boolean;
  hasRequeuableItems: boolean;
  onStart: () => void;
  onCancel: () => void;
  onClear: () => void;
  onRequeueAll: () => void;
}

/**
 * Displays the processing action buttons (Start, Cancel, Clear All, Requeue All),
 * per-file and batch progress bars, and the current status message.
 *
 * @param status              - Current processor status snapshot.
 * @param isProcessing        - Whether a batch is actively running.
 * @param hasFiles            - Whether there are queued files ready to process.
 * @param allMetadataReady    - Whether all queued files have been analysed.
 * @param hasRequeuableItems  - Whether at least one item can be requeued.
 * @param onStart             - Called when the user clicks Start Processing.
 * @param onCancel            - Called when the user clicks Cancel.
 * @param onClear             - Called when the user clicks Clear All.
 * @param onRequeueAll        - Called when the user clicks Requeue All.
 */
export default function ProcessingPanel({
  status,
  isProcessing,
  hasFiles,
  allMetadataReady,
  hasRequeuableItems,
  onStart,
  onCancel,
  onClear,
  onRequeueAll,
}: Props) {
  // Live tick to refresh the batch elapsed display while processing.
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (!status.batchStartTime) return;
    const id = setInterval(() => forceUpdate((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [status.batchStartTime]);

  const batchPct =
    status.batchTotal > 0
      ? Math.round((status.batchDone / status.batchTotal) * 100)
      : 0;

  // Live elapsed string shown in the batch progress label while processing.
  const batchElapsedStr = status.batchStartTime
    ? ` - ${formatElapsed(Date.now() - status.batchStartTime)}`
    : "";

  return (
    <div className="panel">
      <div className="actions">
        <button
          className="icon-btn primary"
          disabled={!hasFiles || !allMetadataReady || isProcessing}
          onClick={onStart}
        >
          ▶️ Start Processing
        </button>
        <button
          className="icon-btn"
          disabled={!isProcessing}
          onClick={onCancel}
        >
          ⏹️ Cancel
        </button>
        {hasRequeuableItems && (
          <button
            className="icon-btn"
            disabled={isProcessing}
            onClick={onRequeueAll}
          >
            ↺ Requeue All
          </button>
        )}
        <button className="icon-btn" disabled={isProcessing} onClick={onClear}>
          🗑️ Clear All
        </button>
      </div>
      <div className="progress-area">
        <div className="progress-block">
          <div className="progress-label">
            <span>Current file</span>
            <span>{Math.round(status.currentPct)}%</span>
          </div>
          <progress value={status.currentPct} max={100} />
        </div>
        {status.batchTotal > 0 && (
          <div className="progress-block">
            <div className="progress-label">
              <span>
                Batch progress ({status.batchDone}/{status.batchTotal})
                {batchElapsedStr}
              </span>
              <span>{batchPct}%</span>
            </div>
            <progress value={batchPct} max={100} />
          </div>
        )}
        <div className="status">{status.text}</div>
      </div>
    </div>
  );
}
