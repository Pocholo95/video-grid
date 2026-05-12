import { useState } from "react";
import { Sun, Moon, Monitor, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { UploadDestination } from "../types";
import DestinationManager from "./DestinationManager";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemDescription,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldSet,
  FieldSeparator,
} from "@/components/ui/field";

interface SettingsProps {
  open: boolean;
  theme: "dark" | "light" | "dimmed" | "classic";
  showPreview: boolean;
  destinations: UploadDestination[];
  onThemeChange: (theme: "dark" | "light" | "dimmed" | "classic") => void;
  onShowPreviewChange: (show: boolean) => void;
  onSaveAndClose: () => void;
  onCancel: () => void;
  updateDestinations: (dests: UploadDestination[]) => void;
}

export default function Settings({
  open,
  theme,
  showPreview,
  destinations,
  onThemeChange,
  onShowPreviewChange,
  onSaveAndClose,
  onCancel,
  updateDestinations,
}: SettingsProps) {
  const [showDestManagerOpen, setShowDestManagerOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure the app. Changes are applied interactively but only
            persist if you save them.
          </DialogDescription>
        </DialogHeader>

        <FieldSet className="p-4 rounded-lg border bg-muted/30 min-w-0">
          <Field orientation="responsive" className="">
            <FieldLabel>
              <Moon className="size-4" /> Theme
            </FieldLabel>
            <Select
              value={theme}
              onValueChange={(v: "dark" | "light" | "dimmed" | "classic") =>
                onThemeChange(v)
              }
            >
              <SelectTrigger className="w-full min-w-20 truncate">
                <SelectValue className="truncate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value="dark"
                  className="flex items-center gap-2 min-w-0"
                >
                  <Moon className="size-4 shrink-0" /> Dark
                  <SelectItemDescription>
                    Default dark theme with muted colors
                  </SelectItemDescription>
                </SelectItem>
                <SelectItem
                  value="dimmed"
                  className="flex items-center gap-2 min-w-0"
                >
                  <div className="size-4 relative shrink-0 flex items-end justify-center">
                    <Moon className="size-full opacity-50" />
                    <Sun className="absolute size-[60%] top-[-30%]" />
                  </div>{" "}
                  Dimmed
                  <SelectItemDescription>
                    Reduced eye strain, softer than light
                  </SelectItemDescription>
                </SelectItem>
                <SelectItem
                  value="light"
                  className="flex items-center gap-2 min-w-0"
                >
                  <Sun className="size-4 shrink-0" /> Light
                  <SelectItemDescription>
                    Bright light theme for daytime use
                  </SelectItemDescription>
                </SelectItem>
                <SelectItem
                  value="classic"
                  className="flex items-center gap-2 min-w-0"
                >
                  <Monitor className="size-4 shrink-0" /> Classic
                  <SelectItemDescription>
                    Original navy and blue palette
                  </SelectItemDescription>
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <FieldSeparator />

          <Field orientation="horizontal">
            <Checkbox
              id="show-previews"
              checked={showPreview}
              onCheckedChange={onShowPreviewChange}
            />
            <FieldContent>
              <FieldLabel htmlFor="show-previews">Show Previews</FieldLabel>
              <FieldLabel htmlFor="show-previews">
                <FieldDescription>
                  Display thumbnail previews in the tasks list
                </FieldDescription>
              </FieldLabel>
            </FieldContent>
          </Field>

          <FieldSeparator />

          <div className="flex items-start gap-2 min-w-0">
            <div className="min-w-0 flex-1 flex flex-col gap-1">
              <Button
                variant={"outline"}
                onClick={() => setShowDestManagerOpen(true)}
                className="w-full min-w-0"
              >
                <Cloud className="size-4 shrink-0 opacity-70" />
                <span className="wrap-break-word">
                  Upload Destinations{" "}
                  {(() => {
                    const enabled = destinations.filter(
                      (d) => d.enabled,
                    ).length;
                    return `(${enabled}/${destinations.length})`;
                  })()}
                </span>
              </Button>
              <span className="text-muted-foreground text-xs min-w-0">
                Configure where to upload the generated files
              </span>
            </div>
          </div>
        </FieldSet>

        <DestinationManager
          open={showDestManagerOpen}
          destinations={destinations}
          onSave={(list) => {
            updateDestinations(list);
            setShowDestManagerOpen(false);
          }}
          onUpdate={(updatedDests) => {
            updateDestinations(updatedDests);
          }}
          onClose={() => setShowDestManagerOpen(false)}
        />

        <DialogFooter className="flex justify-between pt-2 min-w-0">
          <Button variant="secondary" onClick={onCancel} className="min-w-0">
            Cancel
          </Button>
          <Button onClick={onSaveAndClose} className="min-w-0">
            Save & close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
