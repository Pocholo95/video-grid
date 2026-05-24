import { describe, it, expect } from "vitest";
import {
  getGridLayout,
  prepareHeader,
  getVrCropRect,
  vrModeLabel,
  getTimecodePosition,
  calculateSampleTimes,
  resolveTimestamps,
} from "@/gridUtils";
import { createTestMeta, createTestOpts } from "../helpers/mockServices";

describe("gridUtils", () => {
  const mockMeta = createTestMeta({ duration: 100 });

  describe("getGridLayout", () => {
    it("returns cell slots for uniform grid", () => {
      const opts = createTestOpts({ cols: 3, rows: 3 });
      const result = getGridLayout(
        {
          width: opts.width,
          cols: opts.cols,
          rows: opts.rows,
          spacing: opts.spacing,
          vrMode: opts.vrMode,
        },
        mockMeta,
      );
      expect(result.cellSlots.length).toBe(9);
      expect(result.canvasWidth).toBeGreaterThan(0);
      expect(result.canvasHeight).toBeGreaterThan(0);
    });

    it("accounts for header height", () => {
      const opts = createTestOpts({ cols: 3, rows: 3 });
      const result = getGridLayout(
        {
          width: opts.width,
          cols: opts.cols,
          rows: opts.rows,
          spacing: opts.spacing,
          vrMode: opts.vrMode,
        },
        mockMeta,
        50,
      );
      expect(result.cellSlots[0].y).toBeGreaterThanOrEqual(50);
    });

    it("handles VR mode", () => {
      const opts = createTestOpts({ cols: 3, rows: 3, vrMode: "sbs-left" });
      const result = getGridLayout(
        {
          width: opts.width,
          cols: opts.cols,
          rows: opts.rows,
          spacing: opts.spacing,
          vrMode: opts.vrMode,
        },
        mockMeta,
      );
      expect(result.cellSlots.length).toBe(9);
    });
  });

  describe("prepareHeader", () => {
    it("returns undefined header when disabled", () => {
      const mockFile = new File([""], "test.mp4", { type: "video/mp4" });
      const opts = createTestOpts({ header: false });
      const result = prepareHeader(
        {
          header: opts.header,
          bgColor: opts.bgColor,
          textColor: opts.textColor,
          vrMode: opts.vrMode,
          width: opts.width,
        },
        mockFile,
        mockMeta,
      );
      expect(result.headerCanvas).toBeUndefined();
      expect(result.headerHeight).toBe(0);
    });
  });

  describe("getVrCropRect", () => {
    it("returns left crop for sbs-left", () => {
      const result = getVrCropRect(1920, 1080, "sbs-left");
      expect(result.sx).toBe(0);
      expect(result.sw).toBe(960);
      expect(result.sh).toBe(1080);
    });

    it("returns right crop for sbs-right", () => {
      const result = getVrCropRect(1920, 1080, "sbs-right");
      expect(result.sx).toBe(960);
      expect(result.sw).toBe(960);
      expect(result.sh).toBe(1080);
    });

    it("returns top crop for tb-left", () => {
      const result = getVrCropRect(1920, 1080, "tb-left");
      expect(result.sy).toBe(0);
      expect(result.sh).toBe(540);
      expect(result.sw).toBe(1920);
    });

    it("returns bottom crop for tb-right", () => {
      const result = getVrCropRect(1920, 1080, "tb-right");
      expect(result.sy).toBe(540);
      expect(result.sh).toBe(540);
      expect(result.sw).toBe(1920);
    });
  });

  describe("vrModeLabel", () => {
    it("returns empty string for disabled", () => {
      expect(vrModeLabel("disabled")).toBe("");
    });

    it("returns label for sbs-left", () => {
      expect(vrModeLabel("sbs-left")).toBe("SBS - Crop Left Eye");
    });

    it("returns label for sbs-right", () => {
      expect(vrModeLabel("sbs-right")).toBe("SBS - Crop Right Eye");
    });

    it("returns label for tb-left", () => {
      expect(vrModeLabel("tb-left")).toBe("TB - Crop Top (Left Eye)");
    });

    it("returns label for tb-right", () => {
      expect(vrModeLabel("tb-right")).toBe("TB - Crop Bottom (Right Eye)");
    });
  });

  describe("getTimecodePosition", () => {
    it("maps top-left correctly", () => {
      expect(getTimecodePosition("top-left")).toEqual({ x: "left", y: "top" });
    });

    it("maps top-right correctly", () => {
      expect(getTimecodePosition("top-right")).toEqual({
        x: "right",
        y: "top",
      });
    });

    it("maps bottom-left correctly", () => {
      expect(getTimecodePosition("bottom-left")).toEqual({
        x: "left",
        y: "bottom",
      });
    });

    it("maps bottom-right correctly", () => {
      expect(getTimecodePosition("bottom-right")).toEqual({
        x: "right",
        y: "bottom",
      });
    });
  });

  describe("calculateSampleTimes", () => {
    it("returns correct number of samples", () => {
      const times = calculateSampleTimes(9, 100);
      expect(times.length).toBe(9);
    });

    it("distributes times across duration", () => {
      const times = calculateSampleTimes(4, 100);
      expect(times[0]).toBeLessThan(times[1]);
      expect(times[1]).toBeLessThan(times[2]);
      expect(times[2]).toBeLessThan(times[3]);
    });

    it("respects margins", () => {
      const times = calculateSampleTimes(4, 100);
      expect(times[0]).toBeGreaterThan(0);
      expect(times[times.length - 1]).toBeLessThan(100);
    });

    it("handles single cell", () => {
      const times = calculateSampleTimes(1, 100);
      expect(times.length).toBe(1);
      expect(times[0]).toBeCloseTo(50, 1);
    });
  });

  describe("resolveTimestamps", () => {
    it("uses custom markers when sufficient", () => {
      const result = resolveTimestamps([10, 20, 30, 40, 50], 5, 100);
      expect(result.length).toBe(5);
      expect(result[0]).toBe(10);
    });

    it("fills remaining cells with auto timestamps", () => {
      const result = resolveTimestamps([10, 20], 5, 100);
      expect(result.length).toBe(5);
      // Custom markers are merged with auto-generated timestamps
      expect(result).toContain(10);
      expect(result).toContain(20);
      // All timestamps should be within valid range
      for (const t of result) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThan(100);
      }
    });

    it("clamps timestamps to valid range", () => {
      const result = resolveTimestamps([-5, 200], 2, 100);
      expect(result[0]).toBeGreaterThanOrEqual(0);
      expect(result[1]).toBeLessThan(100);
    });

    it("sorts results chronologically", () => {
      const result = resolveTimestamps([50, 10, 30], 3, 100);
      expect(result[0]).toBeLessThan(result[1]);
      expect(result[1]).toBeLessThan(result[2]);
    });
  });
});
