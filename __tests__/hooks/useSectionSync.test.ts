/**
 * Tests for the useSectionSync hook.
 *
 * Verifies that Shift+click dispatches a sync event, normal click does not,
 * and that sibling sections react to sync events correctly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSectionSync } from "@/hooks/useSectionSync";

describe("useSectionSync", () => {
  let capturedEvent: CustomEvent | null;

  beforeEach(() => {
    capturedEvent = null;
    // Listen for all section-sync events to capture dispatched details
    window.addEventListener("section-sync", (e: Event) => {
      if (e instanceof CustomEvent) {
        capturedEvent = e;
      }
    });
  });

  it("dispatches section-sync event when Shift is held", () => {
    const { result } = renderHook(() =>
      useSectionSync("group-a", false, vi.fn()),
    );

    result.current.shiftRef.current = true;

    act(() => {
      result.current.handleOpenChange();
    });

    expect(capturedEvent).not.toBeNull();
    expect(capturedEvent!.type).toBe("section-sync");
    expect(capturedEvent!.detail).toEqual({
      group: "group-a",
      expanded: true,
    });
  });

  it("does not dispatch event when Shift is not held", () => {
    const onToggle = vi.fn();
    const { result } = renderHook(() =>
      useSectionSync("group-a", false, onToggle),
    );

    result.current.shiftRef.current = false;

    act(() => {
      result.current.handleOpenChange();
    });

    expect(capturedEvent).toBeNull();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("toggles sibling when sync event target differs from current expanded", () => {
    const onToggle = vi.fn();
    renderHook(() => useSectionSync("group-a", false, onToggle));

    act(() => {
      window.dispatchEvent(
        new CustomEvent("section-sync", {
          detail: { group: "group-a", expanded: true },
        }),
      );
    });

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("ignores sync event from different group", () => {
    const onToggle = vi.fn();
    renderHook(() => useSectionSync("group-a", false, onToggle));

    act(() => {
      window.dispatchEvent(
        new CustomEvent("section-sync", {
          detail: { group: "group-b", expanded: true },
        }),
      );
    });

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("ignores sync event when state already matches target", () => {
    const onToggle = vi.fn();
    renderHook(() => useSectionSync("group-a", true, onToggle));

    act(() => {
      window.dispatchEvent(
        new CustomEvent("section-sync", {
          detail: { group: "group-a", expanded: true },
        }),
      );
    });

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("cleans up listener on unmount", () => {
    const onToggle = vi.fn();
    const { unmount } = renderHook(() =>
      useSectionSync("group-a", false, onToggle),
    );

    unmount();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("section-sync", {
          detail: { group: "group-a", expanded: true },
        }),
      );
    });

    expect(onToggle).not.toHaveBeenCalled();
  });
});
