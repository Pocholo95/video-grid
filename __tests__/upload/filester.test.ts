import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  uploadBlob,
  deleteFromDestination,
  canDeleteFromDestination,
} from "@/upload";
import type { UploadDestination } from "@/types";
import { getProvider } from "@/upload/providers";

const filesterDestination: UploadDestination = {
  id: "dest-filester",
  name: "Filester",
  type: "filester",
  apiKey: "my-api-key",
  url: "https://u1.filester.me",
  enabled: true,
  allowedExtensions: "",
  maxSizeMb: 0,
};

const filesterDeleteDestination: UploadDestination = {
  id: "dest-filester",
  name: "Filester",
  type: "filester",
  apiKey: "my-api-key",
  url: "https://u1.filester.me",
  enabled: true,
  allowedExtensions: "",
  maxSizeMb: 0,
};

/** - Filester upload tests */

describe("uploadBlob - filester", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns UploadResult on successful Filester upload", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });
    const progressCalls: number[] = [];

    const mockResponse = {
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          success: true,
          message: "File uploaded successfully",
          slug: "abc123",
          url: "https://filester.me/d/abc123",
          file_id: 12345,
          thumbnail_url: "/t/thumb-uuid",
        }),
      ),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as never);

    const result = await uploadBlob(
      blob,
      "test.jpg",
      filesterDestination,
      (pct: number) => progressCalls.push(pct),
    );

    expect(result).toMatchObject({
      directUrl: "https://filester.me/d/abc123",
      pageUrl: "https://filester.me/d/abc123",
      thumbUrl: "https://filester.me/t/thumb-uuid",
      deleteUrl: "abc123",
      deleteToken: "abc123",
    });
    expect(progressCalls).toContain(100);
  });

  it("handles absolute thumbnail_url correctly", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });

    const mockResponse = {
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          success: true,
          message: "File uploaded successfully",
          slug: "xyz789",
          url: "https://filester.me/d/xyz789",
          file_id: 67890,
          thumbnail_url: "https://cdn.filester.me/t/thumb-uuid",
        }),
      ),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as never);

    const result = await uploadBlob(
      blob,
      "test.jpg",
      filesterDestination,
      () => {},
    );

    expect(result.thumbUrl).toBe("https://cdn.filester.me/t/thumb-uuid");
  });

  it("sends Authorization Bearer header with API key", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });

    let capturedHeaders: Record<string, string> | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (
        _url: string | URL | globalThis.Request,
        options?: RequestInit,
      ) => {
        capturedHeaders = options?.headers as
          | Record<string, string>
          | undefined;
        return {
          ok: true,
          status: 200,
          text: vi.fn().mockResolvedValue(
            JSON.stringify({
              success: true,
              message: "File uploaded successfully",
              slug: "abc123",
              url: "https://filester.me/d/abc123",
              file_id: 12345,
              thumbnail_url: "/t/thumb-uuid",
            }),
          ),
        } as never;
      },
    );

    await uploadBlob(blob, "test.jpg", filesterDestination, () => {});

    expect(capturedHeaders).toBeDefined();
    expect(capturedHeaders!["Authorization"]).toBe("Bearer my-api-key");
  });

  it("allows guest upload without API key (no Authorization header)", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });

    const destNoKey: UploadDestination = {
      ...filesterDestination,
      apiKey: "",
    };

    let capturedHeaders: Record<string, string> | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (
        _url: string | URL | globalThis.Request,
        options?: RequestInit,
      ) => {
        capturedHeaders = options?.headers as
          | Record<string, string>
          | undefined;
        return {
          ok: true,
          status: 200,
          text: vi.fn().mockResolvedValue(
            JSON.stringify({
              success: true,
              message: "File uploaded successfully",
              slug: "guest123",
              url: "https://filester.me/d/guest123",
              file_id: 99999,
            }),
          ),
        } as never;
      },
    );

    const result = await uploadBlob(blob, "test.jpg", destNoKey, () => {});

    expect(capturedHeaders).toBeDefined();
    expect(capturedHeaders!["Authorization"]).toBeUndefined();
    expect(result).toMatchObject({
      directUrl: "https://filester.me/d/guest123",
      deleteUrl: "guest123",
    });
  });

  it("rejects on HTTP error", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });

    const mockResponse = {
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: vi.fn().mockResolvedValue("Invalid file"),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as never);

    await expect(
      uploadBlob(blob, "test.jpg", filesterDestination, () => {}),
    ).rejects.toThrow(/Filester HTTP 400/);
  });

  it("rejects on network error", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    await expect(
      uploadBlob(blob, "test.jpg", filesterDestination, () => {}),
    ).rejects.toThrow(/Network error/);
  });

  it("rejects when API returns success=false", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });

    const mockResponse = {
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          success: false,
          error: { message: "File too large", code: "FILE_TOO_LARGE" },
        }),
      ),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as never);

    await expect(
      uploadBlob(blob, "test.jpg", filesterDestination, () => {}),
    ).rejects.toThrow(/File too large/);
  });

  it("rejects when response is non-JSON (plain text) even with HTTP 200", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });

    const mockResponse = {
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("This is not JSON, just plain text."),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as never);

    await expect(
      uploadBlob(blob, "test.jpg", filesterDestination, () => {}),
    ).rejects.toThrow(/Filester returned non-JSON response/);
  });

  it("rejects when JSON response missing 'success' field", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });

    const mockResponse = {
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify({ data: "something" })),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as never);

    await expect(
      uploadBlob(blob, "test.jpg", filesterDestination, () => {}),
    ).rejects.toThrow(/Filester returned an invalid response/);
  });

  it("rejects when success=true but slug is missing", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });

    const mockResponse = {
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          success: true,
          message: "Uploaded",
          file_id: 42,
        }),
      ),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as never);

    await expect(
      uploadBlob(blob, "test.jpg", filesterDestination, () => {}),
    ).rejects.toThrow(/no slug returned/);
  });

  it("rejects on upload timeout via fetch AbortError", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });

    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new DOMException("The operation was aborted.", "AbortError"),
    );

    await expect(
      uploadBlob(blob, "test.jpg", filesterDestination, () => {}),
    ).rejects.toThrow(/The operation was aborted./);
  });
});

