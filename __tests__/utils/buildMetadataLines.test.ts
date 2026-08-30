import { describe, it, expect } from "vitest";
import { buildMetadataLines } from "@/utils";
import type { VideoMetadata } from "@/types";

describe("buildMetadataLines", () => {
  const baseMeta: VideoMetadata = {
    duration: 125,
    width: 1920,
    height: 1080,
    fps: 30,
    codec: "h264",
    videoBitrate: 5_000_000,
  };

  describe("basic lines", () => {
    it("includes filename when provided", () => {
      const lines = buildMetadataLines(baseMeta, "test.mp4");
      expect(lines).toContain("Filename: test.mp4");
    });

    it("omits filename when not provided", () => {
      const lines = buildMetadataLines(baseMeta);
      expect(lines.every((l) => !l.startsWith("Filename:"))).toBe(true);
    });

    it("includes size when fileSize is provided", () => {
      const lines = buildMetadataLines(baseMeta, "test.mp4", 10_485_760);
      expect(lines).toContain("Size: 10.0 MB");
    });

    it("omits size when fileSize is 0 or undefined", () => {
      expect(
        buildMetadataLines(baseMeta, "test.mp4", 0).every(
          (l) => !l.startsWith("Size:"),
        ),
      ).toBe(true);
      expect(
        buildMetadataLines(baseMeta, "test.mp4").every(
          (l) => !l.startsWith("Size:"),
        ),
      ).toBe(true);
    });

    it("includes resolution", () => {
      const lines = buildMetadataLines(baseMeta);
      expect(lines).toContain("Resolution: 1920×1080");
    });

    it("shows Unknown resolution when dimensions are zero", () => {
      const meta = { ...baseMeta, width: 0, height: 0 };
      const lines = buildMetadataLines(meta);
      expect(lines).toContain("Resolution: Unknown");
    });

    it("includes duration", () => {
      const lines = buildMetadataLines(baseMeta);
      expect(lines).toContain("Duration: 00:02:05");
    });
  });

  describe("video bitrate", () => {
    it("formats video bitrate in Mbps for high values", () => {
      const lines = buildMetadataLines(baseMeta);
      expect(lines).toContain("Video Bitrate: 5.00 Mbps @ 30fps - Codec: h264");
    });

    it("formats video bitrate in kbps for low values", () => {
      const meta = { ...baseMeta, videoBitrate: 500_000 };
      const lines = buildMetadataLines(meta);
      expect(lines).toContain("Video Bitrate: 500 kbps @ 30fps - Codec: h264");
    });

    it("shows Unknown video bitrate when zero", () => {
      const meta = { ...baseMeta, videoBitrate: 0 };
      const lines = buildMetadataLines(meta);
      expect(lines).toContain("Video Bitrate: Unknown @ 30fps - Codec: h264");
    });

    it("includes video track count suffix when >1", () => {
      const meta = { ...baseMeta, videoTracks: 2 };
      const lines = buildMetadataLines(meta);
      expect(lines).toContain(
        "Video Bitrate: 5.00 Mbps @ 30fps - Codec: h264 (2 tracks)",
      );
    });

    it("omits video track count suffix when 1 or undefined", () => {
      const lines = buildMetadataLines(baseMeta);
      expect(lines[0]).not.toMatch(/\(\d+ tracks\)/);
    });

    it("shows Unknown fps when not provided", () => {
      const meta = { ...baseMeta, fps: undefined };
      const lines = buildMetadataLines(meta);
      expect(lines).toContain(
        "Video Bitrate: 5.00 Mbps @ Unknownfps - Codec: h264",
      );
    });

    it("shows Unknown codec when not provided", () => {
      const meta = { ...baseMeta, codec: undefined };
      const lines = buildMetadataLines(meta);
      expect(lines).toContain(
        "Video Bitrate: 5.00 Mbps @ 30fps - Codec: Unknown",
      );
    });
  });

  describe("audio bitrate", () => {
    it("includes audio bitrate line when audioBitrate is provided", () => {
      const meta: VideoMetadata = {
        ...baseMeta,
        audioBitrate: 128_000,
        audioCodec: "aac",
      };
      const lines = buildMetadataLines(meta);
      expect(lines).toContain("Audio Bitrate: 128 kbps - Codec: aac");
    });

    it("omits audio bitrate line when audioBitrate is not provided", () => {
      const lines = buildMetadataLines(baseMeta);
      expect(lines.every((l) => !l.startsWith("Audio Bitrate:"))).toBe(true);
    });

    it("formats audio bitrate in Mbps for high values", () => {
      const meta: VideoMetadata = {
        ...baseMeta,
        audioBitrate: 2_000_000,
        audioCodec: "flac",
      };
      const lines = buildMetadataLines(meta);
      expect(lines).toContain("Audio Bitrate: 2.00 Mbps - Codec: flac");
    });

    it("includes audio track count suffix when >1", () => {
      const meta: VideoMetadata = {
        ...baseMeta,
        audioBitrate: 128_000,
        audioCodec: "aac",
        audioTracks: 3,
      };
      const lines = buildMetadataLines(meta);
      expect(lines).toContain(
        "Audio Bitrate: 128 kbps - Codec: aac (3 tracks)",
      );
    });

    it("omits audio track count suffix when 1 or undefined", () => {
      const meta: VideoMetadata = {
        ...baseMeta,
        audioBitrate: 128_000,
        audioCodec: "aac",
      };
      const lines = buildMetadataLines(meta);
      const audioLine = lines.find((l) => l.startsWith("Audio Bitrate:"));
      expect(audioLine).not.toMatch(/\(\d+ tracks\)/);
    });

    it("shows Unknown audio codec when not provided", () => {
      const meta: VideoMetadata = {
        ...baseMeta,
        audioBitrate: 128_000,
      };
      const lines = buildMetadataLines(meta);
      expect(lines).toContain("Audio Bitrate: 128 kbps - Codec: Unknown");
    });
  });

  describe("complete output", () => {
    it("produces correct line order with all fields", () => {
      const meta: VideoMetadata = {
        duration: 3661,
        width: 3840,
        height: 2160,
        fps: 60,
        codec: "h265",
        videoBitrate: 20_000_000,
        audioBitrate: 384_000,
        audioCodec: "aac",
      };
      const lines = buildMetadataLines(meta, "4k_video.mp4", 2_147_483_648);

      expect(lines).toEqual([
        "Filename: 4k_video.mp4",
        "Size: 2.0 GB",
        "Resolution: 3840×2160",
        "Duration: 01:01:01",
        "Video Bitrate: 20.00 Mbps @ 60fps - Codec: h265",
        "Audio Bitrate: 384 kbps - Codec: aac",
      ]);
    });

    it("produces minimal output with only required fields", () => {
      const meta: VideoMetadata = {
        duration: 60,
        width: 1280,
        height: 720,
        videoBitrate: 0,
      };
      const lines = buildMetadataLines(meta);

      expect(lines).toEqual([
        "Resolution: 1280×720",
        "Duration: 00:01:00",
        "Video Bitrate: Unknown @ Unknownfps - Codec: Unknown",
      ]);
    });
  });
});
