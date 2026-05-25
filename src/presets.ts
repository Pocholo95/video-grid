import type {
  AppSettings,
  GridCell,
  Presets,
  SavedOptions,
  UploadDestination,
} from "./types";
import { createVersionedStorage } from "./services/storage.service";
import { DEFAULTS } from "./constants";

// ---------------------------------------------------------------------------
// Built-in Presets
// ---------------------------------------------------------------------------
// Easily editable: add, remove, or tweak presets here.
// Each preset defines only the fields that differ from DEFAULTS, so new fields
// added to DEFAULTS automatically propagate to all presets.
// Seeded only on a completely fresh install (no localStorage data).
// ---------------------------------------------------------------------------

/** Helper to build a row of cells. */
function row(y: number, count: number): GridCell[] {
  const w = 60 / count;
  return Array.from({ length: count }, (_, i) => ({
    id: `cell-${y}-${i}`,
    x: i,
    y,
    w,
    h: 1,
  }));
}

/** A built-in preset: partial overrides merged with DEFAULTS at seed time. */
type BuiltInPreset = { name: string; opts: Partial<SavedOptions> };

export const BUILT_IN_PRESETS: BuiltInPreset[] = [
  {
    name: "Hero Shot",
    opts: {
      gridTemplate: {
        cols: 60,
        cells: [...row(0, 3), ...row(1, 1), ...row(2, 3)],
      },
    },
  },
  {
    name: "Balanced",
    opts: {
      gridTemplate: {
        cols: 60,
        cells: [...row(0, 1), ...row(1, 2), ...row(2, 1)],
      },
    },
  },
  {
    name: "Animated Hero Light",
    opts: {
      width: 1280,
      animated: true,
      webpMethod: 6,
      webpQuality: 75,
      gridTemplate: {
        cols: 60,
        cells: [...row(0, 3), ...row(1, 1), ...row(2, 3)],
      },
    },
  },
  {
    name: "Gallery",
    opts: {
      cols: 4,
      rows: 6,
      gridTemplate: {
        cols: 60,
        cells: [...row(0, 4), ...row(1, 2), ...row(2, 1), ...row(3, 4)],
      },
    },
  },
  {
    name: "Film Strip",
    opts: {
      width: 2560,
      cols: 6,
      rows: 2,
      gridTemplate: {
        cols: 60,
        cells: [
          ...row(0, 1),
          ...row(1, 6),
          ...row(2, 1),
          ...row(3, 6),
          ...row(4, 1),
        ],
      },
    },
  },
  {
    name: "Spotlight",
    opts: {
      cols: 2,
      rows: 3,
      gridTemplate: {
        cols: 60,
        cells: [...row(0, 2), ...row(1, 1), ...row(2, 2)],
      },
    },
  },
  {
    name: "Storyboard",
    opts: {
      cols: 1,
      rows: 8,
    },
  },
  {
    name: "Bento Box",
    opts: {
      cols: 2,
      rows: 4,
      gridTemplate: {
        cols: 60,
        cells: [...row(0, 2), ...row(1, 1), ...row(2, 1), ...row(3, 2)],
      },
    },
  },
  {
    name: "Quick Preview",
    opts: {
      width: 1280,
      rows: 2,
    },
  },
  {
    name: "4K Archive",
    opts: {
      width: 3840,
      cols: 4,
      rows: 6,
      spacing: 4,
    },
  },
  {
    name: "VR Side-by-Side",
    opts: {
      vrMode: "sbs-left",
    },
  },
  {
    name: "VR Top-Bottom",
    opts: {
      vrMode: "tb-left",
    },
  },
];

// ---------------------------------------------------------------------------
// Defaults & Storage
// ---------------------------------------------------------------------------

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
 * Seed built-in presets into localStorage if this is a completely fresh install
 * (no app settings stored at all). Once the user has any settings — even if
 * they delete all presets — we do not re-seed.
 */
export const seedBuiltInPresets = (): void => {
  const settings = storage.load(() => structuredClone(DEFAULT));
  if (Object.keys(settings.presets.entries).length === 0) {
    settings.presets.entries = Object.fromEntries(
      BUILT_IN_PRESETS.map((p) => [
        p.name,
        { ...structuredClone(DEFAULTS), ...structuredClone(p.opts) },
      ]),
    );
    storage.save(settings);
  }
};

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

// Preset display helpers

/**
 * Compute a human-readable summary string for a preset, e.g.
 * "Static, 1920px, 3×4" or "Animated, 1280px, Custom: 3 | 1 | 3 (SBS)".
 * Pure display concern — does not modify stored preset names.
 */
export function getPresetSummary(opts: SavedOptions): string {
  const mode = opts.animated ? "Animated" : "Static";
  const width = `${opts.width}px`;

  let grid: string;
  if (opts.gridTemplate && opts.gridTemplate.cells.length > 0) {
    // Group cells by row and show cell count per row
    const rowCounts: number[] = [];
    const byRow = new Map<number, number>();
    for (const cell of opts.gridTemplate.cells) {
      byRow.set(cell.y, (byRow.get(cell.y) ?? 0) + 1);
    }
    for (let y = 0; y < byRow.size; y++) {
      rowCounts.push(byRow.get(y) ?? 0);
    }
    grid = `Custom Grid: ${rowCounts.join(" | ")}`;
  } else {
    grid = `Grid: ${opts.cols}×${opts.rows}`;
  }

  let vr = "";
  if (opts.vrMode && opts.vrMode !== "disabled") {
    if (opts.vrMode.startsWith("sbs")) vr = "(SBS)";
    else if (opts.vrMode.startsWith("tb")) vr = "(TB)";
  }

  return `${mode} · ${width} · ${grid}${vr ? ` · ${vr}` : ""}`;
}

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
