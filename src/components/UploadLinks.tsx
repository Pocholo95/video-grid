import { useState } from "react";
import type { UploadResult } from "../types";

interface Props {
  result: UploadResult;
  filename: string;
}

type LinkFormat = {
  label: string;
  value: string;
  description: string;
};

function buildFormats(r: UploadResult, filename: string): LinkFormat[] {
  const altText = filename.replace(/\.[^.]+$/, "");
  return [
    {
      label: "Direct URL",
      value: r.directUrl,
      description: "Full-resolution image link",
    },
    {
      label: "Viewer page",
      value: r.pageUrl,
      description: "imgBB viewer page",
    },
    {
      label: "BBCode — full image",
      value: `[img]${r.directUrl}[/img]`,
      description: "Displays the image inline",
    },
    {
      label: "BBCode — thumbnail → full",
      value: `[url=${r.pageUrl}][img]${r.thumbUrl}[/img][/url]`,
      description: "Thumbnail that links to the viewer page",
    },
    {
      label: "Markdown",
      value: `![${altText}](${r.directUrl})`,
      description: "For GitHub, GitLab, Reddit…",
    },
    {
      label: "HTML img",
      value: `<img src="${r.directUrl}" alt="${altText}" />`,
      description: "Inline HTML image tag",
    },
  ];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback for older browsers
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <button
      className={`copy-btn${copied ? " copied" : ""}`}
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy to clipboard"}
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

export default function UploadLinks({ result, filename }: Props) {
  const formats = buildFormats(result, filename);

  return (
    <div className="upload-links">
      <div className="upload-links-header">
        <span className="upload-success-badge">☁️ Uploaded</span>
        <a
          href={result.deleteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="delete-link"
          title="Delete this image from imgBB"
        >
          🗑 Delete from host
        </a>
      </div>

      <div className="link-rows">
        {formats.map((f) => (
          <div key={f.label} className="link-row">
            <div className="link-meta">
              <span className="link-label">{f.label}</span>
              <span className="link-desc">{f.description}</span>
            </div>
            <div className="link-value-row">
              <input
                className="link-input"
                type="text"
                readOnly
                value={f.value}
                onFocus={(e) => e.target.select()}
              />
              <CopyButton text={f.value} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
