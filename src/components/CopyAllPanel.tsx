import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { DestinationUploadState, TaskItem, UploadResult } from "../types";
import { resolutionLabel, buildFormats } from "../uploadUtils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  /** Only done items with at least one successful upload should be passed. */
  items: TaskItem[];
}

type FormatKey =
  | "directUrl"
  | "pageUrl"
  | "bbcodeFull"
  | "bbcodeMedium"
  | "bbcodeThumb"
  | "markdown"
  | "htmlImg"
  | "postTemplate";

const FORMAT_LABELS: Record<FormatKey, string> = {
  directUrl: "Direct URL",
  pageUrl: "Viewer page",
  bbcodeFull: "BBCode — full image",
  bbcodeMedium: "BBCode — medium",
  bbcodeThumb: "BBCode — thumbnail",
  markdown: "Markdown",
  htmlImg: "HTML img",
  postTemplate: "Post Template",
};

/**
 * Pick the first successful upload result for an item, across all destinations.
 *
 * @param item - The TaskItem to inspect.
 * @returns The first completed upload result, or null if none exists.
 */
function firstResult(item: TaskItem) {
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
 * @param item - The TaskItem to build a block for.
 * @returns The formatted BBCode string, or null if the item has no uploads.
 */
function buildPostBlock(item: TaskItem): string | null {
  if (!item.uploads) return null;

  const results = Object.values(item.uploads)
    .filter(
      (state): state is DestinationUploadState & { result: UploadResult } =>
        state.status === "done" && !!state.result,
    )
    .map((state) => state.result);

  if (!results.length) return null;

  const baseName = item.file.name.replace(/\.[^.]+$/, "");
  const res = resolutionLabel(item.metadata);
  const titleLine = `[b]${baseName}${res ? ` ${res}` : ""}[/b]`;
  const imgLine = results
    .map(
      (result) =>
        `[url=${result.pageUrl}][img]${result.mediumUrl ?? result.thumbUrl}[/img][/url]`,
    )
    .join(" ");

  return `${titleLine}\n${imgLine}\n\n`;
}

/**
 * Build the copyable text for a given format key, one line per item.
 * For "postTemplate", items are separated by blank lines instead.
 *
 * @param items - The TaskItems to include (should each have at least one upload).
 * @param format - The FormatKey identifying which named link format to emit.
 * @returns The combined copyable text for the selected format.
 */
function buildCopyText(items: TaskItem[], format: FormatKey): string {
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
            (
              state,
            ): state is DestinationUploadState & { result: UploadResult } =>
              state.status === "done" && !!state.result,
          )
        : [];

      if (!uploads.length) return null;

      const filename = item.outputName ?? item.file.name;

      const values = uploads.map((state) => {
        const result = state.result;
        const formats = buildFormats(result, filename, item.metadata);
        const selected = formats.find((f) => f.key === format);
        return selected?.value ?? "";
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
    <Button
      type="button"
      variant="default"
      size="sm"
      onClick={handleCopy}
      disabled={disabled}
      title={copied ? "Copied!" : "Copy all links"}
    >
      {copied ? (
        <>
          <Check className="size-4" /> Copied
        </>
      ) : (
        <>
          <Copy className="size-4" /> Copy All
        </>
      )}
    </Button>
  );
}

/**
 * Toolbar that lets the user pick a link format and copy all uploaded
 * link strings (one per task) at once.
 * @param items Task items that could be used to generate the output strings
 */
export default function CopyAllPanel({ items }: Props) {
  const [format, setFormat] = useState<FormatKey>("bbcodeThumb");

  // Only include items that have at least one upload result.
  const uploadedItems = items.filter((i) => firstResult(i) !== null);
  if (uploadedItems.length === 0) return null;

  const copyText = buildCopyText(uploadedItems, format);

  return (
    <div className="bg-muted/30 flex flex-wrap items-center gap-3 rounded-md border p-3">
      <Label className="text-sm font-medium">Copy all links:</Label>
      <Select value={format} onValueChange={(v) => setFormat(v as FormatKey)}>
        <SelectTrigger className="w-auto min-w-45">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(FORMAT_LABELS) as FormatKey[]).map((k) => (
            <SelectItem key={k} value={k}>
              {FORMAT_LABELS[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <CopyButton text={copyText} disabled={uploadedItems.length === 0} />
    </div>
  );
}
