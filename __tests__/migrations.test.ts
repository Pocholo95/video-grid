/**
 * Tests for the migration pipeline.
 *
 * Verifies that settings data is correctly migrated between schema versions.
 */

import { describe, it, expect } from "vitest";
import { migrateSettings, needsMigration } from "@/migrations";
import { DEFAULTS, FONT_FACES, STORAGE_SCHEMA_VERSION } from "@/constants";
import type { AppSettings, SavedOptions } from "@/types";
import { createTestOpts, createTestPresets } from "./helpers/mockServices";

/** - Helper factories */

function makeAppSettings(presetOverride?: Partial<SavedOptions>): AppSettings {
  return {
    presets: createTestPresets({
      entries: {
        test: createTestOpts(presetOverride),
      },
      lastUsed: "test",
    }),
    destinations: [],
    theme: "dark",
    showPreview: true,
  };
}

/** - migrateSettings */

describe("migrateSettings", () => {
  it("returns data unchanged when version is current", () => {
    const data = makeAppSettings();
    const result = migrateSettings(data, STORAGE_SCHEMA_VERSION);
    expect(result).toBe(data);
  });

  it("returns data unchanged for future versions (no-op)", () => {
    const data = makeAppSettings();
    const result = migrateSettings(data, 999);
    expect(result).toBe(data);
  });

  it("migrates v0 → v1 → v2 when fromVersion is 0", () => {
    const data = makeAppSettings();
    const result = migrateSettings(data, 0);
    expect(result.presets.entries.test.fontFamily).toBe(FONT_FACES[0]);
    expect(result.presets.entries.test.tcFontSizeAuto).toBe(true);
    expect(result.presets.entries.test.tcFontSize).toBe(DEFAULTS.tcFontSize);
    expect(result.presets.entries.test.headerFontSizeAuto).toBe(true);
    expect(result.presets.entries.test.headerFontSize).toBe(
      DEFAULTS.headerFontSize,
    );
  });

  it("migrates v1 → v2: adds missing font fields with defaults", () => {
    const data = makeAppSettings();
    const result = migrateSettings(data, 1);

    expect(result.presets.entries.test.fontFamily).toBe(FONT_FACES[0]);
    expect(result.presets.entries.test.tcFontSizeAuto).toBe(true);
    expect(result.presets.entries.test.tcFontSize).toBe(DEFAULTS.tcFontSize);
    expect(result.presets.entries.test.headerFontSizeAuto).toBe(true);
    expect(result.presets.entries.test.headerFontSize).toBe(
      DEFAULTS.headerFontSize,
    );
  });

  it("migrates v1 → v2: preserves existing font fields", () => {
    const data = makeAppSettings({
      fontFamily: "Georgia, serif",
      tcFontSizeAuto: false,
      tcFontSize: 32,
      headerFontSizeAuto: false,
      headerFontSize: 48,
    });
    const result = migrateSettings(data, 1);

    expect(result.presets.entries.test.fontFamily).toBe("Georgia, serif");
    expect(result.presets.entries.test.tcFontSizeAuto).toBe(false);
    expect(result.presets.entries.test.tcFontSize).toBe(32);
    expect(result.presets.entries.test.headerFontSizeAuto).toBe(false);
    expect(result.presets.entries.test.headerFontSize).toBe(48);
  });

  it("migrates v1 → v2: replaces NaN/Invalid font sizes with defaults", () => {
    const data = makeAppSettings({
      tcFontSize: NaN,
      headerFontSize: NaN,
    } as unknown as SavedOptions);
    const result = migrateSettings(data, 1);

    expect(result.presets.entries.test.tcFontSize).toBe(DEFAULTS.tcFontSize);
    expect(result.presets.entries.test.headerFontSize).toBe(
      DEFAULTS.headerFontSize,
    );
  });

  it("migrates v1 → v2: replaces non-boolean auto flags with defaults", () => {
    const data = makeAppSettings({
      tcFontSizeAuto: "yes" as unknown as boolean,
      headerFontSizeAuto: 1 as unknown as boolean,
    });
    const result = migrateSettings(data, 1);

    expect(result.presets.entries.test.tcFontSizeAuto).toBe(true);
    expect(result.presets.entries.test.headerFontSizeAuto).toBe(true);
  });

  it("migrates v1 → v2: replaces empty string fontFamily with default", () => {
    const data = makeAppSettings({
      fontFamily: "",
    });
    const result = migrateSettings(data, 1);

    expect(result.presets.entries.test.fontFamily).toBe(FONT_FACES[0]);
  });

  it("migrates v1 → v2: preserves non-empty fontFamily", () => {
    const data = makeAppSettings({
      fontFamily: "Courier New, Courier, monospace",
    });
    const result = migrateSettings(data, 1);

    expect(result.presets.entries.test.fontFamily).toBe(
      "Courier New, Courier, monospace",
    );
  });

  it("migrates v1 → v2: renames legacy position to tcPosition", () => {
    const legacyPreset = {
      width: 1920,
      cols: 4,
      rows: 3,
      spacing: 4,
      // Legacy preset uses `position` instead of `tcPosition`
      position: "bottom-right",
      header: true,
      bgColor: "#000000",
      textColor: "#FFFFFF",
      animated: false,
      animDuration: 10,
      animFps: 24,
      webpMethod: 4,
      webpQuality: 75,
      vrMode: "disabled",
      fontFamily: DEFAULTS.fontFamily,
      tcFontSizeAuto: DEFAULTS.tcFontSizeAuto,
      tcFontSize: DEFAULTS.tcFontSize,
      headerFontSizeAuto: DEFAULTS.headerFontSizeAuto,
      headerFontSize: DEFAULTS.headerFontSize,
      sectionStates: { grid: true, style: true, modes: true },
    } as unknown as SavedOptions;

    const settings: AppSettings = {
      presets: createTestPresets({
        entries: { legacy: legacyPreset },
        lastUsed: "legacy",
      }),
      destinations: [],
      theme: "dark",
      showPreview: true,
    };
    const result = migrateSettings(settings, 1);

    expect(result.presets.entries.legacy.tcPosition).toBe("bottom-right");
    // Legacy `position` field should not leak into migrated output
    expect(
      (result.presets.entries.legacy as Record<string, unknown>).position,
    ).toBeUndefined();
  });

  it("migrates v1 → v2: removes obsolete preview field", () => {
    const dirtyPreset = {
      width: 1920,
      cols: 4,
      rows: 3,
      spacing: 4,
      tcPosition: "top-left",
      header: true,
      bgColor: "#000000",
      textColor: "#FFFFFF",
      preview: true,
      animated: false,
      animDuration: 10,
      animFps: 24,
      webpMethod: 4,
      webpQuality: 75,
      vrMode: "disabled",
      fontFamily: DEFAULTS.fontFamily,
      tcFontSizeAuto: DEFAULTS.tcFontSizeAuto,
      tcFontSize: DEFAULTS.tcFontSize,
      headerFontSizeAuto: DEFAULTS.headerFontSizeAuto,
      headerFontSize: DEFAULTS.headerFontSize,
      sectionStates: { grid: true, style: true, modes: true },
    } as unknown as SavedOptions;

    const settings: AppSettings = {
      presets: createTestPresets({
        entries: { dirty: dirtyPreset },
        lastUsed: "dirty",
      }),
      destinations: [],
      theme: "dark",
      showPreview: true,
    };
    const result = migrateSettings(settings, 1);

    expect(
      (result.presets.entries.dirty as Record<string, unknown>).preview,
    ).toBeUndefined();
  });

  it("handles multiple presets independently", () => {
    const settings: AppSettings = {
      presets: createTestPresets({
        entries: {
          a: createTestOpts({ tcFontSize: 20, headerFontSize: 30 }),
          b: createTestOpts(),
        },
        lastUsed: "a",
      }),
      destinations: [],
      theme: "dark",
      showPreview: true,
    };
    const result = migrateSettings(settings, 1);

    // Preset A: existing font sizes preserved
    expect(result.presets.entries.a.tcFontSize).toBe(20);
    expect(result.presets.entries.a.headerFontSize).toBe(30);

    // Preset B: defaults applied
    expect(result.presets.entries.b.tcFontSize).toBe(DEFAULTS.tcFontSize);
    expect(result.presets.entries.b.headerFontSize).toBe(
      DEFAULTS.headerFontSize,
    );
  });
});

/** - needsMigration */

describe("needsMigration", () => {
  it("returns true for old versions and false for current/future", () => {
    expect(needsMigration(0)).toBe(true);
    expect(needsMigration(1)).toBe(true);
    expect(needsMigration(STORAGE_SCHEMA_VERSION)).toBe(false);
    expect(needsMigration(999)).toBe(false);
  });
});
