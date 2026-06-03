import { UPLOAD_TIMEOUT_MS } from "./constants";
import type { UploadDestination, UploadResult } from "./types";

interface CheveretoSuccessResponse {
  success: true;
  data: {
    url: string;
    url_viewer: string;
    delete_url: string;
    medium?: { url?: string | null };
    thumb?: { url: string | null };
  };
}

interface CheveretoErrorResponse {
  status_code: number;
  error: {
    message: string;
    code?: number;
  };
  status_txt?: string;
}

type CheveretoResponse = CheveretoSuccessResponse | CheveretoErrorResponse;

/**
 * Builds the upload URL by substituting the `{key}` placeholder with the
 * URL-encoded API key. Throws if the URL is invalid, does not use HTTPS,
 * or does not contain the `{key}` placeholder.
 *
 * @param urlTemplate - The URL template containing `{key}`.
 * @param apiKey - The API key to substitute in place of `{key}`.
 * @returns The ready-to-use upload URL.
 */
function buildUploadUrl(urlTemplate: string, apiKey: string): string {
  try {
    new URL(urlTemplate);
  } catch {
    throw new Error("Upload URL is not a valid URL.");
  }
  if (!urlTemplate.startsWith("https://")) {
    throw new Error("Upload URL must use HTTPS.");
  }
  if (!urlTemplate.includes("{key}")) {
    throw new Error(
      "Upload URL must contain {key} as a placeholder for the API key.",
    );
  }
  return urlTemplate.replaceAll("{key}", encodeURIComponent(apiKey));
}

/**
 * Read a Blob as a base64 data URL.
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image data"));
    reader.onload = () => {
      const result = (reader.result as string).split(",")[1];
      if (!result) {
        reject(new Error("Empty base64 data"));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Upload a Blob to a Chevereto-compatible host using the v1 API.
 * Resolves with structured URLs on success, rejects with a descriptive error otherwise.
 *
 * @param blob       - The image data to upload.
 * @param filename   - Original filename (extension is stripped for the `name` field).
 * @param apiKey     - API key for the host.
 * @param urlTemplate - Upload endpoint URL template containing `{key}` placeholder.
 * @param onProgress - Called with 0-100 as the upload progresses.
 */
const uploadToChevereto = async (
  blob: Blob,
  filename: string,
  apiKey: string,
  urlTemplate: string,
  onProgress: (pct: number) => void,
): Promise<UploadResult> => {
  const uploadUrl = buildUploadUrl(urlTemplate, apiKey);

  const b64 = await blobToBase64(blob);

  const formData = new FormData();
  formData.append("image", b64);
  formData.append("name", filename.replace(/\.[^.]+$/, ""));

  // Use XMLHttpRequest for upload progress events (fetch doesn't support upload progress)
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const timeoutId = setTimeout(() => {
      xhr.abort();
    }, UPLOAD_TIMEOUT_MS);

    xhr.open("POST", uploadUrl);
    xhr.timeout = UPLOAD_TIMEOUT_MS;

    // Track upload progress
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      clearTimeout(timeoutId);

      // Try to parse the JSON response regardless of HTTP status
      let json: CheveretoResponse;
      try {
        json = JSON.parse(xhr.responseText) as CheveretoResponse;
      } catch {
        reject(new Error(`Chevereto HTTP ${xhr.status} — invalid response`));
        return;
      }

      // Handle error responses (Chevereto error format has status_code + error object)
      if ("error" in json && json.error?.message) {
        reject(new Error(json.error.message));
        return;
      }

      // Handle unexpected non-200 status without structured error
      if (xhr.status !== 200) {
        reject(new Error(`Chevereto HTTP ${xhr.status}`));
        return;
      }

      onProgress(100);

      if ("success" in json && json.success) {
        resolve({
          directUrl: json.data.url,
          pageUrl: json.data.url_viewer,
          mediumUrl: json.data.medium?.url ?? undefined,
          thumbUrl: json.data.thumb?.url ?? json.data.url,
          deleteUrl: json.data.delete_url,
        });
      } else {
        reject(new Error("Chevereto returned an error"));
      }
    };

    xhr.onerror = () => {
      clearTimeout(timeoutId);
      reject(new Error("Network error during upload"));
    };

    xhr.ontimeout = () => {
      clearTimeout(timeoutId);
      reject(new Error("Upload timed out"));
    };

    xhr.onabort = () => {
      clearTimeout(timeoutId);
      reject(new Error("Upload timed out"));
    };

    xhr.send(formData);
  });
};

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
      return uploadToChevereto(
        blob,
        filename,
        destination.apiKey,
        destination.url,
        onProgress,
      );
    default:
      return Promise.reject(
        new Error(`Unknown destination type: ${destination.type as string}`),
      );
  }
};
