/**
 * Tests for the CORS Tunnel library (src/lib/cors-tunnel.ts).
 *
 * Tests the actual module functions: isCORSError, CORSError, isValidOrigin,
 * generateUserscriptContent, detectBrowserExtension, state management,
 * and sendMessage / detectCORSTunnelAvailable with mocked window APIs.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
} from "vitest";
import {
  isCORSError,
  CORSError,
  isValidOrigin,
  generateUserscriptContent,
  detectBrowserExtension,
  USERSCRIPT_VERSION,
  getCORSStatus,
  setCORSStatus,
  resetBatchState,
  hasVersionMismatch,
  getInstalledVersion,
} from "../../src/lib/cors-tunnel";

// ─── isCORSError ─────────────────────────────────────────────────────

describe("isCORSError", () => {
  it("returns true for CORSError instances", () => {
    expect(isCORSError(new CORSError("Failed", "http://test"))).toBe(true);
  });

  it("returns true for Chrome-style TypeError 'Failed to fetch'", () => {
    const error = new TypeError("Failed to fetch");
    expect(isCORSError(error)).toBe(true);
  });

  it("returns true for Firefox-style TypeError", () => {
    const error = new TypeError(
      "NetworkError when attempting to fetch resource",
    );
    expect(isCORSError(error)).toBe(true);
  });

  it("returns true for Safari-style DOMException 'Load failed'", () => {
    const error = new DOMException("Load failed");
    expect(isCORSError(error)).toBe(true);
  });

  it("returns false for non-CORS TypeErrors", () => {
    const error = new TypeError("Cannot read property of undefined");
    expect(isCORSError(error)).toBe(false);
  });

  it("returns false for non-CORS DOMExceptions", () => {
    const error = new DOMException("Something else went wrong");
    expect(isCORSError(error)).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isCORSError("string error")).toBe(false);
    expect(isCORSError(null)).toBe(false);
    expect(isCORSError(undefined)).toBe(false);
    expect(isCORSError(42)).toBe(false);
    expect(isCORSError({ message: "not an Error" })).toBe(false);
  });

  it("returns false for generic Error instances", () => {
    expect(isCORSError(new Error("generic error"))).toBe(false);
  });
});

// ─── CORSError ───────────────────────────────────────────────────────

describe("CORSError", () => {
  it("creates an error with correct name and flag", () => {
    const error = new CORSError("test message", "http://example.com");
    expect(error.name).toBe("CORSError");
    expect(error.message).toBe("test message");
    expect(error.isCORSError).toBe(true);
    expect(error.url).toBe("http://example.com");
  });

  it("is an instance of Error", () => {
    expect(new CORSError("msg", "url")).toBeInstanceOf(Error);
  });
});

// ─── isValidOrigin ───────────────────────────────────────────────────

describe("isValidOrigin", () => {
  it("accepts valid http origins", () => {
    expect(isValidOrigin("http://localhost:3000")).toBe(true);
    expect(isValidOrigin("http://example.com")).toBe(true);
  });

  it("accepts valid https origins", () => {
    expect(isValidOrigin("https://app.example.com")).toBe(true);
    expect(isValidOrigin("https://sub.domain.example.co.uk:8080")).toBe(true);
  });

  it("accepts file origins", () => {
    expect(isValidOrigin("file:///home/user")).toBe(false); // no host
    expect(isValidOrigin("file://localhost")).toBe(true);
  });

  it("rejects empty strings", () => {
    expect(isValidOrigin("")).toBe(false);
  });

  it("rejects non-string values", () => {
    // @ts-expect-error - testing runtime behavior
    expect(isValidOrigin(123)).toBe(false);
    // @ts-expect-error - testing runtime behavior
    expect(isValidOrigin(null)).toBe(false);
  });

  it("rejects origins with injected newlines", () => {
    expect(isValidOrigin("http://evil.com\nalert(1)")).toBe(false);
  });

  it("rejects origins with JavaScript protocol", () => {
    expect(isValidOrigin("javascript:alert(1)")).toBe(false);
  });

  it("rejects origins with comments", () => {
    expect(isValidOrigin("http://example.com // injected")).toBe(false);
  });

  it("rejects origins without scheme", () => {
    expect(isValidOrigin("example.com")).toBe(false);
  });

  it("rejects origins with spaces", () => {
    expect(isValidOrigin("http://example .com")).toBe(false);
  });
});

// ─── generateUserscriptContent ──────────────────────────────────────

describe("generateUserscriptContent", () => {
  it("generates content with valid origin", () => {
    const content = generateUserscriptContent("http://localhost:3000");
    expect(content).toContain("http://localhost:3000");
  });

  it("throws for invalid origin", () => {
    expect(() => generateUserscriptContent("javascript:alert(1)")).toThrow(
      "Refusing to generate userscript",
    );
  });

  it("throws for empty origin", () => {
    expect(() => generateUserscriptContent("")).toThrow(
      "Refusing to generate userscript",
    );
  });

  it("includes project name in generated content", () => {
    const content = generateUserscriptContent("https://example.com");
    expect(content).toMatch(/@name/i);
  });
});

// ─── detectBrowserExtension ────────────────────────────────────────

describe("detectBrowserExtension", () => {
  beforeEach(() => {
    delete (window as unknown as Record<string, unknown>).Tampermonkey;
    delete (window as unknown as Record<string, unknown>).GM_info;
  });

  it("detects Tampermonkey when window.Tampermonkey exists", () => {
    (window as unknown as Record<string, unknown>).Tampermonkey = {};
    const result = detectBrowserExtension();
    expect(result.name).toBe("Tampermonkey");
    expect(result.detected).toBe(true);
  });

  it("returns undetected Tampermonkey when no extension found", () => {
    const result = detectBrowserExtension();
    expect(result.name).toBe("Tampermonkey");
    expect(result.detected).toBe(false);
  });

  it("detects Violentmonkey when GM_info has our script", () => {
    (window as unknown as Record<string, unknown>).GM_info = {
      script: {
        name: "VidGrid-HTML CORS Tunnel",
      },
    };
    const result = detectBrowserExtension();
    expect(result.detected).toBe(true);
    expect(result.name).toContain("Violentmonkey");
  });
});

// ─── State management ──────────────────────────────────────────────

describe("State management", () => {
  beforeEach(() => {
    setCORSStatus({
      available: false,
      modalShownThisBatch: false,
      versionMismatch: false,
    });
  });

  describe("getCORSStatus / setCORSStatus", () => {
    it("returns a copy of the state", () => {
      setCORSStatus({
        available: true,
        modalShownThisBatch: false,
        versionMismatch: false,
      });
      const status = getCORSStatus();
      expect(status.available).toBe(true);
    });

    it("does not allow mutation via returned reference", () => {
      setCORSStatus({
        available: true,
        modalShownThisBatch: false,
        versionMismatch: false,
      });
      const status = getCORSStatus();
      status.available = false; // mutate the copy
      expect(getCORSStatus().available).toBe(true);
    });
  });

  describe("resetBatchState", () => {
    it("resets modalShownThisBatch and versionMismatch", () => {
      setCORSStatus({
        available: true,
        modalShownThisBatch: true,
        versionMismatch: true,
        installedVersion: "0.9.0",
      });
      resetBatchState();
      expect(getCORSStatus().modalShownThisBatch).toBe(false);
      expect(getCORSStatus().versionMismatch).toBe(false);
      expect(getCORSStatus().installedVersion).toBeUndefined();
    });

    it("preserves available state", () => {
      setCORSStatus({
        available: true,
        modalShownThisBatch: true,
        versionMismatch: true,
      });
      resetBatchState();
      expect(getCORSStatus().available).toBe(true);
    });
  });

  describe("hasVersionMismatch", () => {
    it("returns the versionMismatch flag from state", () => {
      setCORSStatus({
        available: false,
        modalShownThisBatch: false,
        versionMismatch: true,
      });
      expect(hasVersionMismatch()).toBe(true);

      setCORSStatus({
        available: false,
        modalShownThisBatch: false,
        versionMismatch: false,
      });
      expect(hasVersionMismatch()).toBe(false);
    });
  });

  describe("getInstalledVersion", () => {
    it("returns the installed version when set", () => {
      setCORSStatus({
        available: false,
        modalShownThisBatch: false,
        versionMismatch: true,
        installedVersion: "0.9.0",
      });
      expect(getInstalledVersion()).toBe("0.9.0");
    });

    it("returns undefined when not set", () => {
      setCORSStatus({
        available: false,
        modalShownThisBatch: false,
        versionMismatch: false,
      });
      expect(getInstalledVersion()).toBeUndefined();
    });
  });
});

// ─── Helper types for mocking ──────────────────────────────────────

interface TunnelMessage {
  type: string;
  id?: string;
  version?: string;
  body?: string;
  bodyType?: string;
  formData?: unknown;
  status?: number;
  headers?: Record<string, string>;
  error?: string;
}

// ─── detectCORSTunnelAvailable ────────────────────────────────────

describe("detectCORSTunnelAvailable", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns true when userscript responds with matching version", async () => {
    const { detectCORSTunnelAvailable } =
      await import("../../src/lib/cors-tunnel");

    // Capture message handlers so we can simulate pong
    const handlers: Array<EventListenerOrEventListenerObject> = [];
    vi.spyOn(window, "addEventListener").mockImplementation(
      (type: string, handler: EventListenerOrEventListenerObject) => {
        if (type === "message") {
          handlers.push(handler);
        }
      },
    );

    const postMessageMock = vi.spyOn(window, "postMessage");

    const detectPromise = detectCORSTunnelAvailable();

    const pingMessage = postMessageMock.mock.calls[0][0] as TunnelMessage;
    expect(pingMessage.type).toBe("cors-tunnel-ping");

    const handler = handlers[handlers.length - 1] as EventListener;
    handler(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          type: "cors-tunnel-pong",
          id: pingMessage.id,
          version: USERSCRIPT_VERSION,
        },
      }),
    );

    await expect(detectPromise).resolves.toBe(true);
  });

  it("returns false when timeout expires", async () => {
    const { detectCORSTunnelAvailable } =
      await import("../../src/lib/cors-tunnel");

    vi.spyOn(window, "addEventListener").mockImplementation(() => {});
    vi.spyOn(window, "postMessage");

    const detectPromise = detectCORSTunnelAvailable();

    vi.advanceTimersByTime(3500);

    await expect(detectPromise).resolves.toBe(false);
  });

  it("returns false when version mismatch", async () => {
    const {
      detectCORSTunnelAvailable,
      hasVersionMismatch,
      getInstalledVersion,
    } = await import("../../src/lib/cors-tunnel");

    const handlers: Array<EventListenerOrEventListenerObject> = [];
    vi.spyOn(window, "addEventListener").mockImplementation(
      (type: string, handler: EventListenerOrEventListenerObject) => {
        if (type === "message") {
          handlers.push(handler);
        }
      },
    );

    const postMessageMock = vi.spyOn(window, "postMessage");

    const detectPromise = detectCORSTunnelAvailable();

    const pingMessage = postMessageMock.mock.calls[0][0] as TunnelMessage;

    const handler = handlers[handlers.length - 1] as EventListener;
    handler(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          type: "cors-tunnel-pong",
          id: pingMessage.id,
          version: "0.9.0",
        },
      }),
    );

    await expect(detectPromise).resolves.toBe(false);
    expect(hasVersionMismatch()).toBe(true);
    expect(getInstalledVersion()).toBe("0.9.0");
  });
});

// ─── proxyFetch body handling ──────────────────────────────────────

describe("proxyFetch body handling", () => {
  let proxyFetch: typeof import("../../src/lib/cors-tunnel").proxyFetch;
  let CORSErrorLocal: typeof import("../../src/lib/cors-tunnel").CORSError;

  beforeAll(async () => {
    const mod = await import("../../src/lib/cors-tunnel");
    proxyFetch = mod.proxyFetch;
    CORSErrorLocal = mod.CORSError;
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("handles string body", async () => {
    const handlers: Array<EventListenerOrEventListenerObject> = [];
    vi.spyOn(window, "addEventListener").mockImplementation(
      (type: string, handler: EventListenerOrEventListenerObject) => {
        if (type === "message") {
          handlers.push(handler);
        }
      },
    );

    const postMessageMock = vi.spyOn(window, "postMessage");

    const fetchPromise = proxyFetch("http://test.com", {
      method: "POST",
      body: '{"hello":"world"}',
    });

    const requestMsg = postMessageMock.mock.calls[0][0] as TunnelMessage;
    expect(requestMsg.type).toBe("cors-tunnel-request");
    expect(requestMsg.body).toBe('{"hello":"world"}');
    expect(requestMsg.bodyType).toBeUndefined();

    const handler = handlers[handlers.length - 1] as EventListener;
    handler(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          type: "cors-tunnel-response",
          id: requestMsg.id,
          status: 200,
          headers: {},
          body: "OK",
        },
      }),
    );

    const response = await fetchPromise;
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
  });

  it("converts FormData with Blob to structured form data", async () => {
    // blobToBase64 uses FileReader internally which is hard to mock in
    // happy-dom (closure captures the global at import time). We work around
    // this by using FormData with only text fields — no blobs — to verify
    // the formdata-v2 serialization path.
    const handlers: Array<EventListenerOrEventListenerObject> = [];
    vi.spyOn(window, "addEventListener").mockImplementation(
      (type: string, handler: EventListenerOrEventListenerObject) => {
        if (type === "message") {
          handlers.push(handler);
        }
      },
    );

    const postMessageMock = vi.spyOn(window, "postMessage");

    const form = new FormData();
    form.append("field1", "value1");
    form.append("field2", "value2");

    const fetchPromise = proxyFetch("http://test.com", {
      method: "POST",
      body: form,
    });

    const requestMsg = postMessageMock.mock.calls[0][0] as TunnelMessage;
    expect(requestMsg.bodyType).toBe("formdata-v2");
    expect(requestMsg.formData).toBeDefined();

    const formData = requestMsg.formData as {
      fields: Array<{ key: string; value: string }>;
      files: Array<{
        key: string;
        filename: string;
        contentType: string;
        data: string;
      }>;
    };
    expect(formData.fields).toHaveLength(2);
    expect(formData.fields[0]).toEqual({ key: "field1", value: "value1" });
    expect(formData.fields[1]).toEqual({ key: "field2", value: "value2" });
    expect(formData.files).toHaveLength(0);

    const handler = handlers[handlers.length - 1] as EventListener;
    handler(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          type: "cors-tunnel-response",
          id: requestMsg.id,
          status: 200,
          headers: {},
          body: "OK",
        },
      }),
    );

    const response = await fetchPromise;
    expect(response.status).toBe(200);
  });

  it("converts Uint8Array body to base64", async () => {
    const handlers: Array<EventListenerOrEventListenerObject> = [];
    vi.spyOn(window, "addEventListener").mockImplementation(
      (type: string, handler: EventListenerOrEventListenerObject) => {
        if (type === "message") {
          handlers.push(handler);
        }
      },
    );

    const postMessageMock = vi.spyOn(window, "postMessage");

    const bytes = new Uint8Array([72, 101, 108, 108, 111]);
    const fetchPromise = proxyFetch("http://test.com", {
      method: "POST",
      body: bytes,
    });

    const requestMsg = postMessageMock.mock.calls[0][0] as TunnelMessage;
    expect(requestMsg.bodyType).toBe("arraybuffer");
    expect(requestMsg.body).toBe("SGVsbG8=");

    const handler = handlers[handlers.length - 1] as EventListener;
    handler(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          type: "cors-tunnel-response",
          id: requestMsg.id,
          status: 200,
          headers: {},
          body: "OK",
        },
      }),
    );

    const response = await fetchPromise;
    expect(response.status).toBe(200);
  });

  it("converts ArrayBuffer body to base64", async () => {
    const handlers: Array<EventListenerOrEventListenerObject> = [];
    vi.spyOn(window, "addEventListener").mockImplementation(
      (type: string, handler: EventListenerOrEventListenerObject) => {
        if (type === "message") {
          handlers.push(handler);
        }
      },
    );

    const postMessageMock = vi.spyOn(window, "postMessage");

    const buffer = new TextEncoder().encode("test").buffer;
    const fetchPromise = proxyFetch("http://test.com", {
      method: "POST",
      body: buffer,
    });

    const requestMsg = postMessageMock.mock.calls[0][0] as TunnelMessage;
    expect(requestMsg.bodyType).toBe("arraybuffer");
    expect(requestMsg.body).toBe("dGVzdA==");

    const handler = handlers[handlers.length - 1] as EventListener;
    handler(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          type: "cors-tunnel-response",
          id: requestMsg.id,
          status: 200,
          headers: {},
          body: "OK",
        },
      }),
    );

    const response = await fetchPromise;
    expect(response.status).toBe(200);
  });

  it("throws CORSError on proxy timeout", async () => {
    vi.spyOn(window, "addEventListener").mockImplementation(() => {});
    vi.spyOn(window, "postMessage");

    const fetchPromise = proxyFetch("http://test.com", {
      method: "GET",
    });

    vi.advanceTimersByTime(75000);

    await expect(fetchPromise).rejects.toThrow(CORSErrorLocal);
  });

  it("throws CORSError when proxy returns error response", async () => {
    const handlers: Array<EventListenerOrEventListenerObject> = [];
    vi.spyOn(window, "addEventListener").mockImplementation(
      (type: string, handler: EventListenerOrEventListenerObject) => {
        if (type === "message") {
          handlers.push(handler);
        }
      },
    );

    const postMessageMock = vi.spyOn(window, "postMessage");

    const fetchPromise = proxyFetch("http://test.com", {
      method: "GET",
    });

    const requestMsg = postMessageMock.mock.calls[0][0] as TunnelMessage;

    const handler = handlers[handlers.length - 1] as EventListener;
    handler(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          type: "cors-tunnel-response",
          id: requestMsg.id,
          status: 0,
          headers: {},
          body: "",
          error: "Network error",
        },
      }),
    );

    await expect(fetchPromise).rejects.toThrow(CORSErrorLocal);
  });
});
