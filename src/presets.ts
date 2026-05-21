import type {
  AppSettings,
  Presets,
  SavedOptions,
  UploadDestination,
} from "./types";
import { createVersionedStorage } from "./services/storage.service";

const DEFAULT: AppSettings = {
  presets: { entries: {}, lastUsed: null },
  destinations: [],
  theme: "dark",
  showPreview: true,
};

/**
 * Singleton VersionedStorage instance for app settings.
 * Handles schema versioning and migration automatically.
 */
const storage = createVersionedStorage();

/**
 * Load the full AppSettings object from localStorage.
 * Returns a safe default if nothing is stored or parsing fails.
 * Automatically runs schema migrations if needed.
 */
export const loadAppSettings = (): AppSettings =>
  storage.load(() => structuredClone(DEFAULT));

/**
 * Persist the full AppSettings object to localStorage.
 * Wraps data in VersionedSettings with current schema version.
 *
 * @param settings - The settings object to store.
 */
export const persistAppSettings = (settings: AppSettings): void => {
  storage.save(settings);
};

// Preset helpers

/** Load only the presets map from persisted settings. */
export const loadPresets = (): Presets => loadAppSettings().presets.entries;

/**
 * Overwrite the presets map while preserving other settings.
 *
 * @param entries - The full replacement presets map.
 */
export const persistPresets = (entries: Presets): void => {
  const s = loadAppSettings();
  s.presets.entries = entries;
  persistAppSettings(s);
};

/** Return the name of the last-used preset, or null. */
export const getLastUsedPreset = (): string | null =>
  loadAppSettings().presets.lastUsed;

/**
 * Set the last-used preset name.
 *
 * @param name - Preset name to record, or null to clear.
 */
export const setLastUsedPreset = (name: string | null): void => {
  const s = loadAppSettings();
  s.presets.lastUsed = name;
  persistAppSettings(s);
};

/**
 * Save a named preset and mark it as last-used.
 *
 * @param name - Display name for the preset.
 * @param opts - The SavedOptions to store.
 */
export const savePreset = (name: string, opts: SavedOptions): void => {
  const entries = loadPresets();
  entries[name] = opts;
  persistPresets(entries);
  setLastUsedPreset(name);
};

/**
 * Delete a named preset. If it was the last-used preset, clears that pointer.
 *
 * @param name - The preset name to remove.
 */
export const deletePreset = (name: string): void => {
  const entries = loadPresets();
  delete entries[name];
  persistPresets(entries);
  if (getLastUsedPreset() === name) setLastUsedPreset(null);
};

// Destination helpers

/** Load the destinations array from persisted settings. */
export const loadDestinations = (): UploadDestination[] =>
  loadAppSettings().destinations;

/**
 * Overwrite the destinations array while preserving other settings.
 *
 * @param destinations - Full replacement list of upload destinations.
 */
export const persistDestinations = (
  destinations: UploadDestination[],
): void => {
  const s = loadAppSettings();
  s.destinations = destinations;
  persistAppSettings(s);
};
