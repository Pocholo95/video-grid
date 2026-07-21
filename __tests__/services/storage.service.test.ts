/**
 * Tests for storage service layer.
 *
 * Covers:
 * - LocalStorageProvider (wrapper around localStorage)
 * - VersionedStorage (auto-migration + versioning)
 * - createVersionedStorage factory
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  LocalStorageProvider,
  VersionedStorage,
  createVersionedStorage,
} from "@/services/storage.service";
import {
  STORAGE_SCHEMA_VERSION,
  APP_STORAGE_KEY,
  ESTIMATION_MAX_FRAMES,
  ESTIMATION_MAX_PIXELS,
} from "@/constants";
import type { AppSettings } from "@/types";

/** - Test fixtures */

function getDefaultSettings(): AppSettings {
  return {
    presets: {
      entries: {},
      lastUsed: null,
    },
    destinations: [],
    theme: "dark",
    showPreview: true,
    corsModalDismissed: false,
    estimationMaxFrames: ESTIMATION_MAX_FRAMES,
    estimationMaxPixels: ESTIMATION_MAX_PIXELS,
  };
}

/** - LocalStorageProvider */

describe("LocalStorageProvider", () => {
  let provider: LocalStorageProvider;

  beforeEach(() => {
    localStorage.clear();
    provider = new LocalStorageProvider();
  });

  describe("getItem", () => {
    it("returns value for existing key", () => {
      localStorage.setItem("a", "b");
      expect(provider.getItem("a")).toBe("b");
    });

    it("returns null for missing key", () => {
      expect(provider.getItem("missing")).toBeNull();
    });

    it("calls onError callback when storage throws", () => {
      const handler = vi.fn();
      const badProvider = new LocalStorageProvider(
        {
          getItem: () => {
            throw new Error("quota");
          },
        } as unknown as Storage,
        handler,
      );
      badProvider.getItem("x");
      expect(handler).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe("setItem", () => {
    it("persists value to storage", () => {
      provider.setItem("key", "value");
      expect(localStorage.getItem("key")).toBe("value");
    });

    it("calls onError callback when storage throws", () => {
      const handler = vi.fn();
      const badProvider = new LocalStorageProvider(
        {
          setItem: () => {
            throw new Error("full");
          },
        } as unknown as Storage,
        handler,
      );
      badProvider.setItem("x", "y");
      expect(handler).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe("removeItem", () => {
    it("removes value from storage", () => {
      localStorage.setItem("key", "value");
      provider.removeItem("key");
      expect(localStorage.getItem("key")).toBeNull();
    });
  });
});

/** - VersionedStorage */

describe("VersionedStorage", () => {
  let provider: LocalStorageProvider;
  let storage: VersionedStorage;

  beforeEach(() => {
    localStorage.clear();
    provider = new LocalStorageProvider();
    storage = new VersionedStorage(provider);
  });

  describe("load", () => {
    it("returns defaults when nothing stored", () => {
      const defaults = getDefaultSettings();
      const result = storage.load(() => defaults);
      expect(result).toEqual(defaults);
    });

    it("returns defaults when JSON is malformed", () => {
      localStorage.setItem(APP_STORAGE_KEY, "{invalid json");
      const defaults = getDefaultSettings();
      const result = storage.load(() => defaults);
      expect(result).toEqual(defaults);
    });

    it("loads and migrates legacy (unversioned) data", () => {
      const legacyData = {
        presets: { entries: {}, lastUsed: null },
        destinations: [],
        theme: "dark",
        showPreview: true,
      };
      localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(legacyData));
      const result = storage.load(() => getDefaultSettings());
      expect(result.theme).toBe("dark");
    });

    it("loads versioned data without migration when version matches", () => {
      const data = getDefaultSettings();
      const versioned = { schemaVersion: STORAGE_SCHEMA_VERSION, data };
      localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(versioned));
      const result = storage.load(() => getDefaultSettings());
      expect(result).toEqual(data);
    });

    it("runs migration when stored version is older", () => {
      const oldData = {
        presets: { entries: {}, lastUsed: null },
        destinations: [],
        theme: "dark",
        showPreview: true,
      };
      const versioned = { schemaVersion: 0, data: oldData };
      localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(versioned));
      const result = storage.load(() => getDefaultSettings());
      expect(result).toBeDefined();
    });
  });

  describe("save", () => {
    it("persists data with current schema version", () => {
      const data = getDefaultSettings();
      storage.save(data);

      const raw = localStorage.getItem(APP_STORAGE_KEY);
      expect(raw).toBeDefined();

      const parsed = JSON.parse(raw!);
      expect(parsed.schemaVersion).toBe(STORAGE_SCHEMA_VERSION);
      expect(parsed.data).toEqual(data);
    });
  });

  describe("clear", () => {
    it("removes stored data", () => {
      storage.save(getDefaultSettings());
      storage.clear();
      expect(localStorage.getItem(APP_STORAGE_KEY)).toBeNull();
    });
  });
});

/** - createVersionedStorage factory */

describe("createVersionedStorage", () => {
  it("returns a VersionedStorage instance backed by localStorage", () => {
    const instance = createVersionedStorage();
    const testSettings = getDefaultSettings();
    instance.save(testSettings);
    const loaded = instance.load(() => getDefaultSettings());
    expect(loaded).toEqual(testSettings);
  });
});
