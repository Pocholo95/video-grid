import { useEffect } from "react";
import { useScrollLock } from "../hooks/useScrollLock";

interface Props {
  url: string;
  onClose: () => void;
}

/**
 * Full-screen image preview modal. Conditionally mounted by the parent so
 * `url` is always a non-empty string when this component is alive. Scroll is
 * locked for the lifetime of the mount and released on unmount.
 *
 * @param url - Blob URL of the image to display.
 * @param onClose - Called when the user dismisses the modal (backdrop click or Escape).
 */
export default function PreviewModal({ url, onClose }: Props) {
  // Always active - the parent only mounts this component when url is set.
  useScrollLock();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      id="previewModal"
      style={{ display: "flex" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div id="previewModalWrapper">
        <button className="icon-btn" id="previewClose" onClick={onClose}>
          ✕ Close
        </button>
        <img id="previewModalImg" src={url} alt="Preview" />
      </div>
    </div>
  );
}
