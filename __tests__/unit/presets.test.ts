/**
 * Tests for getPresetSummary display helper.
 */

import { describe, it, expect } from "vitest";
import { getPresetSummary } from "@/presets";
import { DEFAULTS } from "@/constants";
import type { SavedOptions, VrMode } from "@/types";

describe("getPresetSummary", () => {
  it("shows Static mode for default options", () => {
    const summary = getPresetSummary(DEFAULTS);
    expect(summary).toContain("Static");
    expect(summary).toContain("1920px");
    expect(summary).toContain("3×4");
  });

  it("shows Animated mode when outputMode is animated", () => {
    const opts = { ...DEFAULTS, outputMode: "animated" as const };
    const summary = getPresetSummary(opts);
    expect(summary).toContain("Animated");
  });

  it("shows custom grid template row structure", () => {
    const opts: SavedOptions = {
      ...DEFAULTS,
      gridTemplate: {
        cols: 60,
        cells: [
          { id: "a", x: 0, y: 0, w: 20, h: 1 },
          { id: "b", x: 1, y: 0, w: 20, h: 1 },
          { id: "c", x: 2, y: 0, w: 20, h: 1 },
          { id: "d", x: 0, y: 1, w: 60, h: 1 },
          { id: "e", x: 0, y: 2, w: 20, h: 1 },
          { id: "f", x: 1, y: 2, w: 20, h: 1 },
          { id: "g", x: 2, y: 2, w: 20, h: 1 },
        ],
      },
    };
    const summary = getPresetSummary(opts);
    expect(summary).toContain("Grid: 3 | 1 | 3");
  });

  it("shows VR SBS suffix", () => {
    const opts = { ...DEFAULTS, vrMode: "sbs-left" as VrMode };
    const summary = getPresetSummary(opts);
    expect(summary).toContain("(SBS)");
  });

  it("shows VR TB suffix", () => {
    const opts = { ...DEFAULTS, vrMode: "tb-right" as VrMode };
    const summary = getPresetSummary(opts);
    expect(summary).toContain("(TB)");
  });

  it("does not show VR suffix when disabled", () => {
    const opts = { ...DEFAULTS, vrMode: "disabled" as VrMode };
    const summary = getPresetSummary(opts);
    expect(summary).not.toContain("(SBS)");
    expect(summary).not.toContain("(TB)");
  });

  it("shows correct width", () => {
    const opts = { ...DEFAULTS, width: 3840 };
    const summary = getPresetSummary(opts);
    expect(summary).toContain("3840px");
  });
});
