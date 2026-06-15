import { useEffect, useState } from "react";
import { Cloud, Pencil, Plus, Trash2 } from "lucide-react";
import type { UploadDestination } from "../types";
import { makeId } from "../utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  UPLOAD_DESTINATION_PROVIDERS,
  DEFAULT_DEST_ALLOWED_EXTENSIONS,
  DEFAULT_DEST_MAX_SIZE_MB,
} from "@/constants";
import RangeNumberInput from "@/components/control/RangeNumberInput";

const EMPTY: Omit<UploadDestination, "id"> = {
  name: "",
  type: "chevereto",
  apiKey: "",
  url: UPLOAD_DESTINATION_PROVIDERS.chevereto.defaultUrl,
  enabled: true,
  allowedExtensions: DEFAULT_DEST_ALLOWED_EXTENSIONS,
  maxSizeMb: DEFAULT_DEST_MAX_SIZE_MB,
};

interface Props {
  open: boolean;
  destinations: UploadDestination[];
  onSave: (destinations: UploadDestination[]) => void;
  onUpdate: (destinations: UploadDestination[]) => void;
  onClose: () => void;
}

export default function DestinationManager({
  open,
  destinations,
  onSave,
  onUpdate,
  onClose,
}: Props) {
  const [list, setList] = useState<UploadDestination[]>(() =>
    structuredClone(destinations),
  );
  const [editing, setEditing] = useState<UploadDestination | null>(null);
  const [draft, setDraft] = useState<Omit<UploadDestination, "id">>(EMPTY);
  const [error, setError] = useState("");

  // Re‑initialize list from the latest saved settings every time dialog opens
  useEffect(() => {
    if (open) {
      setList(structuredClone(destinations));
    }
  }, [open, destinations]);

  const openAdd = () => {
    setEditing({ id: "__new__", ...EMPTY });
    setDraft({ ...EMPTY });
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
      allowedExtensions: d.allowedExtensions,
      maxSizeMb: d.maxSizeMb,
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

    // {key} placeholder is only required for Chevereto destinations
    if (draft.type === "chevereto" && !trimmedUrl.includes("{key}")) {
      setError(
        "Upload URL must contain {key} as a placeholder for the API key.",
      );
      return;
    }

    // API key is required for Chevereto, optional for Catbox (anonymous upload)
    if (draft.type === "chevereto" && !draft.apiKey.trim()) {
      setError("API key is required for Chevereto destinations.");
      return;
    }

    // Validate & normalize allowedExtensions: comma-separated, alphanumeric only
    const rawExt = draft.allowedExtensions.trim();
    let normalizedExt = rawExt;
    if (rawExt) {
      const parts = rawExt.split(",").map((s) => s.trim().replace(/^\.+/, ""));
      if (parts.some((p) => p && /[^\w]/.test(p))) {
        setError(
          "Allowed extensions must be comma-separated alphanumeric names (e.g. jpg,webp).",
        );
        return;
      }
      normalizedExt = parts.join(",");
    }

    const base = {
      name: draft.name.trim(),
      apiKey: draft.apiKey.trim(),
      url: trimmedUrl,
      type: draft.type,
      enabled: draft.enabled,
      allowedExtensions: normalizedExt,
      maxSizeMb: draft.maxSizeMb,
    };

    if (editing!.id === "__new__") {
      const newList = [
        ...list,
        {
          id: makeId(),
          ...base,
        },
      ];
      setList(newList);
      onUpdate(newList); // Persist immediately
    } else {
      const newList = list.map((d) =>
        d.id === editing!.id ? { ...d, ...base } : d,
      );
      setList(newList);
      onUpdate(newList); // Persist immediately
    }
    setEditing(null);
    setError("");
  };

  const toggleEnabled = (id: string) => {
    const newList = list.map((d) =>
      d.id === id ? { ...d, enabled: !d.enabled } : d,
    );
    setList(newList);
    // Enabled state is persisted only when user clicks "Save & close" below
    // (via onSave → updateDestinations → persistAppSettings)
  };

  const removeItem = (id: string) => {
    const newList = list.filter((d) => d.id !== id);
    setList(newList);
    onUpdate(newList); // Persist immediately
    setEditing(null);
    setError("");
  };

  const handleSaveAndClose = () => {
    onSave(list);
    onClose();
  };

  const handleDiscardAndClose = () => {
    // Just close without saving - list will be reset on next open from parent
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => !isOpen && handleDiscardAndClose()}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="size-5" />
            <span>Upload Destinations</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {list.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No destinations yet. Add one below.
            </p>
          )}
          {list.map((d) => (
            <div
              key={d.id}
              className={cn(
                "bg-muted/30 flex flex-wrap items-center gap-3 rounded-md border p-3",
                !d.enabled && "opacity-60",
              )}
            >
              <Switch
                checked={d.enabled}
                onCheckedChange={() => toggleEnabled(d.id)}
              />
              <span className="bg-secondary text-secondary-foreground rounded px-2 py-0.5 font-mono text-xs">
                {d.type}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {d.name}
              </span>
              <span className="text-muted-foreground font-mono text-xs">
                {d.apiKey.slice(0, 8)}…
              </span>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEdit(d)}
                  title="Edit"
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeItem(d.id)}
                  title="Delete"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {editing && (
          <div className="bg-card flex flex-col gap-4 rounded-md border p-4">
            <h3 className="text-sm font-semibold">
              {editing.id === "__new__"
                ? "Add destination"
                : "Edit destination"}
            </h3>

            <div className="flex flex-col gap-2">
              <Label htmlFor="dest-name">Name</Label>
              <Input
                id="dest-name"
                type="text"
                value={draft.name}
                maxLength={64}
                placeholder="My Chevereto account"
                onChange={(e) =>
                  setDraft((p) => ({ ...p, name: e.target.value }))
                }
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="dest-type">Type</Label>
              <Select
                value={draft.type}
                onValueChange={(value) => {
                  const newType = value as "chevereto" | "catbox";
                  setDraft((p) => ({
                    ...p,
                    type: newType,
                    url: UPLOAD_DESTINATION_PROVIDERS[newType].defaultUrl,
                  }));
                }}
              >
                <SelectTrigger id="dest-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chevereto">Chevereto</SelectItem>
                  <SelectItem value="catbox">Catbox</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="dest-url">Upload URL</Label>
              <Input
                id="dest-url"
                type="text"
                value={draft.url}
                placeholder={UPLOAD_DESTINATION_PROVIDERS.chevereto.defaultUrl}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, url: e.target.value }))
                }
                autoComplete="off"
              />
              {draft.type === "chevereto" ? (
                <p className="text-muted-foreground text-xs">
                  Use{" "}
                  <code className="bg-muted rounded px-1 py-0.5 font-mono">
                    {"{key}"}
                  </code>{" "}
                  as a placeholder for the API key. HTTPS required.
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Catbox uses a fixed upload endpoint. HTTPS required.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="dest-key">
                {draft.type === "catbox" ? "User hash (optional)" : "API Key"}
              </Label>
              <Input
                id="dest-key"
                type="text"
                value={draft.apiKey}
                placeholder={
                  draft.type === "catbox"
                    ? "Leave empty for anonymous uploads"
                    : "Paste your API key"
                }
                onChange={(e) =>
                  setDraft((p) => ({ ...p, apiKey: e.target.value }))
                }
                autoComplete="off"
              />
              {draft.type === "catbox" && (
                <p className="text-muted-foreground text-xs">
                  Catbox supports anonymous uploads. Provide your user hash to
                  associate uploads with your account.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="dest-extensions">Allowed Extensions</Label>
              <Input
                id="dest-extensions"
                type="text"
                value={draft.allowedExtensions}
                placeholder={DEFAULT_DEST_ALLOWED_EXTENSIONS}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, allowedExtensions: e.target.value }))
                }
              />
              <p className="text-muted-foreground text-xs">
                Comma-separated extensions (e.g.{" "}
                <code className="bg-muted rounded px-1 py-0.5 font-mono">
                  jpg,webp
                </code>
                ). Leave empty to allow all file types.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="dest-maxsize">Max File Size</Label>
              <RangeNumberInput
                id="dest-maxsize"
                value={draft.maxSizeMb}
                min={0}
                max={64}
                step={1}
                suffix="MB"
                hardMin={0}
                hardMax={Number.MAX_SAFE_INTEGER}
                onChange={(v) => setDraft((p) => ({ ...p, maxSizeMb: v }))}
              />
              <p className="text-muted-foreground text-xs">
                0 means no size limit. Files larger than this will be blocked
                from upload.
              </p>
            </div>

            {error && (
              <p className="text-destructive text-sm font-medium">{error}</p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={cancelEdit}>
                Cancel
              </Button>
              <Button variant="default" onClick={confirmEdit}>
                {editing.id === "__new__" ? "Add" : "Update"}
              </Button>
            </div>
          </div>
        )}

        {!editing && (
          <Button variant="outline" onClick={openAdd} className="w-full">
            <Plus className="size-4" /> Add destination
          </Button>
        )}

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={handleDiscardAndClose}
            disabled={editing !== null}
          >
            Discard changes
          </Button>
          <Button
            variant="default"
            onClick={handleSaveAndClose}
            disabled={editing !== null}
          >
            Save & close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
