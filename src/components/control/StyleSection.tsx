import { useState } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import RangeNumberInput from "@/components/control/RangeNumberInput";
import Section from "./Section";
import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerAreaGradient,
  ColorPickerAreaThumb,
  ColorPickerHueSlider,
  ColorPickerHueSliderTrack,
  ColorPickerHueSliderThumb,
  ColorPickerInput,
  ColorPickerInputTrigger,
  ColorPickerContent,
  ColorPickerSwatches,
  ColorPickerSwatch,
} from "@markoradak/color-picker";
import type { ColorPickerValue } from "@markoradak/color-picker";
import type { SavedOptions } from "../../types";
import { FONT_FACES, FONT_SIZE_MIN, FONT_SIZE_MAX } from "../../constants";

interface Props {
  opts: SavedOptions;
  setOpts: (o: SavedOptions) => void;
  expanded: boolean;
  onToggle: () => void;
}

/**
 * Validates and normalizes a hex color string.
 * Returns a valid 7-char hex string (#RRGGBB) or the fallback.
 */
function normalizeHex(color: ColorPickerValue, fallback: string): string {
  // ColorPickerValue can be a string or a gradient object
  if (typeof color !== "string") return fallback;
  const cleaned = color.replace(/^#/, "");
  // Strip alpha if present (#rrggbbaa -> #rrggbb)
  const hexPart = cleaned.length > 6 ? cleaned.slice(0, 6) : cleaned;
  if (/^[0-9a-f]{6}$/i.test(hexPart)) {
    return "#" + hexPart.toLowerCase();
  }
  if (/^[0-9a-f]{3}$/i.test(hexPart)) {
    const expanded = hexPart
      .split("")
      .map((c) => c + c)
      .join("");
    return "#" + expanded.toLowerCase();
  }
  return fallback;
}

/**
 * A reusable color picker field using @markoradak/color-picker composable API.
 * Theme-aware styling using Tailwind CSS variables.
 */
function ColorPickerField({
  label,
  id,
  value,
  opts,
  setOpts,
  keyName,
}: {
  label: string;
  id: string;
  value: string;
  opts: SavedOptions;
  setOpts: (o: SavedOptions) => void;
  keyName: "bgColor" | "textColor";
}) {
  const [color, setColor] = useState<ColorPickerValue>(value);

  // Sync when value changes from outside (e.g. preset restore)
  if (color !== value) setColor(value);

  const handleValueChange = (v: ColorPickerValue) => {
    setColor(v);
    const valid = normalizeHex(
      v,
      keyName === "bgColor" ? "#000000" : "#ffffff",
    );
    setOpts({ ...opts, [keyName]: valid });
  };

  const swatches = [
    "#000000",
    "#ef4444",
    "#f97316",
    "#eab308",
    "#22c55e",
    "#3b82f6",
    "#ec4899",
    "#ffffff",
  ];

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <ColorPicker
          value={color}
          onValueChange={handleValueChange}
          autoTokens={false}
        >
          <ColorPickerInputTrigger
            id={id}
            className="inline-flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg border border-border dark:bg-input/30 dark:hover:bg-input/50 px-1.5 text-left outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
            classNames={{
              thumbnail: "h-7 w-7 shrink-0 rounded-md",
              thumbnailCheckerboard: "hidden",
              thumbnailSwatch: "rounded-md",
              formatToggle:
                "shrink-0 cursor-pointer rounded-md px-1 text-xs opacity-50 outline-none hover:opacity-80",
              input:
                "w-full cursor-text bg-transparent font-mono text-sm outline-none",
            }}
          />
          <ColorPickerContent className="z-50 flex w-80 flex-col gap-3 rounded-xl border border-border bg-popover p-3 shadow-lg text-popover-foreground">
            <ColorPickerArea className="relative h-44 w-full cursor-crosshair rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ColorPickerAreaGradient className="rounded-lg" />
              <ColorPickerAreaThumb className="h-4 w-4 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.2),inset_0_0_0_1px_rgba(0,0,0,0.1)]" />
            </ColorPickerArea>
            <ColorPickerHueSlider className="relative h-3 w-full cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ColorPickerHueSliderTrack className="rounded-full" />
              <ColorPickerHueSliderThumb className="h-4 w-4 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.2)]" />
            </ColorPickerHueSlider>
            <ColorPickerInput
              className="flex items-center gap-1"
              classNames={{
                formatToggle:
                  "shrink-0 select-none rounded-md border border-border bg-popover px-2 h-8 text-xs font-medium outline-none hover:bg-muted",
                field:
                  "w-full rounded-md border border-border bg-popover px-2 h-8 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring",
              }}
            />
            <ColorPickerSwatches values={swatches} className="gap-1">
              {swatches.map((c) => (
                <ColorPickerSwatch
                  key={c}
                  value={c}
                  className="relative aspect-square rounded-md border border-border outline-none data-active:ring-1 data-active:ring-ring"
                />
              ))}
            </ColorPickerSwatches>
          </ColorPickerContent>
        </ColorPicker>
      </div>
    </Field>
  );
}

