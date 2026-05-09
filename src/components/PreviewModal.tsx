import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";

interface Props {
  url: string | null;
  onClose: () => void;
}

/**
 * Full-screen image preview modal.
 *
 * Built directly on the Radix Dialog primitive (rather than the styled
 * `DialogContent`) so the image can fill the viewport without the
 * default bordered/rounded card styling.
 *
 * @param url - Blob URL of the image to display, or null when closed.
 * @param onClose - Called when the user dismisses the modal.
 */
export default function PreviewModal({ url, onClose }: Props) {
  const isOpen = url !== null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="bg-black/80" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            Image preview
          </DialogPrimitive.Title>
          <DialogPrimitive.Close
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80 ring-offset-background focus-visible:ring-ring absolute top-4 right-4 inline-flex size-9 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            aria-label="Close preview"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
          {url && (
            <img
              src={url}
              alt="Preview"
              className="max-h-full max-w-full rounded-md object-contain shadow-2xl"
            />
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
