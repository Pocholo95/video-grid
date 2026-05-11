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

        <FieldSet className="p-4 rounded-lg border bg-muted/30">
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
                <SelectItem value="dark" className="flex items-center gap-2">
                  <Moon className="size-4" /> Dark
                  <span className="text-muted-foreground ml-auto text-xs truncate max-w-30 sm:max-w-xs">
                    Default dark theme with muted colors
                  </span>
                </SelectItem>
                <SelectItem value="dimmed" className="flex items-center gap-2">
                  <div className="size-4 relative flex items-end justify-center">
                    <Moon className="size-full opacity-50" />
                    <Sun className="absolute size-[60%] top-[-30%]" />
                  </div>{" "}
                  Dimmed
                  <span className="text-muted-foreground ml-auto text-xs truncate max-w-30 sm:max-w-xs">
                    Reduced eye strain, softer than light
                  </span>
                </SelectItem>
                <SelectItem value="light" className="flex items-center gap-2">
                  <Sun className="size-4" /> Light
                  <span className="text-muted-foreground ml-auto text-xs truncate max-w-30 sm:max-w-xs">
                    Bright light theme for daytime use
                  </span>
                </SelectItem>
                <SelectItem value="classic" className="flex items-center gap-2">
                  <Monitor className="size-4" /> Classic
                  <span className="text-muted-foreground ml-auto text-xs truncate max-w-30 sm:max-w-xs">
                    Original navy and blue palette
                  </span>
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
              <FieldDescription>
                Display thumbnail previews in the tasks list (app-wide)
              </FieldDescription>
            </FieldContent>
          </Field>

          <FieldSeparator />

          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 flex flex-col gap-1">
              <Button
                variant={"outline"}
                onClick={() => setShowDestManagerOpen(true)}
              >
                <Cloud className="size-4 shrink-0 opacity-70 mr-2" />
                Upload Destinations
                {(() => {
                  const enabled = destinations.filter((d) => d.enabled).length;
                  return ` (${enabled}/${destinations.length})`;
                })()}
              </Button>
              <span className="text-muted-foreground text-xs">
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

        <DialogFooter className="flex justify-between pt-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onSaveAndClose}>Save & close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
