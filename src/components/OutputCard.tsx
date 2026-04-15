import { useEffect, useRef, useState } from "react";
import { saveAs } from "file-saver";
import type { OutputItem, UploadDestination } from "../types";
import { formatTime, humanSize } from "../utils";
import UploadLinks from "./UploadLinks";

interface Props {
  item: OutputItem;
  showPreview: boolean;
  destinations: UploadDestination[];
  activeDestId: string;
  onPreview: (url: string) => void;
  onUpload: (id: string, destId: string) => void;
}

export default function OutputCard({
  item, showPreview, destinations, activeDestId,
  onPreview, onUpload,
}: Props) {
  // Manage object URL lifecycle locally
  const urlRef             = useRef<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!item.outputBlob || !showPreview) {
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
      setBlobUrl(null);
      return;
    }
    if (!urlRef.current) {
      urlRef.current = URL.createObjectURL(item.outputBlob);
    }
    setBlobUrl(urlRef.current);
    return () => {
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    };
  }, [item.outputBlob, showPreview]);

  const meta    = item.metadata;
  const isDone  = item.status === "done";
  const canUpload = isDone && !!item.outputBlob && destinations.length > 0 &&
                    item.uploadStatus !== "uploading" && item.uploadStatus !== "done";

  const destForSelect = destinations.find((d) => d.id === activeDestId) ?? destinations[0];

  const [selectedDestId, setSelectedDestId] = useState<string>(activeDestId);
  useEffect(() => setSelectedDestId(activeDestId), [activeDestId]);

  const handleDownload = () => {
    if (!item.outputBlob || !item.outputName) return;
    saveAs(item.outputBlob, item.outputName);
  };

  const handleUpload = () => {
    const dest = destinations.find((d) => d.id === selectedDestId) ?? destForSelect;
    if (!dest) return;
    onUpload(item.id, dest.id);
  };

  return (
    <article className={`output-card output-${item.status}${item.uploadStatus === "done" ? " output-uploaded" : ""}`}>
      {/* ── Top row ── */}
      <div className="output-top">
        <div className="output-top-text">
          <h3 title={item.file.name}>{item.file.name}</h3>
          {item.warning && <p className="warning">{item.warning}</p>}
          {meta && (
            <p className="small">
              Duration: {formatTime(meta.duration)} &nbsp;·&nbsp;
              {meta.width}×{meta.height} &nbsp;·&nbsp;
              {meta.bitrate ? `${Math.round(meta.bitrate / 1000)} kbps` : "n/a"} &nbsp;·&nbsp;
              {humanSize(item.file.size)}
            </p>
          )}
        </div>
        <div className="badge">{item.status}</div>
      </div>

      {/* ── Content grid ── */}
      <div className="output-grid">
        {/* Preview */}
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
                ? item.status === "processing" ? "Processing…" : "No preview"
                : "Preview off"}
            </div>
          )}
        </div>

        {/* Info + actions */}
        <div className="output-info">
          <p><strong>Output:</strong> {item.outputName ?? "—"}</p>
          <p><strong>Size:</strong> {item.outputSize ? humanSize(item.outputSize) : "—"}</p>
          <p><strong>Status:</strong> {item.status}</p>
          {item.error && <p className="error">{item.error}</p>}

          {/* Action buttons row */}
          <div className="action-row">
            {isDone && item.outputBlob && item.outputName ? (
              <button className="button-link" onClick={handleDownload}>⬇️ Download JPG</button>
            ) : (
              <span className="muted">No download yet</span>
            )}

            {/* Upload section */}
            {isDone && destinations.length > 0 && item.uploadStatus !== "done" && (
              <div className="upload-action">
                {destinations.length > 1 && (
                  <select
                    className="dest-select"
                    value={selectedDestId}
                    onChange={(e) => setSelectedDestId(e.target.value)}
                    disabled={item.uploadStatus === "uploading"}
                  >
                    {destinations.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                )}
                <button
                  className="button-link upload-btn"
                  onClick={handleUpload}
                  disabled={!canUpload}
                  title={destinations.length === 1 ? `Upload to ${destinations[0].name}` : "Upload to selected destination"}
                >
                  ☁️ Upload{destinations.length === 1 ? ` to ${destinations[0].name}` : ""}
                </button>
              </div>
            )}
          </div>

          {/* Upload progress */}
          {item.uploadStatus === "uploading" && (
            <div className="upload-progress-wrap">
              <div className="progress-label">
                <span>Uploading…</span>
                <span>{item.uploadProgress ?? 0}%</span>
              </div>
              <progress value={item.uploadProgress ?? 0} max={100} />
            </div>
          )}

          {item.uploadStatus === "error" && item.uploadError && (
            <p className="error">Upload failed: {item.uploadError}</p>
          )}
        </div>
      </div>

      {/* ── Upload links panel ── */}
      {item.uploadStatus === "done" && item.uploadResult && (
        <UploadLinks result={item.uploadResult} filename={item.outputName ?? item.file.name} />
      )}
    </article>
  );
}
