import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock,
  Cloud,
  EyeOff,
  FileVideo,
  Download,
  Loader2,
  RotateCcw,
  Timeline,
  Terminal,
  Trash2,
} from "lucide-react";
import type { TaskItem, UploadDestination } from "../types";
import { formatElapsed, formatTime, humanSize } from "../utils";
import { resolutionLabel } from "../uploadUtils";
import UploadLinks from "./UploadLinks";
import { CopyField } from "./CopyField";
import TimestampEditor from "./TimestampEditor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import Section from "./control/Section";

interface Props {
  /** 1-based position in the task list for display purposes. */
  position?: number;
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
  handleEnablePreviews: () => void;
  /** True when this specific task is detected as stale (stuck FFmpeg). */
  isStale?: boolean;
  /** Callback to force-kill FFmpeg for this task only. */
  onForceCancel?: () => void;
}

export default function TaskCard({
  position,
  item,
  totalCells,
  showPreview,
  destinations,
  onPreview,
  onUpload,
  onUpdateTimestamps,
  onRemove,
  onRequeue,
  handleEnablePreviews,
  isStale,
  onForceCancel,
}: Props) {
  const urlRef = useRef<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [pendingMarkers, setPendingMarkers] = useState<number[] | null>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showFfmpegLogs, setShowFfmpegLogs] = useState(false);
  const [showSourceInfo, setShowSourceInfo] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [outputDimensions, setOutputDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!item.outputBlob) {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      setBlobUrl(null);
      setOutputDimensions(null);
      return;
    }
    if (!urlRef.current) urlRef.current = URL.createObjectURL(item.outputBlob);
    setBlobUrl(urlRef.current);

    // Read image dimensions from the blob
    const img = new Image();
    img.onload = () => {
      setOutputDimensions({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.src = urlRef.current;
    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      setOutputDimensions(null);
    };
  }, [item.outputBlob]);

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
    tsLabel = "Auto timestamps (evenly distributed)";
  } else if (markerCount === 0) {
    tsLabel = "Custom timestamps — no markers (uses auto)";
  } else {
    const used = Math.min(markerCount, totalCells);
    const fallback = Math.max(0, totalCells - markerCount);
    const ignored = markerCount - totalCells;
    if (ignored > 0) {
      tsLabel = `Custom timestamps — ${used} marker${used !== 1 ? "s" : ""} (${ignored} ignored)`;
    } else {
      tsLabel =
        `Custom — ${used} marker${used !== 1 ? "s" : ""}` +
        (fallback > 0 ? ` + ${fallback} auto` : "");
    }
  }

  const applyMarkers = (markers: number[]) => {
    if (markers.length === 0) {
      onUpdateTimestamps(item.id, "auto", []);
    } else {
      onUpdateTimestamps(item.id, "custom", markers);
    }
  };

  const handleSaveMarkers = (markers: number[]) => {
    const isDoneItem = item.status === "done";
    if (isDoneItem) {
      // Defer; show requeue confirmation dialog.
      setPendingMarkers(markers);
      setShowEditor(false);
      return;
    }
    applyMarkers(markers);
    setShowEditor(false);
  };

  const handleRequeueConfirm = () => {
    if (pendingMarkers != null) {
      applyMarkers(pendingMarkers);
      onRequeue(item.id);
      setPendingMarkers(null);
    }
  };

  const handleRequeueDecline = () => {
    if (pendingMarkers != null) {
      applyMarkers(pendingMarkers);
      setPendingMarkers(null);
    }
  };

  // Disabled while processing - can't open editor mid-batch.
  const canEditTimestamps = item.status !== "processing" && !!item.metadata;

  // Tasks that have finished (one way or another) can be re-queued.
  const canRequeue =
    item.status === "done" ||
    item.status === "error" ||
    item.status === "cancelled";

  // Source video summary for collapsed state
  const sourceSummary = item.metadata
    ? `${item.metadata.width}×${item.metadata.height} · ${item.metadata.fps ?? "?"}fps · ${formatTime(item.metadata.duration)}`
    : null;

  // BBCode video title for copy (shown as soon as metadata is available)
  const bbcodeVideoTitle = item.metadata
    ? `[b]${(item.outputName ?? item.file.name).replace(/\.[^.]+$/, "").replace(/\.[^.]+$/, "")}${item.metadata.width ? ` ${resolutionLabel(item.metadata)}` : ""}[/b]`
    : null;

  return (
    <>
      <Section
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        bodyClassName="flex flex-col gap-3 !grid-cols-1"
        className={cn(
          item.status === "error" && "border-destructive/50",
          allDone && "border-emerald-500/40",
        )}
        renderTrigger={() => (
          <>
            {position != null && (
              <Badge
                variant="info"
                className="text-xs uppercase shrink-0 font-mono p-1"
              >
                #{position}
              </Badge>
            )}
            <div className="min-w-0 flex-1">
              <h3
                className="truncate text-sm font-semibold"
                title={item.file.name}
              >
                {item.file.name}
              </h3>
            </div>
            <Badge variant={item.status} className="uppercase shrink-0">
              {item.status}
            </Badge>
            <Button
              variant="destructive"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.id);
              }}
              disabled={item.status === "processing"}
              title="Remove this task"
              className="h-6 w-6 p-1"
            >
              <Trash2 className="size-3" />
            </Button>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 transition-transform duration-200",
                expanded && "rotate-180",
              )}
            />
          </>
        )}
      >
        {/* Collapsible Source Info section */}
        {item.metadata && (
          <div className="border rounded-md">
            <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
              <button
                type="button"
                className="flex items-center gap-2 hover:text-foreground flex-1 text-muted-foreground"
                onClick={() => setShowSourceInfo((s) => !s)}
              >
                <FileVideo className="size-4" />
                <span className="font-medium">Source</span>
                <span className="text-muted-foreground">{sourceSummary}</span>
              </button>
              <button
                type="button"
                className="shrink-0 hover:text-foreground"
                onClick={() => setShowSourceInfo((s) => !s)}
              >
                {showSourceInfo ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </button>
            </div>
            {showSourceInfo && (
              <div className="px-3 pb-2 text-xs text-muted-foreground space-y-1">
                <div>Filename: {item.file.name}</div>
                <div>
                  Resolution: {item.metadata.width}×{item.metadata.height}
                </div>
                <div>Duration: {formatTime(item.metadata.duration)}</div>
                <div>
                  Bitrate:{" "}
                  {item.metadata.bitrate
                    ? `${(item.metadata.bitrate / 1_000_000).toFixed(2)} Mbps`
                    : "Unknown"}
                </div>
                <div>FPS: {item.metadata.fps ?? "Unknown"}</div>
                <div>Codec: {item.metadata.codec ?? "Unknown"}</div>
              </div>
            )}
          </div>
        )}

        {/* Warning row */}
        {item.warning && (
          <Alert className="py-2 px-3">
            <AlertTriangle />
            <AlertDescription>{item.warning}</AlertDescription>
          </Alert>
        )}

        {/* Error row */}
        {item.error && (
          <Alert variant="destructive" className="py-2 px-3">
            <CircleAlert />
            <AlertDescription>{item.error}</AlertDescription>
          </Alert>
        )}

        {/* Stale warning */}
        {isStale && (
          <Alert variant="destructive" className="py-2 px-3">
            <AlertTriangle />
            <AlertDescription>
              FFmpeg processing might be stuck, if you don't see any progress in
              the FFmpeg log after some time you can press the "Kill" button to
              proceed.
            </AlertDescription>
          </Alert>
        )}

        {/* Collapsible FFmpeg logs */}
        {item.ffmpegLogs && item.ffmpegLogs.length > 0 && (
          <div className="border rounded-md">
            <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium">
              <button
                type="button"
                className="flex items-center gap-2 hover:text-foreground flex-1"
                onClick={() => setShowFfmpegLogs((s) => !s)}
              >
                <Terminal className="size-3" />
                FFmpeg Logs ({item.ffmpegLogs.length} lines)
              </button>
              {/* Force Kill button - shown during processing */}
              {item.status === "processing" && onForceCancel && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onForceCancel}
                  title="Force-kill FFmpeg for this file and move on"
                  className={cn("shrink-0", isStale && "animate-pulse")}
                >
                  <Ban className="size-3" />
                  Kill
                </Button>
              )}
              {/* Chevron toggle - always on the far right */}
              <button
                type="button"
                className="shrink-0 hover:text-foreground"
                onClick={() => setShowFfmpegLogs((s) => !s)}
              >
                {showFfmpegLogs ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </button>
            </div>
            {showFfmpegLogs && (
              <div className="max-h-48 overflow-auto bg-muted/50 px-3 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground whitespace-pre">
                {item.ffmpegLogs.join("\n")}
              </div>
            )}
          </div>
        )}

        {/* Timestamp row */}
        <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2">
          <span
            className={cn(
              "flex items-center gap-2 text-xs",
              isCustom ? "text-primary font-medium" : "text-muted-foreground",
            )}
          >
            <Timeline className="size-4 -rotate-90" />
            {tsLabel}
          </span>
          <Button
            variant={isCustom ? "default" : "secondary"}
            size="sm"
            disabled={!canEditTimestamps}
            onClick={() => setShowEditor(true)}
            title={
              canEditTimestamps
                ? "Edit timestamps for this file"
                : "Timestamps can be edited after analysis completes"
            }
          >
            <Timeline className="size-4 -rotate-90" />
            Edit Timestamps
          </Button>
        </div>

        {/* Preview + info grid */}
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="bg-muted/50 flex min-h-35 items-center justify-center overflow-hidden rounded-md">
            {blobUrl && showPreview ? (
              <div className="max-h-65 overflow-hidden rounded-md m-2">
                <img
                  src={blobUrl}
                  alt={`Preview for ${item.file.name}`}
                  onClick={() => onPreview(blobUrl)}
                  className="max-h-65 cursor-zoom-in object-contain"
                />
              </div>
            ) : (
              <div
                className="flex flex-col items-center justify-center gap-2 p-4 text-center text-xs"
                onClick={() => {
                  if (!showPreview && item.status !== "error") {
                    setShowPreviewDialog(true);
                  }
                }}
                title={
                  showPreview
                    ? "Click to open full-size preview"
                    : item.status === "error"
                      ? "Preview not generated due to error"
                      : "Click to enable previews globally"
                }
              >
                {item.status === "error" ? (
                  <>
                    <CircleAlert className="size-8 text-destructive mb-1" />
                    <div className="text-muted-foreground">
                      Preview not generated
                    </div>
                  </>
                ) : showPreview ? (
                  item.status === "done" || item.status === "cancelled" ? (
                    <>
                      <EyeOff className="size-8 text-muted-foreground mb-1" />
                      <div className="text-muted-foreground">No preview</div>
                    </>
                  ) : item.status === "queued" ? (
                    <>
                      <Clock className="size-8 text-muted-foreground" />
                      <div className="text-muted-foreground font-medium">
                        Queued
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="relative">
                        <div className="animate-ping absolute inset-0 rounded-full bg-primary/20 opacity-75" />
                        <Loader2 className="size-8 animate-spin text-primary" />
                      </div>
                      <div className="text-muted-foreground">
                        Generating preview…
                      </div>
                    </>
                  )
                ) : (
                  <>
                    <EyeOff className="size-8 text-muted-foreground" />
                    <div className="text-muted-foreground">Preview off</div>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <p>
              <span className="text-muted-foreground">Task status: </span>
              <span className="inline-block first-letter-capitalize">
                {statusText}
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">Output name: </span>
              <span className="break-all">{item.outputName ?? "—"}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Output size: </span>
              {item.outputSize ? humanSize(item.outputSize) : "—"}
              {outputDimensions && (
                <span className="text-muted-foreground">
                  {` (${outputDimensions.width}×${outputDimensions.height})`}
                </span>
              )}
            </p>
            {/* BBCode – video title + resolution */}
            {bbcodeVideoTitle && (
              <div className="flex flex-col gap-1 my-2">
                <span className="text-xs font-medium">
                  BBCode – video title + resolution
                </span>
                <CopyField value={bbcodeVideoTitle} fieldType="input" />
              </div>
            )}
            <div className="mt-1 flex flex-wrap gap-2">
              {isDone && item.outputBlob && item.outputName && (
                <Button asChild variant="outline" size="sm">
                  <a href={blobUrl || "#"} download={item.outputName}>
                    <Download className="size-4" />
                    Download{" "}
                    {item.outputName.endsWith(".webp") ? "WebP" : "JPG"}
                  </a>
                </Button>
              )}
              {isDone && enabledDests.length > 0 && !allDone && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onUpload(item.id)}
                  disabled={!canUpload}
                  title={`Upload to ${enabledDests.map((d) => d.name).join(", ")}`}
                >
                  <Cloud className="size-4" />
                  Upload
                  {enabledDests.length === 1
                    ? ` to ${enabledDests[0].name}`
                    : ` (${enabledDests.length} destinations)`}
                </Button>
              )}
              {canRequeue && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRequeue(item.id)}
                  title="Requeue this task to process it again"
                >
                  <RotateCcw className="size-4" />
                  Requeue
                </Button>
              )}
            </div>
            {/* Per-destination upload progress */}
            {enabledDests.map((dest) => {
              const state = item.uploads?.[dest.id];
              if (!state || state.status === "idle") return null;
              if (state.status === "uploading") {
                return (
                  <Field key={dest.id}>
                    <FieldLabel className="text-muted-foreground flex w-full justify-between text-xs font-normal">
                      <span>Uploading to {dest.name}…</span>
                      <span>{state.progress}%</span>
                    </FieldLabel>
                    <Progress value={state.progress} />
                  </Field>
                );
              }
              if (state.status === "error" && state.error) {
                return (
                  <p key={dest.id} className="text-destructive text-xs">
                    Upload to {dest.name} failed: {state.error}
                  </p>
                );
              }
              return null;
            })}
          </div>
        </div>

        {/* Per-destination upload results */}
        {enabledDests.some((d) => item.uploads?.[d.id]?.status === "done") && (
          <div className="flex flex-col gap-2">
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
      </Section>
      {showEditor && item.metadata && (
        <TimestampEditor
          item={item}
          totalCells={totalCells}
          onSave={handleSaveMarkers}
          onClose={() => setShowEditor(false)}
        />
      )}
      <AlertDialog
        open={pendingMarkers !== null}
        onOpenChange={(open) => {
          if (!open) handleRequeueDecline();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Requeue with new timestamps?</AlertDialogTitle>
            <AlertDialogDescription>
              This task is already done. Requeue it with the new timestamps for
              processing?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleRequeueDecline}>
              Save markers only
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRequeueConfirm}>
              <RotateCcw className="size-4" />
              Save & Requeue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preview Enable Dialog */}
      {showPreviewDialog && (
        <AlertDialog
          open={showPreviewDialog}
          onOpenChange={setShowPreviewDialog}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Enable previews?</AlertDialogTitle>
              <AlertDialogDescription>
                You have disabled previews in the settings.
                <br />
                Do you want to enable them again?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowPreviewDialog(false)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-primary hover:bg-primary/90"
                onClick={() => {
                  handleEnablePreviews();
                  setShowPreviewDialog(false);
                }}
              >
                Enable Previews
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
