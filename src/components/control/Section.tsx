import * as React from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface SectionProps {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  /** Override the body container layout (defaults to a 2-col responsive grid). */
  bodyClassName?: string;
}

/**
 * A collapsible fieldset-style section used inside the ControlPanel.
 *
 * - Header is a full-width button with the section label and a chevron.
 * - Body is wrapped in a grid container so children form a 2-column layout
 *   on `sm` and up; pass `bodyClassName` to override.
 */
export default function Section({
  label,
  expanded,
  onToggle,
  children,
  bodyClassName,
}: SectionProps) {
  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <div className="rounded-lg border">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-expanded={expanded}
            className={cn(
              "hover:bg-accent/50 flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors",
              expanded ? "rounded-t-lg" : "rounded-lg",
            )}
          >
            <span>{label}</span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 transition-transform duration-200",
                expanded && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div
            className={cn(
              "grid grid-cols-1 gap-4 border-t p-4 sm:grid-cols-2",
              bodyClassName,
            )}
          >
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
