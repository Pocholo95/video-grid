import { useEffect, useRef, useState } from "react";
import { saveAs } from "file-saver";
import type { OutputItem, UploadDestination } from "../types";
import { formatTime, humanSize } from "../utils";
import UploadLinks from "./UploadLinks";

interface Props {
  item: OutputItem;
  showPreview: boolean;
  destinations: UploadDestination[];
  onPreview: (url: string) => void;
  onUpload: (id: string) => void;
}

export default function OutputCard({
  item,
  showPreview,
  destinations,
  onPreview,
  onUpload,
}: Props) {
  const urlRef = useRef<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

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

  const handleDownload = () => {
    if (!item.outputBlob || !item.outputName) return;
    saveAs(item.outputBlob, item.outputName);
  };

  return (
    <article
      className={`output-card output-${item.status}${allDone ? " output-uploaded" : ""}`}
    >
      <div className="output-top">
        <div className="output-top-text">
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
        <div className="badge">{item.status}</div>
      </div>

      <div className="output-grid">
        <div className="output-preview">
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

        <div className="output-info">
          <p>
            <strong>Output:</strong> {item.outputName ?? "—"}
          </p>
          <p>
            <strong>Size:</strong>{" "}
            {item.outputSize ? humanSize(item.outputSize) : "—"}
          </p>
          <p>
            <strong>Status:</strong> {item.status}
          </p>
          {item.error && <p className="error">{item.error}</p>}

          <div className="action-row">
            {isDone && item.outputBlob && item.outputName ? (
              <button className="icon-btn button-link" onClick={handleDownload}>
                ⬇️ Download JPG
              </button>
            ) : (
              <span className="muted">No download yet</span>
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
  );
}
