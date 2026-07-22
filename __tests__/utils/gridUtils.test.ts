import { describe, it, expect } from "vitest";
import {
  getGridLayout,
  prepareHeader,
  getVrCropRect,
  vrModeLabel,
  getTimecodePosition,
  calculateSampleTimes,
  resolveTimestamps,
  computeAnimationEstimate,
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
          fontFamily: opts.fontFamily,
          headerFontSizeAuto: opts.headerFontSizeAuto,
          headerFontSize: opts.headerFontSize,
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

    it("generates times within a custom start/end range", () => {
      const times = calculateSampleTimes(4, 50, 25, 75);
      expect(times.length).toBe(4);
      for (const t of times) {
        expect(t).toBeGreaterThanOrEqual(25);
        expect(t).toBeLessThanOrEqual(75);
      }
    });

    it("generates times for first half when endTime is duration/2", () => {
      const duration = 100;
      const times = calculateSampleTimes(4, duration / 2, 0, duration / 2);
      expect(times.length).toBe(4);
      for (const t of times) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(50);
      }
    });

    it("generates times for second half when startTime is duration/2", () => {
      const duration = 100;
      const times = calculateSampleTimes(
        4,
        duration / 2,
        duration / 2,
        duration,
      );
      expect(times.length).toBe(4);
      for (const t of times) {
        expect(t).toBeGreaterThanOrEqual(50);
        expect(t).toBeLessThanOrEqual(100);
      }
    });

    it("maintains backward compatibility when startTime/endTime omitted", () => {
      const times = calculateSampleTimes(4, 100);
      expect(times.length).toBe(4);
      for (const t of times) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(100);
      }
    });

    it("evenly distributes times within custom range with margins", () => {
      const times = calculateSampleTimes(5, 60, 20, 80);
      expect(times.length).toBe(5);
      // First time should be after start (with margin)
      expect(times[0]).toBeGreaterThan(20);
      // Last time should be before end (with margin)
      expect(times[times.length - 1]).toBeLessThan(80);
      // Times should be in ascending order
      for (let i = 1; i < times.length; i++) {
        expect(times[i]).toBeGreaterThan(times[i - 1]);
      }
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

  describe("computeAnimationEstimate", () => {
    const mockMeta = createTestMeta({ duration: 100 });

    it("returns null when output mode is static", () => {
      const opts = createTestOpts({ outputMode: "static" });
      const result = computeAnimationEstimate(mockMeta, {
        outputMode: opts.outputMode ?? "static",
        animSegments: opts.animSegments,
        animDuration: opts.animDuration,
        animFps: opts.animFps,
        width: opts.width,
        cols: opts.cols,
        rows: opts.rows,
        spacing: opts.spacing,
        header: opts.header,
        vrMode: opts.vrMode,
        headerFontSizeAuto: opts.headerFontSizeAuto,
        headerFontSize: opts.headerFontSize,
      });
      expect(result).toBeNull();
    });

    it("returns estimates when output mode is animated", () => {
      const opts = createTestOpts({ outputMode: "animated" });
      const result = computeAnimationEstimate(mockMeta, {
        outputMode: opts.outputMode ?? "static",
        animSegments: opts.animSegments,
        animDuration: opts.animDuration,
        animFps: opts.animFps,
        width: opts.width,
        cols: opts.cols,
        rows: opts.rows,
        spacing: opts.spacing,
        header: opts.header,
        vrMode: opts.vrMode,
        headerFontSizeAuto: opts.headerFontSizeAuto,
        headerFontSize: opts.headerFontSize,
      });
      expect(result).not.toBeNull();
      expect(result!.totalFrames).toBeGreaterThan(0);
      expect(result!.totalPixels).toBeGreaterThan(0);
      expect(result!.canvasWidth).toBeGreaterThan(0);
      expect(result!.canvasHeight).toBeGreaterThan(0);
    });

    it("calculates frames correctly in animated mode (duration * fps)", () => {
      const opts = createTestOpts({
        outputMode: "animated",
        animDuration: 5,
        animFps: 10,
      });
      const result = computeAnimationEstimate(mockMeta, {
        outputMode: opts.outputMode ?? "static",
        animSegments: opts.animSegments,
        animDuration: opts.animDuration,
        animFps: opts.animFps,
        width: opts.width,
        cols: opts.cols,
        rows: opts.rows,
        spacing: opts.spacing,
        header: opts.header,
        vrMode: opts.vrMode,
        headerFontSizeAuto: opts.headerFontSizeAuto,
        headerFontSize: opts.headerFontSize,
      });
      // 5 seconds * 10 fps = 50 frames
      expect(result!.totalFrames).toBe(50);
    });

    it("calculates frames correctly in sequence mode (segments * duration * fps)", () => {
      const opts = createTestOpts({
        outputMode: "sequence",
        animSegments: 3,
        animDuration: 2,
        animFps: 10,
      });
      const result = computeAnimationEstimate(mockMeta, {
        outputMode: opts.outputMode ?? "static",
        animSegments: opts.animSegments,
        animDuration: opts.animDuration,
        animFps: opts.animFps,
        width: opts.width,
        cols: opts.cols,
        rows: opts.rows,
        spacing: opts.spacing,
        header: opts.header,
        vrMode: opts.vrMode,
        headerFontSizeAuto: opts.headerFontSizeAuto,
        headerFontSize: opts.headerFontSize,
      });
      // 3 segments * 2 seconds * 10 fps = 60 frames
      expect(result!.totalFrames).toBe(60);
    });

    it("calculates total pixels as (canvasWidth * canvasHeight * totalFrames)", () => {
      const opts = createTestOpts({
        outputMode: "animated",
        animDuration: 5,
        animFps: 10,
        header: false,
      });
      const result = computeAnimationEstimate(mockMeta, {
        outputMode: opts.outputMode ?? "static",
        animSegments: opts.animSegments,
        animDuration: opts.animDuration,
        animFps: opts.animFps,
        width: opts.width,
        cols: opts.cols,
        rows: opts.rows,
        spacing: opts.spacing,
        header: opts.header,
        vrMode: opts.vrMode,
        headerFontSizeAuto: opts.headerFontSizeAuto,
        headerFontSize: opts.headerFontSize,
      });
      expect(result!.totalPixels).toBe(
        result!.canvasWidth * result!.canvasHeight * result!.totalFrames,
      );
    });

    it("includes header height in canvas height when header is enabled", () => {
      const optsNoHeader = createTestOpts({
        outputMode: "animated",
        header: false,
        animDuration: 5,
        animFps: 10,
      });
      const optsWithHeader = createTestOpts({
        outputMode: "animated",
        header: true,
        animDuration: 5,
        animFps: 10,
      });

      const resultNoHeader = computeAnimationEstimate(mockMeta, {
        outputMode: optsNoHeader.outputMode ?? "static",
        animSegments: optsNoHeader.animSegments,
        animDuration: optsNoHeader.animDuration,
        animFps: optsNoHeader.animFps,
        width: optsNoHeader.width,
        cols: optsNoHeader.cols,
        rows: optsNoHeader.rows,
        spacing: optsNoHeader.spacing,
        header: optsNoHeader.header,
        vrMode: optsNoHeader.vrMode,
        headerFontSizeAuto: optsNoHeader.headerFontSizeAuto,
        headerFontSize: optsNoHeader.headerFontSize,
      });

      const resultWithHeader = computeAnimationEstimate(mockMeta, {
        outputMode: optsWithHeader.outputMode ?? "static",
        animSegments: optsWithHeader.animSegments,
        animDuration: optsWithHeader.animDuration,
        animFps: optsWithHeader.animFps,
        width: optsWithHeader.width,
        cols: optsWithHeader.cols,
        rows: optsWithHeader.rows,
        spacing: optsWithHeader.spacing,
        header: optsWithHeader.header,
        vrMode: optsWithHeader.vrMode,
        headerFontSizeAuto: optsWithHeader.headerFontSizeAuto,
        headerFontSize: optsWithHeader.headerFontSize,
      });

      expect(resultWithHeader!.canvasHeight).toBeGreaterThan(
        resultNoHeader!.canvasHeight,
      );
    });

    it("handles VR mode correctly", () => {
      const opts = createTestOpts({
        outputMode: "animated",
        vrMode: "sbs-left",
        animDuration: 5,
        animFps: 10,
      });
      const result = computeAnimationEstimate(mockMeta, {
        outputMode: opts.outputMode ?? "static",
        animSegments: opts.animSegments,
        animDuration: opts.animDuration,
        animFps: opts.animFps,
        width: opts.width,
        cols: opts.cols,
        rows: opts.rows,
        spacing: opts.spacing,
        header: opts.header,
        vrMode: opts.vrMode,
        headerFontSizeAuto: opts.headerFontSizeAuto,
        headerFontSize: opts.headerFontSize,
      });
      expect(result).not.toBeNull();
      expect(result!.canvasWidth).toBeGreaterThan(0);
      expect(result!.canvasHeight).toBeGreaterThan(0);
    });

    it("handles zero duration edge case", () => {
      const opts = createTestOpts({
        outputMode: "animated",
        animDuration: 0,
        animFps: 10,
      });
      const result = computeAnimationEstimate(mockMeta, {
        outputMode: opts.outputMode ?? "static",
        animSegments: opts.animSegments,
        animDuration: opts.animDuration,
        animFps: opts.animFps,
        width: opts.width,
        cols: opts.cols,
        rows: opts.rows,
        spacing: opts.spacing,
        header: opts.header,
        vrMode: opts.vrMode,
        headerFontSizeAuto: opts.headerFontSizeAuto,
        headerFontSize: opts.headerFontSize,
      });
      // 0 duration means 0 frames, so 0 total pixels
      expect(result!.totalFrames).toBe(0);
      expect(result!.totalPixels).toBe(0);
    });

    it("rounds up frame count with ceil for fractional frames", () => {
      const opts = createTestOpts({
        outputMode: "animated",
        animDuration: 5.5,
        animFps: 3,
      });
      const result = computeAnimationEstimate(mockMeta, {
        outputMode: opts.outputMode ?? "static",
        animSegments: opts.animSegments,
        animDuration: opts.animDuration,
        animFps: opts.animFps,
        width: opts.width,
        cols: opts.cols,
        rows: opts.rows,
        spacing: opts.spacing,
        header: opts.header,
        vrMode: opts.vrMode,
        headerFontSizeAuto: opts.headerFontSizeAuto,
        headerFontSize: opts.headerFontSize,
      });
      // ceil(5.5 * 3) = ceil(16.5) = 17
      expect(result!.totalFrames).toBe(17);
    });

    it("produces consistent results for same inputs", () => {
      const opts = createTestOpts({
        outputMode: "animated",
        animDuration: 10,
        animFps: 15,
        cols: 3,
        rows: 3,
        header: true,
      });

      const result1 = computeAnimationEstimate(mockMeta, {
        outputMode: opts.outputMode ?? "static",
        animSegments: opts.animSegments,
        animDuration: opts.animDuration,
        animFps: opts.animFps,
        width: opts.width,
        cols: opts.cols,
        rows: opts.rows,
        spacing: opts.spacing,
        header: opts.header,
        vrMode: opts.vrMode,
        headerFontSizeAuto: opts.headerFontSizeAuto,
        headerFontSize: opts.headerFontSize,
      });

      const result2 = computeAnimationEstimate(mockMeta, {
        outputMode: opts.outputMode ?? "static",
        animSegments: opts.animSegments,
        animDuration: opts.animDuration,
        animFps: opts.animFps,
        width: opts.width,
        cols: opts.cols,
        rows: opts.rows,
        spacing: opts.spacing,
        header: opts.header,
        vrMode: opts.vrMode,
        headerFontSizeAuto: opts.headerFontSizeAuto,
        headerFontSize: opts.headerFontSize,
      });

      expect(result1).toEqual(result2);
    });
  });
});
