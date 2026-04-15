import { APP_STORAGE_KEY } from "./constants";
import type { AppSettings, Presets, SavedOptions } from "./types";

const DEFAULT: AppSettings = {
  presets: { entries: {}, lastUsed: null },
};

export const loadAppSettings = (): AppSettings => {
  try {
    const raw = localStorage.getItem(APP_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT);
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      presets: {
        entries:  parsed.presets?.entries  ?? {},
        lastUsed: parsed.presets?.lastUsed ?? null,
      },
    };
  } catch {
    return structuredClone(DEFAULT);
  }
};

export const persistAppSettings = (settings: AppSettings): void => {
  try {
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("localStorage write failed:", e);
  }
};

export const loadPresets = (): Presets => loadAppSettings().presets.entries;

export const persistPresets = (entries: Presets): void => {
  const s = loadAppSettings();
  s.presets.entries = entries;
  persistAppSettings(s);
};

export const getLastUsedPreset = (): string | null =>
  loadAppSettings().presets.lastUsed;

export const setLastUsedPreset = (name: string | null): void => {
  const s = loadAppSettings();
  s.presets.lastUsed = name;
  persistAppSettings(s);
};

export const savePreset = (name: string, opts: SavedOptions): void => {
  const entries  = loadPresets();
  entries[name]  = opts;
  persistPresets(entries);
  setLastUsedPreset(name);
};

export const deletePreset = (name: string): void => {
  const entries = loadPresets();
  delete entries[name];
  persistPresets(entries);
  if (getLastUsedPreset() === name) setLastUsedPreset(null);
};
