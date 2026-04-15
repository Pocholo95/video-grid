import type { UploadDestination, UploadResult } from "./types";

/**
 * Upload a Blob to a Chevereto-compatible host using the v1 API.
 * Resolves with structured URLs on success, rejects with a descriptive error otherwise.
 *
 * @param blob       - The image data to upload.
 * @param filename   - Original filename (extension is stripped for the `name` field).
 * @param apiKey     - API key for the host.
 * @param onProgress - Called with 0-100 as the XHR upload progresses.
 */
const uploadToChevereto = (
  blob: Blob,
  filename: string,
  apiKey: string,
  onProgress: (pct: number) => void,
): Promise<UploadResult> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image data"));
    reader.onload  = () => {
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
              reject(new Error(json.error?.message ?? "Chevereto returned an error"));
            }
          } catch {
            reject(new Error("Unexpected response from Chevereto"));
          }
        } else if (xhr.status === 400) {
          reject(new Error("Chevereto rejected the request — check your API key"));
        } else if (xhr.status === 429) {
          reject(new Error("Chevereto rate limit hit — wait a moment and try again"));
        } else {
          reject(new Error(`Chevereto HTTP ${xhr.status}`));
        }
      });

      xhr.addEventListener("error",   () => reject(new Error("Network error during upload")));
      xhr.addEventListener("timeout", () => reject(new Error("Upload timed out")));

      xhr.timeout = 120_000;
      xhr.open("POST", `https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`);
      xhr.send(formData);
    };
    reader.readAsDataURL(blob);
  });

/**
 * Upload a Blob to the given destination, dispatching to the correct
 * provider implementation. Throws on failure so the caller can record the error.
 *
 * @param blob        - Image data to upload.
 * @param filename    - Suggested filename for the host.
 * @param destination - Target upload destination config.
 * @param onProgress  - Called with 0-100 during upload.
 */
export const uploadBlob = (
  blob: Blob,
  filename: string,
  destination: UploadDestination,
  onProgress: (pct: number) => void,
): Promise<UploadResult> => {
  switch (destination.type) {
    case "chevereto":
      return uploadToChevereto(blob, filename, destination.apiKey, onProgress);
    default:
      return Promise.reject(new Error(`Unknown destination type: ${destination.type as string}`));
  }
};
