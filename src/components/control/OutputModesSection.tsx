import { DEFAULTS } from "../../constants";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Section from "./Section";
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
        <Field>
          <FieldLabel htmlFor="cp-tc-pos">Timecode position</FieldLabel>
          <Select
            value={opts.position}
            onValueChange={(v) =>
              setOpts({ ...opts, position: v as SavedOptions["position"] })
            }
          >
            <SelectTrigger id="cp-tc-pos">
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
        <Field orientation="horizontal">
          <Checkbox id="cp-chk-header" {...checkField("header")} />
          <FieldLabel htmlFor="cp-chk-header">Show header metadata</FieldLabel>
        </Field>
        <Field>
          <FieldLabel htmlFor="cp-vr">VR Video</FieldLabel>
          <Select
            value={opts.vrMode ?? DEFAULTS.vrMode}
            onValueChange={(v) => setOpts({ ...opts, vrMode: v as VrMode })}
          >
            <SelectTrigger id="cp-vr">
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
          <div className="bg-muted/30 grid grid-cols-2 gap-3 rounded-md border p-3">
            <Field>
              <FieldLabel htmlFor="cp-anim-duration">Duration (s)</FieldLabel>
              <Input
                id="cp-anim-duration"
                type="number"
                min={1}
                step={1}
                value={String(opts.animDuration ?? DEFAULTS.animDuration)}
                onChange={(e) =>
                  setOpts({
                    ...opts,
                    animDuration: Math.max(1, Number(e.target.value) || 1),
                  })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cp-anim-fps">FPS</FieldLabel>
              <Input
                id="cp-anim-fps"
                type="number"
                min={1}
                step={1}
                value={String(opts.animFps ?? DEFAULTS.animFps)}
                onChange={(e) =>
                  setOpts({
                    ...opts,
                    animFps: Math.max(1, Number(e.target.value) || 1),
                  })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cp-anim-method">
                WebP method (0-6)
              </FieldLabel>
              <Input
                id="cp-anim-method"
                type="number"
                min={0}
                max={6}
                step={1}
                value={String(opts.webpMethod ?? DEFAULTS.webpMethod)}
                onChange={(e) =>
                  setOpts({
                    ...opts,
                    webpMethod: Math.min(
                      6,
                      Math.max(0, Number(e.target.value) || 0),
                    ),
                  })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cp-anim-quality">
                WebP quality (5-100)
              </FieldLabel>
              <Input
                id="cp-anim-quality"
                type="number"
                min={5}
                max={100}
                step={1}
                value={String(opts.webpQuality ?? DEFAULTS.webpQuality)}
                onChange={(e) =>
                  setOpts({
                    ...opts,
                    webpQuality: Math.min(
                      100,
                      Math.max(5, Number(e.target.value) || 5),
                    ),
                  })
                }
              />
            </Field>
          </div>
        )}
      </div>
    </Section>
  );
}
