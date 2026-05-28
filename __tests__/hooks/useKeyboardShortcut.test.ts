/**
 * Tests for the useKeyboardShortcut hook.
 *
 * Verifies key matching, modifier combinations (ctrl, shift), input guard,
 * cleanup on unmount, and multiple shortcut registration.
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";

function fireKeydown(
  key: string,
  opts: { ctrlKey?: boolean; shiftKey?: boolean } = {},
) {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        ctrlKey: opts.ctrlKey ?? false,
        shiftKey: opts.shiftKey ?? false,
        bubbles: true,
      }),
    );
  });
}

describe("useKeyboardShortcut", () => {
  it("triggers callback when key matches", () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcut({
        key: "m",
        callback,
        deps: [callback],
      }),
    );

    fireKeydown("m");
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not trigger for wrong key", () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcut({
        key: "m",
        callback,
        deps: [callback],
      }),
    );

    fireKeydown("s");
    expect(callback).not.toHaveBeenCalled();
  });

  it("triggers when ctrl modifier matches", () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcut({
        key: "s",
        ctrl: true,
        callback,
        deps: [callback],
      }),
    );

    fireKeydown("s", { ctrlKey: true });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not trigger when ctrl is required but not pressed", () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcut({
        key: "s",
        ctrl: true,
        callback,
        deps: [callback],
      }),
    );

    fireKeydown("s");
    expect(callback).not.toHaveBeenCalled();
  });

  it("triggers when shift modifier matches", () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcut({
        key: "ArrowRight",
        shift: true,
        callback,
        deps: [callback],
      }),
    );

    fireKeydown("ArrowRight", { shiftKey: true });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not trigger when shift is required but not pressed", () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcut({
        key: "ArrowRight",
        shift: true,
        callback,
        deps: [callback],
      }),
    );

    fireKeydown("ArrowRight");
    expect(callback).not.toHaveBeenCalled();
  });

  it("triggers when both ctrl and shift match", () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcut({
        key: "w",
        ctrl: true,
        shift: true,
        callback,
        deps: [callback],
      }),
    );

    fireKeydown("w", { ctrlKey: true, shiftKey: true });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not trigger when ctrl+shift required but only ctrl pressed", () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcut({
        key: "w",
        ctrl: true,
        shift: true,
        callback,
        deps: [callback],
      }),
    );

    fireKeydown("w", { ctrlKey: true });
    expect(callback).not.toHaveBeenCalled();
  });

  it("ignores shortcut when input is focused", () => {
    const callback = vi.fn();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    renderHook(() =>
      useKeyboardShortcut({
        key: "m",
        callback,
        deps: [callback],
      }),
    );

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "m",
          bubbles: true,
        }),
      );
    });

    expect(callback).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("handles multiple shortcuts in an array", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cb3 = vi.fn();

    renderHook(() =>
      useKeyboardShortcut([
        { key: "a", callback: cb1, deps: [cb1] },
        { key: "b", callback: cb2, deps: [cb2] },
        { key: "c", ctrl: true, callback: cb3, deps: [cb3] },
      ]),
    );

    fireKeydown("a");
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).not.toHaveBeenCalled();
    expect(cb3).not.toHaveBeenCalled();

    fireKeydown("b");
    expect(cb2).toHaveBeenCalledTimes(1);

    fireKeydown("c", { ctrlKey: true });
    expect(cb3).toHaveBeenCalledTimes(1);
  });

  it("handles Ctrl+Enter shortcut", () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcut({
        key: "Enter",
        ctrl: true,
        callback,
        deps: [callback],
      }),
    );

    fireKeydown("Enter", { ctrlKey: true });
    expect(callback).toHaveBeenCalledTimes(1);

    // Without ctrl it should not fire
    callback.mockReset();
    fireKeydown("Enter");
    expect(callback).not.toHaveBeenCalled();
  });

  it("handles Space shortcut", () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcut({
        key: " ",
        callback,
        deps: [callback],
      }),
    );

    fireKeydown(" ");
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("handles ArrowLeft/ArrowRight shortcuts", () => {
    const left = vi.fn();
    const right = vi.fn();

    renderHook(() =>
      useKeyboardShortcut([
        { key: "ArrowLeft", callback: left, deps: [left] },
        { key: "ArrowRight", callback: right, deps: [right] },
      ]),
    );

    fireKeydown("ArrowLeft");
    expect(left).toHaveBeenCalledTimes(1);
    expect(right).not.toHaveBeenCalled();

    fireKeydown("ArrowRight");
    expect(right).toHaveBeenCalledTimes(1);
  });

  it("cleans up listener on unmount", () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcut({
        key: "m",
        callback,
        deps: [callback],
      }),
    );

    unmount();
    fireKeydown("m");
    expect(callback).not.toHaveBeenCalled();
  });

  it("ignores shortcut when dialog overlay is present (dialog modal open)", () => {
    const callback = vi.fn();

    // Simulate an open Radix dialog overlay (what all modals render)
    const overlay = document.createElement("div");
    overlay.setAttribute("data-slot", "dialog-overlay");
    overlay.setAttribute("data-state", "open");
    document.body.appendChild(overlay);

    renderHook(() =>
      useKeyboardShortcut({
        key: "Enter",
        ctrl: true,
        callback,
        deps: [callback],
      }),
    );

    fireKeydown("Enter", { ctrlKey: true });
    expect(callback).not.toHaveBeenCalled();

    document.body.removeChild(overlay);
  });

  it("ignores shortcut when alert-dialog overlay is present", () => {
    const callback = vi.fn();

    // Simulate an open Radix alert-dialog overlay
    const overlay = document.createElement("div");
    overlay.setAttribute("data-slot", "alert-dialog-overlay");
    overlay.setAttribute("data-state", "open");
    document.body.appendChild(overlay);

    renderHook(() =>
      useKeyboardShortcut({
        key: "Enter",
        ctrl: true,
        callback,
        deps: [callback],
      }),
    );

    fireKeydown("Enter", { ctrlKey: true });
    expect(callback).not.toHaveBeenCalled();

    document.body.removeChild(overlay);
  });

  it("fires shortcut when overlay has data-state=closed", () => {
    const callback = vi.fn();

    // Overlay exists but is closed (state=closed)
    const overlay = document.createElement("div");
    overlay.setAttribute("data-slot", "dialog-overlay");
    overlay.setAttribute("data-state", "closed");
    document.body.appendChild(overlay);

    renderHook(() =>
      useKeyboardShortcut({
        key: "Enter",
        ctrl: true,
        callback,
        deps: [callback],
      }),
    );

    fireKeydown("Enter", { ctrlKey: true });
    expect(callback).toHaveBeenCalledTimes(1);

    document.body.removeChild(overlay);
  });

  it("treats meta key as ctrl for macOS compatibility", () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcut({
        key: "s",
        ctrl: true,
        callback,
        deps: [callback],
      }),
    );

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "s",
          ctrlKey: false,
          metaKey: true,
          bubbles: true,
        }),
      );
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
