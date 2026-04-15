import { useEffect } from "react";

interface Props {
  url: string | null;
  onClose: () => void;
}

export default function PreviewModal({ url, onClose }: Props) {
  useEffect(() => {
    if (!url) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [url, onClose]);

  if (!url) return null;

  return (
    <div
      id="previewModal"
      style={{ display: "flex" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div id="previewModalWrapper">
        <button id="previewClose" onClick={onClose}>✕ Close</button>
        <img id="previewModalImg" src={url} alt="Preview" />
      </div>
    </div>
  );
}
