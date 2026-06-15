import { useState } from "react";
import { ChevronDown, Cloud, Trash2 } from "lucide-react";
import type { UploadDestination, UploadResult, VideoMetadata } from "../types";
import { buildFormats } from "../uploadUtils";
import { deleteFromCatbox } from "../upload";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CopyField } from "@/components/CopyField";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface Props {
  dest: UploadDestination;
  result: UploadResult;
  filename: string;
  metadata?: VideoMetadata;
  onDelete: (destId: string) => void;
}

/**
 * Per-destination collapsible block listing every named link format
 * (Direct URL, BBCode variants, Markdown, etc.) for one successful upload.
 */
export default function UploadLinks({
  dest,
  result,
  filename,
  metadata,
  onDelete,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const formats = buildFormats(result, filename, metadata);

  // Determine if delete is available:
  // - Chevereto: always has a deleteUrl from the API
  // - Catbox: only if deleteToken (userhash) was provided at upload time
  const canDelete =
    dest.type === "chevereto" ? !!result.deleteUrl : !!result.deleteToken;

  const handleDeleteClick = () => {
    if (dest.type === "catbox") {
      setShowDeleteDialog(true);
    }
    // For Chevereto, the <a> tag opens the delete URL in a new tab
  };

  const handleCatboxConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!result.deleteUrl || !result.deleteToken) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteFromCatbox(result.deleteUrl, result.deleteToken, dest.url);
      // Calling onDelete clears the upload result, which causes this component
      // to unmount (taking the dialog with it). No need to manually close.
      onDelete(dest.id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open && deleting) return;
    setShowDeleteDialog(open);
  };

  return (
    <>
      <Collapsible
        open={expanded}
        onOpenChange={setExpanded}
        className="rounded-md border"
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-expanded={expanded}
              className="hover:bg-accent/50 -mx-1 -my-1 flex flex-1 items-center justify-between gap-2 rounded-md px-1 py-1 text-sm font-medium transition-colors"
            >
              <span className="flex items-center gap-2">
                <Cloud className="size-4" />
                <span>{dest.name}</span>
              </span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 transition-transform duration-200",
                  expanded && "rotate-180",
                )}
              />
            </button>
          </CollapsibleTrigger>
          {canDelete && (
            <Button
              asChild={dest.type === "chevereto"}
              variant="ghost"
              size="sm"
              title={`Delete this image from ${dest.name}`}
              className="text-destructive hover:text-destructive shrink-0"
              onClick={dest.type === "catbox" ? handleDeleteClick : undefined}
            >
              {dest.type === "chevereto" ? (
                <a
                  href={result.deleteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  <Trash2 className="size-4" />
                  Delete
                </a>
              ) : (
                <span className="flex items-center gap-2">
                  <Trash2 className="size-4" />
                  Delete
                </span>
              )}
            </Button>
          )}
        </div>

        <CollapsibleContent>
          <div className="flex flex-col gap-3 border-t p-3">
            {formats.map((f) => (
              <div key={f.key} className="flex flex-col gap-1.5">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{f.label}</span>
                  <span className="text-muted-foreground text-xs">
                    {f.description}
                  </span>
                </div>
                <CopyField
                  value={f.value}
                  fieldType={f.fieldType === "textarea" ? "textarea" : "input"}
                  rows={3}
                />
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Catbox Delete Confirmation Dialog */}
      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={handleDialogOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete from {dest.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the uploaded file from the server.
              The file cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <div className="text-destructive text-sm">{deleteError}</div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleCatboxConfirm}
              disabled={deleting}
            >
              <Trash2 className="size-4" />
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
