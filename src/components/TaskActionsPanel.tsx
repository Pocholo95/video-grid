import { useState } from "react";
import { Check, Copy, Download, Loader2, Upload } from "lucide-react";
import type { DestinationUploadState, TaskItem, UploadResult } from "../types";
import { resolutionLabel, buildFormats } from "../uploadUtils";
import { buildBbcodeTitle } from "../utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  /** All task items. */
  items: TaskItem[];
  /** Whether all uploads across all items and destinations are complete. */
  allDone: boolean;
  /** Enabled upload destinations. */
  enabledDests: { id: string; name: string }[];
  /** Done items that have outputBlob and outputName. */
  doneItems: TaskItem[];
  /** Total possible uploads (doneItems * enabledDests). */
  totalPossibleUploads: number;
  /** Completed upload count. */
  completedUploads: number;
  /** Whether there are pending uploads. */
  hasPendingUploads: boolean;
  /** True while a bulk-upload batch is in progress. */
  isUploadingAll: boolean;
  /** Upload progress for bulk upload. */
  uploadProgress: { attempted: number; total: number };
  /** True while ZIP archive is being generated. */
  isZipping: boolean;
  /** Callback to upload all completed items. */
  onUploadAll: () => void;
  /** Callback to download all completed items as ZIP. */
  onDownloadAll: () => void;
}

type FormatKey =
  | "bbcodeTitleRes"
  | "bbcodePostTemplate"
  | "bbcodeFull"
  | "bbcodeMedium"
  | "bbcodeThumb"
  | "directUrl"
  | "pageUrl"
  | "markdown"
  | "htmlImg";

const FORMAT_LABELS: Record<FormatKey, string> = {
  bbcodeTitleRes: "BBCode – video title + resolution",
  bbcodePostTemplate: "BBCode — post template",
  bbcodeFull: "BBCode — full image",
  bbcodeMedium: "BBCode — medium",
  bbcodeThumb: "BBCode — thumbnail",
  directUrl: "Direct URL",
  pageUrl: "Viewer page",
  markdown: "Markdown",
  htmlImg: "HTML img",
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
 * For "bbcodePostTemplate", items are separated by blank lines instead.
 *
 * @param items - The TaskItems to include (should each have at least one upload).
 * @param format - The FormatKey identifying which named link format to emit.
 * @returns The combined copyable text for the selected format.
 */
function buildCopyText(items: TaskItem[], format: FormatKey): string {
  if (format === "bbcodeTitleRes") {
    // Title + resolution: works as long as metadata is available
    return items
      .map((item) => buildBbcodeTitle(item))
      .filter((value): value is string => Boolean(value))
      .join("\n");
  }

  if (format === "bbcodePostTemplate") {
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
 * Panel that groups completed-task actions: CopyAll links toolbar,
 * Upload All, and Download All buttons.
 *
 * Layout: two columns on desktop (CopyAll left, buttons right-aligned),
 * stacked on mobile.
 *
 * @param items - All task items.
 * @param allDone - True when all uploads are complete.
 * @param enabledDests - Enabled upload destinations.
 * @param doneItems - Items with outputBlob and outputName ready.
 * @param totalPossibleUploads - Max upload count across all items/destinations.
 * @param completedUploads - Number of uploads that have completed.
 * @param hasPendingUploads - True when completedUploads < totalPossibleUploads.
 * @param isUploadingAll - True while bulk-upload is in progress.
 * @param uploadProgress - { attempted, total } for current bulk run.
 * @param isZipping - True while ZIP archive is being generated.
 * @param onUploadAll - Starts uploading all completed items.
 * @param onDownloadAll - Downloads all completed items as ZIP.
 */
export default function TaskActionsPanel({
  items,
  allDone,
  enabledDests,
  doneItems,
  totalPossibleUploads,
  completedUploads,
  hasPendingUploads,
  isUploadingAll,
  uploadProgress,
  isZipping,
  onUploadAll,
  onDownloadAll,
}: Props) {
  const [format, setFormat] = useState<FormatKey>("bbcodeTitleRes");

  // Only show panel if at least one item has metadata
  const analyzedItems = items.filter((i) => i.metadata);
  if (analyzedItems.length === 0) return null;

  // Only include items that have at least one upload result for upload formats.
  const uploadedItems = analyzedItems.filter((i) => firstResult(i) !== null);

  // Determine which formats are available given current state.
  const titleResAvailable = analyzedItems.length > 0;
  const uploadFormatsAvailable = allDone && uploadedItems.length > 0;
  const anyAvailable = titleResAvailable || uploadFormatsAvailable;

  const copyText = buildCopyText(
    uploadFormatsAvailable ? uploadedItems : analyzedItems,
    format,
  );

  // Show panel only when there are done items or items with metadata
  const hasActions = doneItems.length > 0 || analyzedItems.length > 0;
  if (!hasActions) return null;

  return (
    <Card className="w-full overflow-hidden">
      <CardHeader>
        <CardTitle>Tasks Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Column 1 - CopyAll Panel */}
          <div className="flex items-center gap-3">
            <Label className="text-sm font-medium sr-only">Copy all:</Label>
            <Select
              value={format}
              onValueChange={(v) => setFormat(v as FormatKey)}
            >
              <SelectTrigger className="w-56 min-w-0 **:data-[slot=select-value]:inline-block **:data-[slot=select-value]:max-w-full **:data-[slot=select-value]:truncate">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(FORMAT_LABELS) as FormatKey[]).map((k) => (
                  <SelectItem
                    key={k}
                    value={k}
                    disabled={
                      k === "bbcodeTitleRes"
                        ? !titleResAvailable
                        : !uploadFormatsAvailable
                    }
                  >
                    {FORMAT_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <CopyButton text={copyText} disabled={!anyAvailable} />
          </div>

          {/* Column 2 - Action Buttons (right-aligned) */}
          <div className="flex flex-wrap items-center gap-2 justify-end">
            {enabledDests.length > 0 && doneItems.length > 0 && (
              <Button
                variant="default"
                disabled={isUploadingAll || !hasPendingUploads}
                onClick={onUploadAll}
                title={`Upload all to ${enabledDests.map((d) => d.name).join(", ")} ${
                  hasPendingUploads ? "" : "(All uploads complete)"
                }`}
              >
                {isUploadingAll ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Uploading… ({uploadProgress.attempted}/
                    {uploadProgress.total})
                  </>
                ) : (
                  <>
                    <Upload className="size-4" />
                    Upload All ({completedUploads}/{totalPossibleUploads})
                  </>
                )}
              </Button>
            )}
            {doneItems.length > 1 && (
              <Button
                variant="default"
                disabled={isZipping}
                onClick={onDownloadAll}
              >
                {isZipping ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Zipping…
                  </>
                ) : (
                  <>
                    <Download className="size-4" />
                    Download All ({doneItems.length})
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
