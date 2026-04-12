import { DEFAULTS } from "./constants";

// ---------------------------------------------------------------------------
// Inject app shell
// ---------------------------------------------------------------------------
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root not found");

app.innerHTML = `
  <main class="app-shell">
    <header class="app-header">
      <div class="brand-mark" aria-hidden="true"><img src="favicon.svg" alt="Logo" /></div>
      <div>
        <h1>VidGrid-HTML</h1>
        <p class="subtitle">Client-side JPG thumbnail grid generator</p>
      </div>
    </header>

    <section class="panel">
      <div class="controls">

        <div class="presets-row">
          <span class="presets-label" title="Presets">🗂️</span>
          <select id="presetSelect" title="Select a Preset"></select>
          <button id="deletePreset" class="icon-btn" title="Delete Selected Preset">🗑️</button>
          <button id="savePreset"   class="icon-btn" title="Add / Save preset">💾</button>
        </div>

        <div id="presetNameArea" class="preset-name-area">
          <input id="presetNameInput" type="text" placeholder="New Preset Name… (or reuse a name to overwrite it)" maxlength="64" />
          <button id="presetNameConfirm" class="icon-btn" title="Confirm Save">✅</button>
          <button id="presetNameCancel"  class="icon-btn" title="Cancel">✕</button>
        </div>

        <label class="field">
          <span>Video files</span>
          <input id="files" type="file" accept="video/*" multiple />
        </label>

        <label class="field">
          <span>Output width (px)</span>
          <input id="width" type="number" min="240" step="1" value="${DEFAULTS.width}" />
        </label>

        <label class="field">
          <span>Grid columns</span>
          <input id="cols" type="number" min="1" step="1" value="${DEFAULTS.cols}" />
        </label>

        <label class="field">
          <span>Grid rows</span>
          <input id="rows" type="number" min="1" step="1" value="${DEFAULTS.rows}" />
        </label>

        <label class="field">
          <span>Frame spacing (px)</span>
          <input id="spacing" type="number" min="0" step="1" value="${DEFAULTS.spacing}" />
        </label>

        <label class="field">
          <span>Timecode position</span>
          <select id="position">
            <option value="disabled">Disabled</option>
            <option value="top-left" selected>Top-Left</option>
            <option value="top-right">Top-Right</option>
            <option value="bottom-left">Bottom-Left</option>
            <option value="bottom-right">Bottom-Right</option>
          </select>
        </label>

        <label class="field color-field">
          <span>Background color</span>
          <div class="color-input-row">
            <input id="bgColor" type="color" value="${DEFAULTS.bgColor}" />
            <span id="bgColorHex" class="color-hex">${DEFAULTS.bgColor}</span>
          </div>
        </label>

        <label class="field color-field">
          <span>Text color</span>
          <div class="color-input-row">
            <input id="textColor" type="color" value="${DEFAULTS.textColor}" />
            <span id="textColorHex" class="color-hex">${DEFAULTS.textColor}</span>
          </div>
        </label>

        <label class="check">
          <input id="header" type="checkbox" ${DEFAULTS.header ? "checked" : ""}/>
          <span>Show header metadata</span>
        </label>

        <label class="check">
          <input id="preview" type="checkbox" ${DEFAULTS.preview ? "checked" : ""}/>
          <span>Show preview</span>
        </label>

        <div class="actions">
          <button id="start" class="primary">▶️ Start Processing</button>
          <button id="cancel">⏹️ Cancel</button>
          <button id="clear">🗑️ Clear Files</button>
        </div>
      </div>

      <div class="progress-area">
        <div class="progress-block">
          <div class="progress-label">
            <span>Current file</span>
            <span id="currentPct">0%</span>
          </div>
          <progress id="currentProgress" value="0" max="100"></progress>
        </div>

        <div class="progress-block">
          <div class="progress-label">
            <span>Batch progress</span>
            <span id="batchPct">0%</span>
          </div>
          <progress id="batchProgress" value="0" max="100"></progress>
        </div>

        <div id="status" class="status">Select one or more videos to begin.</div>
      </div>
    </section>

    <section class="panel">
      <h2>Outputs</h2>
      <div id="outputs" class="outputs"></div>
    </section>

    <div id="previewModal">
      <div id="previewModalWrapper">
        <button id="previewClose">✕ Close</button>
        <img id="previewModalImg" src="" alt="Preview" />
      </div>
    </div>
  </main>
`;

// ---------------------------------------------------------------------------
// Element references
// ---------------------------------------------------------------------------
const q = <T extends Element>(sel: string) => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Element not found: ${sel}`);
  return el;
};

export const els = {
  files:             q<HTMLInputElement>("#files"),
  width:             q<HTMLInputElement>("#width"),
  cols:              q<HTMLInputElement>("#cols"),
  rows:              q<HTMLInputElement>("#rows"),
  spacing:           q<HTMLInputElement>("#spacing"),
  position:          q<HTMLSelectElement>("#position"),
  bgColor:           q<HTMLInputElement>("#bgColor"),
  bgColorHex:        q<HTMLSpanElement>("#bgColorHex"),
  textColor:         q<HTMLInputElement>("#textColor"),
  textColorHex:      q<HTMLSpanElement>("#textColorHex"),
  header:            q<HTMLInputElement>("#header"),
  preview:           q<HTMLInputElement>("#preview"),
  start:             q<HTMLButtonElement>("#start"),
  cancel:            q<HTMLButtonElement>("#cancel"),
  clear:             q<HTMLButtonElement>("#clear"),
  presetSelect:      q<HTMLSelectElement>("#presetSelect"),
  deletePreset:      q<HTMLButtonElement>("#deletePreset"),
  savePreset:        q<HTMLButtonElement>("#savePreset"),
  presetNameArea:    q<HTMLDivElement>("#presetNameArea"),
  presetNameInput:   q<HTMLInputElement>("#presetNameInput"),
  presetNameConfirm: q<HTMLButtonElement>("#presetNameConfirm"),
  presetNameCancel:  q<HTMLButtonElement>("#presetNameCancel"),
  currentPct:        q<HTMLSpanElement>("#currentPct"),
  batchPct:          q<HTMLSpanElement>("#batchPct"),
  currentProgress:   q<HTMLProgressElement>("#currentProgress"),
  batchProgress:     q<HTMLProgressElement>("#batchProgress"),
  status:            q<HTMLDivElement>("#status"),
  outputs:           q<HTMLDivElement>("#outputs"),
  previewModal:      q<HTMLDivElement>("#previewModal"),
  previewModalImg:   q<HTMLImageElement>("#previewModalImg"),
  previewClose:      q<HTMLButtonElement>("#previewClose"),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Keep the hex label next to a colour picker in sync. */
export const syncColorHex = (
  input: HTMLInputElement,
  label: HTMLSpanElement,
): void => {
  label.textContent = input.value;
  input.addEventListener("input", () => { label.textContent = input.value; });
};

export const setStatus = (text: string): void => {
  els.status.textContent = text;
};
