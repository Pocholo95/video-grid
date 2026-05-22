import { useState } from "react";
import { Ban, ChevronDown, ChevronUp, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  logs: string[];
  isProcessing?: boolean;
  isStale?: boolean;
  onForceCancel?: () => void;
}

export default function FfmpegLogsSection({
  logs,
  isProcessing,
  isStale,
  onForceCancel,
}: Props) {
  const [open, setOpen] = useState(false);

  if (logs.length === 0) return null;

  return (
    <div className="border rounded-md">
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium">
        <button
          type="button"
          className="flex items-center gap-2 hover:text-foreground flex-1"
          onClick={() => setOpen((s) => !s)}
        >
          <Terminal className="size-3" />
          FFmpeg Logs ({logs.length} lines)
        </button>
        {isProcessing && onForceCancel && (
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
        <button
          type="button"
          className="shrink-0 hover:text-foreground"
          onClick={() => setOpen((s) => !s)}
        >
          {open ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </button>
      </div>
      {open && (
        <div className="max-h-48 overflow-auto bg-muted/50 px-3 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground whitespace-pre">
          {logs.join("\n")}
        </div>
      )}
    </div>
  );
}
