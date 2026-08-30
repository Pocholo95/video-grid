/**
 * Unit tests for the CORS tunnel module.
 *
 * Focus: Origin validation to prevent injection attacks when substituting
 * user-controlled values into the userscript template.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isValidOrigin,
  generateUserscriptContent,
  proxyFetch,
  proxyXHR,
  CORSError,
  isCORSError,
  detectCORSTunnelAvailable,
  hasVersionMismatch,
  getInstalledVersion,
  resetBatchState,
  getCORSStatus,
  setCORSStatus,
  USERSCRIPT_VERSION,
  fetchWithCORSFallback,
  shouldShowCORSModal,
  markModalShown,
  clearModalShown,
  detectBrowserExtension,
} from "../../src/lib/cors-tunnel";
import { PROJECT_NAME } from "@/constants";

// ─── isValidOrigin ───────────────────────────────────────────────────

describe("isValidOrigin", () => {
  // Valid origins
  it("accepts https origins", () => {
    expect(isValidOrigin("https://example.com")).toBe(true);
    expect(isValidOrigin("https://vidgrid.myhost.org")).toBe(true);
  });

  it("accepts http origins", () => {
    expect(isValidOrigin("http://localhost")).toBe(true);
    expect(isValidOrigin("http://192.168.1.1")).toBe(true);
  });

  it("accepts origins with port", () => {
    expect(isValidOrigin("https://example.com:8080")).toBe(true);
    expect(isValidOrigin("http://localhost:3000")).toBe(true);
    expect(isValidOrigin("http://localhost:5173")).toBe(true);
  });

  it("accepts subdomains", () => {
    expect(isValidOrigin("https://app.sub.domain.com")).toBe(true);
  });

  it("accepts custom schemes", () => {
    expect(isValidOrigin("file://localhost")).toBe(true);
  });

  // Invalid origins - injection attempts
  it("rejects origins with newlines (header injection)", () => {
    expect(isValidOrigin("https://example.com\n// @match http://*/*")).toBe(
      false,
    );
    expect(isValidOrigin("https://example.com\r\n// ==/UserScript==")).toBe(
      false,
    );
  });

  it("rejects origins with wildcard characters", () => {
    expect(isValidOrigin("*://*/*")).toBe(false);
    expect(isValidOrigin("https://*")).toBe(false);
    expect(isValidOrigin("*://example.com")).toBe(false);
  });

  it("rejects origins with JavaScript injection", () => {
    expect(isValidOrigin("https://example.com\n})(); alert('xss'); //")).toBe(
      false,
    );
    expect(
      isValidOrigin(
        "https://example.com\n// ==/UserScript==\n// @match http://*/*",
      ),
    ).toBe(false);
  });

  it("rejects origins with URL-encoded characters", () => {
    expect(isValidOrigin("https://example.com%0A%0Aalert(1)")).toBe(false);
  });

  it("rejects empty strings", () => {
    expect(isValidOrigin("")).toBe(false);
  });

  it("rejects origins with spaces", () => {
    expect(isValidOrigin("https://example .com")).toBe(false);
    expect(isValidOrigin("https://example.com bad")).toBe(false);
  });

  it("rejects origins with quotes", () => {
    expect(isValidOrigin("https://example.com'")).toBe(false);
    expect(isValidOrigin('https://example.com"')).toBe(false);
  });

  it("rejects origins with slashes in wrong places", () => {
    expect(isValidOrigin("https://example.com/path")).toBe(false);
    expect(isValidOrigin("https:///example.com")).toBe(false);
  });

  it("rejects origins with colons in wrong places", () => {
    expect(isValidOrigin("https://example.com:abc")).toBe(false);
    expect(isValidOrigin("https://example.com:8080:9090")).toBe(false);
  });

  it("rejects SQL injection patterns", () => {
    expect(isValidOrigin("https://example.com'; DROP TABLE--")).toBe(false);
  });

  it("rejects complex injection payload", () => {
    const payload =
      "https://evil.com\n// ==/UserScript==\n// @match http://*/*\n// @grant GM_xmlhttpRequest\n// @grant GM_setClipboard";
    expect(isValidOrigin(payload)).toBe(false);
  });
});

// ─── generateUserscriptContent ──────────────────────────────────────

