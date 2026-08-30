/**
 * Tests for the useLongPress hook.
 *
 * Verifies long press triggering, cancellation on pointer up/leave/cancel,
 * and configurable threshold.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLongPress } from "@/hooks/useLongPress";

describe("useLongPress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns pointer event handlers", () => {
    const { result } = renderHook(() => useLongPress(() => {}));
    expect(result.current.onPointerDown).toBeDefined();
    expect(result.current.onPointerUp).toBeDefined();
    expect(result.current.onPointerLeave).toBeDefined();
    expect(result.current.onPointerCancel).toBeDefined();
  });

  it("triggers callback after threshold", () => {
    const handler = vi.fn();
    const { result } = renderHook(() => useLongPress(handler));

    const pointerEvent = {
      stopPropagation: vi.fn(),
    } as unknown as React.PointerEvent;

    result.current.onPointerDown(pointerEvent);
    expect(handler).not.toHaveBeenCalled();

    // Advance past default threshold (600ms)
    vi.advanceTimersByTime(600);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("uses custom threshold", () => {
    const handler = vi.fn();
    const { result } = renderHook(() =>
      useLongPress(handler, { thresholdMs: 200 }),
    );

    result.current.onPointerDown({
      stopPropagation: vi.fn(),
    } as unknown as React.PointerEvent);
    vi.advanceTimersByTime(199);
    expect(handler).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("cancels on pointer up", () => {
    const handler = vi.fn();
    const { result } = renderHook(() => useLongPress(handler));

    result.current.onPointerDown({
      stopPropagation: vi.fn(),
    } as unknown as React.PointerEvent);
    vi.advanceTimersByTime(300);
    result.current.onPointerUp();
    vi.advanceTimersByTime(600);
    expect(handler).not.toHaveBeenCalled();
  });

  it("cancels on pointer leave", () => {
    const handler = vi.fn();
    const { result } = renderHook(() => useLongPress(handler));

    result.current.onPointerDown({
      stopPropagation: vi.fn(),
    } as unknown as React.PointerEvent);
    vi.advanceTimersByTime(300);
    result.current.onPointerLeave();
    vi.advanceTimersByTime(600);
    expect(handler).not.toHaveBeenCalled();
  });

  it("cancels on pointer cancel", () => {
    const handler = vi.fn();
    const { result } = renderHook(() => useLongPress(handler));

    result.current.onPointerDown({
      stopPropagation: vi.fn(),
    } as unknown as React.PointerEvent);
    vi.advanceTimersByTime(300);
    result.current.onPointerCancel();
    vi.advanceTimersByTime(600);
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls stopPropagation on pointer down", () => {
    const handler = vi.fn();
    const stopPropagation = vi.fn();
    const { result } = renderHook(() => useLongPress(handler));

    result.current.onPointerDown({
      stopPropagation,
    } as unknown as React.PointerEvent);
    expect(stopPropagation).toHaveBeenCalled();
  });
});
