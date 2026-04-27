import React, { useRef, useState } from "react";
import { DEFAULTS, PRESETS_DEFAULT_VALUE } from "../constants";
import { deletePreset, loadPresets, savePreset } from "../presets";
import type {
  AppSettings,
  SavedOptions,
  SectionStates,
  VrMode,
} from "../types";

interface Props {
  opts: SavedOptions;
  setOpts: (o: SavedOptions) => void;
  presets: AppSettings["presets"];
  setPresets: (p: AppSettings["presets"]) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFilesChange: (files: File[]) => void;
}

/**
 * A collapsible fieldset. The legend contains a button that toggles the body.
 * The body is always wrapped in a `<div className="ctrl-section-body">` so the
 * grid layout applies regardless of what children are passed in.
 *
 * @param label      - Text shown in the legend toggle.
 * @param expanded   - Whether the body is currently visible.
 * @param onToggle   - Called when the user clicks the legend toggle.
 * @param children   - Body content rendered inside the grid wrapper when expanded.
 * @param bodyClass  - Extra class(es) added to the body wrapper div.
 */
function Section({
  label,
  expanded,
  onToggle,
  children,
  bodyClass = "",
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  bodyClass?: string;
}) {
  return (
    <fieldset className="ctrl-section">
      <legend>
        <button
          type="button"
          className="ctrl-section-toggle"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span>{label}</span>
          <span className={`ctrl-chevron${expanded ? " open" : ""}`}>▲</span>
        </button>
      </legend>
      {expanded && (
        <div className={`ctrl-section-body${bodyClass ? ` ${bodyClass}` : ""}`}>
          {children}
        </div>
      )}
    </fieldset>
  );
}

