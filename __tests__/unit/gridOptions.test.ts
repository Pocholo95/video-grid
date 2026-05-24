/**
 * Tests for grid options builders.
 *
 * Verifies cell options, static grid options, and animated grid options
 * are constructed correctly from user settings and task items.
 */

import { describe, it, expect } from "vitest";
import {
  buildCellOptions,
  buildStaticGridOptions,
  buildAnimatedGridOptions,
} from "@/gridOptions";
import { DEFAULTS, MIN_CELL_WIDTH } from "@/constants";
import {
  createTestOpts,
  createTestMeta,
  createTestTaskItem,
} from "../helpers/mockServices";
import type { TaskItem } from "@/types";

const mockOpts = createTestOpts();
const mockMeta = createTestMeta();
const mockItem = createTestTaskItem({ id: "test-1" });

describe("buildCellOptions", () => {
  it("returns defaults when opts are empty", () => {
    const result = buildCellOptions(mockOpts);
    expect(result.width).toBe(DEFAULTS.width);
    expect(result.cols).toBe(DEFAULTS.cols);
    expect(result.rows).toBe(DEFAULTS.rows);
  });

  it("clamps width to minimum MIN_CELL_WIDTH", () => {
    const result = buildCellOptions({ ...mockOpts, width: 100 });
    expect(result.width).toBe(MIN_CELL_WIDTH);
  });

  it("falls back to defaults when cols/rows are zero (falsy)", () => {
    const result = buildCellOptions({ ...mockOpts, cols: 0, rows: 0 });
    expect(result.cols).toBe(DEFAULTS.cols);
    expect(result.rows).toBe(DEFAULTS.rows);
  });

  it("clamps spacing to minimum 0", () => {
    const result = buildCellOptions({ ...mockOpts, spacing: -5 });
    expect(result.spacing).toBe(0);
  });

  it("clears empty grid template", () => {
    const result = buildCellOptions({
      ...mockOpts,
      gridTemplate: { cols: 3, cells: [] },
    });
    expect(result.gridTemplate).toBeUndefined();
  });

  it("preserves valid grid template", () => {
    const template = { cols: 3, cells: [{ id: "c0", x: 0, y: 0, w: 1, h: 1 }] };
    const result = buildCellOptions({ ...mockOpts, gridTemplate: template });
    expect(result.gridTemplate).toBe(template);
  });

  it("always sets customTimestamps to undefined", () => {
    const result = buildCellOptions(mockOpts);
    expect(result.customTimestamps).toBeUndefined();
  });
});

describe("buildStaticGridOptions", () => {
  it("includes duration from metadata", () => {
    const result = buildStaticGridOptions(mockOpts, mockItem, mockMeta);
    expect(result.duration).toBe(120);
  });

  it("clamps duration to minimum 1", () => {
    const badMeta = { ...mockMeta, duration: 0 };
    const result = buildStaticGridOptions(mockOpts, mockItem, badMeta);
    expect(result.duration).toBe(1);
  });

  it("includes custom timestamps when mode is custom", () => {
    const itemWithCustom: TaskItem = {
      ...mockItem,
      timestampMode: "custom",
      customTimestamps: [10, 20, 30],
    };
    const result = buildStaticGridOptions(mockOpts, itemWithCustom, mockMeta);
    expect(result.customTimestamps).toEqual([10, 20, 30]);
  });

  it("omits custom timestamps when mode is auto", () => {
    const result = buildStaticGridOptions(mockOpts, mockItem, mockMeta);
    expect(result.customTimestamps).toBeUndefined();
  });

  it("omits custom timestamps when array is empty", () => {
    const itemWithEmpty: TaskItem = {
      ...mockItem,
      timestampMode: "custom",
      customTimestamps: [],
    };
    const result = buildStaticGridOptions(mockOpts, itemWithEmpty, mockMeta);
    expect(result.customTimestamps).toBeUndefined();
  });
});

describe("buildAnimatedGridOptions", () => {
  it("includes animation parameters", () => {
    const result = buildAnimatedGridOptions(mockOpts, mockItem, mockMeta);
    expect(result.animDuration).toBe(DEFAULTS.animDuration);
    expect(result.animFps).toBe(DEFAULTS.animFps);
    expect(result.webpMethod).toBe(DEFAULTS.webpMethod);
    expect(result.webpQuality).toBe(DEFAULTS.webpQuality);
  });

  it("clamps animDuration to minimum 1", () => {
    const opts = { ...mockOpts, animDuration: 0 };
    const result = buildAnimatedGridOptions(opts, mockItem, mockMeta);
    expect(result.animDuration).toBe(1);
  });

  it("clamps animFps to minimum 1", () => {
    const opts = { ...mockOpts, animFps: 0 };
    const result = buildAnimatedGridOptions(opts, mockItem, mockMeta);
    expect(result.animFps).toBe(1);
  });

  it("clamps webpQuality between 5 and 100", () => {
    const optsLow = { ...mockOpts, webpQuality: 0 };
    const optsHigh = { ...mockOpts, webpQuality: 200 };
    expect(
      buildAnimatedGridOptions(optsLow, mockItem, mockMeta).webpQuality,
    ).toBe(5);
    expect(
      buildAnimatedGridOptions(optsHigh, mockItem, mockMeta).webpQuality,
    ).toBe(100);
  });

  it("extends static grid options", () => {
    const result = buildAnimatedGridOptions(mockOpts, mockItem, mockMeta);
    expect(result.duration).toBe(120);
    expect(result.width).toBe(DEFAULTS.width);
    expect(result.cols).toBe(DEFAULTS.cols);
  });
});
