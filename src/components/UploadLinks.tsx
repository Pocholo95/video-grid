import { useState } from "react";
import { ChevronDown, Cloud, Trash2 } from "lucide-react";
import type { UploadResult, VideoMetadata } from "../types";
import { buildFormats } from "../uploadUtils";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CopyField } from "@/components/CopyField";
import { cn } from "@/lib/utils";

interface Props {
  destName: string;
  result: UploadResult;
  filename: string;
  metadata?: VideoMetadata;
}

/**
 * Per-destination collapsible block listing every named link format
 * (Direct URL, BBCode variants, Markdown, etc.) for one successful upload.
 */
export default function UploadLinks({
  destName,
  result,
  filename,
  metadata,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const formats = buildFormats(result, filename, metadata);

  return (
    <Collapsible
      open={expanded}
      onOpenChange={setExpanded}
      className="rounded-md border"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-expanded={expanded}
            className="hover:bg-accent/50 -mx-1 -my-1 flex flex-1 items-center justify-between gap-2 rounded-md px-1 py-1 text-sm font-medium transition-colors"
          >
            <span className="flex items-center gap-2">
              <Cloud className="size-4" />
              <span>{destName}</span>
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 transition-transform duration-200",
                expanded && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <Button
          asChild
          variant="ghost"
          size="sm"
          title={`Delete this image from ${destName}`}
          className="text-destructive hover:text-destructive shrink-0"
        >
          <a href={result.deleteUrl} target="_blank" rel="noopener noreferrer">
            <Trash2 className="size-4" /> Delete
          </a>
        </Button>
      </div>

      <CollapsibleContent>
        <div className="flex flex-col gap-3 border-t p-3">
          {formats.map((f) => (
            <div key={f.key} className="flex flex-col gap-1.5">
              <div className="flex flex-col">
                <span className="text-sm font-medium">{f.label}</span>
                <span className="text-muted-foreground text-xs">
                  {f.description}
                </span>
              </div>
              <CopyField
                value={f.value}
                fieldType={f.fieldType === "textarea" ? "textarea" : "input"}
                rows={3}
              />
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
