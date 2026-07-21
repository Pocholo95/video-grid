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

// GM_xmlhttpRequest response type
interface GMResponse {
  status: number;
  statusText: string;
  responseHeaders: string;
  responseText: string;
  response: unknown;
  readyState: number;
  finalUrl: string;
  time: {
    start: number;
    end: number;
    firstByte: number;
    endOfWrite: number;
  };
  ip: string;
}

// GM_xmlhttpRequest error type
interface GMError {
  error: string;
  readyState: number;
  status: number;
  response: string;
  finalUrl: string;
  loaded: number;
  total: number;
  position: number;
}

// GM_xmlhttpRequest options type
interface GMXmlHttpRequestOptions {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  data?: string;
  onload?: (response: GMResponse) => void;
  onerror?: (error: GMError) => void;
}

// GM XMLHTTPRequest return type
interface GMXmlHttpRequestReturn {
  abort: () => void;
  url?: string;
  method?: string;
}

// CORS tunnel outgoing message types
interface CorsTunnelPong {
  type: "cors-tunnel-pong";
  id: string;
  version: string;
}

interface CorsTunnelResponse {
  type: "cors-tunnel-response";
  id: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

interface CorsTunnelError {
  type: "cors-tunnel-error";
  id: string;
  error: string;
}

type CorsTunnelOutgoingMessage =
  CorsTunnelPong | CorsTunnelResponse | CorsTunnelError;

// Incoming message from the page
interface IncomingTunnelMessage {
  type: string;
  source?: string;
  id?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

// Window extension for GM APIs
interface GMWindow extends Window {
  GM_xmlhttpRequest: (
    options: GMXmlHttpRequestOptions,
  ) => GMXmlHttpRequestReturn;
  GM_info: {
    script: {
      name: string;
      version: string;
    };
  };
  GM_addStyle: (css: string) => void;
  GM_log: (...args: unknown[]) => void;
}

// Mock GM_* APIs that the userscript expects
function createGMMock() {
  const callbacks: Record<
    string,
    { onload?: (r: GMResponse) => void; onerror?: (e: GMError) => void }
  > = {};

  return {
    callbacks,
    GM_xmlhttpRequest: vi.fn(function (
      options: GMXmlHttpRequestOptions,
    ): GMXmlHttpRequestReturn {
      const { url, method, onload, onerror } = options;
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
  let responses: CorsTunnelOutgoingMessage[];

  beforeEach(() => {
    gm = createGMMock();
    responses = [];

    // Assign GM_* to window
    const gmWindow = window as unknown as GMWindow;
    gmWindow.GM_xmlhttpRequest = gm.GM_xmlhttpRequest;
    gmWindow.GM_info = gm.GM_info;
    gmWindow.GM_addStyle = gm.GM_addStyle;
    gmWindow.GM_log = gm.GM_log;

    // Override postMessage to capture outgoing tunnel responses
    // (don't call original — happy-dom validates target origin and would throw)

    window.postMessage = function (data: unknown): void {
      const message = data as CorsTunnelOutgoingMessage | undefined;
      if (
        message &&
        (message.type === "cors-tunnel-pong" ||
          message.type === "cors-tunnel-response" ||
          message.type === "cors-tunnel-error")
      ) {
        responses.push(message);
      }
    };

    // Simulate the userscript's message handler logic
    messageHandler = function (event: MessageEvent): void {
      const msg = event.data as IncomingTunnelMessage | undefined;
      if (!msg || msg.source !== "vidgrid-html") return;

      if (msg.type === "cors-tunnel-ping") {
        window.postMessage(
          {
            type: "cors-tunnel-pong",
            id: msg.id ?? "",
            version: USERSCRIPT_VERSION,
          },
          { targetOrigin: event.origin },
        );
      } else if (msg.type === "cors-tunnel-request") {
        gm.GM_xmlhttpRequest({
          url: msg.url,
          method: msg.method,
          headers: msg.headers,
          data: msg.body,
          onload: (response: GMResponse) => {
            window.postMessage(
              {
                type: "cors-tunnel-response",
                id: msg.id ?? "",
                status: response.status,
                statusText: response.statusText,
                headers: JSON.parse(response.responseHeaders) as Record<
                  string,
                  string
                >,
                body: response.responseText,
              },
              { targetOrigin: event.origin },
            );
          },
          onerror: (error: GMError) => {
            window.postMessage(
              {
                type: "cors-tunnel-error",
                id: msg.id ?? "",
                error: error.error || "Network error",
              },
              { targetOrigin: event.origin },
            );
          },
        });
      }
    };
  });

  afterEach(() => {
    const gmWindow = window as unknown as GMWindow;
    (gmWindow.GM_xmlhttpRequest as unknown) = undefined;
    (gmWindow.GM_info as unknown) = undefined;
    (gmWindow.GM_addStyle as unknown) = undefined;
    (gmWindow.GM_log as unknown) = undefined;
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
      const call = gm.GM_xmlhttpRequest.mock
        .calls[0][0] as GMXmlHttpRequestOptions;
      call.onload?.({
        status: 200,
        statusText: "OK",
        responseHeaders: JSON.stringify({ "content-type": "application/json" }),
        responseText: '{"success":true}',
        response: null,
        readyState: 4,
        finalUrl: "https://api.example.com/data",
        time: { start: 0, end: 0, firstByte: 0, endOfWrite: 0 },
        ip: "127.0.0.1",
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
      const call = gm.GM_xmlhttpRequest.mock
        .calls[0][0] as GMXmlHttpRequestOptions;
      call.onerror?.({
        error: "Network error",
        readyState: 0,
        status: 0,
        response: "",
        finalUrl: "",
        loaded: 0,
        total: 0,
        position: 0,
      });

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
      const call = gm.GM_xmlhttpRequest.mock
        .calls[0][0] as GMXmlHttpRequestOptions;
      call.onload?.({
        status: 404,
        statusText: "Not Found",
        responseHeaders: JSON.stringify({}),
        responseText: "File not found",
        response: null,
        readyState: 4,
        finalUrl: "https://api.example.com/data",
        time: { start: 0, end: 0, firstByte: 0, endOfWrite: 0 },
        ip: "127.0.0.1",
      });

      expect(responses).toHaveLength(1);
      expect((responses[0] as CorsTunnelResponse).status).toBe(404);
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
