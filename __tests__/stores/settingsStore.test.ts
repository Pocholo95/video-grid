/**
 * Tests for settingsStore.
 *
 * Verifies settings loading, updates, theme changes, dialog state,
 * and persistence integration.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useSettingsStore } from "@/store/settingsStore";
import type { AppSettings } from "@/types";

const defaultSettings = vi.hoisted(() => {
  return {
    presets: { entries: {}, lastUsed: null },
    destinations: [],
    theme: "dark",
    showPreview: true,
    corsModalDismissed: false,
  } as AppSettings;
});

// Mock presets module
vi.mock("@/presets", () => ({
  loadAppSettings: vi.fn(() => structuredClone(defaultSettings)),
  persistAppSettings: vi.fn(),
  seedBuiltInPresets: vi.fn(),
}));

vi.mock("@/lib/deepClone", () => ({
  deepClone: vi.fn((obj) => JSON.parse(JSON.stringify(obj))),
}));

// Mock localStorage
const mockStorage = new Map<string, string>();
beforeEach(() => {
  mockStorage.clear();
  vi.clearAllMocks();
  useSettingsStore.getState().settings = structuredClone(defaultSettings);
  useSettingsStore.getState().showSettingsDialog = false;
  useSettingsStore.getState().originalSettings = null;
});

describe("settingsStore - initial state", () => {
  it("loads settings from loadAppSettings", () => {
    const { settings } = useSettingsStore.getState();
    expect(settings.theme).toBe("dark");
    expect(settings.showPreview).toBe(true);
    expect(settings.destinations).toEqual([]);
  });
});

describe("updateSettings", () => {
  it("merges patch into settings", async () => {
    const { persistAppSettings } = await import("@/presets");
    useSettingsStore.getState().updateSettings({ theme: "light" });
    expect(useSettingsStore.getState().settings.theme).toBe("light");
    expect(persistAppSettings).toHaveBeenCalled();
  });

  it("updates showPreview", () => {
    useSettingsStore.getState().updateSettings({ showPreview: false });
    expect(useSettingsStore.getState().settings.showPreview).toBe(false);
  });
});

describe("updateDestinations", () => {
  it("replaces destinations array", async () => {
    const { persistAppSettings } = await import("@/presets");
    const dests = [
      {
        id: "d1",
        name: "test",
        type: "chevereto" as const,
        apiKey: "key",
        url: "https://example.com",
        enabled: true,
        allowedExtensions: "",
        maxSizeMb: 0,
      },
    ];
    useSettingsStore.getState().updateDestinations(dests);
    expect(useSettingsStore.getState().settings.destinations).toEqual(dests);
    expect(persistAppSettings).toHaveBeenCalled();
  });
});

describe("handleThemeChange", () => {
  it("changes theme and updates document class", async () => {
    const { persistAppSettings } = await import("@/presets");
    useSettingsStore.getState().handleThemeChange("light");
    expect(useSettingsStore.getState().settings.theme).toBe("light");
    expect(document.documentElement.className).toBe("light");
    // Persists when dialog is closed
    expect(persistAppSettings).toHaveBeenCalled();
  });

  it("does not persist when dialog is open", async () => {
    const { persistAppSettings } = await import("@/presets");
    vi.clearAllMocks();
    useSettingsStore.getState().showSettingsDialog = true;
    useSettingsStore.getState().handleThemeChange("light");
    expect(useSettingsStore.getState().settings.theme).toBe("light");
    expect(persistAppSettings).not.toHaveBeenCalled();
  });
});

describe("handleShowPreviewChange", () => {
  it("toggles showPreview", () => {
    useSettingsStore.getState().handleShowPreviewChange(false);
    expect(useSettingsStore.getState().settings.showPreview).toBe(false);
  });
});

describe("applyTheme", () => {
  it("sets document class to theme", () => {
    useSettingsStore.getState().applyTheme("light");
    expect(document.documentElement.className).toBe("light");
  });
});

describe("dialog state management", () => {
  it("opens settings dialog and saves original settings", () => {
    useSettingsStore.getState().handleOpenSettingsDialog();
    expect(useSettingsStore.getState().showSettingsDialog).toBe(true);
    expect(useSettingsStore.getState().originalSettings).not.toBeNull();
  });

  it("closes settings dialog", () => {
    useSettingsStore.getState().setShowSettingsDialog(true);
    useSettingsStore.getState().setShowSettingsDialog(false);
    expect(useSettingsStore.getState().showSettingsDialog).toBe(false);
  });

  it("cancels settings and restores original", async () => {
    const { persistAppSettings } = await import("@/presets");
    // Open dialog
    useSettingsStore.getState().handleOpenSettingsDialog();
    // Make changes
    useSettingsStore.getState().updateSettings({ theme: "light" });
    // Cancel
    useSettingsStore.getState().handleCancelSettings();
    expect(useSettingsStore.getState().showSettingsDialog).toBe(false);
    expect(useSettingsStore.getState().settings.theme).toBe("dark");
    expect(persistAppSettings).toHaveBeenCalled();
  });

  it("saves and closes settings dialog", async () => {
    const { persistAppSettings } = await import("@/presets");
    useSettingsStore.getState().handleOpenSettingsDialog();
    useSettingsStore.getState().updateSettings({ theme: "light" });
    useSettingsStore.getState().saveAndCloseSettings();
    expect(useSettingsStore.getState().showSettingsDialog).toBe(false);
    expect(useSettingsStore.getState().settings.theme).toBe("light");
    expect(persistAppSettings).toHaveBeenCalled();
  });
});

describe("loadSettings", () => {
  it("reloads settings from storage", async () => {
    const { loadAppSettings } = await import("@/presets");
    useSettingsStore.getState().loadSettings();
    expect(loadAppSettings).toHaveBeenCalled();
  });
});