export default function ControlPanel({
  opts,
  setOpts,
  presets,
  setPresets,
  fileInputRef,
  onFilesChange,
}: Props) {
  const presetNameRef = useRef<HTMLInputElement>(null);
  const [nameVisible, setNameVisible] = useState(false);
  const [nameValue, setNameValue] = useState("");

  // Section states are derived from opts so they are saved/restored with presets.
  // Falls back to all expanded when the key is absent (e.g. older stored presets).
  const sections: SectionStates = opts.sectionStates ?? {
    grid: true,
    style: true,
    modes: true,
  };

  const toggleSection = (key: keyof SectionStates) => {
    setOpts({
      ...opts,
      sectionStates: { ...sections, [key]: !sections[key] },
    });
  };

  // Controlled field helpers
  const numField = (key: "width" | "cols" | "rows" | "spacing") => ({
    value: String(opts[key]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setOpts({ ...opts, [key]: Number(e.target.value) || 0 }),
  });

  const checkField = (key: "header" | "preview" | "animated") => ({
    checked: opts[key] ?? false,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setOpts({ ...opts, [key]: e.target.checked }),
  });

  // Presets management
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

  const selectedPreset = presets.lastUsed ?? PRESETS_DEFAULT_VALUE;
  const isAnimated = opts.animated ?? false;

  return (
    <div className="panel">
      <div className="controls">
        {/* Presets row */}
        <div className="presets-row">
          <span className="presets-label" title="Presets">
            🗂️
          </span>
          <select
            value={selectedPreset}
            onChange={(e) => applyPreset(e.target.value)}
          >
            <option value={PRESETS_DEFAULT_VALUE}>
              &lt;Default Preset&gt;
            </option>
            {Object.keys(presets.entries).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button
            className="icon-btn"
            title="Delete selected preset"
            disabled={!presets.lastUsed}
            onClick={handleDelete}
          >
            🗑️
          </button>
          <button
            className="icon-btn"
            title="Save / add preset"
            onClick={openSave}
          >
            💾
          </button>
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
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmSave();
                }
                if (e.key === "Escape") setNameVisible(false);
              }}
            />
            <button className="icon-btn" title="Confirm" onClick={confirmSave}>
              ✅
            </button>
            <button
              className="icon-btn"
              title="Cancel"
              onClick={() => setNameVisible(false)}
            >
              ✖️
            </button>
          </div>
        )}
        {/* File picker - always visible, outside any section */}
        <label className="field ctrl-full">
          <span>Add video files</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) {
                onFilesChange(files);
                // Reset so the same file(s) can be picked again.
                e.target.value = "";
              }
            }}
          />
        </label>
        {/* Section: Grid */}
        <Section
          label="Grid"
          expanded={sections.grid}
          onToggle={() => toggleSection("grid")}
        >
          <label className="field">
            <span>Output width (px)</span>
            <input type="number" min={240} step={1} {...numField("width")} />
          </label>
          <label className="field">
            <span>Frame spacing (px)</span>
            <input type="number" min={0} step={1} {...numField("spacing")} />
          </label>
          <label className="field">
            <span>Grid columns</span>
            <input type="number" min={1} step={1} {...numField("cols")} />
          </label>
          <label className="field">
            <span>Grid rows</span>
            <input type="number" min={1} step={1} {...numField("rows")} />
          </label>
        </Section>
        {/* Section: Style */}
        <Section
          label="Style"
          expanded={sections.style}
          onToggle={() => toggleSection("style")}
        >
          <label className="field">
            <span>Timecode position</span>
            <select
              value={opts.position}
              onChange={(e) =>
                setOpts({
                  ...opts,
                  position: e.target.value as SavedOptions["position"],
                })
              }
            >
              <option value="disabled">Disabled</option>
              <option value="top-left">Top-Left</option>
              <option value="top-right">Top-Right</option>
              <option value="bottom-left">Bottom-Left</option>
              <option value="bottom-right">Bottom-Right</option>
            </select>
          </label>
          {/* Empty div keeps the colour pickers on their own row */}
          <div />
          <label className="field color-field">
            <span>Background color</span>
            <div className="color-input-row">
              <input
                type="color"
                value={opts.bgColor}
                onChange={(e) => setOpts({ ...opts, bgColor: e.target.value })}
              />
              <span className="color-hex">{opts.bgColor}</span>
            </div>
          </label>
          <label className="field color-field">
            <span>Text color</span>
            <div className="color-input-row">
              <input
                type="color"
                value={opts.textColor}
                onChange={(e) =>
                  setOpts({ ...opts, textColor: e.target.value })
                }
              />
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
        </Section>
        {/* Section: Output Modes - body uses a 2-column layout where each column
            is independent, so expanding Animated never shifts the VR control. */}
        <Section
          label="Output Modes"
          expanded={sections.modes}
          onToggle={() => toggleSection("modes")}
          bodyClass="task-modes-body"
        >
          {/* Left column: Animated WebP */}
          <div className="task-mode-col">
            <label className="check">
              <input type="checkbox" {...checkField("animated")} />
              <span>Animated output (WebP)</span>
            </label>
            {isAnimated && (
              <fieldset className="mode-sub-opts">
                <legend>Animation settings</legend>
                <label className="field">
                  <span>Duration (s)</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={String(opts.animDuration ?? DEFAULTS.animDuration)}
                    onChange={(e) =>
                      setOpts({
                        ...opts,
                        animDuration: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>FPS</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={String(opts.animFps ?? DEFAULTS.animFps)}
                    onChange={(e) =>
                      setOpts({
                        ...opts,
                        animFps: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>WebP method (0-6)</span>
                  <input
                    type="number"
                    min={0}
                    max={6}
                    step={1}
                    value={String(opts.webpMethod ?? DEFAULTS.webpMethod)}
                    onChange={(e) =>
                      setOpts({
                        ...opts,
                        webpMethod: Math.min(
                          6,
                          Math.max(0, Number(e.target.value) || 0),
                        ),
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>WebP quality (5-100)</span>
                  <input
                    type="number"
                    min={5}
                    max={100}
                    step={1}
                    value={String(opts.webpQuality ?? DEFAULTS.webpQuality)}
                    onChange={(e) =>
                      setOpts({
                        ...opts,
                        webpQuality: Math.min(
                          100,
                          Math.max(5, Number(e.target.value) || 5),
                        ),
                      })
                    }
                  />
                </label>
              </fieldset>
            )}
          </div>
          {/* Right column: VR Video */}
          <div className="task-mode-col">
            <label className="field">
              <span>VR Video</span>
              <select
                value={opts.vrMode ?? DEFAULTS.vrMode}
                onChange={(e) =>
                  setOpts({ ...opts, vrMode: e.target.value as VrMode })
                }
              >
                <option value="disabled">Disabled</option>
                <option value="sbs-left">SBS - Crop Left Eye</option>
                <option value="sbs-right">SBS - Crop Right Eye</option>
                <option value="tb-left">TB - Crop Top (Left Eye)</option>
                <option value="tb-right">TB - Crop Bottom (Right Eye)</option>
              </select>
            </label>
          </div>
        </Section>
      </div>
    </div>
  );
}
