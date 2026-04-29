import { useState } from "react";
import type { UploadResult, VideoMetadata } from "../types";
import { buildFormats } from "../uploadUtils";

interface Props {
  destName: string;
  result: UploadResult;
  filename: string;
  metadata?: VideoMetadata;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button
      className={`icon-btn copy-btn${copied ? " copied" : ""}`}
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy to clipboard"}
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

export default function UploadLinks({
  destName,
  result,
  filename,
  metadata,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const formats = buildFormats(result, filename, metadata);

  return (
    <div className="upload-links">
      <div className="upload-links-header">
        <button
          className="icon-btn upload-links-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <span className="upload-success-badge">☁️ {destName}</span>
          <span className="upload-links-chevron">{expanded ? "▲" : "▼"}</span>
        </button>
        <a
          href={result.deleteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="delete-link"
          title={`Delete this image from ${destName}`}
        >
          🗑 Delete
        </a>
      </div>

      {expanded && (
        <div className="link-rows">
          {formats.map((f) => (
            <div key={f.key} className="link-row">
              <div className="link-meta">
                <span className="link-label">{f.label}</span>
                <span className="link-desc">{f.description}</span>
              </div>
              <div className="link-value-row">
                {f.fieldType === "textarea" ? (
                  <textarea
                    className="link-input link-textarea"
                    readOnly
                    value={f.value}
                    rows={3}
                    onFocus={(e) => e.target.select()}
                  />
                ) : (
                  <input
                    className="link-input"
                    type="text"
                    readOnly
                    value={f.value}
                    onFocus={(e) => e.target.select()}
                  />
                )}
                <CopyButton text={f.value} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
