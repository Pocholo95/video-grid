/**
 * Shared mock factories for service interfaces used across hook and service tests.
 */
import { DEFAULTS } from "@/constants";
import type {
  IFFmpegService,
  IMediaInfoService,
  IGridRenderer,
} from "@/types/service";
import type {
  AppSettings,
  SavedOptions,
  TaskItem,
  VideoMetadata,
} from "@/types";

/** Default mock video metadata - the single source of truth for test VideoMetadata */
export const defaultMockMeta: VideoMetadata = {
  duration: 120,
  width: 1920,
  height: 1080,
  videoBitrate: 5000,
  fps: 30,
  codec: "h264",
  videoTracks: 1,
  audioBitrate: 128000,
  audioCodec: "aac",
  audioTracks: 1,
};

/**
 * Create a SavedOptions object for tests.
 * Returns a deep clone of DEFAULTS merged with any overrides.
 */
export function createTestOpts(
  overrides?: Partial<SavedOptions>,
): SavedOptions {
  return { ...structuredClone(DEFAULTS), ...overrides };
}

/**
 * Create a VideoMetadata object for tests.
 * Returns defaultMockMeta merged with any overrides.
 */
export function createTestMeta(
  overrides?: Partial<VideoMetadata>,
): VideoMetadata {
  return { ...defaultMockMeta, ...overrides };
}

/**
 * Create a complete TaskItem for tests.
 */
export function createTestTaskItem(overrides?: Partial<TaskItem>): TaskItem {
  return {
    id: "test-task",
    file: new File([""], "test.mp4", { type: "video/mp4" }),
    status: "queued",
    metadata: createTestMeta(overrides?.metadata),
    customTimestamps: [],
    timestampMode: "auto",
    ffmpegLogs: [],
    uploads: {},
    ...overrides,
  };
}

/**
 * Create a default presets structure for tests.
 */
export function createTestPresets(
  overrides?: Partial<AppSettings["presets"]>,
): AppSettings["presets"] {
  return { entries: {}, lastUsed: null, ...overrides };
}

/**
 * Create a mock IFFmpegService with configurable behavior.
 */
export function createMockFFmpegService(
  overrides: Partial<IFFmpegService> = {},
): IFFmpegService {
  const onProgressCbs: Array<(data: { progress: number }) => void> = [];
  const taskLogs: Record<string, string[]> = {};
  let ready = true;

  return {
    init: async () => {},
    isReady: () => ready,
    exec: async () => {},
    writeData: async () => {},
    readData: async () => new Uint8Array(),
    listDir: async () => [],
    deleteFile: async () => {},
    destroy: async () => {
      ready = false;
    },
    reinit: async () => {
      ready = true;
    },
    onLog: () => {
      // no-op, callbacks tracked via taskLogs
    },
    onProgress: (cb) => {
      if (cb) onProgressCbs.push(cb);
    },
    offProgress: (cb) => {
      if (cb) {
        const idx = onProgressCbs.indexOf(cb);
        if (idx !== -1) onProgressCbs.splice(idx, 1);
      }
    },
    reset: async () => {},
    setTaskId: () => {},
    getAndClearLogs: (id: string) => {
      const logs = taskLogs[id] || [];
      delete taskLogs[id];
      return logs;
    },
    getBusyState: () => false,
    setAbortController: () => new AbortController(),
    abortCurrent: () => {},
    setLoggingEnabled: () => {},
    appendLog: () => {},
    ...overrides,
  };
}

/**
 * Create a mock IMediaInfoService with configurable metadata.
 */
export function createMockMediaInfoService(
  overrides: Partial<IMediaInfoService> = {},
): IMediaInfoService {
  return {
    init: async () => {},
    analyze: async () => defaultMockMeta,
    destroy: () => {},
    ...overrides,
  };
}

/**
 * Create a mock IGridRenderer with configurable render results.
 */
export function createMockGridRenderer(
  overrides: Partial<IGridRenderer> = {},
): IGridRenderer {
  const defaultOutput = {
    outputName: "test.jpg",
    outputSize: 1000,
    outputBlob: new Blob(["mock"], { type: "image/jpeg" }),
  };

  return {
    renderStaticGrid: async () => defaultOutput,
    renderAnimatedGrid: async () => ({
      ...defaultOutput,
      outputName: "test.webp",
      outputBlob: new Blob(["mock"], { type: "image/webp" }),
    }),
    renderSequence: async () => ({
      ...defaultOutput,
      outputName: "test.webp",
      outputBlob: new Blob(["mock"], { type: "image/webp" }),
    }),
    renderGallery: async () => [
      {
        blob: new Blob(["mock"], { type: "image/jpeg" }),
        filename: "test_001.jpg",
      },
    ],
    destroy: async () => {},
    ...overrides,
  };
}
