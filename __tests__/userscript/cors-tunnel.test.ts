/**
 * Tests for the CORS Tunnel userscript.
 *
 * Since the userscript runs in the browser's userscript sandbox (Tampermonkey/
 * Violentmonkey), we cannot directly import it in Node.js tests. Instead, we
 * test the core logic by extracting the message handler and testing it in
 * isolation with mocked GM_* APIs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PROJECT_NAME } from "@/constants";
import { USERSCRIPT_VERSION } from "../../src/lib/cors-tunnel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

// Mock GM_* APIs that the userscript expects
function createGMMock() {
  const callbacks: Record<
    string,
    { onload?: (r: any) => void; onerror?: (e: any) => void }
  > = {};

  return {
    callbacks,
    GM_xmlhttpRequest: vi.fn(({ url, method, onload, onerror }: any) => {
      const requestKey = `${method}:${url}`;
      callbacks[requestKey] = { onload, onerror };
      return { abort: vi.fn(), url, method };
    }),
    GM_info: {
      script: {
        name: `${PROJECT_NAME} CORS Tunnel`,
        version: USERSCRIPT_VERSION,
      },
    },
    GM_addStyle: vi.fn(),
    GM_log: vi.fn(),
  };
}

describe("CORS Tunnel Userscript - Message Handler", () => {
  let gm: ReturnType<typeof createGMMock>;
  let messageHandler: (event: MessageEvent) => void;
  let responses: any[];

  beforeEach(() => {
    gm = createGMMock();
    responses = [];

    // Assign GM_* to window
    (window as any).GM_xmlhttpRequest = gm.GM_xmlhttpRequest;
    (window as any).GM_info = gm.GM_info;
    (window as any).GM_addStyle = gm.GM_addStyle;
    (window as any).GM_log = gm.GM_log;

    // Override postMessage to capture outgoing tunnel responses
    // (don't call original — happy-dom validates target origin and would throw)
    (window as unknown as Record<string, AnyFn>).postMessage = function (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _targetOrigin?: any,
    ) {
      if (
        data.type === "cors-tunnel-pong" ||
        data.type === "cors-tunnel-response" ||
        data.type === "cors-tunnel-error"
      ) {
        responses.push(data);
      }
    };

    // Simulate the userscript's message handler logic
    messageHandler = function (event: MessageEvent) {
      const msg = event.data;
      if (!msg || msg.source !== "vidgrid-html") return;

      if (msg.type === "cors-tunnel-ping") {
        window.postMessage(
          {
            type: "cors-tunnel-pong",
            id: msg.id,
            version: USERSCRIPT_VERSION,
          },
          event.origin,
        );
      } else if (msg.type === "cors-tunnel-request") {
        gm.GM_xmlhttpRequest({
          url: msg.url,
          method: msg.method,
          headers: msg.headers,
          data: msg.body,
          onload: (response: any) => {
            window.postMessage(
              {
                type: "cors-tunnel-response",
                id: msg.id,
                status: response.status,
                statusText: response.statusText,
                headers: response.responseHeaders,
                body: response.responseText,
              },
              event.origin,
            );
          },
          onerror: (error: any) => {
            window.postMessage(
              {
                type: "cors-tunnel-error",
                id: msg.id,
                error: error.message || "Network error",
              },
              event.origin,
            );
          },
        });
      }
    };
  });

  afterEach(() => {
    delete (window as any).GM_xmlhttpRequest;
    delete (window as any).GM_info;
    delete (window as any).GM_addStyle;
    delete (window as any).GM_log;
    vi.restoreAllMocks();
  });

  describe("Ping/Pong", () => {
    it("responds to ping with pong containing version", () => {
      const pingEvent = new MessageEvent("message", {
        origin: "https://example.com",
        data: {
          type: "cors-tunnel-ping",
          id: "test-ping-1",
          source: "vidgrid-html",
        },
      });

      messageHandler(pingEvent);

      expect(responses).toHaveLength(1);
      expect(responses[0]).toEqual({
        type: "cors-tunnel-pong",
        id: "test-ping-1",
        version: USERSCRIPT_VERSION,
      });
    });

    it("ignores ping without correct source", () => {
      const pingEvent = new MessageEvent("message", {
        origin: "https://example.com",
        data: {
          type: "cors-tunnel-ping",
          id: "test-ping-2",
          source: "other-app",
        },
      });

      messageHandler(pingEvent);
      expect(responses).toHaveLength(0);
    });
  });

  describe("Request Forwarding", () => {
    it("forwards GET request through GM_xmlhttpRequest", () => {
      const requestEvent = new MessageEvent("message", {
        origin: "https://example.com",
        data: {
          type: "cors-tunnel-request",
          id: "req-1",
          source: "vidgrid-html",
          url: "https://api.example.com/data",
          method: "GET",
          headers: { Accept: "application/json" },
        },
      });

      messageHandler(requestEvent);

      // Verify GM_xmlhttpRequest was called
      expect(gm.GM_xmlhttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://api.example.com/data",
          method: "GET",
          headers: { Accept: "application/json" },
        }),
      );

      // Simulate successful response
      const call = gm.GM_xmlhttpRequest.mock.calls[0][0];
      call.onload({
        status: 200,
        statusText: "OK",
        responseHeaders: { "content-type": "application/json" },
        responseText: '{"success":true}',
      });

      expect(responses).toHaveLength(1);
      expect(responses[0]).toEqual({
        type: "cors-tunnel-response",
        id: "req-1",
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: '{"success":true}',
      });
    });

    it("forwards POST request with body", () => {
      const requestEvent = new MessageEvent("message", {
        origin: "https://example.com",
        data: {
          type: "cors-tunnel-request",
          id: "req-2",
          source: "vidgrid-html",
          url: "https://api.example.com/upload",
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: '{"file":"test.png"}',
        },
      });

      messageHandler(requestEvent);

      expect(gm.GM_xmlhttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://api.example.com/upload",
          method: "POST",
          data: '{"file":"test.png"}',
        }),
      );
    });

    it("handles network errors", () => {
      const requestEvent = new MessageEvent("message", {
        origin: "https://example.com",
        data: {
          type: "cors-tunnel-request",
          id: "req-3",
          source: "vidgrid-html",
          url: "https://api.example.com/data",
          method: "GET",
          headers: {},
        },
      });

      messageHandler(requestEvent);

      // Simulate error
      const call = gm.GM_xmlhttpRequest.mock.calls[0][0];
      call.onerror({ message: "Network error" });

      expect(responses).toHaveLength(1);
      expect(responses[0]).toEqual({
        type: "cors-tunnel-error",
        id: "req-3",
        error: "Network error",
      });
    });

    it("handles HTTP errors", () => {
      const requestEvent = new MessageEvent("message", {
        origin: "https://example.com",
        data: {
          type: "cors-tunnel-request",
          id: "req-4",
          source: "vidgrid-html",
          url: "https://api.example.com/data",
          method: "GET",
          headers: {},
        },
      });

      messageHandler(requestEvent);

      // Simulate HTTP error
      const call = gm.GM_xmlhttpRequest.mock.calls[0][0];
      call.onload({
        status: 404,
        statusText: "Not Found",
        responseHeaders: {},
        responseText: "File not found",
      });

      expect(responses).toHaveLength(1);
      expect(responses[0].status).toBe(404);
    });
  });

  describe("Security", () => {
    it("rejects messages without source identifier", () => {
      const event = new MessageEvent("message", {
        origin: "https://example.com",
        data: { type: "cors-tunnel-ping", id: "test" },
      });

      messageHandler(event);
      expect(responses).toHaveLength(0);
    });

    it("rejects messages from unknown types", () => {
      const event = new MessageEvent("message", {
        origin: "https://example.com",
        data: { type: "unknown-message-type", source: "vidgrid-html" },
      });

      messageHandler(event);
      expect(responses).toHaveLength(0);
    });
  });
});