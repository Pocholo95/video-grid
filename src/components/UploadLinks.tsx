import { useState } from "react";
import type { UploadResult, VideoMetadata } from "../types";

interface Props {
  destName: string;
  result: UploadResult;
  filename: string;
  metadata?: VideoMetadata;
}

type LinkFormat = {
  key: string;
  label: string;
  value: string;
  description: string;
  fieldType?: "input" | "textarea";
};

/**
 * Derives a human-readable resolution label (e.g. "1080p") from pixel height,
 * with BBCode colour tags for forum use. Returns an empty string if metadata
 * is missing or height is zero.
 *
 * @param meta - Optional VideoMetadata; height is used to pick the label.
 * @returns The formatted resolution label, or an empty string.
 */
function resolutionLabel(meta?: VideoMetadata): string {
  if (!meta || meta.height === 0) return "";
  const h = meta.height;
  if (h >= 2160) return "[COLOR=rgb(85, 57, 130)]2160p[/COLOR]";
  if (h >= 1440) return "[COLOR=rgb(251, 160, 38)]1440p[/COLOR]";
  if (h >= 1080) return "[COLOR=rgb(184, 49, 47)]1080p[/COLOR]";
  if (h >= 720) return "[COLOR=rgb(250, 197, 28)]720p[/COLOR]";
  if (h >= 480) return "[COLOR=rgb(0, 0, 0)]480p[/COLOR]";
  if (h >= 360) return "[COLOR=rgb(204, 204, 204)]360p[/COLOR]";
  return `${h}p`;
}

/**
 * Build the list of copyable link formats for a given upload result.
 * Each item uses a named key so callers do not depend on array positions.
 *
 * @param r - The UploadResult from the host.
 * @param filename - Original output filename (extension stripped for alt text).
 * @param metadata - Optional video metadata used for the post template title.
 * @returns The available link formats for the upload result.
 */
function buildFormats(
  r: UploadResult,
  filename: string,
  metadata?: VideoMetadata,
): LinkFormat[] {
  const filenameNoExt = filename
    .replace(/\.[^.]+$/, "") // Remove thumbnail image file extension
    .replace(/\.[^.]+$/, ""); // Remove video file exttension
  const resolution = resolutionLabel(metadata);
  const formats: LinkFormat[] = [
    {
      key: "directUrl",
      label: "Direct URL",
      value: r.directUrl,
      description: "Full-resolution image link",
    },
    {
      key: "pageUrl",
      label: "Viewer page",
      value: r.pageUrl,
      description: "Host viewer page",
    },
    {
      key: "bbcodeFull",
      label: "BBCode — full image",
      value: `[img]${r.directUrl}[/img]`,
      description: "Displays the image inline",
    },
    {
      key: "bbcodeThumb",
      label: "BBCode — thumbnail → full",
      value: `[url=${r.pageUrl}][img]${r.thumbUrl}[/img][/url]`,
      description: "Thumbnail that links to the viewer page",
    },
    {
      key: "markdown",
      label: "Markdown",
      value: `![${filenameNoExt}](${r.directUrl})`,
      description: "For GitHub, GitLab, Reddit…",
    },
    {
      key: "htmlImg",
      label: "HTML img",
      value: `<img src="${r.directUrl}" alt="${filenameNoExt}" />`,
      description: "Inline HTML image tag",
    },
    {
      key: "postTemplate",
      label: "Post Template",
      value: `[b]${filenameNoExt}${resolution ? ` ${resolution}` : ""}[/b]\n[url=${r.pageUrl}][img]${r.mediumUrl ?? r.thumbUrl}[/img][/url]`,
      description: "Forum-style template for this upload",
      fieldType: "textarea",
    },
  ];

  if (r.mediumUrl) {
    formats.splice(3, 0, {
      key: "bbcodeMedium",
      label: "BBCode — medium → full",
      value: `[url=${r.pageUrl}][img]${r.mediumUrl}[/img][/url]`,
      description: "Medium image that links to the viewer page",
    });
  }

  return formats;
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

export { resolutionLabel, buildFormats };
