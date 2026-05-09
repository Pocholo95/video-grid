import { Field, FieldLabel } from "@/components/ui/field";
import Section from "./Section";
import type { SavedOptions } from "../../types";

interface Props {
  opts: SavedOptions;
  setOpts: (o: SavedOptions) => void;
  expanded: boolean;
  onToggle: () => void;
}

/**
 * Style section of the ControlPanel.
 *
 * Two color picker rows (Background color, Text color) laid out in the
 * Section's default 2-column grid body. Each row pairs a native
 * `<input type="color">` with a monospace hex readout span.
 */
export default function StyleSection({
  opts,
  setOpts,
  expanded,
  onToggle,
}: Props) {
  return (
    <Section label="Style" expanded={expanded} onToggle={onToggle}>
      <Field>
        <FieldLabel htmlFor="bg-color">Background color</FieldLabel>
        <div className="flex items-center gap-3">
          <input
            id="bg-color"
            type="color"
            value={opts.bgColor}
            onChange={(e) => setOpts({ ...opts, bgColor: e.target.value })}
            className="bg-background h-10 w-16 cursor-pointer rounded border"
          />
          <span className="text-muted-foreground font-mono text-sm">
            {opts.bgColor}
          </span>
        </div>
      </Field>
      <Field>
        <FieldLabel htmlFor="text-color">Text color</FieldLabel>
        <div className="flex items-center gap-3">
          <input
            id="text-color"
            type="color"
            value={opts.textColor}
            onChange={(e) => setOpts({ ...opts, textColor: e.target.value })}
            className="bg-background h-10 w-16 cursor-pointer rounded border"
          />
          <span className="text-muted-foreground font-mono text-sm">
            {opts.textColor}
          </span>
        </div>
      </Field>
    </Section>
  );
}
