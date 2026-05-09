import { useState } from "react";
import { Check, ChevronDown, Cloud, Copy, Trash2 } from "lucide-react";
import type { UploadResult, VideoMetadata } from "../types";
import { buildFormats } from "../uploadUtils";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ItemGroup, Item } from "@/components/ui/item-group"; // Assuming this exists
import { cn } from "@/lib/utils";

interface Props {
  destName: string;
  result: UploadResult;
  filename: string;
  metadata?: VideoMetadata;
}

interface CopyFieldProps {
  value: string;
  fieldType: "input" | "textarea";
  rows?: number;
}

function CopyField({ value, fieldType, rows = 3 }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const el = document.createElement("textarea");
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const commonProps = {
    readOnly: true,
    value,
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      e.target.select(),
    className: "font-mono text-xs flex-1",
  };

  return (
    <ItemGroup className="w-full">
      <Item className="relative">
        {fieldType === "textarea" ? (
          <Textarea {...commonProps} rows={rows} />
        ) : (
          <Input type="text" {...commonProps} />
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          title={copied ? "Copied!" : "Copy to clipboard"}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-16 border-0 bg-background/80 hover:bg-background text-xs shadow-sm transition-all group-hover/item:bg-accent/50"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </Button>
      </Item>
    </ItemGroup>
  );
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
