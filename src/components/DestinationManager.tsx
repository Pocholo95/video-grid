import { useState } from "react";
import { Cloud, Pencil, Plus, Trash2 } from "lucide-react";
import type { UploadDestination } from "../types";
import { makeId } from "../utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

interface Props {
  open: boolean;
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
  open,
  destinations,
  onSave,
  onClose,
}: Props) {
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

  // Reset internal state every time the dialog re-opens.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      onClose();
      return;
    }
    setList(structuredClone(destinations));
    setEditing(null);
    setDraft(EMPTY);
    setError("");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
              <Checkbox
                checked={d.enabled}
                onCheckedChange={() => toggleEnabled(d.id)}
                title={
                  d.enabled
                    ? "Enabled — click to disable"
                    : "Disabled — click to enable"
                }
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
                onValueChange={(value) =>
                  setDraft((p) => ({
                    ...p,
                    type: value as "chevereto",
                  }))
                }
              >
                <SelectTrigger id="dest-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chevereto">Chevereto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="dest-url">Upload URL</Label>
              <Input
                id="dest-url"
                type="text"
                value={draft.url}
                placeholder={DEFAULT_URL}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, url: e.target.value }))
                }
                autoComplete="off"
              />
              <p className="text-muted-foreground text-xs">
                Use{" "}
                <code className="bg-muted rounded px-1 py-0.5 font-mono">
                  {"{key}"}
                </code>{" "}
                as a placeholder for the API key. HTTPS required.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="dest-key">API Key</Label>
              <Input
                id="dest-key"
                type="text"
                value={draft.apiKey}
                placeholder="Paste your API key"
                onChange={(e) =>
                  setDraft((p) => ({ ...p, apiKey: e.target.value }))
                }
                autoComplete="off"
              />
            </div>

            {error && (
              <p className="text-destructive text-sm font-medium">{error}</p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={cancelEdit}>
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
          <Button variant="ghost" onClick={onClose}>
            Discard changes
          </Button>
          <Button
            variant="default"
            onClick={() => {
              onSave(list);
              onClose();
            }}
          >
            Save &amp; close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
