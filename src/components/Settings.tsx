import { useEffect, useRef, useState, useCallback } from "react";
import {
  Sun,
  Moon,
  Monitor,
  Cloud,
  Code,
  Download,
  CheckCircle,
  AlertCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { UploadDestination } from "../types";
import DestinationManager from "./DestinationManager";
import UserscriptViewer from "./UserscriptViewer";
import {
  downloadUserscript,
  detectCORSTunnelAvailable,
  getCORSStatus,
} from "@/lib/cors-tunnel";
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
  corsModalDismissed: boolean;
  destinations: UploadDestination[];
  onThemeChange: (theme: "dark" | "light" | "dimmed" | "classic") => void;
  onShowPreviewChange: (show: boolean) => void;
  onCorsModalDismissedChange: (dismissed: boolean) => void;
  onSaveAndClose: () => void;
  onCancel: () => void;
  updateDestinations: (dests: UploadDestination[]) => void;
}

export default function Settings({
  open,
  theme,
  showPreview,
  corsModalDismissed,
  destinations,
  onThemeChange,
  onShowPreviewChange,
  onCorsModalDismissedChange,
  onSaveAndClose,
  onCancel,
  updateDestinations,
}: SettingsProps) {
  const [showDestManagerOpen, setShowDestManagerOpen] = useState(false);
  const [showUserscriptViewer, setShowUserscriptViewer] = useState(false);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  // CORS tunnel status check
  type TunnelStatus = "checking" | "available" | "outdated" | "unavailable";
  const [tunnelStatus, setTunnelStatus] = useState<TunnelStatus>("checking");
  const [installedVersion, setInstalledVersion] = useState<
    string | undefined
  >();

  const checkTunnel = useCallback(async () => {
    setTunnelStatus("checking");
    try {
      const ok = await detectCORSTunnelAvailable();
      const state = getCORSStatus();
      if (ok) {
        setTunnelStatus("available");
      } else if (state.versionMismatch) {
        setInstalledVersion(state.installedVersion);
        setTunnelStatus("outdated");
      } else {
        setTunnelStatus("unavailable");
      }
    } catch {
      setTunnelStatus("unavailable");
    }
  }, []);

  useEffect(() => {
    if (open) {
      checkTunnel();
    }
  }, [open, checkTunnel]);

  useEffect(() => {
    if (open) {
      setTimeout(() => saveButtonRef.current?.focus(), 0);
    }
  }, [open]);

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
            <Switch
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

          <Field>
            <FieldLabel>CORS Tunnel UserScript</FieldLabel>
            <FieldDescription>
              Some upload hosts block requests from external websites (CORS).
              Installing this userscript (e.g.{" "}
              <a
                href="https://tampermonkey.net"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Tampermonkey
              </a>
              ) bypasses the restriction so uploads work seamlessly.
            </FieldDescription>

            {/* Status indicator */}
            <div className="mb-2 flex items-center gap-2 text-sm">
              {tunnelStatus === "checking" && (
                <>
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">Checking…</span>
                </>
              )}
              {tunnelStatus === "available" && (
                <>
                  <CheckCircle className="size-4 text-green-500" />
                  <span className="text-green-600 dark:text-green-400">
                    Installed & up to date
                  </span>
                </>
              )}
              {tunnelStatus === "outdated" && (
                <>
                  <AlertCircle className="size-4 text-amber-500" />
                  <span className="text-amber-600 dark:text-amber-400">
                    Outdated (v{installedVersion}) - Update required
                  </span>
                </>
              )}
              {tunnelStatus === "unavailable" && (
                <>
                  <XCircle className="size-4 text-red-500" />
                  <span className="text-red-600 dark:text-red-400">
                    Not detected
                  </span>
                </>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={downloadUserscript}
                className="shrink-0"
              >
                <Download className="size-3 mr-1" />
                Download
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUserscriptViewer(true)}
                className="shrink-0"
              >
                <Code className="size-3 mr-1" />
                View Code
              </Button>
            </div>
          </Field>

          <Field orientation="horizontal">
            <Switch
              id="cors-help-modal"
              checked={corsModalDismissed}
              onCheckedChange={onCorsModalDismissedChange}
            />
            <FieldContent>
              <FieldLabel htmlFor="cors-help-modal">
                Don't show CORS help on upload failure
              </FieldLabel>
              <FieldLabel htmlFor="cors-help-modal">
                <FieldDescription>
                  When enabled, the CORS help modal will not be displayed when
                  an upload is blocked by CORS restrictions
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

        <UserscriptViewer
          open={showUserscriptViewer}
          onClose={() => setShowUserscriptViewer(false)}
        />

        <DialogFooter className="flex justify-between pt-2 min-w-0">
          <Button variant="secondary" onClick={onCancel} className="min-w-0">
            Cancel
          </Button>
          <Button
            ref={saveButtonRef}
            onClick={onSaveAndClose}
            className="min-w-0"
          >
            Save & close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
