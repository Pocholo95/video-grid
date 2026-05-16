import { Card, CardContent } from "@/components/ui/card";
import PresetsRow from "./control/PresetsRow";
import GridSection from "./control/GridSection";
import OutputModesSection from "./control/OutputModesSection";
import StyleSection from "./control/StyleSection";
import type { AppSettings, SavedOptions, SectionStates } from "../types";

interface Props {
  opts: SavedOptions;
  setOpts: (o: SavedOptions) => void;
  presets: AppSettings["presets"];
  setPresets: (p: AppSettings["presets"]) => void;
}

/**
 * Top-level Control Panel.
 *
 * This component is now a thin shell composing dedicated sub-files from
 * `./control/`. The only logic kept at this level is the derivation and
 * mutation of `opts.sectionStates`, since each section's expanded/collapsed
 * state is persisted (saved/restored with presets).
 */
export default function ControlPanel({
  opts,
  setOpts,
  presets,
  setPresets,
}: Props) {
  // Section states are derived from opts so they are saved/restored with presets.
  // Falls back to all expanded when the key is absent (e.g. older stored presets).
  const sections: SectionStates = opts.sectionStates ?? {
    grid: true,
    style: true,
    modes: true,
  };

  const toggleSection = (key: keyof SectionStates) => {
    setOpts({
      ...opts,
      sectionStates: { ...sections, [key]: !sections[key] },
    });
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <PresetsRow
          opts={opts}
          setOpts={setOpts}
          presets={presets}
          setPresets={setPresets}
        />
        <GridSection
          opts={opts}
          setOpts={setOpts}
          presets={presets}
          expanded={sections.grid}
          onToggle={() => toggleSection("grid")}
        />
        <OutputModesSection
          opts={opts}
          setOpts={setOpts}
          expanded={sections.modes}
          onToggle={() => toggleSection("modes")}
        />
        <StyleSection
          opts={opts}
          setOpts={setOpts}
          expanded={sections.style}
          onToggle={() => toggleSection("style")}
        />
      </CardContent>
    </Card>
  );
}
