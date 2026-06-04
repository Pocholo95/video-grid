import { Cloud, Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/CopyField";
import { Field, FieldLabel } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { TaskItem } from "@/types";
import type { UploadDestination } from "@/types";
import { isUploadEligible } from "@/uploadUtils";
import { buildBbcodeTitle, humanSize } from "@/utils";

interface Props {
  item: TaskItem;
  blobUrl: string | null;
  statusText: string;
  outputDimensions: { width: number; height: number } | null;
  destinations: UploadDestination[];
  canUpload: boolean;
  canRequeue: boolean;
  onUpload: () => void;
  onRequeue: () => void;
}

export default function InfoPanel({
  item,
  blobUrl,
  statusText,
  outputDimensions,
  destinations,
  canUpload,
  canRequeue,
  onUpload,
  onRequeue,
}: Props) {
  const isDone = item.status === "done";
  const enabledDests = destinations.filter((d) => d.enabled);

  // Filter enabled destinations to only those eligible for this task's output
  const eligibleDests = enabledDests.filter(
    (d) =>
      isUploadEligible(item.outputName, item.outputSize, d) &&
      item.uploads?.[d.id]?.status !== "done",
  );

  const allDone =
    enabledDests.length > 0 &&
    enabledDests.every((d) => item.uploads?.[d.id]?.status === "done");

  // BBCode video title
  const bbcodeVideoTitle = buildBbcodeTitle(item);

  return (
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
      <div className="flex flex-col gap-1 my-2">
        <span className="text-xs font-medium">
          BBCode – video title + resolution
        </span>
        <CopyField value={bbcodeVideoTitle} fieldType="input" />
      </div>
      <div className="mt-1 flex flex-wrap gap-2">
        {isDone && item.outputBlob && item.outputName && (
          <Button asChild variant="outline" size="sm">
            <a href={blobUrl || "#"} download={item.outputName}>
              <Download className="size-4" />
              Download{" "}
              {item.outputName.split(".").pop()?.toUpperCase() ?? "File"}
            </a>
          </Button>
        )}
        {isDone && eligibleDests.length > 0 && !allDone && (
          <Button
            variant="default"
            size="sm"
            onClick={onUpload}
            disabled={!canUpload}
            title={`Upload to ${eligibleDests.map((d) => d.name).join(", ")}`}
          >
            <Cloud className="size-4" />
            Upload
            {eligibleDests.length === 1
              ? ` to ${eligibleDests[0].name}`
              : ` (${eligibleDests.length} destinations)`}
          </Button>
        )}
        {isDone &&
          eligibleDests.length === 0 &&
          enabledDests.length > 0 &&
          !allDone && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="default" size="sm" className="opacity-60">
                  <Cloud className="size-4" />
                  Upload
                  {enabledDests.length === 1
                    ? ` to ${enabledDests[0].name}`
                    : ` (${enabledDests.length} destinations)`}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" side="top" align="start">
                <p className="text-sm font-medium">Upload unavailable</p>
                <p className="text-muted-foreground text-xs mt-1">
                  No enabled destinations accept this file type or size.
                </p>
              </PopoverContent>
            </Popover>
          )}
        {canRequeue && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRequeue}
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
  );
}
