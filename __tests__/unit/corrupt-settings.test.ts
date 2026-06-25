/**
 * Regression tests for corrupt/incomplete localStorage settings.
 *
 * Ensures the app starts gracefully when stored settings are missing
 * required keys (e.g., old data before a schema migration added new fields).
 *
 * Related issue: TypeError: can't access property "entries",
 * settings.presets is undefined
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { APP_STORAGE_KEY, STORAGE_SCHEMA_VERSION } from "@/constants";
import type { AppSettings } from "@/types";

/** Helper to write raw JSON directly to localStorage (bypassing the storage API). */
function writeRawSettings(data: unknown): void {
  const payload = {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    data,
  };
  localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(payload));
}

/**
 * Import the presets module dynamically so each test can control
 * localStorage state before the module's top-level seedBuiltInPresets() runs.
 */
async function importPresets() {
  // Clear any cached module state by using a fresh import
  return await import("@/presets");
}

describe("corrupt / incomplete settings recovery", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("gracefully handles settings missing presets key entirely", async () => {
    // Simulate corrupt settings: no `presets` property at all
    const corruptSettings = {
      destinations: [],
      theme: "dark",
      showPreview: true,
      // `presets` is intentionally missing
    };
    writeRawSettings(corruptSettings);

    const { loadAppSettings, seedBuiltInPresets } = await importPresets();

    // loadAppSettings should NOT throw
    const settings = loadAppSettings();

    // Should have valid presets structure with defaults
    expect(settings.presets).toBeDefined();
    expect(settings.presets.entries).toBeDefined();
    expect(settings.presets.lastUsed).toBeNull();
    expect(settings.theme).toBe("dark");
    expect(settings.showPreview).toBe(true);

    // seedBuiltInPresets should also NOT throw
    expect(() => seedBuiltInPresets()).not.toThrow();
  });

  it("gracefully handles settings with presets as null", async () => {
    const corruptSettings: unknown = {
      presets: null,
      destinations: [],
      theme: "light",
      showPreview: false,
      corsModalDismissed: false,
    };
    writeRawSettings(corruptSettings);

    const { loadAppSettings } = await importPresets();

    const settings = loadAppSettings();

    expect(settings.presets).toBeDefined();
    expect(settings.presets.entries).toBeDefined();
    expect(settings.theme).toBe("light");
    expect(settings.showPreview).toBe(false);
  });

  it("gracefully handles settings with presets.entries missing", async () => {
    const corruptSettings: unknown = {
      presets: {
        lastUsed: "Hero Shot",
        // `entries` is intentionally missing
      },
      destinations: [],
      theme: "dimmed",
      showPreview: true,
    };
    writeRawSettings(corruptSettings);

    const { loadAppSettings } = await importPresets();

    const settings = loadAppSettings();

    expect(settings.presets).toBeDefined();
    expect(settings.presets.entries).toBeDefined();
    // lastUsed should be preserved from corrupt data
    expect(settings.presets.lastUsed).toBe("Hero Shot");
    expect(settings.theme).toBe("dimmed");
  });

  it("gracefully handles settings with presets.entries as null", async () => {
    const corruptSettings: unknown = {
      presets: {
        entries: null,
        lastUsed: null,
      },
      destinations: [],
      theme: "classic",
      showPreview: true,
    };
    writeRawSettings(corruptSettings);

    const { loadAppSettings } = await importPresets();

    const settings = loadAppSettings();

    // entries should be restored to empty object (default)
    expect(settings.presets.entries).toEqual({});
    expect(settings.theme).toBe("classic");
  });

  it("gracefully handles completely empty settings object", async () => {
    writeRawSettings({});

    const { loadAppSettings, seedBuiltInPresets } = await importPresets();

    const settings = loadAppSettings();

    expect(settings.presets).toBeDefined();
    expect(settings.presets.entries).toBeDefined();
    expect(settings.destinations).toEqual([]);
    expect(settings.theme).toBe("dark");
    expect(settings.showPreview).toBe(true);

    // seeding should work without crash
    expect(() => seedBuiltInPresets()).not.toThrow();
  });

  it("preserves existing valid presets while filling missing keys", async () => {
    const { DEFAULTS } = await import("@/constants");

    const partialSettings: AppSettings = {
      presets: {
        entries: {
          "Custom Preset": {
            ...DEFAULTS,
            width: 2560,
            cols: 5,
            rows: 3,
          },
        },
        lastUsed: "Custom Preset",
      },
      destinations: [],
      theme: "light",
      showPreview: false,
      corsModalDismissed: false,
    };
    writeRawSettings(partialSettings);

    const { loadAppSettings } = await importPresets();

    const settings = loadAppSettings();

    // Existing preset data preserved
    expect(settings.presets.entries["Custom Preset"]).toBeDefined();
    expect(settings.presets.entries["Custom Preset"].width).toBe(2560);
    expect(settings.presets.lastUsed).toBe("Custom Preset");
    expect(settings.theme).toBe("light");
    expect(settings.showPreview).toBe(false);
  });
});
