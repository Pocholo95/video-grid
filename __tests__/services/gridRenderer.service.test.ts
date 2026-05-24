/**
 * Tests for the GridRenderer service.
 *
 * Tests the factory function, interface contract, and lifecycle methods.
 * Heavy rendering logic (canvas, video decoder, FFmpeg WASM) is exercised
 * indirectly via the batch processor and integration tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  GridRenderer,
  createGridRenderer,
} from "@/services/gridRenderer.service";
import type { IFFmpegService } from "@/types/service";
import { createMockFFmpegService } from "../helpers/mockServices";

describe("GridRenderer", () => {
  let mockFfmpeg: IFFmpegService;

  beforeEach(() => {
    mockFfmpeg = createMockFFmpegService();
  });

  describe("constructor", () => {
    it("accepts an IFFmpegService instance", () => {
      const renderer = new GridRenderer(mockFfmpeg);
      expect(renderer).toBeInstanceOf(GridRenderer);
    });
  });

  describe("createGridRenderer factory", () => {
    it("returns a GridRenderer instance", () => {
      const renderer = createGridRenderer(mockFfmpeg);
      expect(renderer).toBeInstanceOf(GridRenderer);
    });

    it("returned instance has renderStaticGrid method", () => {
      const renderer = createGridRenderer(mockFfmpeg);
      expect(typeof renderer.renderStaticGrid).toBe("function");
    });

    it("returned instance has renderAnimatedGrid method", () => {
      const renderer = createGridRenderer(mockFfmpeg);
      expect(typeof renderer.renderAnimatedGrid).toBe("function");
    });

    it("returned instance has destroy method", () => {
      const renderer = createGridRenderer(mockFfmpeg);
      expect(typeof renderer.destroy).toBe("function");
    });
  });

  describe("destroy", () => {
    it("clears the internal file cache", async () => {
      const renderer = createGridRenderer(mockFfmpeg);
      await renderer.destroy();
      // No error means success; cache is private so we verify via no-throw
    });

    it("is idempotent", async () => {
      const renderer = createGridRenderer(mockFfmpeg);
      await renderer.destroy();
      await renderer.destroy();
    });
  });
});
