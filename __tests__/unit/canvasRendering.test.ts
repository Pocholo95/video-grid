/**
 * Tests for canvas rendering functions in gridUtils.
 *
 * Mocks CanvasRenderingContext2D so that createHeaderCanvas,
 * drawTimecodeOverlay, and drawErrorPlaceholder can be exercised
 * without a real browser canvas.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createHeaderCanvas,
  drawTimecodeOverlay,
  drawErrorPlaceholder,
} from "@/gridUtils";
import { createTestMeta } from "../helpers/mockServices";

/* ------------------------------------------------------------------ */
/*  CanvasRenderingContext2D mock                                       */
/* ------------------------------------------------------------------ */

function createMockContext() {
  const mockCtx = {
    fillStyle: "",
    fillRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    measureText: vi.fn((text: string) => ({
      width: (text?.length || 0) * 7,
    })),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(16 * 16 * 4).fill(255),
    })),
  };
  return mockCtx;
}

describe("canvas rendering", () => {
  const mockMeta = createTestMeta();

  describe("createHeaderCanvas", () => {
    let mockCtx: ReturnType<typeof createMockContext>;

    beforeEach(() => {
      vi.clearAllMocks();
      mockCtx = createMockContext();

      vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        if (tag !== "canvas") return document.createElement(tag);
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => mockCtx,
        } as unknown as HTMLCanvasElement;
        return canvas;
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("creates canvas with correct width", () => {
      const file = new File([""], "video.mp4", { type: "video/mp4" });
      createHeaderCanvas(
        file,
        mockMeta,
        "disabled",
        1920,
        "#000000",
        "#ffffff",
      );

      expect(mockCtx.fillRect).toHaveBeenCalled();
      const fillRectCall = mockCtx.fillRect.mock.calls[0];
      expect(fillRectCall[2]).toBe(1920);
    });

    it("renders filename in header", () => {
      const file = new File([""], "my_video.mp4", { type: "video/mp4" });
      createHeaderCanvas(
        file,
        mockMeta,
        "disabled",
        1920,
        "#000000",
        "#ffffff",
      );

      const fillTextCalls = mockCtx.fillText.mock.calls;
      const hasFilename = fillTextCalls.some((call: string[]) =>
        call[0]?.includes("my_video.mp4"),
      );
      expect(hasFilename).toBe(true);
    });

    it("renders VR info when vrMode is active", () => {
      const file = new File([""], "test.mp4", { type: "video/mp4" });
      createHeaderCanvas(
        file,
        mockMeta,
        "sbs-left",
        1920,
        "#000000",
        "#ffffff",
      );

      const fillTextCalls = mockCtx.fillText.mock.calls;
      const hasVrInfo = fillTextCalls.some((call: string[]) =>
        call[0]?.includes("SBS - Crop Left Eye"),
      );
      expect(hasVrInfo).toBe(true);
    });

    it("does not render VR info when disabled", () => {
      const file = new File([""], "test.mp4", { type: "video/mp4" });
      createHeaderCanvas(
        file,
        mockMeta,
        "disabled",
        1920,
        "#000000",
        "#ffffff",
      );

      const fillTextCalls = mockCtx.fillText.mock.calls;
      const hasVrInfo = fillTextCalls.some((call: string[]) =>
        call[0]?.includes("VR Video"),
      );
      expect(hasVrInfo).toBe(false);
    });

    it("renders filename even when very long without crashing", () => {
      const longName = "a".repeat(500) + ".mp4";
      const file = new File([""], longName, { type: "video/mp4" });

      expect(() => {
        createHeaderCanvas(
          file,
          mockMeta,
          "disabled",
          1920,
          "#000000",
          "#ffffff",
        );
      }).not.toThrow();

      expect(mockCtx.fillText).toHaveBeenCalled();
    });

    it("uses provided text color", () => {
      const file = new File([""], "test.mp4", { type: "video/mp4" });
      createHeaderCanvas(
        file,
        mockMeta,
        "disabled",
        1920,
        "#1a1a2e",
        "#e0e0e0",
      );

      expect(mockCtx.fillStyle).toBe("#e0e0e0");
    });
  });

  describe("drawTimecodeOverlay", () => {
    let mockCtx: ReturnType<typeof createMockContext>;

    beforeEach(() => {
      vi.clearAllMocks();
      mockCtx = createMockContext();
    });

    it("draws timecode at top-left position", () => {
      drawTimecodeOverlay(
        mockCtx as unknown as CanvasRenderingContext2D,
        45.5,
        0,
        0,
        320,
        180,
        1920,
        "top-left",
        "#000000",
        "#ffffff",
      );

      expect(mockCtx.fillText).toHaveBeenCalled();
    });

    it("draws timecode at bottom-right position", () => {
      drawTimecodeOverlay(
        mockCtx as unknown as CanvasRenderingContext2D,
        45.5,
        0,
        0,
        320,
        180,
        1920,
        "bottom-right",
        "#000000",
        "#ffffff",
      );

      expect(mockCtx.fillText).toHaveBeenCalled();
    });

    it("does not draw when position is disabled", () => {
      drawTimecodeOverlay(
        mockCtx as unknown as CanvasRenderingContext2D,
        45.5,
        0,
        0,
        320,
        180,
        1920,
        "disabled",
        "#000000",
        "#ffffff",
      );

      expect(mockCtx.fillText).not.toHaveBeenCalled();
      expect(mockCtx.fillRect).not.toHaveBeenCalled();
    });

    it("draws background rectangle before text", () => {
      drawTimecodeOverlay(
        mockCtx as unknown as CanvasRenderingContext2D,
        45.5,
        0,
        0,
        320,
        180,
        1920,
        "top-left",
        "#000000",
        "#ffffff",
      );

      expect(mockCtx.fillRect).toHaveBeenCalled();
    });

    it("resets textBaseline after drawing", () => {
      drawTimecodeOverlay(
        mockCtx as unknown as CanvasRenderingContext2D,
        45.5,
        0,
        0,
        320,
        180,
        1920,
        "top-left",
        "#000000",
        "#ffffff",
      );

      expect(mockCtx.textBaseline).toBe("alphabetic");
    });
  });

  describe("drawErrorPlaceholder", () => {
    let mockCtx: ReturnType<typeof createMockContext>;

    beforeEach(() => {
      vi.clearAllMocks();
      mockCtx = createMockContext();
    });

    it("fills background with provided color", () => {
      drawErrorPlaceholder(
        mockCtx as unknown as CanvasRenderingContext2D,
        0,
        0,
        320,
        180,
        "#000000",
      );

      expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 320, 180);
    });

    it("draws FAILED text centered in cell", () => {
      drawErrorPlaceholder(
        mockCtx as unknown as CanvasRenderingContext2D,
        10,
        20,
        320,
        180,
        "#000000",
      );

      expect(mockCtx.fillText).toHaveBeenCalledWith(
        "FAILED",
        10 + 320 / 2,
        20 + 180 / 2,
      );
    });

    it("resets text alignment and baseline after drawing", () => {
      drawErrorPlaceholder(
        mockCtx as unknown as CanvasRenderingContext2D,
        0,
        0,
        320,
        180,
        "#000000",
      );

      expect(mockCtx.textAlign).toBe("left");
      expect(mockCtx.textBaseline).toBe("alphabetic");
    });
  });
});
