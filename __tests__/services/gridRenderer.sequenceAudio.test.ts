/**
 * Tests for the "Video with audio" sequence mode pipeline.
 *
 * Validates that renderSequence dispatches to renderSequenceWithAudio
 * when sequenceMode is "video_with_audio", and that the FFmpeg
 * per-segment cut + concat pipeline executes correctly with proper
 * error reporting and progress reporting.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  GridRenderer,
  createGridRenderer,
} from "@/services/gridRenderer.service";
import type {
  IFFmpegService,
  SequenceRenderOptions,
  SequenceSegmentCallback,
  EncodeProgressCallback,
  WarningCallback,
} from "@/types/service";
import {
  createMockFFmpegService,
  createTestMeta,
} from "../helpers/mockServices";
import { buildSequenceOptions } from "@/gridOptions";
import { DEFAULTS } from "@/constants";

// ---------------------------------------------------------------------------
// Helper: create a SequenceRenderOptions for video_with_audio
// ---------------------------------------------------------------------------
function createAudioSequenceOpts(
  overrides?: Partial<SequenceRenderOptions>,
): SequenceRenderOptions {
  return {
    width: 1280,
    cols: 1,
    rows: 1,
    spacing: 0,
    tcPosition: "disabled",
    header: false,
    bgColor: "#000000",
    textColor: "#ffffff",
    vrMode: "disabled",
    fontFamily: "sans-serif",
    tcFontSizeAuto: true,
    tcFontSize: 14,
    headerFontSizeAuto: true,
    headerFontSize: 14,
    gridTemplate: undefined,
    segments: 4,
    customTimestamps: [],
    animDuration: 5,
    animFps: 30,
    format: "mp4",
    webpQuality: 80,
    webpMethod: 4,
    sequenceMode: "video_with_audio",
    duration: 120,
    ...overrides,
  } as SequenceRenderOptions;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("GridRenderer - video_with_audio sequence mode", () => {
  let mockFfmpeg: IFFmpegService;
  let renderer: GridRenderer;
  let execCalls: string[][];
  let writeDataCalls: Array<{ path: string; data: Uint8Array }>;
  let readDataCalls: string[];
  let deleteFileCalls: string[];

  beforeEach(() => {
    execCalls = [];
    writeDataCalls = [];
    readDataCalls = [];
    deleteFileCalls = [];

    mockFfmpeg = createMockFFmpegService({
      exec: async (args: string[]) => {
        execCalls.push(args);
      },
      writeData: async (path: string, data: Uint8Array) => {
        writeDataCalls.push({ path, data });
      },
      readData: async (path: string) => {
        readDataCalls.push(path);
        /*
         * Return a mock MP4 header large enough to pass the segment
         * validation check (>100 bytes). The first 8 bytes are a valid
         * ftyp box header; the rest is padding to simulate a real file.
         */
        const buf = new Uint8Array(256);
        buf.set([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70], 0);
        return buf;
      },
      deleteFile: async (path: string) => {
        deleteFileCalls.push(path);
      },
    });

    renderer = createGridRenderer(mockFfmpeg) as GridRenderer;
  });

  describe("buildSequenceOptions", () => {
    it("passes sequenceMode through correctly", () => {
      const meta = createTestMeta();
      const item = {
        id: "test",
        file: new File([""], "test.mp4"),
        status: "queued" as const,
        metadata: meta,
        customTimestamps: [],
        timestampMode: "auto" as const,
        ffmpegLogs: [],
        uploads: {},
      };
      const opts = {
        ...DEFAULTS,
        sequenceMode: "video_with_audio" as const,
      };

      const seqOpts = buildSequenceOptions(opts, item, meta);
      expect(seqOpts.sequenceMode).toBe("video_with_audio");
    });

    it("defaults to 'video' when not specified", () => {
      const meta = createTestMeta();
      const item = {
        id: "test",
        file: new File([""], "test.mp4"),
        status: "queued" as const,
        metadata: meta,
        customTimestamps: [],
        timestampMode: "auto" as const,
        ffmpegLogs: [],
        uploads: {},
      };
      const opts = { ...DEFAULTS };

      const seqOpts = buildSequenceOptions(opts, item, meta);
      expect(seqOpts.sequenceMode).toBe(DEFAULTS.sequenceMode);
    });
  });

  describe("renderSequence dispatches to renderSequenceWithAudio", () => {
    it("calls renderSequenceWithAudio when sequenceMode is video_with_audio", async () => {
      const file = new File([""], "test.mp4", { type: "video/mp4" });
      const meta = createTestMeta();
      const opts = createAudioSequenceOpts();
      const isCancelled = () => false;
      const onSegmentDone = vi.fn<SequenceSegmentCallback>();
      const onEncodeProgress = vi.fn<EncodeProgressCallback>();
      const onWarning = vi.fn<WarningCallback>();

      const result = await renderer.renderSequence(
        file,
        meta,
        opts,
        isCancelled,
        onSegmentDone,
        onEncodeProgress,
        onWarning,
      );

      expect(result.outputName).toBe("test.mp4.mp4");
      /*
       * In video_with_audio mode, onSegmentDone must NOT be called because
       * it maps progress to 0-70% while onEncodeProgress maps to 70-100%.
       * Calling both causes the progress bar to jump forward then backward.
       * All progress for audio mode goes through onEncodeProgress only.
       */
      expect(onSegmentDone).toHaveBeenCalledTimes(0);
      expect(onEncodeProgress).toHaveBeenCalled();
    });

    it("reports segment progress via onEncodeProgress only", async () => {
      const file = new File([""], "test.mp4", { type: "video/mp4" });
      const meta = createTestMeta();
      const opts = createAudioSequenceOpts({ segments: 3 });
      const isCancelled = () => false;
      const onSegmentDone = vi.fn<SequenceSegmentCallback>();
      const onEncodeProgress = vi.fn<EncodeProgressCallback>();
      const onWarning = vi.fn<WarningCallback>();

      await renderer.renderSequence(
        file,
        meta,
        opts,
        isCancelled,
        onSegmentDone,
        onEncodeProgress,
        onWarning,
      );

      /*
       * onSegmentDone must NOT be called in audio mode to avoid progress
       * conflicts. All progress goes through onEncodeProgress.
       */
      expect(onSegmentDone).toHaveBeenCalledTimes(0);

      /*
       * onEncodeProgress should report segment cut progress (0→0.5)
       * and merge progress (0.5→1.0). Verify the values are monotonically
       * non-decreasing and end at 1.0.
       */
      expect(onEncodeProgress).toHaveBeenCalled();
      const ratios = onEncodeProgress.mock.calls.map((c) => c[0].ratio);
      for (let i = 1; i < ratios.length; i++) {
        expect(ratios[i]).toBeGreaterThanOrEqual(ratios[i - 1]);
      }
      expect(ratios[ratios.length - 1]).toBe(1.0);
    });

    it("reports encode progress via onEncodeProgress", async () => {
      const file = new File([""], "test.mp4", { type: "video/mp4" });
      const meta = createTestMeta();
      const opts = createAudioSequenceOpts();
      const isCancelled = () => false;
      const onSegmentDone = vi.fn<SequenceSegmentCallback>();
      const onEncodeProgress = vi.fn<EncodeProgressCallback>();
      const onWarning = vi.fn<WarningCallback>();

      await renderer.renderSequence(
        file,
        meta,
        opts,
        isCancelled,
        onSegmentDone,
        onEncodeProgress,
        onWarning,
      );

      expect(onEncodeProgress).toHaveBeenCalled();
      // Final progress should be { ratio: 1.0, phase: "..." }
      const lastCall =
        onEncodeProgress.mock.calls[onEncodeProgress.mock.calls.length - 1];
      expect(lastCall[0].ratio).toBe(1.0);
    });
  });

  describe("FFmpeg per-segment cut commands", () => {
    it("executes one cut per segment plus one concat merge", async () => {
      const file = new File([""], "test.mp4", { type: "video/mp4" });
      const meta = createTestMeta({ duration: 120 });
      const opts = createAudioSequenceOpts({ segments: 3 });
      const isCancelled = () => false;
      const onSegmentDone = vi.fn<SequenceSegmentCallback>();
      const onEncodeProgress = vi.fn<EncodeProgressCallback>();
      const onWarning = vi.fn<WarningCallback>();

      await renderer.renderSequence(
        file,
        meta,
        opts,
        isCancelled,
        onSegmentDone,
        onEncodeProgress,
        onWarning,
      );

      // 3 segment cuts + 1 concat merge = 4 exec calls
      expect(execCalls.length).toBe(4);

      // First 3 calls are segment cuts
      for (let i = 0; i < 3; i++) {
        const call = execCalls[i];
        expect(call).toContain("-ss");
        expect(call).toContain("-i");
        expect(call).toContain("input.mp4");
        expect(call).toContain("-t");
        expect(call).toContain("-vf");
        // -vf value is at the index after -vf
        const vfIdx = call.indexOf("-vf");
        expect(call[vfIdx + 1]).toContain("scale=");
        expect(call).toContain("-c:v");
        expect(call).toContain("libx264");
        expect(call).toContain("-c:a");
        expect(call).toContain("aac");
        expect(call).toContain(`seg_${String(i).padStart(3, "0")}.mp4`);
      }

      // Last call is concat merge
      const mergeCall = execCalls[3];
      expect(mergeCall).toContain("-f");
      expect(mergeCall).toContain("concat");
      expect(mergeCall).toContain("-c");
      expect(mergeCall).toContain("copy");
      expect(mergeCall).toContain("sequence_output.mp4");
    });

    it("scales output to match opts.width", async () => {
      const file = new File([""], "test.mp4", { type: "video/mp4" });
      const meta = createTestMeta({ duration: 120, width: 3840, height: 2160 });
      const opts = createAudioSequenceOpts({ width: 640 });
      const isCancelled = () => false;
      const onSegmentDone = vi.fn<SequenceSegmentCallback>();
      const onEncodeProgress = vi.fn<EncodeProgressCallback>();
      const onWarning = vi.fn<WarningCallback>();

      await renderer.renderSequence(
        file,
        meta,
        opts,
        isCancelled,
        onSegmentDone,
        onEncodeProgress,
        onWarning,
      );

      // 3840x2160 scaled to 640 wide = 360 high
      for (let i = 0; i < 5; i++) {
        const call = execCalls[i];
        const vfIdx = call.indexOf("-vf");
        if (vfIdx !== -1) {
          expect(call[vfIdx + 1]).toContain("scale=640:360");
        }
      }
    });

    it("uses -avoid_negative_ts make_zero for concat compatibility", async () => {
      const file = new File([""], "test.mp4", { type: "video/mp4" });
      const meta = createTestMeta({ duration: 120 });
      const opts = createAudioSequenceOpts({ segments: 2 });
      const isCancelled = () => false;
      const onSegmentDone = vi.fn<SequenceSegmentCallback>();
      const onEncodeProgress = vi.fn<EncodeProgressCallback>();
      const onWarning = vi.fn<WarningCallback>();

      await renderer.renderSequence(
        file,
        meta,
        opts,
        isCancelled,
        onSegmentDone,
        onEncodeProgress,
        onWarning,
      );

      for (let i = 0; i < 2; i++) {
        expect(execCalls[i]).toContain("-avoid_negative_ts");
        expect(execCalls[i]).toContain("make_zero");
      }
    });
  });

  describe("Error handling", () => {
    it("reports warning when encode fails", async () => {
      const failingFfmpeg = createMockFFmpegService({
        exec: async () => {
          throw new Error("Simulated encode failure");
        },
        writeData: async () => {},
        readData: async () => new Uint8Array(),
        deleteFile: async () => {},
      });

      const failingRenderer = createGridRenderer(failingFfmpeg) as GridRenderer;
      const file = new File([""], "test.mp4", { type: "video/mp4" });
      const meta = createTestMeta();
      const opts = createAudioSequenceOpts();
      const isCancelled = () => false;
      const onSegmentDone = vi.fn<SequenceSegmentCallback>();
      const onEncodeProgress = vi.fn<EncodeProgressCallback>();
      const onWarning = vi.fn<WarningCallback>();

      await expect(
        failingRenderer.renderSequence(
          file,
          meta,
          opts,
          isCancelled,
          onSegmentDone,
          onEncodeProgress,
          onWarning,
        ),
      ).rejects.toThrow(/FFmpeg segment cut failed/);

      expect(onWarning).toHaveBeenCalledWith(
        expect.stringMatching(/Segment 1 cut failed/),
      );
    });

    it("cleans up output file on success", async () => {
      const file = new File([""], "test.mp4", { type: "video/mp4" });
      const meta = createTestMeta();
      const opts = createAudioSequenceOpts();
      const isCancelled = () => false;
      const onSegmentDone = vi.fn<SequenceSegmentCallback>();
      const onEncodeProgress = vi.fn<EncodeProgressCallback>();
      const onWarning = vi.fn<WarningCallback>();

      await renderer.renderSequence(
        file,
        meta,
        opts,
        isCancelled,
        onSegmentDone,
        onEncodeProgress,
        onWarning,
      );

      // Output file should be deleted after reading
      expect(deleteFileCalls).toContain("sequence_output.mp4");
    });

    it("respects cancellation", async () => {
      let cancelled = false;
      const cancelFfmpeg = createMockFFmpegService({
        exec: async (args: string[]) => {
          // Cancel on the second segment cut
          if (args.includes("seg_001.mp4")) {
            cancelled = true;
          }
        },
        writeData: async () => {},
        readData: async () => {
          /* Return valid-sized buffer so validation passes */
          return new Uint8Array(256);
        },
        deleteFile: async () => {},
      });

      const cancelRenderer = createGridRenderer(cancelFfmpeg) as GridRenderer;
      const file = new File([""], "test.mp4", { type: "video/mp4" });
      const meta = createTestMeta();
      const opts = createAudioSequenceOpts();
      const isCancelled = () => cancelled;
      const onSegmentDone = vi.fn<SequenceSegmentCallback>();
      const onEncodeProgress = vi.fn<EncodeProgressCallback>();
      const onWarning = vi.fn<WarningCallback>();

      await expect(
        cancelRenderer.renderSequence(
          file,
          meta,
          opts,
          isCancelled,
          onSegmentDone,
          onEncodeProgress,
          onWarning,
        ),
      ).rejects.toThrow(/cancelled/);
    });
  });

  describe("Custom timestamps", () => {
    it("uses custom timestamps in segment cut -ss values", async () => {
      const file = new File([""], "test.mp4", { type: "video/mp4" });
      const meta = createTestMeta({ duration: 120 });
      const opts = createAudioSequenceOpts({
        customTimestamps: [10, 50, 90],
      });
      const isCancelled = () => false;
      const onSegmentDone = vi.fn<SequenceSegmentCallback>();
      const onEncodeProgress = vi.fn<EncodeProgressCallback>();
      const onWarning = vi.fn<WarningCallback>();

      await renderer.renderSequence(
        file,
        meta,
        opts,
        isCancelled,
        onSegmentDone,
        onEncodeProgress,
        onWarning,
      );

      // 3 segment cuts + 1 concat = 4 exec calls
      expect(execCalls.length).toBe(4);

      // First cut should seek to timestamp 10
      expect(execCalls[0]).toContain("-ss");
      const ssIdx = execCalls[0].indexOf("-ss");
      expect(execCalls[0][ssIdx + 1]).toBe("10");

      // Second cut should seek to timestamp 50
      const ssIdx2 = execCalls[1].indexOf("-ss");
      expect(execCalls[1][ssIdx2 + 1]).toBe("50");

      // Third cut should seek to timestamp 90
      const ssIdx3 = execCalls[2].indexOf("-ss");
      expect(execCalls[2][ssIdx3 + 1]).toBe("90");
    });

    it("reports correct segment count for custom timestamps via onEncodeProgress", async () => {
      const file = new File([""], "test.mp4", { type: "video/mp4" });
      const meta = createTestMeta({ duration: 120 });
      const opts = createAudioSequenceOpts({
        customTimestamps: [5, 15, 25, 35, 45],
      });
      const isCancelled = () => false;
      const onSegmentDone = vi.fn<SequenceSegmentCallback>();
      const onEncodeProgress = vi.fn<EncodeProgressCallback>();
      const onWarning = vi.fn<WarningCallback>();

      await renderer.renderSequence(
        file,
        meta,
        opts,
        isCancelled,
        onSegmentDone,
        onEncodeProgress,
        onWarning,
      );

      /*
       * onSegmentDone must NOT be called in audio mode.
       * Verify that onEncodeProgress was called and ends at ratio 1.0.
       */
      expect(onSegmentDone).toHaveBeenCalledTimes(0);
      expect(onEncodeProgress).toHaveBeenCalled();
      const lastCall =
        onEncodeProgress.mock.calls[onEncodeProgress.mock.calls.length - 1];
      expect(lastCall[0].ratio).toBe(1.0);
    });
  });
});
