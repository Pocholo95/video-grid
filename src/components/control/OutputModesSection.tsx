import { DEFAULTS } from "../../constants";
import { Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import Section from "./Section";
import RangeNumberInput from "./RangeNumberInput";
import type { SavedOptions, VrMode } from "../../types";

interface Props {
  opts: SavedOptions;
  setOpts: (o: SavedOptions) => void;
  expanded: boolean;
  onToggle: () => void;
  groupKey?: string;
}

export default function OutputModesSection({
  opts,
  setOpts,
  expanded,
  onToggle,
  groupKey,
}: Props) {
  const isAnimated = opts.animated ?? false;
  const isSequence = isAnimated && (opts.animSequence ?? false);

  const checkField = (key: "header" | "animated" | "animSequence") => ({
    checked: opts[key] ?? false,
    onCheckedChange: (checked: boolean | "indeterminate") => {
      const val = checked === true;
      const next = { ...opts, [key]: val };
      // Sequence requires animated to be on
      if (key === "animated" && !val) {
        next.animSequence = false;
      }
      setOpts(next);
    },
  });

  // Use items-start so animated sub-options expanding doesn't shift the right
  // column vertically.
  return (
    <Section
      label="Output Modes"
      expanded={expanded}
      onToggle={onToggle}
      groupKey={groupKey}
      bodyClassName="grid grid-cols-1 gap-4 border-t p-4 sm:grid-cols-2 sm:items-start"
    >
      {/* Left column: Timecode / Header / Preview / VR */}
      <div className="flex flex-col gap-3">
        <Field orientation="horizontal">
          <Switch
            id="cp-chk-header"
            label="Show header metadata"
            {...checkField("header")}
          />
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
          <Switch
            id="cp-chk-animated"
            label="Animated output"
            {...checkField("animated")}
          />
        </Field>
        {isAnimated && (
          <div className="bg-muted/30 grid grid-cols-1 lg:grid-cols-2 gap-3 rounded-md border p-3">
            {/* Sequence toggle inside animated options */}
            <Field
              orientation="horizontal"
              className="col-span-1 lg:col-span-2 items-center gap-2"
            >
              <Switch
                id="cp-chk-sequence"
                label="Sequence mode"
                {...checkField("animSequence")}
              />
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="size-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="About Sequence mode"
                  >
                    <Info className="size-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="max-w-72 text-xs leading-relaxed">
                  <p className="font-medium mb-1">Sequence mode</p>
                  <p>
                    Instead of a grid, generates a single-cell output that plays
                    video segments sequentially like a fast visual summary of
                    the entire video.
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Once enabled you can adjust the number of segments,
                    duration, and FPS below to control the output.
                  </p>
                </PopoverContent>
              </Popover>
            </Field>
            {/* Segments - only shown in sequence mode */}
            {isSequence && (
              <Field>
                <FieldLabel htmlFor="cp-seq-segments">
                  Number of segments
                </FieldLabel>
                <RangeNumberInput
                  id="cp-seq-segments"
                  value={opts.animSegments ?? DEFAULTS.animSegments}
                  min={1}
                  max={12}
                  onChange={(v) => setOpts({ ...opts, animSegments: v })}
                  unbounded
                  hardMin={1}
                  hardMax={60}
                />
              </Field>
            )}
            {/* Sequence render mode - only shown in sequence mode */}
            {isSequence && (
              <Field>
                <FieldLabel htmlFor="cp-seq-mode">Render mode</FieldLabel>
                <Select
                  value={opts.sequenceMode ?? DEFAULTS.sequenceMode}
                  onValueChange={(v) =>
                    setOpts({
                      ...opts,
                      sequenceMode: v as SavedOptions["sequenceMode"],
                    })
                  }
                >
                  <SelectTrigger id="cp-seq-mode" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="static">Static (hold frame)</SelectItem>
                    <SelectItem value="video">Video (play segment)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
            {/* Output format - applies to both animated and sequence */}
            <Field>
              <FieldLabel htmlFor="cp-anim-format">Output format</FieldLabel>
              <Select
                value={opts.animFormat ?? DEFAULTS.animFormat}
                onValueChange={(v) =>
                  setOpts({
                    ...opts,
                    animFormat: v as SavedOptions["animFormat"],
                  })
                }
              >
                <SelectTrigger id="cp-anim-format" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="webp">WebP</SelectItem>
                  <SelectItem value="mp4">MP4</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {/* Duration */}
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
            {/* FPS */}
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
            {/* WebP method - only for WebP format */}
            {opts.animFormat !== "mp4" && (
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
            )}
            {/* WebP quality - only for WebP format */}
            {opts.animFormat !== "mp4" && (
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
            )}
          </div>
        )}
      </div>
    </Section>
  );
}
