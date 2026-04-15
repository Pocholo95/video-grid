import type { UploadDestination, UploadResult } from "./types";

// ─── imgBB ────────────────────────────────────────────────────────────────────

const uploadToImgBB = (
  blob: Blob,
  filename: string,
  apiKey: string,
  onProgress: (pct: number) => void,
): Promise<UploadResult> =>
  new Promise((resolve, reject) => {
    // Read blob as base64 first (required by imgBB)
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image data"));
    reader.onload  = () => {
      // Strip "data:image/jpeg;base64," prefix
      const b64 = (reader.result as string).split(",")[1];
      if (!b64) { reject(new Error("Empty base64 data")); return; }

      const formData = new FormData();
      formData.append("image", b64);
      formData.append("name", filename.replace(/\.[^.]+$/, ""));

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
      });

      xhr.addEventListener("load", () => {
        onProgress(100);
        if (xhr.status === 200) {
          try {
            const json = JSON.parse(xhr.responseText) as {
              success: boolean;
              data: {
                url: string;
                url_viewer: string;
                delete_url: string;
                thumb?: { url: string };
              };
              error?: { message: string };
            };
            if (json.success) {
              resolve({
                directUrl: json.data.url,
                pageUrl:   json.data.url_viewer,
                thumbUrl:  json.data.thumb?.url ?? json.data.url,
                deleteUrl: json.data.delete_url,
              });
            } else {
              reject(new Error(json.error?.message ?? "imgBB returned an error"));
            }
          } catch {
            reject(new Error("Unexpected response from imgBB"));
          }
        } else if (xhr.status === 400) {
          reject(new Error("imgBB rejected the request — check your API key"));
        } else if (xhr.status === 429) {
          reject(new Error("imgBB rate limit hit — wait a moment and try again"));
        } else {
          reject(new Error(`imgBB HTTP ${xhr.status}`));
        }
      });

      xhr.addEventListener("error",   () => reject(new Error("Network error during upload")));
      xhr.addEventListener("timeout", () => reject(new Error("Upload timed out")));

      xhr.timeout = 120_000; // 2-minute cap
      xhr.open("POST", `https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`);
      xhr.send(formData);
    };
    reader.readAsDataURL(blob);
  });

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Upload a blob to the given destination.
 * Throws on failure so the caller can record the error.
 */
export const uploadBlob = (
  blob: Blob,
  filename: string,
  destination: UploadDestination,
  onProgress: (pct: number) => void,
): Promise<UploadResult> => {
  switch (destination.type) {
    case "imgbb":
      return uploadToImgBB(blob, filename, destination.apiKey, onProgress);
    default:
      return Promise.reject(new Error(`Unknown destination type: ${destination.type as string}`));
  }
};

// ─── Destination storage ──────────────────────────────────────────────────────

import { DESTINATIONS_STORAGE_KEY } from "./constants";
import type { UploadDestination as _UD } from "./types";

export const loadDestinations = (): _UD[] => {
  try {
    const raw = localStorage.getItem(DESTINATIONS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as _UD[];
  } catch {
    return [];
  }
};

export const saveDestinations = (destinations: _UD[]): void => {
  try {
    localStorage.setItem(DESTINATIONS_STORAGE_KEY, JSON.stringify(destinations));
  } catch (e) {
    console.warn("localStorage write failed:", e);
  }
};
