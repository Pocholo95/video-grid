import { Card, CardContent } from "@/components/ui/card";
import PresetsRow from "./control/PresetsRow";
import GridSection from "./control/GridSection";
import OutputModesSection from "./control/OutputModesSection";
import StyleSection from "./control/StyleSection";
import type { AppSettings, SavedOptions, SectionStates } from "../types";

interface Props {
  opts: SavedOptions;
  setOpts: (
    updater: SavedOptions | ((prev: SavedOptions) => SavedOptions),
  ) => void;
  presets: AppSettings["presets"];
  setPresets: (p: AppSettings["presets"]) => void;
}

export default function ControlPanel({
  opts,
  setOpts,
  presets,
  setPresets,
}: Props) {
  const sections: SectionStates = opts.sectionStates ?? {
    grid: true,
    style: true,
    modes: true,
  };

  // Function updater reads the latest store state, so multiple rapid toggles
  // (e.g. Shift+click syncing siblings) don't suffer from stale closures.
  const toggleSection = (key: keyof SectionStates) => {
    setOpts((prev) => {
      const current = prev.sectionStates ?? {
        grid: true,
        style: true,
        modes: true,
      };
      return {
        ...prev,
        sectionStates: { ...current, [key]: !current[key] },
      };
    });
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Generation Options</h2>
        <PresetsRow
          opts={opts}
          setOpts={setOpts}
          presets={presets}
          setPresets={setPresets}
        />
        <GridSection
          opts={opts}
          setOpts={setOpts}
          expanded={sections.grid}
          onToggle={() => toggleSection("grid")}
          groupKey="control-panel"
        />
        <OutputModesSection
          opts={opts}
          setOpts={setOpts}
          expanded={sections.modes}
          onToggle={() => toggleSection("modes")}
          groupKey="control-panel"
        />
        <StyleSection
          opts={opts}
          setOpts={setOpts}
          expanded={sections.style}
          onToggle={() => toggleSection("style")}
          groupKey="control-panel"
        />
      </CardContent>
    </Card>
  );
}