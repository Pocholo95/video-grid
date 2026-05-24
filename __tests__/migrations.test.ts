/**
 * Tests for the migration pipeline.
 *
 * Verifies that settings data is correctly migrated between schema versions.
 */

import { describe, it, expect } from "vitest";
import { migrateSettings, needsMigration } from "@/migrations";
import type { AppSettings } from "@/types";

describe("migrateSettings", () => {
  it("returns data unchanged when version is current", () => {
    const data = { cols: 3, rows: 3, spacing: 4 };
    const result = migrateSettings(data as unknown as AppSettings, 1);
    expect(result).toBe(data);
  });

  it("returns data unchanged for future versions (no-op)", () => {
    const data = { cols: 3, rows: 3 };
    const result = migrateSettings(data as unknown as AppSettings, 999);
    expect(result).toBe(data);
  });
});

describe("needsMigration", () => {
  it("returns true for old versions and false for current/future", () => {
    expect(needsMigration(0)).toBe(true);
    expect(needsMigration(1)).toBe(false);
    expect(needsMigration(999)).toBe(false);
  });
});
