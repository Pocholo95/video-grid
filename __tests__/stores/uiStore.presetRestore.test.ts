/**
 * Tests for uiStore preset restoration on app load.
 *
 * Verifies that when the store initializes, it correctly restores
 * the last-used preset from settingsStore, or falls back to DEFAULTS
 * when the preset is missing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DEFAULTS } from "@/constants";
import type { SavedOptions, Presets } from "@/types";

// Shared mock data
const testPreset: SavedOptions = {
  ...DEFAULTS,
  width: 1280,
  cols: 4,
  rows: 3,
  bgColor: "#ff0000",
};

const testPresets: Presets = {
  MyPreset: testPreset,
};

describe("uiStore - preset restoration on init", () => {
  beforeEach(async () => {
    // Reset modules so the store re-initializes with the current mock
    await vi.resetModules();

    // Default task/processing mocks (needed by uiStore)
    vi.mock("@/store/taskStore", () => ({
      useTaskStore: {
        getState: () => ({ items: [] }),
      },
    }));

    vi.mock("@/store/processingStore", () => ({
      useProcessingStore: {
        getState: () => ({ isProcessing: false }),
      },
    }));

    vi.mock("@formkit/auto-animate", () => ({
      autoAnimate: vi.fn(),
    }));

    vi.mock("file-saver", () => ({
      saveAs: vi.fn(),
    }));

    vi.mock("jszip", () => ({
      default: class {
        file() {}
        generateAsync() {
          return Promise.resolve(new Blob());
        }
      },
    }));
  });

  afterEach(async () => {
    await vi.restoreAllMocks();
  });

  it("restores lastUsed preset when it exists in entries", async () => {
    vi.doMock("@/store/settingsStore", () => ({
      useSettingsStore: {
        getState: () => ({
          settings: {
            presets: {
              lastUsed: "MyPreset",
              entries: testPresets,
            },
          },
        }),
      },
    }));

    const { useUiStore } = await import("@/store/uiStore");
    const { opts } = useUiStore.getState();

    expect(opts.width).toBe(testPreset.width);
    expect(opts.cols).toBe(testPreset.cols);
    expect(opts.rows).toBe(testPreset.rows);
    expect(opts.bgColor).toBe(testPreset.bgColor);
  });

  it("falls back to DEFAULTS when lastUsed preset was deleted from entries", async () => {
    vi.doMock("@/store/settingsStore", () => ({
      useSettingsStore: {
        getState: () => ({
          settings: {
            presets: {
              lastUsed: "DeletedPreset",
              entries: testPresets, // Does not contain "DeletedPreset"
            },
          },
        }),
      },
    }));

    const { useUiStore } = await import("@/store/uiStore");
    const { opts } = useUiStore.getState();

    expect(opts.width).toBe(DEFAULTS.width);
    expect(opts.cols).toBe(DEFAULTS.cols);
    expect(opts.rows).toBe(DEFAULTS.rows);
    expect(opts.bgColor).toBe(DEFAULTS.bgColor);
  });

  it("falls back to DEFAULTS when lastUsed is null", async () => {
    vi.doMock("@/store/settingsStore", () => ({
      useSettingsStore: {
        getState: () => ({
          settings: {
            presets: {
              lastUsed: null,
              entries: testPresets,
            },
          },
        }),
      },
    }));

    const { useUiStore } = await import("@/store/uiStore");
    const { opts } = useUiStore.getState();

    expect(opts.width).toBe(DEFAULTS.width);
    expect(opts.cols).toBe(DEFAULTS.cols);
    expect(opts.rows).toBe(DEFAULTS.rows);
  });

  it("falls back to DEFAULTS when entries is empty", async () => {
    vi.doMock("@/store/settingsStore", () => ({
      useSettingsStore: {
        getState: () => ({
          settings: {
            presets: {
              lastUsed: "MyPreset",
              entries: {},
            },
          },
        }),
      },
    }));

    const { useUiStore } = await import("@/store/uiStore");
    const { opts } = useUiStore.getState();

    expect(opts.width).toBe(DEFAULTS.width);
    expect(opts.cols).toBe(DEFAULTS.cols);
  });

  it("returns a structured clone (deep copy) of the preset", async () => {
    vi.doMock("@/store/settingsStore", () => ({
      useSettingsStore: {
        getState: () => ({
          settings: {
            presets: {
              lastUsed: "MyPreset",
              entries: testPresets,
            },
          },
        }),
      },
    }));

    const { useUiStore } = await import("@/store/uiStore");
    const { opts } = useUiStore.getState();

    // Verify it's a deep copy, not the same reference
    expect(opts).not.toBe(testPreset);
    expect(opts).toEqual(testPreset);
  });
});
