import "./style.css";

// dom.ts must be imported first — it injects the HTML template
import { els, setStatus, syncColorHex } from "./dom";
import { DEFAULTS, PRESETS_DEFAULT_VALUE } from "./constants";
import {
  applyOptions,
  loadPresets,
  persistPresets,
  populatePresetSelect,
  readCurrentOptions,
} from "./presets";
import { clearAll, processAll, queueSelectedFiles } from "./queue";
import {
  closePreviewModal,
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
// Image Preview Modal
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
// Presets
// ---------------------------------------------------------------------------
els.presetSelect.addEventListener("change", () => {
  const name = els.presetSelect.value;
  if (name === PRESETS_DEFAULT_VALUE) {
    applyOptions(DEFAULTS);
    setStatus("Loaded default options.");
  } else {
    const presets = loadPresets();
    if (presets[name]) {
      applyOptions(presets[name]);
      setStatus(`Loaded preset "${name}".`);
    }
  }
  els.deletePreset.disabled        = name === PRESETS_DEFAULT_VALUE;
  els.presetNameArea.style.display = "none";
});

els.deletePreset.addEventListener("click", () => {
  const name = els.presetSelect.value;
  if (name === PRESETS_DEFAULT_VALUE) return;
  const presets = loadPresets();
  delete presets[name];
  persistPresets(presets);
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
  const presets = loadPresets();
  const isNew   = !presets[name];
  presets[name] = readCurrentOptions();
  persistPresets(presets);
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
renderOutputs();
updateStartButtonState();
els.cancel.disabled = true;
