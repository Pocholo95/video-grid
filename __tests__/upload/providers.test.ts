import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// Import "@/upload" to trigger provider registration
import "@/upload";
import { getProvider, registerProvider } from "@/upload/providers";
import type { UploadProvider } from "@/upload/providers";
import type { DestinationType } from "@/types";

// -- Helper to create a minimal provider --
function createMockProvider(type: DestinationType): UploadProvider {
  return {
    type,
    optionsSchema: [],
    upload: vi.fn().mockResolvedValue({
      directUrl: "https://example.com/test.jpg",
      pageUrl: "https://example.com/test.jpg",
      thumbUrl: "https://example.com/test.jpg",
    }),
  };
}

// Import real providers so we can restore them after tests overwrite the registry
import { cheveretoProvider } from "@/upload/chevereto";

describe("provider registry", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Restore the real chevereto provider so sibling tests see the original
    registerProvider(cheveretoProvider);
  });

  it("registers and retrieves a provider", () => {
    const provider = createMockProvider("chevereto");
    registerProvider(provider);
    expect(getProvider("chevereto")).toBe(provider);
  });

  it("throws for unregistered provider type", () => {
    expect(() => getProvider("unknown" as DestinationType)).toThrow(
      /Unknown destination type/,
    );
  });

  it("overwrites existing provider on re-registration", () => {
    const provider1 = createMockProvider("chevereto");
    const provider2 = createMockProvider("chevereto");
    registerProvider(provider1);
    registerProvider(provider2);
    expect(getProvider("chevereto")).toBe(provider2);
  });
});

describe("provider exports", () => {
  it("catbox provider is registered and retrievable", () => {
    const catboxProvider = getProvider("catbox");
    expect(catboxProvider.type).toBe("catbox");
    expect(typeof catboxProvider.upload).toBe("function");
  });

  it("chevereto provider is registered and retrievable", () => {
    const cheveretoProvider = getProvider("chevereto");
    expect(cheveretoProvider.type).toBe("chevereto");
    expect(typeof cheveretoProvider.upload).toBe("function");
  });

  it("imge provider is registered and retrievable", () => {
    const imgeProvider = getProvider("imge");
    expect(imgeProvider.type).toBe("imge");
    expect(typeof imgeProvider.upload).toBe("function");
  });

  it("all providers have canDelete implemented", () => {
    expect(getProvider("catbox").canDelete).toBeDefined();
    expect(getProvider("chevereto").canDelete).toBeDefined();
    expect(getProvider("imge").canDelete).toBeDefined();
  });

  it("catbox and imge providers have delete implemented", () => {
    expect(getProvider("catbox").delete).toBeDefined();
    expect(getProvider("imge").delete).toBeDefined();
  });
});
