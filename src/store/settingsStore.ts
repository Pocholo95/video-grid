import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import {
  loadAppSettings,
  persistAppSettings,
  seedBuiltInPresets,
} from "@/presets";
import type { AppSettings } from "@/types";
import { deepClone } from "@/lib/deepClone";

/**
 * Zustand store for app settings, theme, presets, and upload destinations.
 * Replaces: src/context/settingsContext.tsx + src/hooks/useAppSettings.ts
 *
 * Settings are persisted to localStorage immediately on every change.
 * The settings dialog tracks a snapshot of the original settings so the
 * user can cancel and revert changes.
 */
interface SettingsState {
  // --- Core state ---
  settings: AppSettings;

  // --- Settings dialog ---
  showSettingsDialog: boolean;
  originalSettings: AppSettings | null;

  // --- Actions ---
  loadSettings: () => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  updateDestinations: (dests: AppSettings["destinations"]) => void;
  handleThemeChange: (theme: AppSettings["theme"]) => void;
  handleShowPreviewChange: (show: boolean) => void;

  // --- Dialog ---
  setShowSettingsDialog: (open: boolean) => void;
  handleOpenSettingsDialog: () => void;
  handleCancelSettings: () => void;
  saveAndCloseSettings: () => void;

  // --- Helpers ---
  applyTheme: (theme: AppSettings["theme"]) => void;
}

export const useSettingsStore = create<SettingsState>()(
  immer((set) => ({
    // --- Initial state ---
    settings: loadAppSettings(),
    showSettingsDialog: false,
    originalSettings: null,

    // --- Load from localStorage ---
    loadSettings: () => {
      set((state) => {
        state.settings = loadAppSettings();
      });
    },

    // --- Update settings (persist immediately) ---
    updateSettings: (patch) =>
      set((state) => {
        Object.assign(state.settings, patch);
        persistAppSettings(state.settings);
      }),

    // --- Update destinations (persist immediately) ---
    updateDestinations: (dests) =>
      set((state) => {
        state.settings.destinations = dests;
        persistAppSettings(state.settings);
      }),

    // --- Theme ---
    handleThemeChange: (theme) =>
      set((state) => {
        state.settings.theme = theme;
        // Persist only when dialog is closed (saveAndCloseSettings handles it)
        if (!state.showSettingsDialog) persistAppSettings(state.settings);
        document.documentElement.className = theme;
      }),

    handleShowPreviewChange: (show) =>
      set((state) => {
        state.settings.showPreview = show;
        // Persist only when dialog is closed (saveAndCloseSettings handles it)
        if (!state.showSettingsDialog) persistAppSettings(state.settings);
      }),

    applyTheme: (theme) => {
      document.documentElement.className = theme;
    },

    // --- Dialog ---
    setShowSettingsDialog: (open) =>
      set((state) => {
        state.showSettingsDialog = open;
      }),

    handleOpenSettingsDialog: () =>
      set((state) => {
        if (!state.originalSettings) {
          // deepClone safely copies Immer proxies into plain objects
          state.originalSettings = deepClone(state.settings);
        }
        state.showSettingsDialog = true;
      }),

    handleCancelSettings: () =>
      set((state) => {
        if (state.originalSettings) {
          // Preserve current destinations — do NOT overwrite changes made in
          // the Upload Destinations dialog (add/edit/delete are persisted
          // immediately, enabled state is persisted on its own Save & close).
          const currentDestinations = state.settings.destinations;
          state.settings = deepClone(state.originalSettings);
          state.settings.destinations = currentDestinations;
          persistAppSettings(state.settings);
          // Restore the original theme CSS class
          document.documentElement.className = state.settings.theme;
          state.originalSettings = null;
        }
        state.showSettingsDialog = false;
      }),

    saveAndCloseSettings: () =>
      set((state) => {
        persistAppSettings(state.settings);
        state.originalSettings = null;
        state.showSettingsDialog = false;
      }),
  })),
);

/** Seed built-in presets on fresh install, reload settings, then apply theme. */
seedBuiltInPresets();
useSettingsStore.getState().loadSettings();
useSettingsStore
  .getState()
  .applyTheme(useSettingsStore.getState().settings.theme);
