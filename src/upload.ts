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
 * Upload a Blob to Catbox (catbox.moe) using the binary upload API.
 * Catbox returns a plain URL string on success. The userhash is optional —
 * when omitted the upload is anonymous.
 *
 * Uses fetch API with FormData for proper CORS handling.
 *
 * @param blob       - The file data to upload.
 * @param filename   - Original filename (extension is extracted for the upload).
 * @param userhash   - Optional user hash for authenticated uploads.
 * @param onProgress - Called with 0-100 as the upload progresses.
 */
const uploadToCatbox = async (
  blob: Blob,
  filename: string,
  userhash: string,
  urlTemplate: string,
  onProgress: (pct: number) => void,
): Promise<UploadResult> => {
  const url = urlTemplate;

  // Extract extension from filename for the upload
  const extension = filename.includes(".")
    ? filename.slice(filename.lastIndexOf(".") + 1)
    : "jpg";

  const formData = new FormData();
  formData.append("reqtype", "fileupload");
  if (userhash) {
    formData.append("userhash", userhash);
  }
  formData.append("fileToUpload", blob, `file.${extension}`);

  // Serialize FormData to an ArrayBuffer for progress tracking
  // FormData cannot be directly serialized in browsers, so we build the
  // multipart body manually using the same boundaries.
  const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`;
  const CRLF = "\r\n";

  // Build the multipart headers
  let bodyParts = "";
  bodyParts += `${CRLF}--${boundary}${CRLF}`;
  bodyParts += `Content-Disposition: form-data; name="reqtype"${CRLF}${CRLF}`;
  bodyParts += "fileupload";
  bodyParts += `${CRLF}--${boundary}${CRLF}`;

  if (userhash) {
    bodyParts += `Content-Disposition: form-data; name="userhash"${CRLF}${CRLF}`;
    bodyParts += userhash;
    bodyParts += `${CRLF}--${boundary}${CRLF}`;
  }

  bodyParts += `Content-Disposition: form-data; name="fileToUpload"; filename="file.${extension}"${CRLF}`;
  bodyParts += `Content-Type: ${blob.type || "application/octet-stream"}${CRLF}${CRLF}`;

  const headerBytes = new TextEncoder().encode(bodyParts);
  const footerBytes = new TextEncoder().encode(`${CRLF}--${boundary}--${CRLF}`);
  const totalSize = headerBytes.length + blob.size + footerBytes.length;

  // Create a ReadableStream that wraps FormData with progress tracking
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(headerBytes);
      const chunk = await blob.slice(0, blob.size).arrayBuffer();
      controller.enqueue(new Uint8Array(chunk));
      controller.enqueue(footerBytes);
      controller.close();
    },
  });

  // Use AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    // Read the stream manually to track progress
    let loaded = 0;
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      const pct = Math.round((loaded / totalSize) * 100);
      onProgress(pct);
    }

    const bodyBuffer = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      bodyBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    const response = await fetch(url, {
      method: "POST",
      body: bodyBuffer,
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Catbox HTTP ${response.status}`);
    }

    const catboxUrl = (await response.text()).trim();

    // Validate the response is a valid catbox URL
    if (!catboxUrl.includes("files.catbox.moe/")) {
      throw new Error(
        `Catbox returned an invalid URL: ${catboxUrl.slice(0, 120)}`,
      );
    }

    onProgress(100);

    return {
      directUrl: catboxUrl,
      pageUrl: catboxUrl,
      thumbUrl: catboxUrl,
      deleteUrl: catboxUrl,
      deleteToken: userhash || undefined,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (controller.signal.aborted) {
      throw new Error("Upload timed out");
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Network error during upload");
  }
};

/**
 * Delete a file from Catbox using the API.
 * Requires the userhash that was used to upload the file.
 *
 * @param fileUrl - The Catbox file URL to delete (e.g. https://files.catbox.moe/abc123.jpg)
 * @param userhash - The user hash used for the upload.
 * @param apiUrl - The Catbox API endpoint URL.
 */
export const deleteFromCatbox = async (
  fileUrl: string,
  userhash: string,
  apiUrl: string,
): Promise<void> => {
  // Extract just the filename from the full URL (e.g. "eh871k.png")
  const filename = fileUrl.split("/").pop() || fileUrl;

  const params = new URLSearchParams();
  params.append("reqtype", "deletefiles");
  params.append("userhash", userhash);
  params.append("files", filename);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl);
    xhr.onload = () => {
      if (xhr.status !== 200) {
        reject(new Error(`Catbox delete failed: HTTP ${xhr.status}`));
        return;
      }
      const text = xhr.responseText.trim();
      // Catbox returns "Files successfully deleted." on success
      if (!text.includes("successfully deleted")) {
        reject(new Error(`Catbox delete failed: ${text.slice(0, 120)}`));
        return;
      }
      resolve();
    };
    xhr.onerror = () => reject(new Error("Network error during delete"));
    xhr.send(params);
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
    case "catbox":
      return uploadToCatbox(
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