/** - Filester canDelete tests */

describe("canDeleteFromDestination - filester", () => {
  it("returns true when API key is present", () => {
    const result = {
      pageUrl: "https://filester.me/d/abc123",
      directUrl: "https://filester.me/d/abc123",
      thumbUrl: "https://filester.me/t/thumb-uuid",
      deleteUrl: "abc123",
      deleteToken: "abc123",
    };

    expect(canDeleteFromDestination(result, filesterDestination)).toBe(true);
  });

  it("returns false when API key is empty (guest upload)", () => {
    const result = {
      pageUrl: "https://filester.me/d/abc123",
      directUrl: "https://filester.me/d/abc123",
      thumbUrl: "https://filester.me/t/thumb-uuid",
      deleteUrl: "abc123",
    };

    const destWithoutKey: UploadDestination = {
      ...filesterDestination,
      apiKey: "",
    };

    expect(canDeleteFromDestination(result, destWithoutKey)).toBe(false);
  });

  it("provider.canDelete returns true with API key", () => {
    const provider = getProvider("filester");
    expect(provider.canDelete).toBeDefined();
    expect(
      provider.canDelete!(
        {
          pageUrl: "https://filester.me/d/abc123",
          directUrl: "https://filester.me/d/abc123",
          thumbUrl: "https://filester.me/t/thumb-uuid",
          deleteUrl: "abc123",
        },
        filesterDestination,
      ),
    ).toBe(true);
  });

  it("provider.canDelete returns false without API key", () => {
    const provider = getProvider("filester");
    const destNoKey: UploadDestination = {
      ...filesterDestination,
      apiKey: "",
    };
    expect(
      provider.canDelete!(
        {
          pageUrl: "https://filester.me/d/abc123",
          directUrl: "https://filester.me/d/abc123",
          thumbUrl: "https://filester.me/t/thumb-uuid",
          deleteUrl: "abc123",
        },
        destNoKey,
      ),
    ).toBe(false);
  });
});

