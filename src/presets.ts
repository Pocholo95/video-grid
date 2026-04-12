import { DEFAULTS, PRESETS_DEFAULT_VALUE, PRESETS_LIST_KEY } from "./constants";
import { els } from "./dom";
import type { Position, Presets, SavedOptions } from "./types";

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export const loadPresets = (): Presets => {
  try {
    const raw = localStorage.getItem(PRESETS_LIST_KEY);
    return raw ? (JSON.parse(raw) as Presets) : {};
  } catch {
    return {};
  }
};

export const persistPresets = (presets: Presets): void => {
  try {
    localStorage.setItem(PRESETS_LIST_KEY, JSON.stringify(presets));
  } catch (e) {
    console.warn("localStorage write failed:", e);
  }
};

// ---------------------------------------------------------------------------
// UI
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

/** Rebuild the preset <select> from localStorage, preserving selection if still valid. */
export const populatePresetSelect = (): void => {
  const presets = loadPresets();
  const current = els.presetSelect.value;

  els.presetSelect.innerHTML =
    `<option value="${PRESETS_DEFAULT_VALUE}">&lt;Default Preset&gt;</option>`;

  for (const name of Object.keys(presets)) {
    const opt = document.createElement("option");
    opt.value       = name;
    opt.textContent = name;
    els.presetSelect.appendChild(opt);
  }

  if (current && current !== PRESETS_DEFAULT_VALUE && presets[current]) {
    els.presetSelect.value = current;
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
