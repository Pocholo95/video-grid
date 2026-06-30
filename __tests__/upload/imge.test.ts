import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  uploadBlob,
  deleteFromDestination,
  canDeleteFromDestination,
} from "@/upload";
import type { UploadDestination } from "@/types";
import { getProvider } from "@/upload/providers";

const imgeDestination: UploadDestination = {
  id: "dest-imge",
  name: "im.ge",
  type: "imge",
  apiKey: "my-api-key",
  url: "https://im.ge",
  enabled: true,
  allowedExtensions: "",
  maxSizeMb: 0,
  options: { nsfw: false },
};

const imgeDestinationNsfw: UploadDestination = {
  ...imgeDestination,
  options: { nsfw: true },
};

const imgeDeleteDestination: UploadDestination = {
  id: "dest-imge",
  name: "im.ge",
  type: "imge",
  apiKey: "my-api-key",
  url: "https://im.ge",
  enabled: true,
  allowedExtensions: "",
  maxSizeMb: 0,
  options: { nsfw: false },
};

/** - im.ge upload tests */

describe("uploadBlob - imge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns UploadResult on successful im.ge upload", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });
    const progressCalls: number[] = [];

    const mockResponse = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          code: "abc123",
          direct_url: "https://i.im.ge/abc123/test.jpg",
          viewer_url: "https://im.ge/i/abc123",
          thumb_url: "https://i.im.ge/abc123/test-t300.webp",
          delete_url: "https://im.ge/i/abc123/delete/token123",
        },
      }),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as never);

    const result = await uploadBlob(
      blob,
      "test.jpg",
      imgeDestination,
      (pct: number) => progressCalls.push(pct),
    );

    expect(result).toMatchObject({
      directUrl: "https://i.im.ge/abc123/test.jpg",
      pageUrl: "https://im.ge/i/abc123",
      thumbUrl: "https://i.im.ge/abc123/test-t300.webp",
      deleteUrl: "abc123",
      deleteToken: "token123",
    });
    expect(progressCalls).toContain(100);
  });

  it("sends nsfw=true when option is enabled", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });

    let capturedBody: FormData | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
      capturedBody = (options as RequestInit).body as FormData;
      return {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: {
            code: "xyz789",
            direct_url: "https://i.im.ge/xyz789/test.jpg",
            viewer_url: "https://im.ge/i/xyz789",
            thumb_url: "https://i.im.ge/xyz789/test-t300.webp",
            delete_url: "https://im.ge/i/xyz789/delete/token456",
          },
        }),
      } as never;
    });

    await uploadBlob(blob, "test.jpg", imgeDestinationNsfw, () => {});

    expect(capturedBody).toBeDefined();
    expect(capturedBody!.get("nsfw")?.toString()).toBe("true");
  });

  it("does not send nsfw when option is disabled", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });

    let capturedBody: FormData | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
      capturedBody = (options as RequestInit).body as FormData;
      return {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: {
            code: "xyz789",
            direct_url: "https://i.im.ge/xyz789/test.jpg",
            viewer_url: "https://im.ge/i/xyz789",
            thumb_url: "https://i.im.ge/xyz789/test-t300.webp",
            delete_url: "https://im.ge/i/xyz789/delete/token456",
          },
        }),
      } as never;
    });

    await uploadBlob(blob, "test.jpg", imgeDestination, () => {});

    expect(capturedBody).toBeDefined();
    expect(capturedBody!.get("nsfw")).toBeNull();
  });

  it("includes deleteToken extracted from API response", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });

    const mockResponse = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          code: "abc123",
          direct_url: "https://i.im.ge/abc123/test.jpg",
          viewer_url: "https://im.ge/i/abc123",
          thumb_url: "https://i.im.ge/abc123/test-t300.webp",
          delete_url: "https://im.ge/i/abc123/delete/token123",
        },
      }),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as never);

    const result = await uploadBlob(
      blob,
      "test.jpg",
      imgeDestination,
      () => {},
    );

    expect(result.deleteToken).toBe("token123");
  });

  it("rejects on HTTP error", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });

    const mockResponse = {
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: vi.fn().mockResolvedValue("Invalid image"),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as never);

    await expect(
      uploadBlob(blob, "test.jpg", imgeDestination, () => {}),
    ).rejects.toThrow(/im.ge HTTP 400/);
  });

  it("rejects on network error", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    await expect(
      uploadBlob(blob, "test.jpg", imgeDestination, () => {}),
    ).rejects.toThrow(/Network error/);
  });

  it("rejects when API returns success=false", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });

    const mockResponse = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        success: false,
        error: { message: "File too large", code: "FILE_TOO_LARGE" },
      }),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as never);

    await expect(
      uploadBlob(blob, "test.jpg", imgeDestination, () => {}),
    ).rejects.toThrow(/File too large/);
  });

  it("rejects on upload timeout via fetch AbortError", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });

    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new DOMException("The operation was aborted.", "AbortError"),
    );

    await expect(
      uploadBlob(blob, "test.jpg", imgeDestination, () => {}),
    ).rejects.toThrow(/The operation was aborted./);
  });

  it("works without API key (anonymous upload)", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });

    const anonymousDest: UploadDestination = {
      ...imgeDestination,
      apiKey: "",
    };

    const mockResponse = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          code: "abc123",
          direct_url: "https://i.im.ge/abc123/test.jpg",
          viewer_url: "https://im.ge/i/abc123",
          thumb_url: "https://i.im.ge/abc123/test-t300.webp",
          delete_url: "https://im.ge/i/abc123/delete/token123",
        },
      }),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as never);

    const result = await uploadBlob(blob, "test.jpg", anonymousDest, () => {});

    expect(result.directUrl).toBe("https://i.im.ge/abc123/test.jpg");
  });
});

