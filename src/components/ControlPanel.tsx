import React, { useRef, useState } from "react";
import { DEFAULTS, PRESETS_DEFAULT_VALUE } from "../constants";
import { deletePreset, loadPresets, savePreset } from "../presets";
import type { AppSettings, SavedOptions } from "../types";
import type { ProcessorStatus } from "../hooks/useProcessor";

interface Props {
  opts: SavedOptions;
  setOpts: (o: SavedOptions) => void;
  presets: AppSettings["presets"];
  setPresets: (p: AppSettings["presets"]) => void;
  status: ProcessorStatus;
  isProcessing: boolean;
  hasFiles: boolean;
  allMetadataReady: boolean;
  onFilesChange: (files: File[]) => void;
  onStart: () => void;
  onCancel: () => void;
  onClear: () => void;
}

export default function ControlPanel({
  opts, setOpts, presets, setPresets,
  status, isProcessing, hasFiles, allMetadataReady,
  onFilesChange, onStart, onCancel, onClear,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const presetNameRef = useRef<HTMLInputElement>(null);
  const [nameVisible, setNameVisible] = useState(false);
  const [nameValue, setNameValue] = useState("");

  // ── Controlled field helpers ──────────────────────────────────────────────
  const numField = (key: "width" | "cols" | "rows" | "spacing") => ({
    value: String(opts[key]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setOpts({ ...opts, [key]: Number(e.target.value) || 0 }),
  });

  const checkField = (key: "header" | "preview") => ({
    checked: opts[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setOpts({ ...opts, [key]: e.target.checked }),
  });

  // ── Preset management ─────────────────────────────────────────────────────
  const applyPreset = (name: string) => {
    if (name === PRESETS_DEFAULT_VALUE) {
      setOpts(DEFAULTS);
      setPresets({ ...presets, lastUsed: null });
    } else if (presets.entries[name]) {
      setOpts(presets.entries[name]);
      setPresets({ ...presets, lastUsed: name });
    }
  };

  const openSave = () => {
    const cur = presets.lastUsed;
    setNameValue(cur && cur !== PRESETS_DEFAULT_VALUE ? cur : "");
    setNameVisible(true);
    setTimeout(() => presetNameRef.current?.focus(), 0);
  };

  const confirmSave = () => {
    const name = nameValue.trim();
    if (!name || name === PRESETS_DEFAULT_VALUE) return;
    savePreset(name, opts);
    const entries = loadPresets();
    setPresets({ entries, lastUsed: name });
    setNameVisible(false);
  };

  const handleDelete = () => {
    const name = presets.lastUsed;
    if (!name) return;
    deletePreset(name);
    const entries = loadPresets();
    setPresets({ entries, lastUsed: null });
    setOpts(DEFAULTS);
  };

  const batchPct = status.batchTotal > 0
    ? Math.round((status.batchDone / status.batchTotal) * 100)
    : 0;
  const selectedPreset = presets.lastUsed ?? PRESETS_DEFAULT_VALUE;

  return (
    <div className="panel">
      <div className="controls">

        {/* ── Presets row ── */}
        <div className="presets-row">
          <span className="presets-label" title="Presets">🗂️</span>
          <select value={selectedPreset} onChange={(e) => applyPreset(e.target.value)}>
            <option value={PRESETS_DEFAULT_VALUE}>&lt;Default Preset&gt;</option>
            {Object.keys(presets.entries).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <button
            className="icon-btn" title="Delete selected preset"
            disabled={!presets.lastUsed} onClick={handleDelete}
          >🗑️</button>
          <button className="icon-btn" title="Save / add preset" onClick={openSave}>💾</button>
        </div>

        {nameVisible && (
          <div className="preset-name-area">
            <input
              ref={presetNameRef}
              type="text"
              placeholder="Preset name… (reuse a name to overwrite)"
              maxLength={64}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); confirmSave(); }
                if (e.key === "Escape") setNameVisible(false);
              }}
            />
            <button className="icon-btn" title="Confirm" onClick={confirmSave}>✅</button>
            <button className="icon-btn" title="Cancel" onClick={() => setNameVisible(false)}>✕</button>
          </div>
        )}

        {/* ── File picker ── */}
        <label className="field">
          <span>Video files</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) onFilesChange(files);
            }}
          />
        </label>

        {/* ── Grid options ── */}
        <label className="field">
          <span>Output width (px)</span>
          <input type="number" min={240} step={1} {...numField("width")} />
        </label>

        <label className="field">
          <span>Grid columns</span>
          <input type="number" min={1} step={1} {...numField("cols")} />
        </label>

        <label className="field">
          <span>Grid rows</span>
          <input type="number" min={1} step={1} {...numField("rows")} />
        </label>

        <label className="field">
          <span>Frame spacing (px)</span>
          <input type="number" min={0} step={1} {...numField("spacing")} />
        </label>

        <label className="field">
          <span>Timecode position</span>
          <select
            value={opts.position}
            onChange={(e) => setOpts({ ...opts, position: e.target.value as SavedOptions["position"] })}
          >
            <option value="disabled">Disabled</option>
            <option value="top-left">Top-Left</option>
            <option value="top-right">Top-Right</option>
            <option value="bottom-left">Bottom-Left</option>
            <option value="bottom-right">Bottom-Right</option>
          </select>
        </label>

        <label className="field color-field">
          <span>Background color</span>
          <div className="color-input-row">
            <input type="color" value={opts.bgColor}
              onChange={(e) => setOpts({ ...opts, bgColor: e.target.value })} />
            <span className="color-hex">{opts.bgColor}</span>
          </div>
        </label>

        <label className="field color-field">
          <span>Text color</span>
          <div className="color-input-row">
            <input type="color" value={opts.textColor}
              onChange={(e) => setOpts({ ...opts, textColor: e.target.value })} />
            <span className="color-hex">{opts.textColor}</span>
          </div>
        </label>

        <label className="check">
          <input type="checkbox" {...checkField("header")} />
          <span>Show header metadata</span>
        </label>

        <label className="check">
          <input type="checkbox" {...checkField("preview")} />
          <span>Show preview</span>
        </label>

        <div className="actions">
          <button
            className="primary"
            disabled={!hasFiles || !allMetadataReady || isProcessing}
            onClick={onStart}
          >▶️ Start Processing</button>
          <button disabled={!isProcessing} onClick={onCancel}>⏹️ Cancel</button>
          <button
            disabled={isProcessing}
            onClick={() => {
              onClear();
              if (fileInputRef.current) {
                fileInputRef.current.value = ""; // Reset file input
              }
            }}
          >
            🗑️ Clear Files
          </button>
        </div>
      </div>

      {/* ── Progress ── */}
      <div className="progress-area">
        <div className="progress-block">
          <div className="progress-label">
            <span>Current file</span>
            <span>{Math.round(status.currentPct)}%</span>
          </div>
          <progress value={status.currentPct} max={100} />
        </div>

        {status.batchTotal > 0 && (
          <div className="progress-block">
            <div className="progress-label">
              <span>Batch progress ({status.batchDone}/{status.batchTotal})</span>
              <span>{batchPct}%</span>
            </div>
            <progress value={batchPct} max={100} />
          </div>
        )}

        <div className="status">{status.text}</div>
      </div>
    </div>
  );
}
