import { useState } from "react";
import type { DestinationUploadState, OutputItem, UploadResult } from "../types";
import { resolutionLabel, buildFormats } from "./UploadLinks";

interface Props {
  /** Only done items with at least one successful upload should be passed. */
  items: OutputItem[];
}

type FormatKey =
  | "directUrl"
  | "pageUrl"
  | "bbcodeFull"
  | "bbcodeThumb"
  | "markdown"
  | "htmlImg"
  | "postTemplate";

const FORMAT_LABELS: Record<FormatKey, string> = {
  directUrl: "Direct URL",
  pageUrl: "Viewer page",
  bbcodeFull: "BBCode - full image",
  bbcodeThumb: "BBCode — thumbnail",
  markdown: "Markdown",
  htmlImg: "HTML img",
  postTemplate: "Post Template",
};

/**
 * Pick the first successful upload result for an item, across all destinations.
 *
 * @param item - The OutputItem to inspect.
 */
function firstResult(item: OutputItem) {
  if (!item.uploads) return null;
  for (const state of Object.values(item.uploads)) {
    if (state.status === "done" && state.result) return state.result;
  }
  return null;
}

/**
 * Build the BBCode "Post Template" block for an item with multiple uploads.
 * Format: `[b]filename resolution[/b]` on the first line, then one
 * `[url=page][img]thumb[/img][/url]` per destination on the second line,
 * followed by two blank lines to separate entries.
 *
 * @param item - The OutputItem to build a block for.
 * @returns The formatted BBCode string, or null if the item has no uploads.
 */
function buildPostBlock(item: OutputItem): string | null {
  if (!item.uploads) return null;

  const results = Object.values(item.uploads)
    .filter((state): state is DestinationUploadState & { result: UploadResult } =>
      state.status === "done" && !!state.result
    )
    .map((state) => state.result);

  if (!results.length) return null;

  const baseName = item.file.name.replace(/\.[^.]+$/, "");
  const res = resolutionLabel(item.metadata);
  const titleLine = `[b]${baseName}${res ? ` ${res}` : ""}[/b]`;
  const imgLine = results
    .map((result) => `[url=${result.pageUrl}][img]${result.thumbUrl}[/img][/url]`)
    .join(" ");

  return `${titleLine}\n${imgLine}\n\n`;
}

/**
 * Build the copyable text for a given format key, one line per item.
 * For "postTemplate", items are separated by blank lines instead.
 *
 * @param items  - The OutputItems to include (should each have at least one upload).
 * @param format - The FormatKey identifying which link format to emit.
 */
function buildCopyText(items: OutputItem[], format: FormatKey): string {
  if (format === "postTemplate") {
    return items
      .map((item) => buildPostBlock(item))
      .filter((value): value is string => Boolean(value))
      .join("\n");
  }

  return items
    .map((item) => {
      const uploads = item.uploads
        ? Object.values(item.uploads).filter(
          (state): state is DestinationUploadState & { result: UploadResult } =>
            state.status === "done" && !!state.result
        )
        : [];

      if (!uploads.length) return null;

      const filename = item.outputName ?? item.file.name;

      const values = uploads.map((state) => {
        const result = state.result;
        const formats = buildFormats(result, filename);

        const map: Record<FormatKey, string> = {
          directUrl: formats[0].value,
          pageUrl: formats[1].value,
          bbcodeFull: formats[2].value,
          bbcodeThumb: formats[3].value,
          markdown: formats[4].value,
          htmlImg: formats[5].value,
          postTemplate: "",
        };

        return map[format];
      });

      return values.filter(Boolean).join(" ");
    })
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function CopyButton({ text, disabled }: { text: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (disabled || !text) return;
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
      className={`copy-btn${copied ? " copied" : ""}`}
      onClick={handleCopy}
      disabled={disabled}
      title={copied ? "Copied!" : "Copy all links"}
    >
      {copied ? "✓ Copied" : "Copy All"}
    </button>
  );
}

export default function CopyAllPanel({ items }: Props) {
  const [format, setFormat] = useState<FormatKey>("bbcodeThumb");

  // Only include items that have at least one upload result
  const uploadedItems = items.filter((i) => firstResult(i) !== null);
  if (uploadedItems.length === 0) return null;

  const copyText = buildCopyText(uploadedItems, format);

  return (
    <div className="copy-all-panel">
      <div className="copy-all-row">
        <span className="copy-all-label">Copy all links:</span>
        <select
          className="dest-select"
          value={format}
          onChange={(e) => setFormat(e.target.value as FormatKey)}
        >
          {(Object.keys(FORMAT_LABELS) as FormatKey[]).map((k) => (
            <option key={k} value={k}>{FORMAT_LABELS[k]}</option>
          ))}
        </select>
        <CopyButton text={copyText} disabled={uploadedItems.length === 0} />
      </div>
    </div>
  );
}
