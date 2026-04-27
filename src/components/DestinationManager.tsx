import { useState } from "react";
import type { UploadDestination } from "../types";
import { makeId } from "../utils";
import { useScrollLock } from "../hooks/useScrollLock";

interface Props {
  destinations: UploadDestination[];
  onSave: (destinations: UploadDestination[]) => void;
  onClose: () => void;
}

const DEFAULT_URL = "https://api.imgbb.com/1/upload?key={key}";

const EMPTY: Omit<UploadDestination, "id"> = {
  name: "",
  type: "chevereto",
  apiKey: "",
  url: DEFAULT_URL,
  enabled: true,
};

export default function DestinationManager({
  destinations,
  onSave,
  onClose,
}: Props) {
  useScrollLock();

  const [list, setList] = useState<UploadDestination[]>(() =>
    structuredClone(destinations),
  );
  const [editing, setEditing] = useState<UploadDestination | null>(null);
  const [draft, setDraft] = useState<Omit<UploadDestination, "id">>(EMPTY);
  const [error, setError] = useState("");

  const openAdd = () => {
    setEditing({ id: "__new__", ...EMPTY });
    setDraft(EMPTY);
    setError("");
  };

  const openEdit = (d: UploadDestination) => {
    setEditing(d);
    setDraft({
      name: d.name,
      type: d.type,
      apiKey: d.apiKey,
      url: d.url,
      enabled: d.enabled,
    });
    setError("");
  };

  const cancelEdit = () => {
    setEditing(null);
    setError("");
  };

  const confirmEdit = () => {
    if (!draft.name.trim()) {
      setError("Name is required.");
      return;
    }

    const trimmedUrl = draft.url.trim();
    if (!trimmedUrl) {
      setError("Upload URL is required.");
      return;
    }
    try {
      new URL(trimmedUrl);
    } catch {
      setError("Upload URL is not a valid URL.");
      return;
    }
    if (!trimmedUrl.startsWith("https://")) {
      setError("Upload URL must start with https://.");
      return;
    }
    if (!trimmedUrl.includes("{key}")) {
      setError(
        "Upload URL must contain {key} as a placeholder for the API key.",
      );
      return;
    }

    if (!draft.apiKey.trim()) {
      setError("API key is required.");
      return;
    }

    if (editing!.id === "__new__") {
      setList((prev) => [
        ...prev,
        {
          id: makeId(),
          ...draft,
          name: draft.name.trim(),
          apiKey: draft.apiKey.trim(),
          url: trimmedUrl,
        },
      ]);
    } else {
      setList((prev) =>
        prev.map((d) =>
          d.id === editing!.id
            ? {
                ...d,
                ...draft,
                name: draft.name.trim(),
                apiKey: draft.apiKey.trim(),
                url: trimmedUrl,
              }
            : d,
        ),
      );
    }
    setEditing(null);
    setError("");
  };

  const toggleEnabled = (id: string) => {
    setList((prev) =>
      prev.map((d) => (d.id === id ? { ...d, enabled: !d.enabled } : d)),
    );
  };

  const removeItem = (id: string) =>
    setList((prev) => prev.filter((d) => d.id !== id));

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-box">
        <div className="modal-header">
          <h2>Upload Destinations</h2>
          <button className="icon-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        <div className="dest-list">
          {list.length === 0 && (
            <p className="empty-note">No destinations yet. Add one below.</p>
          )}
          {list.map((d) => (
            <div
              key={d.id}
              className={`dest-row${d.enabled ? "" : " dest-row--disabled"}`}
            >
              <button
                className={`icon-btn dest-toggle${d.enabled ? " dest-toggle--on" : ""}`}
                title={
                  d.enabled
                    ? "Enabled — click to disable"
                    : "Disabled — click to enable"
                }
                onClick={() => toggleEnabled(d.id)}
              >
                {d.enabled ? "✅" : "⬜"}
              </button>
              <span className="dest-type-badge">{d.type}</span>
              <span className="dest-name">{d.name}</span>
              <span className="dest-key-preview">{d.apiKey.slice(0, 8)}…</span>
              <div className="dest-actions">
                <button
                  className="icon-btn"
                  onClick={() => openEdit(d)}
                  title="Edit"
                >
                  ✏️
                </button>
                <button
                  className="icon-btn danger-btn"
                  onClick={() => removeItem(d.id)}
                  title="Delete"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>

        {editing && (
          <div className="dest-edit-form">
            <h3>
              {editing.id === "__new__"
                ? "Add destination"
                : "Edit destination"}
            </h3>

            <label className="field">
              <span>Name</span>
              <input
                type="text"
                value={draft.name}
                maxLength={64}
                placeholder="My Chevereto account"
                onChange={(e) =>
                  setDraft((p) => ({ ...p, name: e.target.value }))
                }
              />
            </label>

            <label className="field">
              <span>Type</span>
              <select
                value={draft.type}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    type: e.target.value as "chevereto",
                  }))
                }
              >
                <option value="chevereto">Chevereto</option>
              </select>
            </label>

            <label className="field">
              <span>Upload URL</span>
              <input
                type="text"
                value={draft.url}
                placeholder={DEFAULT_URL}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, url: e.target.value }))
                }
                autoComplete="off"
              />
              <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                Use <code>{"{key}"}</code> as a placeholder for the API key.
                HTTPS required.
              </span>
            </label>

            <label className="field">
              <span>API Key</span>
              <input
                type="text"
                value={draft.apiKey}
                placeholder="Paste your API key"
                onChange={(e) =>
                  setDraft((p) => ({ ...p, apiKey: e.target.value }))
                }
                autoComplete="off"
              />
            </label>

            {error && <p className="form-error">{error}</p>}

            <div className="edit-actions">
              <button className="icon-btn primary" onClick={confirmEdit}>
                {editing.id === "__new__" ? "Add" : "Update"}
              </button>
              <button className="icon-btn" onClick={cancelEdit}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {!editing && (
          <button className="icon-btn add-dest-btn" onClick={openAdd}>
            ＋ Add destination
          </button>
        )}

        <div className="modal-footer">
          <button
            className="icon-btn primary"
            onClick={() => {
              onSave(list);
              onClose();
            }}
          >
            Save &amp; close
          </button>
          <button className="icon-btn" onClick={onClose}>
            Discard changes
          </button>
        </div>
      </div>
    </div>
  );
}