/** - Filester delete tests */

describe("deleteFromDestination - filester", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects when slug is missing from result", async () => {
    const result = {
      pageUrl: "https://filester.me/d/abc123",
      directUrl: "https://filester.me/d/abc123",
      thumbUrl: "https://filester.me/t/thumb-uuid",
      deleteUrl: "",
    };

    await expect(
      deleteFromDestination(result, filesterDeleteDestination),
    ).rejects.toThrow(/file slug not available/);
  });

  it("successfully deletes via Filester POST /file/delete", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(""),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as never);

    const result = {
      pageUrl: "https://filester.me/d/abc123",
      directUrl: "https://filester.me/d/abc123",
      thumbUrl: "https://filester.me/t/thumb-uuid",
      deleteUrl: "abc123",
      deleteToken: "abc123",
    };

    await deleteFromDestination(result, filesterDeleteDestination);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://u1.filester.me/file/delete",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer my-api-key",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ identifiers: ["abc123"] }),
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
      pageUrl: "https://filester.me/d/abc123",
      directUrl: "https://filester.me/d/abc123",
      thumbUrl: "https://filester.me/t/thumb-uuid",
      deleteUrl: "abc123",
      deleteToken: "abc123",
    };

    await expect(
      deleteFromDestination(result, filesterDeleteDestination),
    ).rejects.toThrow(/Filester delete failed/);
  });

  it("rejects on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const result = {
      pageUrl: "https://filester.me/d/abc123",
      directUrl: "https://filester.me/d/abc123",
      thumbUrl: "https://filester.me/t/thumb-uuid",
      deleteUrl: "abc123",
      deleteToken: "abc123",
    };

    await expect(
      deleteFromDestination(result, filesterDeleteDestination),
    ).rejects.toThrow(/Network error/);
  });

  it("rejects when delete returns non-JSON response (plain text) even with HTTP 200", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      text: vi
        .fn()
        .mockResolvedValue(
          "# FileHub Storage API v1\n\n## Authentication\nAll API requests require authentication...",
        ),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as never);

    const result = {
      pageUrl: "https://filester.me/d/abc123",
      directUrl: "https://filester.me/d/abc123",
      thumbUrl: "https://filester.me/t/thumb-uuid",
      deleteUrl: "abc123",
      deleteToken: "abc123",
    };

    await expect(
      deleteFromDestination(result, filesterDeleteDestination),
    ).rejects.toThrow(/Filester delete returned non-JSON response/);
  });

  it("rejects when delete JSON response has success=false", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          success: false,
          error: { message: "File not found", code: "NOT_FOUND" },
        }),
      ),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as never);

    const result = {
      pageUrl: "https://filester.me/d/abc123",
      directUrl: "https://filester.me/d/abc123",
      thumbUrl: "https://filester.me/t/thumb-uuid",
      deleteUrl: "abc123",
      deleteToken: "abc123",
    };

    await expect(
      deleteFromDestination(result, filesterDeleteDestination),
    ).rejects.toThrow(/File not found/);
  });

  it("succeeds when delete returns empty body with HTTP 200", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(""),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as never);

    const result = {
      pageUrl: "https://filester.me/d/abc123",
      directUrl: "https://filester.me/d/abc123",
      thumbUrl: "https://filester.me/t/thumb-uuid",
      deleteUrl: "abc123",
      deleteToken: "abc123",
    };

    await expect(
      deleteFromDestination(result, filesterDeleteDestination),
    ).resolves.toBeUndefined();
  });

  it("succeeds when delete returns valid JSON with success=true", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify({ success: true })),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as never);

    const result = {
      pageUrl: "https://filester.me/d/abc123",
      directUrl: "https://filester.me/d/abc123",
      thumbUrl: "https://filester.me/t/thumb-uuid",
      deleteUrl: "abc123",
      deleteToken: "abc123",
    };

    await expect(
      deleteFromDestination(result, filesterDeleteDestination),
    ).resolves.toBeUndefined();
  });
});
