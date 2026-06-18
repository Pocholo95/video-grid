import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  uploadBlob,
  deleteFromDestination,
  canDeleteFromDestination,
} from "@/upload";
import type { UploadDestination } from "@/types";
import { getProvider } from "@/upload/providers";

/** - Catbox upload tests */

describe("uploadBlob - catbox", () => {
  const catboxDestination: UploadDestination = {
    id: "dest-catbox",
    name: "Catbox",
    type: "catbox",
    apiKey: "abc123hash",
    url: "https://catbox.moe/user/api.php",
    enabled: true,
    allowedExtensions: "",
    maxSizeMb: 0,
  };

  const anonymousCatboxDestination: UploadDestination = {
    ...catboxDestination,
    apiKey: "",
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns UploadResult on successful catbox upload", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });
    const progressCalls: number[] = [];

    const mockResponse = {
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("https://files.catbox.moe/abc123.jpg"),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as never);

    const promise = uploadBlob(
      blob,
      "test.jpg",
      catboxDestination,
      (pct: number) => progressCalls.push(pct),
    );

    await vi.runAllTimersAsync();

    const result = await promise;

    expect(result).toMatchObject({
      directUrl: "https://files.catbox.moe/abc123.jpg",
      pageUrl: "https://files.catbox.moe/abc123.jpg",
      thumbUrl: "https://files.catbox.moe/abc123.jpg",
      deleteUrl: "https://files.catbox.moe/abc123.jpg",
      deleteToken: "abc123hash",
    });
    expect(progressCalls).toContain(100);
  });

  it("works with anonymous uploads (empty apiKey)", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });

    const mockResponse = {
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("https://files.catbox.moe/xyz789.png"),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as never);

    const result = await uploadBlob(
      blob,
      "test.png",
      anonymousCatboxDestination,
      () => {},
    );

    expect(result.directUrl).toBe("https://files.catbox.moe/xyz789.png");
    expect(result.deleteToken).toBeUndefined();
  });

  it("rejects on HTTP error", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });

    const mockResponse = {
      ok: false,
      status: 500,
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as never);

    await expect(
      uploadBlob(blob, "test.jpg", catboxDestination, () => {}),
    ).rejects.toThrow("Catbox HTTP 500");
  });

  it("rejects when response is not a valid catbox URL", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });

    const mockResponse = {
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("https://evil.com/phishing"),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as never);

    await expect(
      uploadBlob(blob, "test.jpg", catboxDestination, () => {}),
    ).rejects.toThrow("Catbox returned an invalid URL");
  });

  it("rejects on network error", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    await expect(
      uploadBlob(blob, "test.jpg", catboxDestination, () => {}),
    ).rejects.toThrow("Network error");
  });

  it("rejects on timeout via fetch AbortError", async () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });

    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new DOMException("The operation was aborted.", "AbortError"),
    );

    await expect(
      uploadBlob(blob, "test.jpg", catboxDestination, () => {}),
    ).rejects.toThrow("The operation was aborted.");
  });
});

/** - deleteDestination tests */

