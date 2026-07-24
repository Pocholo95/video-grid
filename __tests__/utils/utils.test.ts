import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  humanSize,
  formatTime,
  formatTimeExact,
  formatElapsed,
  makeId,
  makeUniqueName,
  hasUsableMetadata,
  hexToRgba,
  log,
  warn,
  errlog,
  buildBbcodeTitle,
  normalizeHex,
} from "@/utils";
import type { TaskItem, VideoMetadata } from "@/types";

describe("utils", () => {
  describe("humanSize", () => {
    it("formats bytes", () => {
      expect(humanSize(0)).toBe("0 B");
      expect(humanSize(500)).toBe("500 B");
      expect(humanSize(1023)).toBe("1023 B");
    });

    it("formats kilobytes", () => {
      expect(humanSize(1024)).toBe("1.0 KB");
      expect(humanSize(3072)).toBe("3.0 KB");
    });

    it("formats megabytes", () => {
      expect(humanSize(1048576)).toBe("1.0 MB");
    });

    it("formats gigabytes", () => {
      expect(humanSize(1073741824)).toBe("1.0 GB");
    });
  });

  describe("formatTime", () => {
    it("formats zero", () => {
      expect(formatTime(0)).toBe("00:00:00");
    });

    it("formats seconds", () => {
      expect(formatTime(45)).toBe("00:00:45");
    });

    it("formats minutes and seconds", () => {
      expect(formatTime(125)).toBe("00:02:05");
    });

    it("formats hours", () => {
      expect(formatTime(3661)).toBe("01:01:01");
    });

    it("handles negative values", () => {
      expect(formatTime(-1)).toBe("00:00:00");
    });

    it("handles non-finite values", () => {
      expect(formatTime(NaN)).toBe("00:00:00");
      expect(formatTime(Infinity)).toBe("00:00:00");
    });
  });

  describe("formatTimeExact", () => {
    it("formats with milliseconds", () => {
      expect(formatTimeExact(1.234)).toBe("00:00:01.234");
    });

    it("formats zero", () => {
      expect(formatTimeExact(0)).toBe("00:00:00.000");
    });

    it("handles negative values", () => {
      expect(formatTimeExact(-5)).toBe("00:00:00.000");
    });

    it("handles non-finite values", () => {
      expect(formatTimeExact(NaN)).toBe("00:00:00.000");
    });
  });

  describe("formatElapsed", () => {
    it("formats seconds", () => {
      expect(formatElapsed(32000)).toBe("32.000s");
    });

    it("formats minutes and seconds", () => {
      expect(formatElapsed(90000)).toBe("1m 30s");
    });

    it("formats hours", () => {
      expect(formatElapsed(3661000)).toBe("1h 1m 1s");
    });

    it("handles negative values", () => {
      expect(formatElapsed(-100)).toBe("0s");
    });

    it("handles non-finite values", () => {
      expect(formatElapsed(NaN)).toBe("0s");
    });
  });

  describe("makeId", () => {
    it("returns a valid UUID string", () => {
      const id = makeId();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(10);
    });

    it("generates unique IDs", () => {
      const ids = new Set([makeId(), makeId(), makeId()]);
      expect(ids.size).toBe(3);
    });
  });

  describe("makeUniqueName", () => {
    it("returns original name when no collision", () => {
      expect(makeUniqueName("file.mp4", new Set())).toBe("file.mp4");
      expect(makeUniqueName("file.mp4", new Set(["other.mp4"]))).toBe(
        "file.mp4",
      );
    });

    it("appends _1 on collision", () => {
      expect(makeUniqueName("file.mp4", new Set(["file.mp4"]))).toBe(
        "file_1.mp4",
      );
    });

    it("increments suffix on multiple collisions", () => {
      expect(
        makeUniqueName("file.mp4", new Set(["file.mp4", "file_1.mp4"])),
      ).toBe("file_2.mp4");
    });

    it("handles files without extensions", () => {
      expect(makeUniqueName("file", new Set(["file"]))).toBe("file_1");
    });

    it("handles files with multiple dots", () => {
      expect(
        makeUniqueName("my.video.file.mp4", new Set(["my.video.file.mp4"])),
      ).toBe("my.video.file_1.mp4");
    });
  });

  describe("hasUsableMetadata", () => {
    const validMeta: VideoMetadata = {
      duration: 100,
      width: 1920,
      height: 1080,
      videoBitrate: 5000,
    };

    it("returns true for valid metadata", () => {
      expect(hasUsableMetadata(validMeta)).toBe(true);
    });

    it("returns false for undefined", () => {
      expect(hasUsableMetadata(undefined)).toBe(false);
    });

    it("returns false for zero duration", () => {
      expect(hasUsableMetadata({ ...validMeta, duration: 0 })).toBe(false);
    });

    it("returns false for zero width", () => {
      expect(hasUsableMetadata({ ...validMeta, width: 0 })).toBe(false);
    });

    it("returns false for zero height", () => {
      expect(hasUsableMetadata({ ...validMeta, height: 0 })).toBe(false);
    });
  });

  describe("hexToRgba", () => {
    it("converts full hex", () => {
      expect(hexToRgba("#ff0000")).toBe("rgba(255, 0, 0, 1)");
      expect(hexToRgba("#00ff00")).toBe("rgba(0, 255, 0, 1)");
      expect(hexToRgba("#0000ff")).toBe("rgba(0, 0, 255, 1)");
    });

    it("converts shorthand hex", () => {
      expect(hexToRgba("#f00")).toBe("rgba(255, 0, 0, 1)");
      expect(hexToRgba("#0f0")).toBe("rgba(0, 255, 0, 1)");
    });

    it("handles hex without #", () => {
      expect(hexToRgba("ff0000")).toBe("rgba(255, 0, 0, 1)");
    });

    it("supports custom alpha", () => {
      expect(hexToRgba("#ff0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
      expect(hexToRgba("#ff0000", 0)).toBe("rgba(255, 0, 0, 0)");
    });

    it("throws for invalid alpha", () => {
      expect(() => hexToRgba("#ff0000", -0.1)).toThrow("Alpha must be between");
      expect(() => hexToRgba("#ff0000", 1.1)).toThrow("Alpha must be between");
    });

    it("throws for invalid hex", () => {
      expect(() => hexToRgba("xyz")).toThrow("Invalid hex color");
      expect(() => hexToRgba("#gggggg")).toThrow("Invalid hex color");
      expect(() => hexToRgba("")).toThrow("Invalid hex color");
    });
  });

  describe("buildBbcodeTitle", () => {
    const defaultMetadata: VideoMetadata = {
      duration: 100,
      width: 1920,
      height: 1080,
      videoBitrate: 5000,
    };

    const makeItem = (overrides: Partial<TaskItem> = {}): TaskItem => ({
      id: "test-id",
      status: "done",
      file: new File(["content"], "video.mp4", { type: "video/mp4" }),
      metadata: defaultMetadata,
      ...overrides,
    });

    it("returns title-only when metadata is missing", () => {
      const item = makeItem({ metadata: undefined });
      expect(buildBbcodeTitle(item)).toBe("[b]video[/b]");
    });

    it("returns BBCode with filename and resolution", () => {
      const item = makeItem();
      expect(buildBbcodeTitle(item)).toBe(
        "[b]video [COLOR=rgb(184, 49, 47)]1080p[/COLOR][/b]",
      );
    });

    it("ignores outputName and uses original file.name", () => {
      const item = makeItem({ outputName: "custom_output.webm" });
      // Should use file.name ("video.mp4"), not outputName ("custom_output.webm")
      expect(buildBbcodeTitle(item)).toBe(
        "[b]video [COLOR=rgb(184, 49, 47)]1080p[/COLOR][/b]",
      );
    });

    it("strips only the last extension (handles multiple dots)", () => {
      const item = makeItem({
        file: new File(["content"], "my.video.file.mp4", { type: "video/mp4" }),
      });
      expect(buildBbcodeTitle(item)).toBe(
        "[b]my.video.file [COLOR=rgb(184, 49, 47)]1080p[/COLOR][/b]",
      );
    });

    it("handles 4K metadata (height >= 2160)", () => {
      const item = makeItem({
        metadata: {
          duration: 60,
          width: 3840,
          height: 2160,
          videoBitrate: 20000,
        },
      });
      expect(buildBbcodeTitle(item)).toBe(
        "[b]video [COLOR=rgb(85, 57, 130)]2160p[/COLOR][/b]",
      );
    });

    it("handles portrait video (uses min of width/height)", () => {
      const item = makeItem({
        metadata: {
          duration: 30,
          width: 1080,
          height: 1920,
          videoBitrate: 8000,
        },
      });
      expect(buildBbcodeTitle(item)).toBe(
        "[b]video [COLOR=rgb(184, 49, 47)]1080p[/COLOR][/b]",
      );
    });

    it("falls back to file.name when outputName is not set", () => {
      const item = makeItem({
        file: new File(["content"], "fallback_name.mov", {
          type: "video/quicktime",
        }),
      });
      expect(buildBbcodeTitle(item)).toBe(
        "[b]fallback_name [COLOR=rgb(184, 49, 47)]1080p[/COLOR][/b]",
      );
    });
  });

  describe("normalizeHex", () => {
    it("normalizes full hex with #", () => {
      expect(normalizeHex("#ff0000", "#000000")).toBe("#ff0000");
      expect(normalizeHex("#00ff00", "#000000")).toBe("#00ff00");
      expect(normalizeHex("#0000ff", "#000000")).toBe("#0000ff");
    });

    it("normalizes full hex without #", () => {
      expect(normalizeHex("ff0000", "#000000")).toBe("#ff0000");
    });

    it("expands shorthand hex", () => {
      expect(normalizeHex("#f00", "#000000")).toBe("#ff0000");
      expect(normalizeHex("#0f0", "#000000")).toBe("#00ff00");
      expect(normalizeHex("000", "#000000")).toBe("#000000");
    });

    it("normalizes to lowercase", () => {
      expect(normalizeHex("#FF00AA", "#000000")).toBe("#ff00aa");
      expect(normalizeHex("#F0A", "#000000")).toBe("#ff00aa");
    });

    it("strips alpha from 8-char hex", () => {
      expect(normalizeHex("#ff000080", "#000000")).toBe("#ff0000");
      expect(normalizeHex("ff0000ff", "#000000")).toBe("#ff0000");
    });

    it("returns fallback for non-string input", () => {
      expect(normalizeHex(123, "#abcdef")).toBe("#abcdef");
      expect(normalizeHex(null, "#abcdef")).toBe("#abcdef");
      expect(normalizeHex(undefined, "#abcdef")).toBe("#abcdef");
    });

    it("returns fallback for invalid hex", () => {
      expect(normalizeHex("#gggggg", "#fallback")).toBe("#fallback");
      expect(normalizeHex("#12", "#fallback")).toBe("#fallback");
      expect(normalizeHex("", "#fallback")).toBe("#fallback");
      expect(normalizeHex("xyz", "#fallback")).toBe("#fallback");
    });
  });

  describe("logging functions", () => {
    beforeEach(() => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("log does not throw", () => {
      expect(() => log("test")).not.toThrow();
    });

    it("warn does not throw", () => {
      expect(() => warn("test")).not.toThrow();
    });

    it("errlog does not throw", () => {
      expect(() => errlog("test")).not.toThrow();
    });
  });
});
