/**
 * Tests for FFmpeg service utility functions.
 *
 * The FFmpeg WASM instance itself cannot be tested in a Node environment,
 * but the pure utility functions (isMemoryError, isAbortError) are fully testable.
 */

import { describe, it, expect } from "vitest";
import { isMemoryError, isAbortError } from "@/services/ffmpeg.service";

describe("isMemoryError", () => {
  it("returns true for 'out of bounds' error", () => {
    expect(isMemoryError(new Error("out of bounds"))).toBe(true);
  });

  it("returns true for 'memory' error", () => {
    expect(isMemoryError(new Error("memory allocation failed"))).toBe(true);
  });

  it("returns true for 'unreachable' error", () => {
    expect(isMemoryError(new Error("unreachable instruction"))).toBe(true);
  });

  it("returns true for 'OOM' error", () => {
    expect(isMemoryError(new Error("OOM"))).toBe(true);
  });

  it("returns true for 'heap' error", () => {
    expect(isMemoryError(new Error("heap corruption"))).toBe(true);
  });

  it("returns false for normal errors", () => {
    expect(isMemoryError(new Error("file not found"))).toBe(false);
  });

  it("returns false for abort errors (excluded)", () => {
    const ex = new DOMException("Operation aborted", "AbortError");
    expect(isMemoryError(ex)).toBe(false);
  });

  it("handles non-Error input", () => {
    expect(isMemoryError("memory error")).toBe(true);
    expect(isMemoryError("something else")).toBe(false);
  });
});

describe("isAbortError", () => {
  it("returns true for DOMException AbortError", () => {
    const ex = new DOMException("Operation aborted", "AbortError");
    expect(isAbortError(ex)).toBe(true);
  });

  it("returns true for error message containing 'abort'", () => {
    expect(isAbortError(new Error("abort operation"))).toBe(true);
  });

  it("returns false for normal errors", () => {
    expect(isAbortError(new Error("file not found"))).toBe(false);
  });

  it("handles non-Error input", () => {
    expect(isAbortError("abort this")).toBe(true);
    expect(isAbortError("normal string")).toBe(false);
  });
});