describe("deleteFromDestination - catbox", () => {
  interface MockXHR {
    status: number;
    responseText: string;
    open: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    onload: (() => void) | null;
    onerror: (() => void) | null;
    _triggerLoad: () => void;
    _triggerError: () => void;
  }

  let mockXHR: MockXHR;

  const catboxDest: UploadDestination = {
    id: "dest-catbox",
    name: "Catbox",
    type: "catbox",
    apiKey: "userhash123",
    url: "https://catbox.moe/user/api.php",
    enabled: true,
    allowedExtensions: "",
    maxSizeMb: 0,
  };

  beforeEach(() => {
    mockXHR = {
      status: 200,
      responseText: "Files successfully deleted.",
      open: vi.fn(),
      send: vi.fn(),
      onload: null,
      onerror: null,
      _triggerLoad: () => {
        mockXHR.onload?.();
      },
      _triggerError: () => {
        mockXHR.onerror?.();
      },
    };

    vi.spyOn(globalThis, "XMLHttpRequest").mockImplementation(function () {
      return mockXHR as unknown as XMLHttpRequest;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves on successful delete", async () => {
    const result = {
      pageUrl: "https://files.catbox.moe/abc123.jpg",
      directUrl: "https://files.catbox.moe/abc123.jpg",
      thumbUrl: "https://files.catbox.moe/abc123.jpg",
      deleteUrl: "https://files.catbox.moe/abc123.jpg",
      deleteToken: "userhash123",
    };

    const promise = deleteFromDestination(result, catboxDest);

    mockXHR._triggerLoad();
    await promise;

    expect(mockXHR.open).toHaveBeenCalledWith(
      "POST",
      "https://catbox.moe/user/api.php",
    );

    const sentData = mockXHR.send.mock.calls[0][0] as URLSearchParams;
    expect(sentData.get("reqtype")).toBe("deletefiles");
    expect(sentData.get("userhash")).toBe("userhash123");
    expect(sentData.get("files")).toBe("abc123.jpg");
  });

  it("rejects on HTTP error", async () => {
    mockXHR.status = 500;

    const result = {
      pageUrl: "https://files.catbox.moe/abc123.jpg",
      directUrl: "https://files.catbox.moe/abc123.jpg",
      thumbUrl: "https://files.catbox.moe/abc123.jpg",
      deleteUrl: "https://files.catbox.moe/abc123.jpg",
      deleteToken: "userhash123",
    };

    const promise = deleteFromDestination(result, catboxDest);

    mockXHR._triggerLoad();

    await expect(promise).rejects.toThrow("Catbox delete failed: HTTP 500");
  });

  it("rejects when response indicates failure", async () => {
    mockXHR.responseText = "Files not found.";

    const result = {
      pageUrl: "https://files.catbox.moe/abc123.jpg",
      directUrl: "https://files.catbox.moe/abc123.jpg",
      thumbUrl: "https://files.catbox.moe/abc123.jpg",
      deleteUrl: "https://files.catbox.moe/abc123.jpg",
      deleteToken: "userhash123",
    };

    const promise = deleteFromDestination(result, catboxDest);

    mockXHR._triggerLoad();

    await expect(promise).rejects.toThrow(
      "Catbox delete failed: Files not found.",
    );
  });

  it("rejects on network error", async () => {
    const result = {
      pageUrl: "https://files.catbox.moe/abc123.jpg",
      directUrl: "https://files.catbox.moe/abc123.jpg",
      thumbUrl: "https://files.catbox.moe/abc123.jpg",
      deleteUrl: "https://files.catbox.moe/abc123.jpg",
      deleteToken: "userhash123",
    };

    const promise = deleteFromDestination(result, catboxDest);

    mockXHR._triggerError();

    await expect(promise).rejects.toThrow("Network error during delete");
  });

  it("extracts filename from URL correctly", async () => {
    mockXHR.responseText = "Files successfully deleted.";

    const result = {
      pageUrl: "https://files.catbox.moe/eh871k.png",
      directUrl: "https://files.catbox.moe/eh871k.png",
      thumbUrl: "https://files.catbox.moe/eh871k.png",
      deleteUrl: "https://files.catbox.moe/eh871k.png",
      deleteToken: "hash456",
    };

    const promise = deleteFromDestination(result, catboxDest);
    mockXHR._triggerLoad();
    await promise;

    const sentData = mockXHR.send.mock.calls[0][0] as URLSearchParams;
    expect(sentData.get("files")).toBe("eh871k.png");
  });
});

/** - catbox canDelete tests */

describe("canDeleteFromDestination - catbox", () => {
  const catboxDestination: UploadDestination = {
    id: "dest-catbox",
    name: "Catbox",
    type: "catbox",
    apiKey: "abc123hash",
    url: "https://catbox.moe/user/api.php",
    enabled: true,
    allowedExtensions: "",
    maxSizeMb: 0,
  };

  const catboxDestNoKey: UploadDestination = {
    ...catboxDestination,
    apiKey: "",
  };

  it("returns true when API key and deleteUrl are present", () => {
    const result = {
      pageUrl: "https://files.catbox.moe/abc123.jpg",
      directUrl: "https://files.catbox.moe/abc123.jpg",
      thumbUrl: "https://files.catbox.moe/abc123.jpg",
      deleteUrl: "https://files.catbox.moe/abc123.jpg",
      deleteToken: "abc123hash",
    };

    expect(canDeleteFromDestination(result, catboxDestination)).toBe(true);
  });

  it("returns true when deleteToken is present even without API key", () => {
    const result = {
      pageUrl: "https://files.catbox.moe/abc123.jpg",
      directUrl: "https://files.catbox.moe/abc123.jpg",
      thumbUrl: "https://files.catbox.moe/abc123.jpg",
      deleteUrl: "https://files.catbox.moe/abc123.jpg",
      deleteToken: "abc123hash",
    };

    expect(canDeleteFromDestination(result, catboxDestNoKey)).toBe(true);
  });

  it("returns false when both API key and deleteToken are missing", () => {
    const result = {
      pageUrl: "https://files.catbox.moe/abc123.jpg",
      directUrl: "https://files.catbox.moe/abc123.jpg",
      thumbUrl: "https://files.catbox.moe/abc123.jpg",
      deleteUrl: "https://files.catbox.moe/abc123.jpg",
    };

    expect(canDeleteFromDestination(result, catboxDestNoKey)).toBe(false);
  });

  it("returns false when deleteUrl is missing", () => {
    const result = {
      pageUrl: "https://files.catbox.moe/abc123.jpg",
      directUrl: "https://files.catbox.moe/abc123.jpg",
      thumbUrl: "https://files.catbox.moe/abc123.jpg",
      deleteUrl: "",
    };

    expect(canDeleteFromDestination(result, catboxDestination)).toBe(false);
  });

  it("provider.canDelete returns correct values", () => {
    const provider = getProvider("catbox");
    expect(provider.canDelete).toBeDefined();

    const resultWithDelete = {
      pageUrl: "https://files.catbox.moe/abc123.jpg",
      directUrl: "https://files.catbox.moe/abc123.jpg",
      thumbUrl: "https://files.catbox.moe/abc123.jpg",
      deleteUrl: "https://files.catbox.moe/abc123.jpg",
      deleteToken: "abc123hash",
    };

    // Both true because result has deleteToken
    expect(provider.canDelete!(resultWithDelete, catboxDestination)).toBe(true);
    expect(provider.canDelete!(resultWithDelete, catboxDestNoKey)).toBe(true);

    // False only when both dest.apiKey and result.deleteToken are missing
    const resultNoDelete = {
      pageUrl: "https://files.catbox.moe/abc123.jpg",
      directUrl: "https://files.catbox.moe/abc123.jpg",
      thumbUrl: "https://files.catbox.moe/abc123.jpg",
      deleteUrl: "https://files.catbox.moe/abc123.jpg",
    };
    expect(provider.canDelete!(resultNoDelete, catboxDestNoKey)).toBe(false);
  });
});
