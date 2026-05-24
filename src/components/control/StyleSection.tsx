import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
function normalizeHex(color: string, fallback: string): string {
  const cleaned = color.replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(cleaned)) {
    return "#" + cleaned.toLowerCase();
  }
  if (/^[0-9a-f]{3}$/i.test(cleaned)) {
    const expanded = cleaned
      .split("")
      .map((c) => c + c)
      .join("");
    return "#" + expanded.toLowerCase();
  }
  return fallback;
}

/**
 * Style section of the ControlPanel.
 *
 * Two color picker rows (Background color, Text color) each pairing a native
 * `<input type="color">` swatch with an editable monospace hex field.
 */
export default function StyleSection({
  opts,
  setOpts,
  expanded,
  onToggle,
}: Props) {
  const [draftBg, setDraftBg] = useState(opts.bgColor);
  const [draftTx, setDraftTx] = useState(opts.textColor);
  const [copied, setCopied] = useState<string | null>(null);

  // Keep drafts in sync when opts change from outside (e.g. preset restore).
  if (draftBg !== opts.bgColor) setDraftBg(opts.bgColor);
  if (draftTx !== opts.textColor) setDraftTx(opts.textColor);

  const commitColor = (
    key: "bgColor" | "textColor",
    draft: string,
    fallback: string,
  ) => {
    const valid = normalizeHex(draft, fallback);
    setOpts({ ...opts, [key]: valid });
    if (key === "bgColor") setDraftBg(valid);
    else setDraftTx(valid);
  };

  const handleColorChange = (key: "bgColor" | "textColor") => {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setOpts({ ...opts, [key]: val });
      if (key === "bgColor") setDraftBg(val);
      else setDraftTx(val);
    };
  };

  const handleHexChange = (key: "bgColor" | "textColor") => {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (key === "bgColor") setDraftBg(val);
      else setDraftTx(val);
    };
  };

  const handleHexBlur = (key: "bgColor" | "textColor") => {
    const draft = key === "bgColor" ? draftBg : draftTx;
    const fallback = key === "bgColor" ? "#000000" : "#ffffff";
    commitColor(key, draft, fallback);
  };

  const handleHexKeyDown = (key: "bgColor" | "textColor") => {
    return (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const draft = key === "bgColor" ? draftBg : draftTx;
        const fallback = key === "bgColor" ? "#000000" : "#ffffff";
        commitColor(key, draft, fallback);
      }
    };
  };

  const copyToClipboard = (color: string) => {
    navigator.clipboard.writeText(color);
    setCopied(color);
    setTimeout(() => setCopied(null), 1200);
  };

  const ColorField = ({
    label,
    id,
    value,
    draft,
    keyName,
    copyButton = false,
  }: {
    label: string;
    id: string;
    value: string;
    draft: string;
    keyName: "bgColor" | "textColor";
    copyButton?: boolean;
  }) => (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        {/* Color swatch */}
        <div className="relative">
          <input
            id={id}
            type="color"
            value={value}
            onChange={handleColorChange(keyName)}
            className="bg-background h-10 w-10 cursor-pointer rounded border border-border p-0.5"
            title="Pick color"
          />
        </div>

        {/* Hex text input */}
        <Input
          id={`${id}-hex`}
          type="text"
          value={draft}
          onChange={handleHexChange(keyName)}
          onBlur={() => handleHexBlur(keyName)}
          onKeyDown={handleHexKeyDown(keyName)}
          className="font-mono text-sm tabular-nums"
          spellCheck={false}
          autoComplete="off"
        />

        {/* Copy button */}
        {copyButton && (
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            onClick={() => copyToClipboard(value)}
            title="Copy hex value"
          >
            {copied === value ? (
              <Check className="size-4 text-green-500" />
            ) : (
              <Copy className="size-4" />
            )}
          </Button>
        )}
      </div>
    </Field>
  );

  return (
    <Section label="Style" expanded={expanded} onToggle={onToggle}>
      {/* Background color - stacks on narrow screens, side-by-side on wider ones */}
      <div className="col-span-2 md:col-span-1">
        <ColorField
          label="Background color"
          id="bg-color"
          value={opts.bgColor}
          draft={draftBg}
          keyName="bgColor"
        />
      </div>
      {/* Text color - stacks on narrow screens, side-by-side on wider ones */}
      <div className="col-span-2 md:col-span-1">
        <ColorField
          label="Text color"
          id="text-color"
          value={opts.textColor}
          draft={draftTx}
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
