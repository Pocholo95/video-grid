import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, afterAll } from "vitest";

// Deterministic UUID counter for predictable test IDs
let uuidCounter = 0;

// In-memory localStorage mock to work around happy-dom v17 localStorage.clear() bug
const store = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
  get length() {
    return store.size;
  },
  key: (index: number) =>
    index < store.size ? Array.from(store.keys())[index] : null,
};

beforeAll(() => {
  // Mock crypto.randomUUID for deterministic IDs in tests
  Object.defineProperty(crypto, "randomUUID", {
    value: () => "test-uuid-" + uuidCounter++ + "-" + Date.now() + "-0000-0000",
    writable: true,
    configurable: true,
  });

  // Override localStorage with our mock
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  // Clean up React renders after each test
  cleanup();

  // Clear localStorage between tests
  localStorageMock.clear();

  // Reset UUID counter
  uuidCounter = 0;
});

// Suppress console.error during tests to reduce noise from React warnings
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    // Ignore React hydration warnings and known safe warnings
    const msg = String(args);
    if (
      msg.includes("hydrate") ||
      msg.includes("findDOMNode") ||
      msg.includes("deprecated")
    ) {
      return;
    }
    originalError(...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// Mock resizeObserver for components that use it
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

window.ResizeObserver = MockResizeObserver as never;

// Mock IntersectionObserver for components that use it
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  constructor() {}
}

window.IntersectionObserver = MockIntersectionObserver as never;

// Mock URL.createObjectURL and revokeObjectURL
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeAll(() => {
  URL.createObjectURL = () => {
    const url = `mock-blob-url-${Date.now()}-${Math.random()}`;
    return url;
  };
});

afterAll(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

// Mock matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock navigator.clipboard
Object.defineProperty(navigator, "clipboard", {
  writable: true,
  value: {
    writeText: async () => Promise.resolve(),
    readText: async () => Promise.resolve(""),
  },
});