describe("generateUserscriptContent", () => {
  it("generates content with valid origin", () => {
    const content = generateUserscriptContent("https://example.com");
    expect(content).toContain("https://example.com");
    expect(content).toContain("// ==UserScript==");
    expect(content).toContain(`${PROJECT_NAME} CORS Tunnel`);
  });

  it("throws for invalid origin with newlines", () => {
    expect(() =>
      generateUserscriptContent("https://example.com\n// @match *://*/*"),
    ).toThrow("failed validation");
  });

  it("throws for wildcard origin", () => {
    expect(() => generateUserscriptContent("*://*/*")).toThrow(
      "failed validation",
    );
  });

  it("throws for empty string", () => {
    expect(() => generateUserscriptContent("")).toThrow("failed validation");
  });

  it("throws for JavaScript injection attempt", () => {
    expect(() =>
      generateUserscriptContent("https://evil.com\n})(); alert('xss'); //"),
    ).toThrow("failed validation");
  });
});

// ─── proxyFetch Uint8Array body handling ──────────────────────────────

describe("proxyFetch body handling", () => {
  let postMessageSpy: ReturnType<typeof vi.spyOn>;
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let messageHandler: ((event: MessageEvent) => void) | null;

  beforeEach(() => {
    messageHandler = null;
    postMessageSpy = vi.spyOn(window, "postMessage");
    addEventListenerSpy = vi.spyOn(window, "addEventListener");

    addEventListenerSpy.mockImplementation(
      (type: string, handler: EventListener) => {
        if (type === "message")
          messageHandler = handler as (event: MessageEvent) => void;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function simulateResponse(
    id: string,
    status: number,
    body: string,
    error?: string,
  ) {
    if (!messageHandler) return;
    const event = new MessageEvent("message", {
      origin: window.location.origin,
      data: {
        type: "cors-tunnel-response",
        id,
        status,
        headers: {},
        body,
        ...(error ? { error } : {}),
      },
    });
    messageHandler(event);
  }

  it("handles Uint8Array body (catbox multipart)", async () => {
    postMessageSpy.mockImplementation(() => {
      const lastCall = postMessageSpy.mock.calls[0];
      simulateResponse(
        lastCall![0].id,
        200,
        "https://files.catbox.moe/test.jpg",
      );
    });

    const uint8Body = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header
    const result = await proxyFetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: uint8Body,
      headers: { "Content-Type": "multipart/form-data; boundary=test" },
    });

    expect(result.status).toBe(200);
    expect(await result.text()).toBe("https://files.catbox.moe/test.jpg");

    // Verify body was sent as base64
    const lastCall = postMessageSpy.mock.calls[0]!;
    expect(lastCall[0].bodyType).toBe("arraybuffer");
    expect(typeof lastCall[0].body).toBe("string");
    // Decode and verify
    const decoded = atob(lastCall[0].body);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      bytes[i] = decoded.charCodeAt(i);
    }
    expect(bytes).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  });

  it("handles string body (URL-encoded)", async () => {
    postMessageSpy.mockImplementation(() => {
      const lastCall = postMessageSpy.mock.calls[0]!;
      simulateResponse(lastCall[0].id, 200, "OK");
    });

    const bodyStr = "reqtype=deletefiles&userhash=abc123";
    const result = await proxyFetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: bodyStr,
    });

    expect(result.status).toBe(200);

    const lastCall = postMessageSpy.mock.calls[0]!;
    expect(lastCall[0].body).toBe(bodyStr);
    expect(lastCall[0].bodyType).toBeUndefined();
  });

  it("logs warning on HTTP error responses", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    postMessageSpy.mockImplementation(() => {
      const lastCall = postMessageSpy.mock.calls[0]!;
      simulateResponse(
        lastCall[0].id,
        412,
        "Precondition failed - missing file body",
      );
    });

    await proxyFetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: "test",
    });

    // Verify the warning contains the decisive info: status code + error text
    // Warning is split across multiple console.warn calls, so combine all of them
    expect(warnSpy).toHaveBeenCalled();
    const fullWarnMessage = warnSpy.mock.calls
      .map((args) => args.join(" "))
      .join(" ");
    expect(fullWarnMessage).toContain("412");
    expect(fullWarnMessage).toContain("Precondition failed");
  });

  it("throws CORSError on userscript error", async () => {
    postMessageSpy.mockImplementation(() => {
      const lastCall = postMessageSpy.mock.calls[0]!;
      simulateResponse(
        lastCall[0].id,
        0,
        "",
        "Network error during proxied request",
      );
    });

    await expect(
      proxyFetch("https://catbox.moe/user/api.php", { method: "POST" }),
    ).rejects.toThrow(CORSError);
  });
});

