import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadBlob } from "@/upload";
import type { UploadDestination } from "@/types";

interface MockXHR {
  upload: {
    onprogress: ((e: ProgressEvent) => void) | null;
  };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  ontimeout: (() => void) | null;
  onabort: (() => void) | null;
  status: number;
  responseText: string;
  timeout: number;
  open: ReturnType<typeof vi.fn>;
  setRequestHeader: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  _triggerProgress: (loaded: number, total: number) => void;
  _triggerLoad: () => void;
  _triggerError: () => void;
  _triggerTimeout: () => void;
  _triggerAbort: () => void;
}

function createMockXHR(): MockXHR {
  const mock = {
    upload: {
      onprogress: null as ((e: ProgressEvent) => void) | null,
    },
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
    ontimeout: null as (() => void) | null,
    onabort: null as (() => void) | null,
    status: 200,
    responseText: "",
    timeout: 0,
    open: vi.fn(),
    setRequestHeader: vi.fn(),
    send: vi.fn(),
    abort: vi.fn(),
    _triggerProgress: (loaded: number, total: number) => {
      if (mock.upload.onprogress) {
        mock.upload.onprogress({
          loaded,
          total,
          lengthComputable: true,
        } as ProgressEvent);
      }
    },
    _triggerLoad: () => {
      mock.onload?.();
    },
    _triggerError: () => {
      mock.onerror?.();
    },
    _triggerTimeout: () => {
      mock.ontimeout?.();
    },
    _triggerAbort: () => {
      mock.onabort?.();
    },
  };
  return mock;
}

const mockDestination: UploadDestination = {
  id: "dest1",
  name: "Test Host",
  type: "chevereto",
  apiKey: "test_api_key",
  url: "https://api.example.com/upload?key={key}",
  enabled: true,
  allowedExtensions: "",
  maxSizeMb: 0,
};