/**
 * Style section of the ControlPanel.
 *
 * Two color picker rows (Background color, Text color) each using a
 * composable ColorPicker from @markoradak/color-picker with theme-aware styling.
 */
export default function StyleSection({
  opts,
  setOpts,
  expanded,
  onToggle,
}: Props) {
  return (
    <Section label="Style" expanded={expanded} onToggle={onToggle}>
      {/* Background color */}
      <div className="col-span-2 md:col-span-1">
        <ColorPickerField
          label="Background color"
          id="bg-color"
          value={opts.bgColor}
          opts={opts}
          setOpts={setOpts}
          keyName="bgColor"
        />
      </div>
      {/* Text color */}
      <div className="col-span-2 md:col-span-1">
        <ColorPickerField
          label="Text color"
          id="text-color"
          value={opts.textColor}
          opts={opts}
          setOpts={setOpts}
          keyName="textColor"
        />
      </div>

      {/* Font Family - spans full width */}
      <div className="col-span-2">
        <Field>
          <FieldLabel htmlFor="cp-font-family">Font family</FieldLabel>
          <Select
            value={opts.fontFamily}
            onValueChange={(v) => setOpts({ ...opts, fontFamily: v })}
          >
            <SelectTrigger id="cp-font-family" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_FACES.map((f) => (
                <SelectItem key={f} value={f}>
                  {f.split(",")[0]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {/* Timecode Font Size - stacks on narrow screens, side-by-side on wider ones */}
      <div className="col-span-2 md:col-span-1">
        <Field>
          <FieldLabel>Timecode font size</FieldLabel>
          <div className="flex items-center gap-3">
            <RangeNumberInput
              id="tc-font-size"
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              step={1}
              value={opts.tcFontSize}
              onChange={(v) => setOpts({ ...opts, tcFontSize: v })}
              disabled={opts.tcFontSizeAuto}
              suffix="px"
              className="flex-1"
            />
            <Checkbox
              id="tc-font-auto"
              checked={opts.tcFontSizeAuto}
              onCheckedChange={(checked) =>
                setOpts({ ...opts, tcFontSizeAuto: !!checked })
              }
              className="shrink-0"
            />
            <label
              htmlFor="tc-font-auto"
              className="text-sm cursor-pointer whitespace-nowrap shrink-0"
            >
              Auto
            </label>
          </div>
        </Field>
      </div>

      {/* Header Font Size - stacks on narrow screens, side-by-side on wider ones */}
      <div className="col-span-2 md:col-span-1">
        <Field>
          <FieldLabel>Header font size</FieldLabel>
          <div className="flex items-center gap-3">
            <RangeNumberInput
              id="header-font-size"
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              step={1}
              value={opts.headerFontSize}
              onChange={(v) => setOpts({ ...opts, headerFontSize: v })}
              disabled={opts.headerFontSizeAuto}
              suffix="px"
              className="flex-1"
            />
            <Checkbox
              id="header-font-auto"
              checked={opts.headerFontSizeAuto}
              onCheckedChange={(checked) =>
                setOpts({ ...opts, headerFontSizeAuto: !!checked })
              }
              className="shrink-0"
            />
            <label
              htmlFor="header-font-auto"
              className="text-sm cursor-pointer whitespace-nowrap shrink-0"
            >
              Auto
            </label>
          </div>
        </Field>
      </div>
    </Section>
  );
}
