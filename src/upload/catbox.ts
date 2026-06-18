import { UPLOAD_TIMEOUT_MS } from "@/constants";
import type { UploadDestination, UploadResult } from "@/types";
import type { UploadProvider } from "./providers";

// -- Upload --

/**
 * Upload a Blob to Catbox (catbox.moe) using the binary upload API.
 */
async function upload(
  blob: Blob,
  filename: string,
  dest: UploadDestination,
  onProgress: (pct: number) => void,
): Promise<UploadResult> {
  const url = dest.url;
  const userhash = dest.apiKey;

  const extension = filename.includes(".")
    ? filename.slice(filename.lastIndexOf(".") + 1)
    : "jpg";

  const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`;
  const CRLF = "\r\n";

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

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(headerBytes);
      const chunk = await blob.slice(0, blob.size).arrayBuffer();
      controller.enqueue(new Uint8Array(chunk));
      controller.enqueue(footerBytes);
      controller.close();
    },
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    let loaded = 0;
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      onProgress(Math.round((loaded / totalSize) * 100));
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
}

// -- Delete --

async function deleteFile(
  result: UploadResult,
  dest: UploadDestination,
): Promise<void> {
  const userhash = result.deleteToken || dest.apiKey;
  if (!userhash) {
    throw new Error("Cannot delete: no userhash available");
  }

  const filename = result.deleteUrl.split("/").pop() || result.deleteUrl;

  const params = new URLSearchParams();
  params.append("reqtype", "deletefiles");
  params.append("userhash", userhash);
  params.append("files", filename);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", dest.url);
    xhr.onload = () => {
      if (xhr.status !== 200) {
        reject(new Error(`Catbox delete failed: HTTP ${xhr.status}`));
        return;
      }
      const text = xhr.responseText.trim();
      if (!text.includes("successfully deleted")) {
        reject(new Error(`Catbox delete failed: ${text.slice(0, 120)}`));
        return;
      }
      resolve();
    };
    xhr.onerror = () => reject(new Error("Network error during delete"));
    xhr.send(params);
  });
}

// -- Provider export --

export const catboxProvider: UploadProvider = {
  type: "catbox",
  optionsSchema: [],
  upload,
  delete: deleteFile,
  canDelete: (result: UploadResult, dest: UploadDestination): boolean =>
    !!result.deleteUrl && !!(result.deleteToken || dest.apiKey),
};