describe("uploadBlob - chevereto", () => {
  let mockXHR: MockXHR;

  beforeEach(() => {
    vi.useFakeTimers();
    mockXHR = createMockXHR();

    vi.spyOn(globalThis, "XMLHttpRequest").mockImplementation(function () {
      return mockXHR as unknown as XMLHttpRequest;
    });

    // Mock FileReader to resolve synchronously via runAllTimersAsync
    vi.spyOn(globalThis, "FileReader").mockImplementation(function () {
      let _result = "";
      let _onload: ((e: ProgressEvent) => void) | null = null;

      const fakeReader = {
        readAsDataURL: vi.fn(function () {
          _result = "data:image/png;base64,fakedata";
          setTimeout(() => {
            _onload?.({
              target: { result: _result },
            } as unknown as ProgressEvent<FileReader>);
          }, 0);
        }),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        get result(): string {
          return _result;
        },
        set result(v: string) {
          _result = v;
        },
        readyState: 0,
        error: null,
        get onload(): ((e: ProgressEvent) => void) | null {
          return _onload;
        },
        set onload(v: ((e: ProgressEvent) => void) | null) {
          _onload = v;
        },
        onerror: null,
        onloadend: null,
        onloadstart: null,
        onprogress: null,
        abort: vi.fn(),
      };

      return fakeReader as unknown as FileReader;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns UploadResult on successful upload", async () => {
    const blob = new Blob(["test"], { type: "image/png" });
    const progressCalls: number[] = [];

    mockXHR.responseText = JSON.stringify({
      success: true,
      data: {
        url: "https://cdn.example.com/image.png",
        url_viewer: "https://example.com/view/123",
        delete_url: "https://example.com/delete/abc",
        thumb: { url: "https://cdn.example.com/thumb.png" },
      },
    });

    const promise = uploadBlob(
      blob,
      "test.png",
      mockDestination,
      (pct: number) => progressCalls.push(pct),
    );

    await vi.runAllTimersAsync();

    mockXHR._triggerProgress(50, 100);
    mockXHR._triggerProgress(100, 100);
    mockXHR._triggerLoad();

    const result = await promise;

    expect(result).toMatchObject({
      directUrl: "https://cdn.example.com/image.png",
      pageUrl: "https://example.com/view/123",
      thumbUrl: "https://cdn.example.com/thumb.png",
      deleteUrl: "https://example.com/delete/abc",
    });
    expect(progressCalls).toContain(100);
  });

  it("includes mediumUrl when provided by API", async () => {
    const blob = new Blob(["test"], { type: "image/png" });

    mockXHR.responseText = JSON.stringify({
      success: true,
      data: {
        url: "https://cdn.example.com/image.png",
        url_viewer: "https://example.com/view/123",
        delete_url: "https://example.com/delete/abc",
        medium: { url: "https://cdn.example.com/medium.png" },
        thumb: { url: "https://cdn.example.com/thumb.png" },
      },
    });

    const promise = uploadBlob(blob, "test.png", mockDestination, () => {});
    await vi.runAllTimersAsync();
    mockXHR._triggerLoad();

    const result = await promise;
    expect(result.mediumUrl).toBe("https://cdn.example.com/medium.png");
  });

  it("falls back to directUrl for thumbUrl when thumb is null", async () => {
    const blob = new Blob(["test"], { type: "image/png" });

    mockXHR.responseText = JSON.stringify({
      success: true,
      data: {
        url: "https://cdn.example.com/image.png",
        url_viewer: "https://example.com/view/123",
        delete_url: "https://example.com/delete/abc",
        thumb: { url: null },
      },
    });

    const promise = uploadBlob(blob, "test.png", mockDestination, () => {});
    await vi.runAllTimersAsync();
    mockXHR._triggerLoad();

    const result = await promise;
    expect(result.thumbUrl).toBe("https://cdn.example.com/image.png");
  });

  it("rejects with API error message on HTTP 400", async () => {
    const blob = new Blob(["test"], { type: "image/png" });
    mockXHR.status = 400;
    mockXHR.responseText = JSON.stringify({
      status_code: 400,
      error: { message: "Invalid API v1 key.", code: 100 },
      status_txt: "Bad Request",
    });

    const promise = uploadBlob(blob, "test.png", mockDestination, () => {});
    await vi.runAllTimersAsync();
    mockXHR._triggerLoad();

    await expect(promise).rejects.toThrow("Invalid API v1 key.");
  });

  it("rejects with API error message on HTTP 429", async () => {
    const blob = new Blob(["test"], { type: "image/png" });
    mockXHR.status = 429;
    mockXHR.responseText = JSON.stringify({
      status_code: 429,
      error: { message: "Rate limit exceeded. Try again in 60s.", code: 429 },
      status_txt: "Too Many Requests",
    });

    const promise = uploadBlob(blob, "test.png", mockDestination, () => {});
    await vi.runAllTimersAsync();
    mockXHR._triggerLoad();

    await expect(promise).rejects.toThrow(
      "Rate limit exceeded. Try again in 60s.",
    );
  });

  it("rejects with HTTP status on error when response is not valid JSON", async () => {
    const blob = new Blob(["test"], { type: "image/png" });
    mockXHR.status = 500;
    mockXHR.responseText = "Internal Server Error";

    const promise = uploadBlob(blob, "test.png", mockDestination, () => {});
    await vi.runAllTimersAsync();
    mockXHR._triggerLoad();

    await expect(promise).rejects.toThrow(
      "Chevereto HTTP 500 — invalid response",
    );
  });

  it("rejects with HTTP status on error when JSON has no error message", async () => {
    const blob = new Blob(["test"], { type: "image/png" });
    mockXHR.status = 503;
    mockXHR.responseText = JSON.stringify({
      status_code: 503,
      status_txt: "Service Unavailable",
    });

    const promise = uploadBlob(blob, "test.png", mockDestination, () => {});
    await vi.runAllTimersAsync();
    mockXHR._triggerLoad();

    await expect(promise).rejects.toThrow("Chevereto HTTP 503");
  });

  it("rejects with API error message for file type rejection", async () => {
    const blob = new Blob(["test"], { type: "image/png" });
    mockXHR.status = 400;
    mockXHR.responseText = JSON.stringify({
      status_code: 400,
      error: { message: "File type not allowed: mp4", code: 105 },
      status_txt: "Bad Request",
    });

    const promise = uploadBlob(blob, "test.png", mockDestination, () => {});
    await vi.runAllTimersAsync();
    mockXHR._triggerLoad();

    await expect(promise).rejects.toThrow("File type not allowed: mp4");
  });

  it("rejects on network error", async () => {
    const blob = new Blob(["test"], { type: "image/png" });

    const promise = uploadBlob(blob, "test.png", mockDestination, () => {});
    await vi.runAllTimersAsync();
    mockXHR._triggerError();

    await expect(promise).rejects.toThrow("Network error during upload");
  });

  it("rejects on timeout", async () => {
    const blob = new Blob(["test"], { type: "image/png" });

    const promise = uploadBlob(blob, "test.png", mockDestination, () => {});
    await vi.runAllTimersAsync();
    mockXHR._triggerTimeout();

    await expect(promise).rejects.toThrow("Upload timed out");
  });

  it("rejects on abort", async () => {
    const blob = new Blob(["test"], { type: "image/png" });

    const promise = uploadBlob(blob, "test.png", mockDestination, () => {});
    await vi.runAllTimersAsync();
    mockXHR._triggerAbort();

    await expect(promise).rejects.toThrow("Upload timed out");
  });

  it("rejects when API returns success=false with error message", async () => {
    const blob = new Blob(["test"], { type: "image/png" });
    mockXHR.responseText = JSON.stringify({
      success: false,
      error: { message: "File too large" },
      data: {},
    });

    const promise = uploadBlob(blob, "test.png", mockDestination, () => {});
    await vi.runAllTimersAsync();
    mockXHR._triggerLoad();

    await expect(promise).rejects.toThrow("File too large");
  });

  it("rejects when API returns success=false without error message", async () => {
    const blob = new Blob(["test"], { type: "image/png" });
    mockXHR.responseText = JSON.stringify({
      success: false,
      data: {},
    });

    const promise = uploadBlob(blob, "test.png", mockDestination, () => {});
    await vi.runAllTimersAsync();
    mockXHR._triggerLoad();

    await expect(promise).rejects.toThrow("Chevereto returned an error");
  });

  it("rejects when response is invalid JSON", async () => {
    const blob = new Blob(["test"], { type: "image/png" });
    mockXHR.responseText = "not json at all";

    const promise = uploadBlob(blob, "test.png", mockDestination, () => {});
    await vi.runAllTimersAsync();
    mockXHR._triggerLoad();

    await expect(promise).rejects.toThrow(
      "Chevereto HTTP 200 — invalid response",
    );
  });

  it("rejects for unknown destination type", async () => {
    const blob = new Blob(["test"], { type: "image/png" });
    const badDest = {
      id: "x",
      name: "x",
      type: "unknown" as never,
      apiKey: "",
      url: "",
      enabled: false,
      allowedExtensions: "",
      maxSizeMb: 0,
    };

    await expect(
      uploadBlob(blob, "test.png", badDest, () => {}),
    ).rejects.toThrow("Unknown destination type: unknown");
  });

  it("reports progress via callback", async () => {
    const blob = new Blob(["test"], { type: "image/png" });
    const progressCalls: number[] = [];

    mockXHR.responseText = JSON.stringify({
      success: true,
      data: {
        url: "https://cdn.example.com/image.png",
        url_viewer: "https://example.com/view/123",
        delete_url: "https://example.com/delete/abc",
        thumb: { url: "https://cdn.example.com/thumb.png" },
      },
    });

    const promise = uploadBlob(
      blob,
      "test.png",
      mockDestination,
      (pct: number) => progressCalls.push(pct),
    );
    await vi.runAllTimersAsync();

    mockXHR._triggerProgress(25, 100);
    mockXHR._triggerProgress(50, 100);
    mockXHR._triggerProgress(75, 100);
    mockXHR._triggerLoad();

    await promise;
    expect(progressCalls).toContain(25);
    expect(progressCalls).toContain(50);
    expect(progressCalls).toContain(75);
    expect(progressCalls).toContain(100);
  });

  it("uses XMLHttpRequest for upload", async () => {
    const blob = new Blob(["test"], { type: "image/png" });
    mockXHR.responseText = JSON.stringify({
      success: true,
      data: {
        url: "https://cdn.example.com/image.png",
        url_viewer: "https://example.com/view/123",
        delete_url: "https://example.com/delete/abc",
        thumb: { url: "https://cdn.example.com/thumb.png" },
      },
    });

    const promise = uploadBlob(blob, "test.png", mockDestination, () => {});
    await vi.runAllTimersAsync();
    mockXHR._triggerLoad();
    await promise;

    expect(globalThis.XMLHttpRequest).toHaveBeenCalled();
    expect(mockXHR.open).toHaveBeenCalledWith(
      "POST",
      "https://api.example.com/upload?key=test_api_key",
    );
  });
});
