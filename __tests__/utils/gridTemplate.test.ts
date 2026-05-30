import { describe, it, expect } from "vitest";
import {
  sortCellsReadingOrder,
  computeTemplatePixelRects,
  templateFromUniform,
  EDITOR_COLS,
} from "@/gridTemplate";
import type { GridCell, VideoMetadata } from "@/types";

describe("gridTemplate", () => {
  describe("EDITOR_COLS", () => {
    it("equals 60", () => {
      expect(EDITOR_COLS).toBe(60);
    });
  });

  describe("sortCellsReadingOrder", () => {
    it("sorts cells top-to-bottom, left-to-right", () => {
      const cells: GridCell[] = [
        { id: "a", x: 1, y: 0, w: 1, h: 1 },
        { id: "b", x: 0, y: 1, w: 1, h: 1 },
        { id: "c", x: 0, y: 0, w: 1, h: 1 },
      ];
      const sorted = sortCellsReadingOrder(cells);
      expect(sorted[0].id).toBe("c"); // x=0, y=0
      expect(sorted[1].id).toBe("a"); // x=1, y=0
      expect(sorted[2].id).toBe("b"); // x=0, y=1
    });

    it("does not mutate input", () => {
      const cells: GridCell[] = [
        { id: "a", x: 1, y: 0, w: 1, h: 1 },
        { id: "b", x: 0, y: 0, w: 1, h: 1 },
      ];
      sortCellsReadingOrder(cells);
      expect(cells[0].id).toBe("a");
    });
  });

  describe("templateFromUniform", () => {
    it("creates correct number of cells", () => {
      const template = templateFromUniform(3, 3);
      expect(template.cells.length).toBe(9);
    });

    it("sets cols to EDITOR_COLS", () => {
      const template = templateFromUniform(3, 3);
      expect(template.cols).toBe(EDITOR_COLS);
    });

    it("handles 1x1 grid", () => {
      const template = templateFromUniform(1, 1);
      expect(template.cells.length).toBe(1);
      expect(template.cells[0].w).toBe(EDITOR_COLS);
    });

    it("handles 2x2 grid", () => {
      const template = templateFromUniform(2, 2);
      expect(template.cells.length).toBe(4);
    });

    it("all cells have h=1", () => {
      const template = templateFromUniform(3, 3);
      expect(template.cells.every((c) => c.h === 1)).toBe(true);
    });

    it("cells in same row have same y", () => {
      const template = templateFromUniform(3, 2);
      const row0 = template.cells.filter((c) => c.y === 0);
      expect(row0.length).toBe(3);
    });

    it("cell widths sum to EDITOR_COLS per row", () => {
      const template = templateFromUniform(3, 2);
      const row0 = template.cells.filter((c) => c.y === 0);
      const rowWidth = row0.reduce((sum, c) => sum + c.w, 0);
      expect(rowWidth).toBe(EDITOR_COLS);
    });
  });

  describe("computeTemplatePixelRects", () => {
    const mockMeta: VideoMetadata = {
      duration: 100,
      width: 1920,
      height: 1080,
      bitrate: 5000,
    };

    it("returns rects for all cells", () => {
      const template = templateFromUniform(3, 3);
      const result = computeTemplatePixelRects(
        template,
        1920,
        4,
        mockMeta,
        "disabled",
        0,
      );
      expect(result.rects.length).toBe(9);
    });

    it("accounts for header height", () => {
      const template = templateFromUniform(3, 3);
      const result = computeTemplatePixelRects(
        template,
        1920,
        4,
        mockMeta,
        "disabled",
        50,
      );
      expect(result.rects[0].y).toBeGreaterThanOrEqual(50);
    });

    it("returns positive canvas dimensions", () => {
      const template = templateFromUniform(3, 3);
      const result = computeTemplatePixelRects(
        template,
        1920,
        4,
        mockMeta,
        "disabled",
        0,
      );
      expect(result.canvasWidth).toBeGreaterThan(0);
      expect(result.canvasHeight).toBeGreaterThan(0);
    });

    it("rects are in reading order", () => {
      const template = templateFromUniform(3, 3);
      const result = computeTemplatePixelRects(
        template,
        1920,
        4,
        mockMeta,
        "disabled",
        0,
      );
      for (let i = 1; i < result.rects.length; i++) {
        const prev = result.rects[i - 1];
        const curr = result.rects[i];
        if (curr.y === prev.y) {
          expect(curr.x).toBeGreaterThan(prev.x);
        } else {
          expect(curr.y).toBeGreaterThan(prev.y);
        }
      }
    });

    it("handles VR mode with different aspect ratio", () => {
      const template = templateFromUniform(3, 3);
      const normal = computeTemplatePixelRects(
        template,
        1920,
        4,
        mockMeta,
        "disabled",
        0,
      );
      const vr = computeTemplatePixelRects(
        template,
        1920,
        4,
        mockMeta,
        "sbs-left",
        0,
      );
      expect(vr.canvasHeight).not.toBe(normal.canvasHeight);
    });
  });
});