// ─── Version mismatch detection ──────────────────────────────────────

describe("CORS tunnel version mismatch", () => {
  let postMessageSpy: ReturnType<typeof vi.spyOn>;
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let messageHandler: ((event: MessageEvent) => void) | null;

  beforeEach(() => {
    messageHandler = null;
    postMessageSpy = vi.spyOn(window, "postMessage");
    addEventListenerSpy = vi.spyOn(window, "addEventListener");
    resetBatchState();

    addEventListenerSpy.mockImplementation(
      (type: string, handler: EventListener) => {
        if (type === "message")
          messageHandler = handler as (event: MessageEvent) => void;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function simulatePong(id: string, version: string) {
    if (!messageHandler) return;
    const event = new MessageEvent("message", {
      origin: window.location.origin,
      data: {
        type: "cors-tunnel-pong",
        id,
        version,
      },
    });
    messageHandler(event);
  }

  it("accepts pong with matching version", async () => {
    postMessageSpy.mockImplementation(() => {
      const lastCall = postMessageSpy.mock.calls[0]!;
      simulatePong(lastCall[0].id, USERSCRIPT_VERSION);
    });

    const available = await detectCORSTunnelAvailable();
    expect(available).toBe(true);
    expect(hasVersionMismatch()).toBe(false);
    expect(getCORSStatus().available).toBe(true);
    expect(getCORSStatus().version).toBe(USERSCRIPT_VERSION);
  });

  it("rejects pong with outdated version and sets versionMismatch", async () => {
    const OLD_VERSION = "0.9.0";
    postMessageSpy.mockImplementation(() => {
      const lastCall = postMessageSpy.mock.calls[0]!;
      simulatePong(lastCall[0].id, OLD_VERSION);
    });

    const available = await detectCORSTunnelAvailable();
    expect(available).toBe(false);
    expect(hasVersionMismatch()).toBe(true);
    expect(getInstalledVersion()).toBe(OLD_VERSION);
    expect(getCORSStatus().available).toBe(false);
  });

  it("rejects pong with future version", async () => {
    const FUTURE_VERSION = "99.0.0";
    postMessageSpy.mockImplementation(() => {
      const lastCall = postMessageSpy.mock.calls[0]!;
      simulatePong(lastCall[0].id, FUTURE_VERSION);
    });

    const available = await detectCORSTunnelAvailable();
    expect(available).toBe(false);
    expect(hasVersionMismatch()).toBe(true);
    expect(getInstalledVersion()).toBe(FUTURE_VERSION);
  });

  it("treats no pong as unavailable without version mismatch", async () => {
    // Don't simulate any response – timeout
    const available = await detectCORSTunnelAvailable();
    expect(available).toBe(false);
    expect(hasVersionMismatch()).toBe(false);
    expect(getCORSStatus().available).toBe(false);
  });

  it("resets versionMismatch on resetBatchState", async () => {
    // First set up a mismatch state
    setCORSStatus({
      available: false,
      modalShownThisBatch: false,
      versionMismatch: true,
      installedVersion: "0.1.0",
    });
    expect(hasVersionMismatch()).toBe(true);

    resetBatchState();
    expect(hasVersionMismatch()).toBe(false);
    expect(getInstalledVersion()).toBeUndefined();
  });
});

// ─── isCORSError ─────────────────────────────────────────────────────

describe("isCORSError", () => {
  it("returns true for CORSError instances", () => {
    expect(isCORSError(new CORSError("test", "http://example.com"))).toBe(true);
  });

  it("returns true for Chrome/Firefox 'Failed to fetch'", () => {
    const err = new TypeError("Failed to fetch");
    expect(isCORSError(err)).toBe(true);
  });

  it("returns true for Firefox 'NetworkError when attempting to fetch resource'", () => {
    const err = new TypeError("NetworkError when attempting to fetch resource");
    expect(isCORSError(err)).toBe(true);
  });

  it("returns true for Safari DOMException 'Load failed'", () => {
    const err = new DOMException("Load failed");
    expect(isCORSError(err)).toBe(true);
  });

  it("returns false for plain network errors", () => {
    expect(isCORSError(new Error("Network error"))).toBe(false);
  });

  it("returns false for timeout errors", () => {
    expect(isCORSError(new Error("Timeout"))).toBe(false);
  });

  it("returns false for non-Error objects", () => {
    expect(isCORSError("string error")).toBe(false);
    expect(isCORSError(null)).toBe(false);
    expect(isCORSError(undefined)).toBe(false);
    expect(isCORSError(42)).toBe(false);
  });

  it("returns false for HTTP errors that are not CORS-related", () => {
    expect(isCORSError(new Error("HTTP 404"))).toBe(false);
    expect(isCORSError(new Error("HTTP 500"))).toBe(false);
  });

  it("returns false for AbortError that is not TypeError or DOMException", () => {
    // AbortError is typically a DOMException
    const err = new DOMException("The operation was aborted.", "AbortError");
    expect(isCORSError(err)).toBe(false);
  });
});

// ─── proxyXHR ────────────────────────────────────────────────────────

describe("proxyXHR", () => {
  let postMessageSpy: ReturnType<typeof vi.spyOn>;
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let messageHandler: ((event: MessageEvent) => void) | null;

  beforeEach(() => {
    vi.useFakeTimers();
    messageHandler = null;
    postMessageSpy = vi.spyOn(window, "postMessage");
    addEventListenerSpy = vi.spyOn(window, "addEventListener");

    addEventListenerSpy.mockImplementation(
      (type: string, handler: EventListener) => {
        if (type === "message")
          messageHandler = handler as (event: MessageEvent) => void;
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function simulatePong(id: string, version: string) {
    if (!messageHandler) return;
    const event = new MessageEvent("message", {
      origin: window.location.origin,
      data: {
        type: "cors-tunnel-pong",
        id,
        version,
      },
    });
    messageHandler(event);
  }

  function simulateXHRResponse(
    id: string,
    status: number,
    body: string,
    error?: string,
  ) {
    if (!messageHandler) return;
    const event = new MessageEvent("message", {
      origin: window.location.origin,
      data: {
        type: "cors-tunnel-response",
        id,
        status,
        headers: { "content-type": "application/json" },
        body,
        ...(error ? { error } : {}),
      },
    });
    messageHandler(event);
  }

  it("forwards XHR request and returns response", async () => {
    postMessageSpy.mockImplementation(() => {
      const lastCall = postMessageSpy.mock.calls[0]!;
      simulateXHRResponse(
        lastCall[0].id,
        200,
        '{"success":true,"data":{"url":"https://cdn.example.com/img.png"}}',
      );
    });

    const result = await proxyXHR(
      "https://api.example.com/upload",
      "POST",
      { "Content-Type": "application/json" },
      '{"file":"test.png"}',
    );

    expect(result.status).toBe(200);
    expect(result.responseText).toContain("success");
    expect(result.headers["content-type"]).toBe("application/json");

    // Verify request was sent correctly
    const lastCall = postMessageSpy.mock.calls[0]!;
    expect(lastCall[0].url).toBe("https://api.example.com/upload");
    expect(lastCall[0].method).toBe("POST");
  });

  it("throws CORSError on timeout", async () => {
    // Simulate pong so detection succeeds, then let the actual request timeout
    postMessageSpy.mockImplementation((msg: Record<string, unknown>) => {
      if (msg.type === "cors-tunnel-ping") {
        simulatePong(msg.id as string, USERSCRIPT_VERSION);
      }
      // Don't respond to the actual request - timeout
    });

    // Attach rejection handler immediately so the promise's rejection is
    // handled before we advance timers (which triggers the timeout).
    const promise = proxyXHR("https://api.example.com/upload", "POST", {});
    let caughtError: unknown;
    const handler = promise.catch((e) => {
      caughtError = e;
    });

    await vi.runAllTimersAsync();
    await handler;

    expect(caughtError).toBeInstanceOf(CORSError);
  });

  it("throws CORSError on userscript error", async () => {
    postMessageSpy.mockImplementation(() => {
      const lastCall = postMessageSpy.mock.calls[0]!;
      simulateXHRResponse(lastCall[0].id, 0, "", "Network error");
    });

    await expect(
      proxyXHR("https://api.example.com/upload", "POST", {}),
    ).rejects.toThrow(CORSError);
  });
});

// ─── fetchWithCORSFallback ───────────────────────────────────────────

describe("fetchWithCORSFallback", () => {
  let postMessageSpy: ReturnType<typeof vi.spyOn>;
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let messageHandler: ((event: MessageEvent) => void) | null;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    messageHandler = null;
    postMessageSpy = vi.spyOn(window, "postMessage");
    addEventListenerSpy = vi.spyOn(window, "addEventListener");
    fetchSpy = vi.spyOn(globalThis, "fetch");
    resetBatchState();

    addEventListenerSpy.mockImplementation(
      (type: string, handler: EventListener) => {
        if (type === "message")
          messageHandler = handler as (event: MessageEvent) => void;
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function simulatePong(id: string, version: string) {
    if (!messageHandler) return;
    const event = new MessageEvent("message", {
      origin: window.location.origin,
      data: {
        type: "cors-tunnel-pong",
        id,
        version,
      },
    });
    messageHandler(event);
  }

  function simulateProxyResponse(id: string, status: number, body: string) {
    if (!messageHandler) return;
    const event = new MessageEvent("message", {
      origin: window.location.origin,
      data: {
        type: "cors-tunnel-response",
        id,
        status,
        headers: {},
        body,
      },
    });
    messageHandler(event);
  }

  it("uses direct fetch when proxy not available and fetch succeeds", async () => {
    const mockResponse = new Response("OK", { status: 200 });
    fetchSpy.mockResolvedValue(mockResponse);

    const result = await fetchWithCORSFallback("https://example.com/api");
    await vi.runAllTimersAsync();

    expect(result.response).toBe(mockResponse);
    expect(result.showModal).toBe(false);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("uses proxy directly when already known available", async () => {
    // Set proxy as available
    setCORSStatus({
      available: true,
      modalShownThisBatch: false,
      versionMismatch: false,
    });

    postMessageSpy.mockImplementation(() => {
      const lastCall = postMessageSpy.mock.calls[0]!;
      simulateProxyResponse(lastCall[0].id, 200, "proxied response");
    });

    const result = await fetchWithCORSFallback("https://example.com/api");

    expect(result.response).not.toBeNull();
    expect(result.showModal).toBe(false);
    expect(await result.response!.text()).toBe("proxied response");
    // Direct fetch should NOT be called when proxy is known available
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to proxy on CORS error", async () => {
    fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));

    postMessageSpy.mockImplementation(() => {
      const lastCall =
        postMessageSpy.mock.calls[postMessageSpy.mock.calls.length - 1]!;
      const msgType = lastCall[0].type;
      if (msgType === "cors-tunnel-ping") {
        simulatePong(lastCall[0].id, USERSCRIPT_VERSION);
      } else if (msgType === "cors-tunnel-request") {
        simulateProxyResponse(lastCall[0].id, 200, "proxied OK");
      }
    });

    const result = await fetchWithCORSFallback("https://example.com/api");
    await vi.runAllTimersAsync();

    expect(result.response).not.toBeNull();
    expect(result.showModal).toBe(false);
    expect(await result.response!.text()).toBe("proxied OK");
  });

  it("signals modal when both direct fetch and proxy fail", async () => {
    fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));

    // Proxy detection fails (timeout - no response simulated)
    const promise = fetchWithCORSFallback("https://example.com/api");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.response).toBeNull();
    expect(result.showModal).toBe(true);
  });

  it("rethrows non-CORS errors", async () => {
    fetchSpy.mockRejectedValue(new Error("DNS resolution failed"));

    // Since the error is non-CORS, fetchWithCORSFallback rethrows immediately.
    // But proxy detection may have started in parallel, so we simulate a pong
    // to avoid unhandled rejection from the parallel ping timeout.
    postMessageSpy.mockImplementation((msg: Record<string, unknown>) => {
      if (msg.type === "cors-tunnel-ping") {
        simulatePong(msg.id as string, USERSCRIPT_VERSION);
      }
    });

    // Attach expect handler BEFORE advancing timers so the rejection is caught
    await expect(
      fetchWithCORSFallback("https://example.com/api"),
    ).rejects.toThrow("DNS resolution failed");
    // Settle any remaining async work from parallel detection
    await vi.runAllTimersAsync();
  });
});

// ─── Modal state management ──────────────────────────────────────────

describe("Modal state management", () => {
  let loadAppSettingsSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    resetBatchState();
    // Mock loadAppSettings so shouldShowCORSModal sees corsModalDismissed = false.
    // We set it to false so the "permanently dismissed" branch is skipped.
    // However we must avoid the `corsModalDismissed === false` reset branch
    // which would clear tunnelState.modalShownThisBatch before the check.
    // We achieve this by having the spy throw in tests that need the batch flag
    // to be respected (simulating localStorage unavailable).
    const presets = await import("@/presets");
    loadAppSettingsSpy = vi.spyOn(presets, "loadAppSettings");
  });

  afterEach(() => {
    resetBatchState();
    loadAppSettingsSpy?.mockRestore();
    vi.restoreAllMocks();
  });

  it("shouldShowCORSModal returns true initially", () => {
    // Simulate localStorage unavailable → falls through to catch → checks batch flag
    loadAppSettingsSpy!.mockImplementationOnce(() => {
      throw new Error("localStorage unavailable");
    });
    expect(shouldShowCORSModal()).toBe(true);
  });

  it("shouldShowCORSModal returns false after markModalShown", () => {
    loadAppSettingsSpy!.mockImplementationOnce(() => {
      throw new Error("localStorage unavailable");
    });
    markModalShown();
    expect(shouldShowCORSModal()).toBe(false);
  });

  it("clearModalShown allows modal to show again", () => {
    loadAppSettingsSpy!.mockImplementationOnce(() => {
      throw new Error("localStorage unavailable");
    });
    markModalShown();
    expect(shouldShowCORSModal()).toBe(false);

    clearModalShown();
    loadAppSettingsSpy!.mockImplementationOnce(() => {
      throw new Error("localStorage unavailable");
    });
    expect(shouldShowCORSModal()).toBe(true);
  });

  it("markModalShown persists across calls within same batch", () => {
    loadAppSettingsSpy!.mockImplementationOnce(() => {
      throw new Error("localStorage unavailable");
    });
    markModalShown();
    loadAppSettingsSpy!.mockImplementationOnce(() => {
      throw new Error("localStorage unavailable");
    });
    expect(shouldShowCORSModal()).toBe(false);
    loadAppSettingsSpy!.mockImplementationOnce(() => {
      throw new Error("localStorage unavailable");
    });
    expect(shouldShowCORSModal()).toBe(false);
  });

  it("resetBatchState allows modal to show again", () => {
    loadAppSettingsSpy!.mockImplementationOnce(() => {
      throw new Error("localStorage unavailable");
    });
    markModalShown();
    expect(shouldShowCORSModal()).toBe(false);

    resetBatchState();
    loadAppSettingsSpy!.mockImplementationOnce(() => {
      throw new Error("localStorage unavailable");
    });
    expect(shouldShowCORSModal()).toBe(true);
  });
});

// ─── detectBrowserExtension ──────────────────────────────────────────

describe("detectBrowserExtension", () => {
  beforeEach(() => {
    // Clean up any global GM_* properties
    delete (window as unknown as Record<string, unknown>).Tampermonkey;
    delete (window as unknown as Record<string, unknown>).GM_info;
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).Tampermonkey;
    delete (window as unknown as Record<string, unknown>).GM_info;
  });

  it("detects Tampermonkey when window.Tampermonkey exists", () => {
    (window as unknown as Record<string, unknown>).Tampermonkey = {};
    const result = detectBrowserExtension();

    expect(result.name).toBe("Tampermonkey");
    expect(result.detected).toBe(true);
    expect(result.downloadUrl).toContain("tampermonkey");
  });

  it("detects Violentmonkey/Greasemonkey when GM_info has our script", () => {
    (window as unknown as Record<string, unknown>).GM_info = {
      script: { name: `${PROJECT_NAME} CORS Tunnel` },
    };

    const result = detectBrowserExtension();

    expect(result.detected).toBe(true);
    expect(result.name).toContain("Violentmonkey");
  });

  it("returns Tampermonkey as fallback when no extension detected", () => {
    const result = detectBrowserExtension();

    expect(result.name).toBe("Tampermonkey");
    expect(result.detected).toBe(false);
    expect(result.downloadUrl).toContain("tampermonkey");
  });
});
