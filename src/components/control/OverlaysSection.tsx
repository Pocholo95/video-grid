import { DEFAULTS } from "../../constants";
import { Switch } from "@/components/ui/switch";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Section from "./Section";
import type { SavedOptions } from "../../types";

interface Props {
  opts: SavedOptions;
  setOpts: (o: SavedOptions) => void;
  expanded: boolean;
  onToggle: () => void;
  groupKey?: string;
}

/**
 * Overlays section of the ControlPanel.
 *
 * Contains header toggle and timecode position controls.
 * Hidden entirely when video_with_audio mode is active (both fields disabled).
 */
export default function OverlaysSection({
  opts,
  setOpts,
  expanded,
  onToggle,
  groupKey,
}: Props) {
  const outputMode = opts.outputMode ?? DEFAULTS.outputMode;
  const isGallery = outputMode === "gallery";
  const isVideoWithAudio =
    outputMode === "sequence" &&
    (opts.sequenceMode ?? DEFAULTS.sequenceMode) === "video_with_audio";

  // When video_with_audio is active, both fields are disabled - hide section entirely
  if (isVideoWithAudio) {
    return null;
  }

  return (
    <Section
      label="Overlays"
      expanded={expanded}
      onToggle={onToggle}
      groupKey={groupKey}
      bodyClassName="grid grid-cols-1 gap-4 border-t p-4 sm:grid-cols-2 sm:items-start"
    >
      {/* Left column: Header toggle */}
      <div className="flex flex-col gap-3">
        {!isGallery && (
          <Field orientation="horizontal">
            <Switch
              id="cp-chk-header"
              label="Show metadata header"
              checked={opts.header !== false}
              onCheckedChange={(checked) => {
                setOpts({ ...opts, header: checked === true });
              }}
            />
          </Field>
        )}
      </div>

      {/* Right column: Timecode position */}
      <div className="flex flex-col gap-3">
        <Field>
          <FieldLabel htmlFor="cp-tc-pos">Timecode position</FieldLabel>
          <Select
            value={opts.tcPosition}
            onValueChange={(v) =>
              setOpts({
                ...opts,
                tcPosition: v as SavedOptions["tcPosition"],
              })
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
      </div>
    </Section>
  );
}
