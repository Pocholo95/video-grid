import { Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

interface SettingsProps {
  open: boolean;
  theme: "dark" | "light" | "dimmed" | "classic";
  showPreview: boolean;
  onThemeChange: (theme: "dark" | "light" | "dimmed" | "classic") => void;
  onShowPreviewChange: (show: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function Settings({
  open,
  theme,
  showPreview,
  onThemeChange,
  onShowPreviewChange,
  onSave,
  onCancel,
}: SettingsProps) {
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

        <div className="flex flex-col gap-5 mt-2">
          {/* Theme Selection */}
          <div>
            <label
              htmlFor="theme-select"
              className="text-sm font-medium mb-2 block"
            >
              Theme
            </label>
            <Select
              value={theme}
              onValueChange={(v: "dark" | "light" | "dimmed" | "classic") =>
                onThemeChange(v)
              }
            >
              <SelectTrigger id="theme-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dark" className="flex items-center gap-2">
                  <Moon className="size-4" />
                  Dark
                  <span className="text-muted-foreground ml-auto text-xs">
                    Default dark theme with muted colors
                  </span>
                </SelectItem>
                <SelectItem value="dimmed" className="flex items-center gap-2">
                  <div className="size-4 relative flex items-end justify-center">
                    <Moon className="size-full opacity-50" />
                    <Sun className="absolute size-[60%] top-[-30%]" />
                  </div>
                  Dimmed
                  <span className="text-muted-foreground ml-auto text-xs">
                    Reduced eye strain, softer than light
                  </span>
                </SelectItem>
                <SelectItem value="light" className="flex items-center gap-2">
                  <Sun className="size-4" />
                  Light
                  <span className="text-muted-foreground ml-auto text-xs">
                    Bright light theme for daytime use
                  </span>
                </SelectItem>
                <SelectItem value="classic" className="flex items-center gap-2">
                  <Monitor className="size-4" />
                  Classic
                  <span className="text-muted-foreground ml-auto text-xs">
                    Original navy and blue palette
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Preview Toggle */}
          <div className="flex items-start gap-3">
            <Checkbox
              id="show-previews"
              checked={showPreview}
              onCheckedChange={onShowPreviewChange}
            />
            <div className="flex flex-col gap-0.5">
              <label
                htmlFor="show-previews"
                className="text-sm font-medium leading-none"
              >
                Show Previews
              </label>
              <span className="text-muted-foreground text-xs">
                Display thumbnail previews in the tasks list (app-wide)
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between pt-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save & close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
