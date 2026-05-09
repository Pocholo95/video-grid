import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CircleAlert,
  Clock,
  Cloud,
  Download,
  Loader2,
  RotateCcw,
  Target,
  X,
} from "lucide-react";
import type { TaskItem, UploadDestination } from "../types";
import { formatElapsed, formatTime, humanSize } from "../utils";
import UploadLinks from "./UploadLinks";
import TimestampEditor from "./TimestampEditor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

interface Props {
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
}

export default function TaskCard({
  item,
  totalCells,
  showPreview,
  destinations,
  onPreview,
  onUpload,
  onUpdateTimestamps,
  onRemove,
  onRequeue,
}: Props) {
  const urlRef = useRef<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [pendingMarkers, setPendingMarkers] = useState<number[] | null>(null);

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

  const isCustom = item.timestampMode === "custom";
  const markerCount = item.customTimestamps?.length ?? 0;

  // Timestamp mode label shown in the card.
  let tsLabel: string;
  if (!isCustom) {
    tsLabel = "Auto (evenly distributed)";
  } else if (markerCount === 0) {
    tsLabel = "Custom — no markers (uses auto)";
  } else {
    const used = Math.min(markerCount, totalCells);
    const fallback = Math.max(0, totalCells - markerCount);
    tsLabel =
      `Custom — ${used} marker${used !== 1 ? "s" : ""}` +
      (fallback > 0 ? ` + ${fallback} auto` : "");
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

  return (
    <>
      <Card
        className={cn(
          "gap-4 py-4",
          item.status === "error" && "border-destructive/50",
          allDone && "border-emerald-500/40",
        )}
      >
        <CardContent className="flex flex-col gap-3">
          {/* Top row: filename + meta + status badge + remove button */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3
                className="truncate text-sm font-semibold"
                title={item.file.name}
              >
                {item.file.name}
              </h3>
              {item.warning && (
                <Alert className="mt-2 py-2">
                  <AlertTriangle />
                  <AlertDescription className="text-xs">
                    {item.warning}
                  </AlertDescription>
                </Alert>
              )}
              {meta && (
                <p className="text-muted-foreground mt-1 text-xs">
                  Duration: {formatTime(meta.duration)} · {meta.width}×
                  {meta.height} ·{" "}
                  {meta.bitrate
                    ? `${Math.round(meta.bitrate / 1000)} kbps`
                    : "n/a"}{" "}
                  · {humanSize(item.file.size)}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant={item.status} className="uppercase shrink-0">
                {item.status}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRemove(item.id)}
                disabled={item.status === "processing"}
                title="Remove this task"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          {/* Timestamp row */}
          <div className="bg-muted/30 flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2">
            <span
              className={cn(
                "flex items-center gap-2 text-xs",
                isCustom ? "text-primary font-medium" : "text-muted-foreground",
              )}
            >
              <Target className="size-4" />
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
              <Clock className="size-4" />
              Edit Timestamps
            </Button>
          </div>

          {/* Preview + info grid */}
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="bg-muted/30 flex min-h-35 items-center justify-center overflow-hidden rounded-md">
              {blobUrl ? (
                <img
                  src={blobUrl}
                  alt={`Preview for ${item.file.name}`}
                  onClick={() => onPreview(blobUrl)}
                  className="max-h-65 w-full cursor-zoom-in object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 p-4 text-center text-xs">
                  {showPreview ? (
                    item.status === "done" || item.status === "cancelled" ? (
                      <div className="text-muted-foreground">No preview</div>
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
                    <div className="text-muted-foreground">Preview off</div>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 text-sm">
              <p>
                <span className="text-muted-foreground">Task: </span>
                <span className="break-all">{item.outputName ?? "—"}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Size: </span>
                {item.outputSize ? humanSize(item.outputSize) : "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Status: </span>
                <span className="inline-block first-letter-capitalize">
                  {statusText}
                </span>
              </p>
              {item.error && (
                <Alert variant="destructive" className="py-2">
                  <CircleAlert />
                  <AlertDescription className="text-xs">
                    {item.error}
                  </AlertDescription>
                </Alert>
              )}
              <div className="mt-1 flex flex-wrap gap-2">
                {isDone && item.outputBlob && item.outputName && (
                  <Button asChild variant="secondary" size="sm">
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
                    variant="secondary"
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
          {enabledDests.some(
            (d) => item.uploads?.[d.id]?.status === "done",
          ) && (
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
        </CardContent>
      </Card>
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
              Save &amp; Requeue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
