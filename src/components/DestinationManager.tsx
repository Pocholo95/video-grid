import { useState } from "react";
import type { UploadDestination } from "../types";
import { makeId } from "../utils";

interface Props {
  destinations: UploadDestination[];
  onSave: (destinations: UploadDestination[]) => void;
  onClose: () => void;
}

const EMPTY: Omit<UploadDestination, "id"> = { name: "", type: "imgbb", apiKey: "" };

export default function DestinationManager({ destinations, onSave, onClose }: Props) {
  const [list,    setList]    = useState<UploadDestination[]>(() => structuredClone(destinations));
  const [editing, setEditing] = useState<UploadDestination | null>(null);
  const [draft,   setDraft]   = useState<Omit<UploadDestination, "id">>(EMPTY);
  const [error,   setError]   = useState("");

  const openAdd = () => {
    setEditing({ id: "__new__", ...EMPTY });
    setDraft(EMPTY);
    setError("");
  };

  const openEdit = (d: UploadDestination) => {
    setEditing(d);
    setDraft({ name: d.name, type: d.type, apiKey: d.apiKey });
    setError("");
  };

  const cancelEdit = () => { setEditing(null); setError(""); };

  const confirmEdit = () => {
    if (!draft.name.trim())   { setError("Name is required."); return; }
    if (!draft.apiKey.trim()) { setError("API key is required."); return; }

    if (editing!.id === "__new__") {
      setList((prev) => [...prev, { id: makeId(), ...draft, name: draft.name.trim(), apiKey: draft.apiKey.trim() }]);
    } else {
      setList((prev) =>
        prev.map((d) => d.id === editing!.id ? { ...d, ...draft, name: draft.name.trim(), apiKey: draft.apiKey.trim() } : d),
      );
    }
    setEditing(null);
    setError("");
  };

  const removeItem = (id: string) => setList((prev) => prev.filter((d) => d.id !== id));

  const handleSave = () => {
    onSave(list);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <h2>Upload Destinations</h2>
          <button className="icon-btn" onClick={onClose} title="Close">✕</button>
        </div>

        {/* Destination list */}
        <div className="dest-list">
          {list.length === 0 && (
            <p className="empty-note">No destinations yet. Add one below.</p>
          )}
          {list.map((d) => (
            <div key={d.id} className="dest-row">
              <span className="dest-type-badge">{d.type}</span>
              <span className="dest-name">{d.name}</span>
              <span className="dest-key-preview">{d.apiKey.slice(0, 8)}…</span>
              <div className="dest-actions">
                <button className="icon-btn" onClick={() => openEdit(d)} title="Edit">✏️</button>
                <button className="icon-btn danger-btn" onClick={() => removeItem(d.id)} title="Delete">🗑️</button>
              </div>
            </div>
          ))}
        </div>

        {/* Inline edit form */}
        {editing && (
          <div className="dest-edit-form">
            <h3>{editing.id === "__new__" ? "Add destination" : "Edit destination"}</h3>

            <label className="field">
              <span>Name</span>
              <input
                type="text"
                value={draft.name}
                maxLength={64}
                placeholder="My imgBB account"
                onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
              />
            </label>

            <label className="field">
              <span>Type</span>
              <select value={draft.type} onChange={(e) => setDraft((p) => ({ ...p, type: e.target.value as "imgbb" }))}>
                <option value="imgbb">imgBB</option>
              </select>
            </label>

            <label className="field">
              <span>
                API Key
                {draft.type === "imgbb" && (
                  <> — <a href="https://api.imgbb.com/" target="_blank" rel="noopener noreferrer">get one here</a></>
                )}
              </span>
              <input
                type="text"
                value={draft.apiKey}
                placeholder="Paste your API key"
                onChange={(e) => setDraft((p) => ({ ...p, apiKey: e.target.value }))}
                autoComplete="off"
              />
            </label>

            {error && <p className="form-error">{error}</p>}

            <div className="edit-actions">
              <button className="primary" onClick={confirmEdit}>
                {editing.id === "__new__" ? "Add" : "Update"}
              </button>
              <button onClick={cancelEdit}>Cancel</button>
            </div>
          </div>
        )}

        {!editing && (
          <button className="add-dest-btn" onClick={openAdd}>＋ Add destination</button>
        )}

        <div className="modal-footer">
          <button className="primary" onClick={handleSave}>Save &amp; close</button>
          <button onClick={onClose}>Discard changes</button>
        </div>
      </div>
    </div>
  );
}
