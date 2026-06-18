import { UPLOAD_TIMEOUT_MS } from "@/constants";
import type { UploadDestination, UploadResult } from "@/types";
import type { UploadProvider, ProviderOptionSchema } from "./providers";

// -- API response types --

interface ImgeUploadSuccess {
  success: true;
  data: {
    code: string;
    direct_url: string;
    viewer_url: string;
    thumb_url: string;
    delete_url: string;
  };
}

interface ImgeUploadError {
  success: false;
  error: {
    message: string;
    code: string;
  };
}

type ImgeUploadResponse = ImgeUploadSuccess | ImgeUploadError;

// -- Options schema --

const OPTIONS_SCHEMA: ProviderOptionSchema[] = [
  {
    key: "nsfw",
    label: "NSFW",
    description: "Mark uploads as Not-Safe-For-Work content.",
    type: "boolean",
    defaultValue: true,
  },
];

// -- Provider --

/**
 * Upload a Blob to im.ge using the /api/v1/upload endpoint.
 * Uses multipart/form-data with the "image" field per the OpenAPI spec.
 * Auth via Authorization: Bearer header.
 */
async function upload(
  blob: Blob,
  filename: string,
  dest: UploadDestination,
  onProgress: (pct: number) => void,
): Promise<UploadResult> {
  const nsfw = (dest.options?.nsfw as boolean) ?? false;

  const formData = new FormData();
  formData.append("image", blob, filename);

  if (nsfw) {
    formData.append("nsfw", "true");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    onProgress(10);

    const headers: Record<string, string> = {};

    if (dest.apiKey) {
      headers["Authorization"] = `Bearer ${dest.apiKey}`;
    }

    const response = await fetch(dest.url, {
      method: "POST",
      body: formData,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    onProgress(90);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `im.ge HTTP ${response.status}${errorText ? ` — ${errorText.slice(0, 120)}` : ""}`,
      );
    }

    const json: ImgeUploadResponse = await response.json();
    onProgress(100);

    if (!json.success) {
      throw new Error(json.error?.message ?? "im.ge upload failed");
    }

    const directUrl = json.data.direct_url;
    const pageUrl = json.data.viewer_url;
    const thumbUrl = json.data.thumb_url;
    const code = json.data.code;

    // Extract the delete token from the delete_url returned by the API.
    // Format: https://im.ge/i/{code}/delete/{token}
    const deleteUrlParts = json.data.delete_url.split("/delete/");
    const deleteToken = deleteUrlParts[1] || undefined;

    return {
      directUrl,
      pageUrl,
      thumbUrl,
      deleteUrl: code,
      deleteToken,
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

/**
 * Permanently delete an image from im.ge using the public delete endpoint.
 * Uses /api/v1/delete/:code/:delete_token which does not require API key
 * permissions. The delete_token is provided in the upload response.
 */
async function deleteFile(
  result: UploadResult,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _dest: UploadDestination,
): Promise<void> {
  // deleteUrl stores the image code
  const code = result.deleteUrl;

  if (!code) {
    throw new Error("Cannot delete: image code not available");
  }

  // deleteToken stores the one-time delete token from the upload response
  const deleteToken = result.deleteToken;

  if (!deleteToken) {
    throw new Error("Cannot delete: delete token not available");
  }

  const response = await fetch(
    `https://im.ge/api/v1/delete/${code}/${deleteToken}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `im.ge delete failed: HTTP ${response.status}${errorText ? ` — ${errorText.slice(0, 120)}` : ""}`,
    );
  }
}

export const imgeProvider: UploadProvider = {
  type: "imge",
  optionsSchema: OPTIONS_SCHEMA,
  upload,
  delete: deleteFile,
  canDelete: (_result: UploadResult, dest: UploadDestination): boolean =>
    !!dest.apiKey,
};
