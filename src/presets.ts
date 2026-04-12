import { APP_STORAGE_KEY, DEFAULTS, PRESETS_DEFAULT_VALUE } from "./constants";
import { els } from "./dom";
import type { AppSettings, Position, Presets, SavedOptions } from "./types";

// ---------------------------------------------------------------------------
// App settings — single localStorage key for everything
// ---------------------------------------------------------------------------

const DEFAULT_APP_SETTINGS: AppSettings = {
  presets: {
    entries:  {},
    lastUsed: null,
  },
};

export const loadAppSettings = (): AppSettings => {
  try {
    const raw = localStorage.getItem(APP_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_APP_SETTINGS);
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    // Merge with defaults so future new top-level fields degrade gracefully
    return {
      presets: {
        entries:  parsed.presets?.entries  ?? {},
        lastUsed: parsed.presets?.lastUsed ?? null,
      },
    };
  } catch {
    return structuredClone(DEFAULT_APP_SETTINGS);
  }
};

const persistAppSettings = (settings: AppSettings): void => {
  try {
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("localStorage write failed:", e);
  }
};

// ---------------------------------------------------------------------------
// Preset entries helpers
// ---------------------------------------------------------------------------

/** Return just the named preset entries map. */
export const loadPresets = (): Presets =>
  loadAppSettings().presets.entries;

/** Overwrite only the entries map, leaving other settings untouched. */
export const persistPresets = (entries: Presets): void => {
  const settings = loadAppSettings();
  settings.presets.entries = entries;
  persistAppSettings(settings);
};

// ---------------------------------------------------------------------------
// Last-used preset helpers
// ---------------------------------------------------------------------------

export const getLastUsedPreset = (): string | null =>
  loadAppSettings().presets.lastUsed;

/** Persist which preset was most recently activated. Pass null for <Default Preset>. */
export const setLastUsedPreset = (name: string | null): void => {
  const settings = loadAppSettings();
  settings.presets.lastUsed = name;
  persistAppSettings(settings);
};

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

/** Apply an option object to all form controls. */
export const applyOptions = (opts: Partial<SavedOptions>): void => {
  const o: SavedOptions = { ...DEFAULTS, ...opts };
  els.width.value              = String(o.width);
  els.cols.value               = String(o.cols);
  els.rows.value               = String(o.rows);
  els.spacing.value            = String(o.spacing);
  els.position.value           = o.position;
  els.bgColor.value            = o.bgColor;
  els.bgColorHex.textContent   = o.bgColor;
  els.textColor.value          = o.textColor;
  els.textColorHex.textContent = o.textColor;
  els.header.checked           = o.header;
  els.preview.checked          = o.preview;
};

/**
 * Rebuild the preset <select> from storage.
 *
 * Selection priority:
 *   1. Current value (valid + still exists) — preserves selection after save/delete
 *   2. lastUsed from storage              — restores selection on page load
 *   3. <Default Preset>
 */
export const populatePresetSelect = (): void => {
  const settings = loadAppSettings();
  const entries  = settings.presets.entries;
  const lastUsed = settings.presets.lastUsed;
  const current  = els.presetSelect.value;

  els.presetSelect.innerHTML =
    `<option value="${PRESETS_DEFAULT_VALUE}">&lt;Default Preset&gt;</option>`;

  for (const name of Object.keys(entries)) {
    const opt       = document.createElement("option");
    opt.value       = name;
    opt.textContent = name;
    els.presetSelect.appendChild(opt);
  }

  if (current && current !== PRESETS_DEFAULT_VALUE && entries[current]) {
    els.presetSelect.value = current;
  } else if (lastUsed && entries[lastUsed]) {
    els.presetSelect.value = lastUsed;
  } else {
    els.presetSelect.value = PRESETS_DEFAULT_VALUE;
  }

  els.deletePreset.disabled = els.presetSelect.value === PRESETS_DEFAULT_VALUE;
};

/** Read the current form values into a SavedOptions object. */
export const readCurrentOptions = (): SavedOptions => ({
  width:     Number(els.width.value)   || DEFAULTS.width,
  cols:      Number(els.cols.value)    || DEFAULTS.cols,
  rows:      Number(els.rows.value)    || DEFAULTS.rows,
  spacing:   Number(els.spacing.value) || DEFAULTS.spacing,
  position:  (els.position.value as Position) || DEFAULTS.position,
  bgColor:   els.bgColor.value   || DEFAULTS.bgColor,
  textColor: els.textColor.value || DEFAULTS.textColor,
  header:    els.header.checked,
  preview:   els.preview.checked,
});