/** - im.ge canDelete tests */

describe("canDeleteFromDestination - imge", () => {
  it("returns true when API key is present", () => {
    const result = {
      pageUrl: "https://im.ge/i/abc123",
      directUrl: "https://i.im.ge/abc123/test.jpg",
      thumbUrl: "https://i.im.ge/abc123/test-t300.webp",
      deleteUrl: "abc123",
      deleteToken: "tokenXYZ",
    };

    expect(canDeleteFromDestination(result, imgeDestination)).toBe(true);
  });

  it("returns false when API key is empty", () => {
    const result = {
      pageUrl: "https://im.ge/i/abc123",
      directUrl: "https://i.im.ge/abc123/test.jpg",
      thumbUrl: "https://i.im.ge/abc123/test-t300.webp",
      deleteUrl: "abc123",
    };

    const destWithoutKey: UploadDestination = {
      ...imgeDestination,
      apiKey: "",
    };

    expect(canDeleteFromDestination(result, destWithoutKey)).toBe(false);
  });

  it("provider.canDelete returns true with API key", () => {
    const provider = getProvider("imge");
    expect(provider.canDelete).toBeDefined();
    expect(
      provider.canDelete!(
        {
          pageUrl: "https://im.ge/i/abc123",
          directUrl: "https://i.im.ge/abc123/test.jpg",
          thumbUrl: "https://i.im.ge/abc123/test-t300.webp",
          deleteUrl: "abc123",
        },
        imgeDestination,
      ),
    ).toBe(true);
  });
});

/** - im.ge delete tests */

describe("deleteFromDestination - imge", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects when deleteToken is missing from result", async () => {
    const result = {
      pageUrl: "https://im.ge/i/abc123",
      directUrl: "https://i.im.ge/abc123/test.jpg",
      thumbUrl: "https://i.im.ge/abc123/test-t300.webp",
      deleteUrl: "abc123",
    };

    await expect(
      deleteFromDestination(result, imgeDeleteDestination),
    ).rejects.toThrow(/delete token not available/);
  });

  it("successfully deletes via im.ge public delete endpoint", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(""),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as never);

    // deleteUrl stores the image code, deleteToken stores the one-time token
    const result = {
      pageUrl: "https://im.ge/i/abc123",
      directUrl: "https://i.im.ge/abc123/test.jpg",
      thumbUrl: "https://i.im.ge/abc123/test-t300.webp",
      deleteUrl: "abc123",
      deleteToken: "tokenXYZ",
    };

    await deleteFromDestination(result, imgeDeleteDestination);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://im.ge/api/v1/delete/abc123/tokenXYZ",
      expect.objectContaining({
        method: "DELETE",
      }),
    );
  });

  it("rejects on HTTP error", async () => {
    const mockResponse = {
      ok: false,
      status: 403,
      statusText: "Forbidden",
      text: vi.fn().mockResolvedValue("Unauthorized"),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as never);

    const result = {
      pageUrl: "https://im.ge/i/abc123",
      directUrl: "https://i.im.ge/abc123/test.jpg",
      thumbUrl: "https://i.im.ge/abc123/test-t300.webp",
      deleteUrl: "abc123",
      deleteToken: "tokenXYZ",
    };

    await expect(
      deleteFromDestination(result, imgeDeleteDestination),
    ).rejects.toThrow(/im.ge delete failed/);
  });

  it("rejects on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const result = {
      pageUrl: "https://im.ge/i/abc123",
      directUrl: "https://i.im.ge/abc123/test.jpg",
      thumbUrl: "https://i.im.ge/abc123/test-t300.webp",
      deleteUrl: "abc123",
      deleteToken: "tokenXYZ",
    };

    await expect(
      deleteFromDestination(result, imgeDeleteDestination),
    ).rejects.toThrow(/Network error/);
  });
});
