import * as React from "react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface Props {
  /** Unique ID for the input (used for both range and number inputs). */
  id: string;
  /** Current numeric value. */
  value: number;
  /** Minimum value for the slider track. */
  min: number;
  /** Maximum value for the slider track. */
  max: number;
  /** Step increment. */
  step?: number;
  /** Callback when the value changes (called on every change). */
  onChange: (v: number) => void;
  /** Optional suffix/unit displayed after the value, e.g. "px". */
  suffix?: string;
  /** Whether to show the numeric text input (default true). */
  showTextField?: boolean;
  /** Additional classes for the root container. */
  className?: string;
  /** When true, allows text input values outside [min, max] range. */
  unbounded?: boolean;
  /** Invisible absolute minimum (defaults to min if not provided). */
  hardMin?: number;
  /** Invisible absolute maximum (defaults to max if not provided). */
  hardMax?: number;
}

/**
 * A compact range slider paired with a small numeric text field.
 *
 * The slider allows quick adjustment while the text field allows precise
 * direct entry. Both are kept in sync. When `unbounded` is true, the text
 * field allows values outside [min, max] (bounded by hardMin/hardMax).
 */
export default function RangeNumberInput({
  id,
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix,
  showTextField = true,
  className,
  unbounded = false,
  hardMin,
  hardMax,
}: Props) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const onChangeRef = React.useRef(onChange);
  const valueRef = React.useRef(value);
  onChangeRef.current = onChange;
  valueRef.current = value;

  const actualMin = hardMin ?? min;
  const actualMax = hardMax ?? max;

  // Clamp to slider range unless unbounded, then clamp to hard limits.
  const clamp = (n: number) =>
    unbounded
      ? Math.max(actualMin, Math.min(actualMax, n))
      : Math.max(min, Math.min(max, n));

  // Adjust value by step (used for wheel and arrow key handlers).
  const adjustValue = (delta: number) => {
    const next = clamp(valueRef.current + step * delta);
    onChangeRef.current(next);
    setDraft(String(next));
  };

  // Register native wheel listener with { passive: false } so preventDefault
  // actually blocks page scrolling while hovering over this control.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        adjustValue(e.deltaY > 0 ? -1 : 1);
      }
    };

    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [step, unbounded, min, max, actualMin, actualMax]);

  // Internal "draft" state for the text field so non-numeric keystrokes
  // don't cause immediate re-renders. Committed on blur / Enter.
  const [draft, setDraft] = React.useState(String(value));
  const draftRef = React.useRef(draft);
  draftRef.current = draft;

  // Dynamically measure suffix width so input padding adjusts to any suffix length.
  const suffixRef = React.useRef<HTMLSpanElement>(null);
  const [suffixWidth, setSuffixWidth] = React.useState(0);

  React.useEffect(() => {
    if (!suffixRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSuffixWidth(entry.contentRect.width);
      }
    });
    ro.observe(suffixRef.current);
    return () => ro.disconnect();
  }, [suffix]);

  // Keep draft in sync when value changes from outside (e.g. preset restore).
  React.useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commitFromDraft = () => {
    const raw = Number(draftRef.current);
    const clamped = clamp(isNaN(raw) ? actualMin : raw);
    onChange(clamped);
    setDraft(String(clamped));
  };

  // Whether the current value is outside the slider's recommended range.
  const isOutOfRange = value < min || value > max;

  return (
    <div
      ref={containerRef}
      className={cn("flex items-center gap-3", className)}
    >
      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        value={[Math.max(min, Math.min(max, value))]}
        onValueChange={([v]) => onChange(v)}
        className="flex-1"
      />
      {showTextField && (
        <div className="relative shrink-0">
          <Input
            id={`${id}-text`}
            type="text"
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitFromDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitFromDraft();
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                adjustValue(1);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                adjustValue(-1);
              }
            }}
            className={cn(
              "w-20 text-right tabular-nums",
              isOutOfRange && "border-ring",
            )}
            style={
              suffix ? { paddingRight: `${suffixWidth + 16}px` } : undefined
            }
          />
          {suffix && (
            <span
              ref={suffixRef}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs"
            >
              {suffix}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
