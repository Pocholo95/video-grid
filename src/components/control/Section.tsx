import * as React from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface SectionProps {
  /** Label shown in the default trigger header. Not used when renderTrigger is provided. */
  label?: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  /** Override the body container layout (defaults to a 2-col responsive grid). */
  bodyClassName?: string;
  /** Custom trigger content. When provided, replaces the default label + chevron header. */
  renderTrigger?: (expanded: boolean) => React.ReactNode;
  /** Additional classes on the outer container. */
  className?: string;
}

/**
 * A collapsible fieldset-style section used inside the ControlPanel.
 *
 * - Header is a full-width button with the section label and a chevron.
 * - Body is wrapped in a grid container so children form a 2-column layout
 *   on `sm` and up; pass `bodyClassName` to override.
 * - Pass `renderTrigger` for full control over the trigger content (used by TaskCard).
 */
export default function Section({
  label,
  expanded,
  onToggle,
  children,
  bodyClassName,
  renderTrigger,
  className,
}: SectionProps) {
  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <div className={cn("rounded-lg border shadow-sm", className)}>
        <CollapsibleTrigger asChild>
          {renderTrigger ? (
            <div
              role="button"
              tabIndex={0}
              className={cn(
                "bg-muted/50 hover:bg-muted flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-sm font-bold transition-colors",
                expanded ? "rounded-t-lg" : "rounded-lg",
              )}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle();
                }
              }}
            >
              {renderTrigger(expanded)}
            </div>
          ) : (
            <button
              type="button"
              aria-expanded={expanded}
              className={cn(
                "bg-muted/50 hover:bg-muted flex w-full items-center justify-between px-4 py-3 text-sm font-bold transition-colors",
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
          )}
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
