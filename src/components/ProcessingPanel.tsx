import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CircleCheck,
  Info,
  Play,
  RotateCcw,
  Square,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ProcessorStatus } from "../hooks/useProcessor";
import { formatElapsed } from "../utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";

const STATUS_TEXT_ICON: Record<
  NonNullable<ProcessorStatus["textKind"]>,
  LucideIcon
> = {
  info: Info,
  success: CircleCheck,
  warning: AlertTriangle,
  cancelled: Square,
};

interface Props {
  status: ProcessorStatus;
  isProcessing: boolean;
  hasFiles: boolean;
  allMetadataReady: boolean;
  hasRequeuableItems: boolean;
  onStart: () => void;
  onCancel: () => void;
  onClear: () => void;
  onRequeueAll: () => void;
}

/**
 * Displays the processing action buttons (Start, Cancel, Clear All, Requeue All),
 * per-file and batch progress bars, and the current status message.
 *
 * @param status              - Current processor status snapshot.
 * @param isProcessing        - Whether a batch is actively running.
 * @param hasFiles            - Whether there are queued files ready to process.
 * @param allMetadataReady    - Whether all queued files have been analyzed.
 * @param hasRequeuableItems  - Whether at least one item can be requeued.
 * @param onStart             - Called when the user clicks Start Processing.
 * @param onCancel            - Called when the user clicks Cancel.
 * @param onClear             - Called when the user clicks Clear All.
 * @param onRequeueAll        - Called when the user clicks Requeue All.
 */
export default function ProcessingPanel({
  status,
  isProcessing,
  hasFiles,
  allMetadataReady,
  hasRequeuableItems,
  onStart,
  onCancel,
  onClear,
  onRequeueAll,
}: Props) {
  // Live tick to refresh the batch elapsed display while processing.
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (!status.batchStartTime) return;
    const id = setInterval(() => forceUpdate((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [status.batchStartTime]);

  const batchPct =
    status.batchTotal > 0
      ? Math.round((status.batchDone / status.batchTotal) * 100)
      : 0;

  // Live elapsed string shown in the batch progress label while processing.
  const batchElapsedStr = status.batchStartTime
    ? ` - ${formatElapsed(Date.now() - status.batchStartTime)}`
    : "";

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!hasFiles || !allMetadataReady || isProcessing}
            onClick={onStart}
          >
            <Play className="size-4" />
            Start Processing
          </Button>
          <Button
            variant="secondary"
            disabled={!isProcessing}
            onClick={onCancel}
          >
            <Square className="size-4" />
            Cancel
          </Button>
          {hasRequeuableItems && (
            <Button
              variant="secondary"
              disabled={isProcessing}
              onClick={onRequeueAll}
            >
              <RotateCcw className="size-4" />
              Requeue All
            </Button>
          )}
          <Button
            variant="destructive"
            disabled={isProcessing || (!hasFiles && !hasRequeuableItems)}
            onClick={onClear}
          >
            <Trash2 className="size-4" />
            Remove All Tasks
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel className="text-muted-foreground flex w-full justify-between text-xs font-normal">
              <span>Current file</span>
              <span>{Math.round(status.currentPct)}%</span>
            </FieldLabel>
            <Progress value={status.currentPct} />
          </Field>

          <Field>
            <FieldLabel className="text-muted-foreground flex w-full justify-between text-xs font-normal">
              <span>
                {status.batchTotal > 0
                  ? `Batch progress (${status.batchDone}/${status.batchTotal})${batchElapsedStr}`
                  : "Batch progress"}
              </span>
              <span>{batchPct}%</span>
            </FieldLabel>
            <Progress value={batchPct} />
          </Field>

          {status.text &&
            (() => {
              const StatusIcon = STATUS_TEXT_ICON[status.textKind ?? "info"];
              return (
                <Alert className="py-2">
                  <StatusIcon />
                  <AlertDescription style={{ overflowWrap: "anywhere" }}>
                    {status.text}
                  </AlertDescription>
                </Alert>
              );
            })()}
        </div>
      </CardContent>
    </Card>
  );
}
