import "./style.css";

// dom.ts must be imported first — it injects the HTML template
import { els, setStatus, syncColorHex } from "./dom";
import { DEFAULTS, PRESETS_DEFAULT_VALUE } from "./constants";
import {
  applyOptions,
  getLastUsedPreset,
  loadAppSettings,
  loadPresets,
  persistPresets,
  populatePresetSelect,
  readCurrentOptions,
  setLastUsedPreset,
} from "./presets";
import { clearAll, processAll, queueSelectedFiles } from "./queue";
import {
  closePreviewModal,
  downloadAllOutputs,
  renderOutputs,
  updateStartButtonState,
} from "./render";
import { setCancelRequested } from "./state";
import { warn } from "./utils";

// ---------------------------------------------------------------------------
// Colour picker sync
// ---------------------------------------------------------------------------
syncColorHex(els.bgColor,   els.bgColorHex);
syncColorHex(els.textColor, els.textColorHex);

// ---------------------------------------------------------------------------
// Core controls
// ---------------------------------------------------------------------------
els.files.addEventListener("change", () => void queueSelectedFiles());
els.start.addEventListener("click",  () => void processAll());

els.cancel.addEventListener("click", () => {
  setCancelRequested(true);
  setStatus("Cancelling…");
  warn("Cancel requested by user");
});

els.clear.addEventListener("click", clearAll);

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
els.previewClose.addEventListener("click", closePreviewModal);
els.previewModal.addEventListener("click", (e) => {
  if (e.target === els.previewModal) closePreviewModal();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && els.previewModal.style.display === "flex") {
    closePreviewModal();
  }
});

// ---------------------------------------------------------------------------
// Download All
// ---------------------------------------------------------------------------
els.downloadAll.addEventListener("click", () => void downloadAllOutputs());

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------
els.presetSelect.addEventListener("change", () => {
  const name = els.presetSelect.value;
  if (name === PRESETS_DEFAULT_VALUE) {
    applyOptions(DEFAULTS);
    setLastUsedPreset(null);
    setStatus("Loaded default options.");
  } else {
    const entries = loadPresets();
    if (entries[name]) {
      applyOptions(entries[name]);
      setLastUsedPreset(name);
      setStatus(`Loaded preset "${name}".`);
    }
  }
  els.deletePreset.disabled        = name === PRESETS_DEFAULT_VALUE;
  els.presetNameArea.style.display = "none";
});

els.deletePreset.addEventListener("click", () => {
  const name = els.presetSelect.value;
  if (name === PRESETS_DEFAULT_VALUE) return;
  const entries = loadPresets();
  delete entries[name];
  persistPresets(entries);
  // If the deleted preset was the last-used one, clear that reference too
  if (name === getLastUsedPreset()) setLastUsedPreset(null);
  populatePresetSelect();
  applyOptions(DEFAULTS);
  setStatus(`🗑️ Preset "${name}" deleted.`);
});

els.savePreset.addEventListener("click", () => {
  const currentName = els.presetSelect.value;
  els.presetNameInput.value        =
    currentName === PRESETS_DEFAULT_VALUE ? "" : currentName;
  els.presetNameArea.style.display = "flex";
  els.presetNameInput.focus();
  els.presetNameInput.select();
});

const confirmSavePreset = (): void => {
  const name = els.presetNameInput.value.trim();
  if (!name) {
    setStatus("⚠️ Preset name cannot be empty.");
    els.presetNameInput.focus();
    return;
  }
  if (name === "<Default options>" || name === PRESETS_DEFAULT_VALUE) {
    setStatus("⚠️ That name is reserved.");
    els.presetNameInput.focus();
    return;
  }
  const entries = loadPresets();
  const isNew   = !entries[name];
  entries[name] = readCurrentOptions();
  persistPresets(entries);
  setLastUsedPreset(name);
  populatePresetSelect();
  els.presetSelect.value           = name;
  els.deletePreset.disabled        = false;
  els.presetNameArea.style.display = "none";
  setStatus(
    isNew
      ? `✅ Preset "${name}" created.`
      : `✅ Preset "${name}" updated.`,
  );
};

els.presetNameConfirm.addEventListener("click", confirmSavePreset);
els.presetNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter")  { e.preventDefault(); confirmSavePreset(); }
  if (e.key === "Escape") { els.presetNameArea.style.display = "none"; }
});
els.presetNameCancel.addEventListener("click", () => {
  els.presetNameArea.style.display = "none";
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
populatePresetSelect();

// Restore the last-used preset's options on page load
const { presets } = loadAppSettings();
if (presets.lastUsed && presets.entries[presets.lastUsed]) {
  applyOptions(presets.entries[presets.lastUsed]);
} else {
  applyOptions(DEFAULTS);
}

renderOutputs();
updateStartButtonState();
els.cancel.disabled = true;
