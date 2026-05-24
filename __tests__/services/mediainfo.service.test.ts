/**
 * Tests for MediaInfo service.
 *
 * Because MediaInfo depends on a WASM module that cannot be loaded in the
 * test environment, we mock the mediaInfoFactory and verify the service
 * contract (init, analyze, destroy).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { VideoMetadata } from "@/types";

// Mock the entire mediaInfo.js module
vi.mock("mediainfo.js", () => {
  return {
    default: vi.fn().mockResolvedValue({
      analyzeData: vi.fn(),
      close: vi.fn(),
    }),
  };
});

// Import after mock
import { MediaInfoService } from "@/services/mediainfo.service";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function createMockFile(): File {
  return new File([""], "test.mp4", { type: "video/mp4" });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("MediaInfoService", () => {
  let service: MediaInfoService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new MediaInfoService();
  });

  describe("init", () => {
    it("initializes without throwing", async () => {
      await expect(service.init()).resolves.not.toThrow();
    });
  });

  describe("analyze", () => {
    it("returns zeroed metadata on analysis failure", async () => {
      const file = createMockFile();
      const result = await service.analyze(file);
      expect(result).toMatchObject({
        duration: 0,
        width: 0,
        height: 0,
        bitrate: 0,
      });
    });

    it("calls onProgress callback", async () => {
      const progress: { pct: number; status: string }[] = [];
      const onProgress = vi.fn((pct, status) => {
        progress.push({ pct, status });
      });

      const file = createMockFile();
      await service.analyze(file, onProgress);

      expect(onProgress).toHaveBeenCalled();
      expect(progress.length).toBeGreaterThan(0);
    });

    it("returns VideoMetadata shape", async () => {
      const file = createMockFile();
      const result: VideoMetadata = await service.analyze(file);
      expect(result).toHaveProperty("duration");
      expect(result).toHaveProperty("width");
      expect(result).toHaveProperty("height");
      expect(result).toHaveProperty("bitrate");
    });
  });

  describe("destroy", () => {
    it("releases resources without throwing", () => {
      expect(() => service.destroy()).not.toThrow();
    });
  });
});
