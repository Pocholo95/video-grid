import { DEFAULTS } from "../../constants";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Section from "./Section";
import RangeNumberInput from "./RangeNumberInput";
import type { SavedOptions, VrMode } from "../../types";

interface Props {
  opts: SavedOptions;
  setOpts: (o: SavedOptions) => void;
  expanded: boolean;
  onToggle: () => void;
}

export default function OutputModesSection({
  opts,
  setOpts,
  expanded,
  onToggle,
}: Props) {
  const isAnimated = opts.animated ?? false;

  const checkField = (key: "header" | "animated") => ({
    checked: opts[key] ?? false,
    onCheckedChange: (checked: boolean | "indeterminate") =>
      setOpts({ ...opts, [key]: checked === true }),
  });

  // Use items-start so animated sub-options expanding doesn't shift the right
  // column vertically.
  return (
    <Section
      label="Output Modes"
      expanded={expanded}
      onToggle={onToggle}
      bodyClassName="grid grid-cols-1 gap-4 border-t p-4 sm:grid-cols-2 sm:items-start"
    >
      {/* Left column: Timecode / Header / Preview / VR */}
      <div className="flex flex-col gap-3">
        <Field orientation="horizontal">
          <Checkbox id="cp-chk-header" {...checkField("header")} />
          <FieldLabel htmlFor="cp-chk-header">Show header metadata</FieldLabel>
        </Field>
        <Field>
          <FieldLabel htmlFor="cp-tc-pos">Timecode position</FieldLabel>
          <Select
            value={opts.tcPosition}
            onValueChange={(v) =>
              setOpts({ ...opts, tcPosition: v as SavedOptions["tcPosition"] })
            }
          >
            <SelectTrigger id="cp-tc-pos" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="disabled">Disabled</SelectItem>
              <SelectItem value="top-left">Top-Left</SelectItem>
              <SelectItem value="top-right">Top-Right</SelectItem>
              <SelectItem value="bottom-left">Bottom-Left</SelectItem>
              <SelectItem value="bottom-right">Bottom-Right</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="cp-vr">VR Video</FieldLabel>
          <Select
            value={opts.vrMode ?? DEFAULTS.vrMode}
            onValueChange={(v) => setOpts({ ...opts, vrMode: v as VrMode })}
          >
            <SelectTrigger id="cp-vr" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="disabled">Disabled</SelectItem>
              <SelectItem value="sbs-left">SBS - Crop Left Eye</SelectItem>
              <SelectItem value="sbs-right">SBS - Crop Right Eye</SelectItem>
              <SelectItem value="tb-left">TB - Crop Top (Left Eye)</SelectItem>
              <SelectItem value="tb-right">
                TB - Crop Bottom (Right Eye)
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      {/* Right column: Animated WebP */}
      <div className="flex flex-col gap-3">
        <Field orientation="horizontal">
          <Checkbox id="cp-chk-animated" {...checkField("animated")} />
          <FieldLabel htmlFor="cp-chk-animated">
            Animated output (WebP)
          </FieldLabel>
        </Field>
        {isAnimated && (
          <div className="bg-muted/30 grid grid-cols-1 lg:grid-cols-2 gap-3 rounded-md border p-3">
            <Field>
              <FieldLabel htmlFor="cp-anim-duration">Duration</FieldLabel>
              <RangeNumberInput
                id="cp-anim-duration"
                value={opts.animDuration ?? DEFAULTS.animDuration}
                min={1}
                max={10}
                onChange={(v) => setOpts({ ...opts, animDuration: v })}
                suffix="s"
                unbounded
                hardMin={1}
                hardMax={3600}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cp-anim-fps">FPS</FieldLabel>
              <RangeNumberInput
                id="cp-anim-fps"
                value={opts.animFps ?? DEFAULTS.animFps}
                min={1}
                max={60}
                onChange={(v) => setOpts({ ...opts, animFps: v })}
                suffix="fps"
                unbounded
                hardMin={1}
                hardMax={60}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cp-anim-method">WebP method</FieldLabel>
              <RangeNumberInput
                id="cp-anim-method"
                value={opts.webpMethod ?? DEFAULTS.webpMethod}
                min={0}
                max={6}
                onChange={(v) => setOpts({ ...opts, webpMethod: v })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cp-anim-quality">WebP quality</FieldLabel>
              <RangeNumberInput
                id="cp-anim-quality"
                value={opts.webpQuality ?? DEFAULTS.webpQuality}
                min={5}
                max={100}
                onChange={(v) => setOpts({ ...opts, webpQuality: v })}
                suffix="%"
              />
            </Field>
          </div>
        )}
      </div>
    </Section>
  );
}
