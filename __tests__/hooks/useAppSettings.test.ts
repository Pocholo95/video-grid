/**
 * Tests for the useAppSettings hook.
 *
 * Verifies settings loading, preview-only updates, and persistence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAppSettings } from "@/hooks/useAppSettings";
import * as presets from "@/presets";
import { ESTIMATION_MAX_FRAMES, ESTIMATION_MAX_PIXELS } from "@/constants";
import type { AppSettings } from "@/types";

const baseSettings: AppSettings = {
  presets: { entries: {}, lastUsed: null },
  destinations: [],
  theme: "dark",
  showPreview: true,
  corsModalDismissed: false,
  estimationMaxFrames: ESTIMATION_MAX_FRAMES,
  estimationMaxPixels: ESTIMATION_MAX_PIXELS,
};

describe("useAppSettings", () => {
  beforeEach(() => {
    vi.spyOn(presets, "loadAppSettings").mockReturnValue(baseSettings);
    vi.spyOn(presets, "persistAppSettings").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads settings on mount", () => {
    const { result } = renderHook(() => useAppSettings());
    expect(result.current.savedSettings).toEqual(baseSettings);
  });

  it("returns getCurrentSettings matching saved on mount", () => {
    const { result } = renderHook(() => useAppSettings());
    expect(result.current.getCurrentSettings()).toEqual(baseSettings);
  });

  it("persists presets immediately via updateSettings", () => {
    const { result } = renderHook(() => useAppSettings());
    const newPresets = { entries: {}, lastUsed: "default" };

    act(() => {
      result.current.updateSettings({ presets: newPresets });
    });

    expect(presets.persistAppSettings).toHaveBeenCalled();
    expect(result.current.savedSettings.presets).toEqual(newPresets);
  });

  it("persists destinations immediately via updateSettings", () => {
    const { result } = renderHook(() => useAppSettings());
    const dests = [
      {
        id: "d1",
        name: "Test",
        type: "chevereto" as const,
        apiKey: "key",
        url: "https://example.com",
        enabled: true,
        allowedExtensions: "",
        maxSizeMb: 0,
      },
    ];

    act(() => {
      result.current.updateSettings({ destinations: dests });
    });

    expect(presets.persistAppSettings).toHaveBeenCalled();
    expect(result.current.savedSettings.destinations).toEqual(dests);
  });

  it("defers theme changes to pending (preview only)", () => {
    const { result } = renderHook(() => useAppSettings());

    act(() => {
      result.current.updateSettings({ theme: "light" });
    });

    expect(presets.persistAppSettings).not.toHaveBeenCalled();
    expect(result.current.pendingSettings.theme).toBe("light");
    expect(result.current.getCurrentSettings().theme).toBe("light");
  });

  it("commits pending settings via saveSettings", () => {
    const { result } = renderHook(() => useAppSettings());

    act(() => {
      result.current.updateSettings({ theme: "light" });
    });

    expect(presets.persistAppSettings).not.toHaveBeenCalled();

    act(() => {
      result.current.saveSettings();
    });

    expect(presets.persistAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "light" }),
    );
    expect(result.current.pendingSettings).toEqual({});
  });

  it("clears pending via resetPending", () => {
    const { result } = renderHook(() => useAppSettings());

    act(() => {
      result.current.updateSettings({ theme: "light" });
    });

    expect(result.current.pendingSettings.theme).toBe("light");

    act(() => {
      result.current.resetPending();
    });

    expect(result.current.pendingSettings).toEqual({});
  });

  it("provides getPresets and getLastUsed", () => {
    const { result } = renderHook(() => useAppSettings());
    expect(result.current.getPresets()).toEqual({});
    expect(result.current.getLastUsed()).toBeNull();
  });
});
