import { describe, it, expect } from "vitest";
import {
  UPLOAD_DESTINATION_PROVIDERS,
  DEFAULT_DEST_ALLOWED_EXTENSIONS,
  DEFAULT_DEST_MAX_SIZE_MB,
} from "@/constants";
import { getProviderDefaults } from "@/upload/providers";
import type { DestinationType } from "@/types";

const PROVIDER_TYPES = Object.keys(
  UPLOAD_DESTINATION_PROVIDERS,
) as DestinationType[];

describe("UPLOAD_DESTINATION_PROVIDERS registry", () => {
  it("has an entry for every provider type", () => {
    expect(PROVIDER_TYPES).toContain("chevereto");
    expect(PROVIDER_TYPES).toContain("catbox");
    expect(PROVIDER_TYPES).toContain("imge");
  });

  it("each entry contains all required config fields", () => {
    const requiredFields = [
      "label",
      "defaultUrl",
      "defaultAllowedExtensions",
      "defaultMaxSizeMb",
      "apiKeyLabel",
      "apiKeyRequired",
      "apiKeyPlaceholder",
      "apiKeyHelpTitle",
      "apiKeyHelpDescription",
      "urlHelpText",
      "requiresKeyPlaceholder",
    ];

    for (const type of PROVIDER_TYPES) {
      const cfg = UPLOAD_DESTINATION_PROVIDERS[type];
      for (const field of requiredFields) {
        expect(cfg).toHaveProperty(field);
      }
    }
  });
});

describe("getProviderDefaults", () => {
  it("returns provider config for known types", () => {
    for (const type of PROVIDER_TYPES) {
      const d = getProviderDefaults(type);
      expect(d).toEqual(UPLOAD_DESTINATION_PROVIDERS[type]);
    }
  });

  it("falls back to global defaults for unknown types", () => {
    const unknown = "nonexistent" as DestinationType;
    const d = getProviderDefaults(unknown);
    expect(d.defaultUrl).toBe("");
    expect(d.defaultAllowedExtensions).toBe(DEFAULT_DEST_ALLOWED_EXTENSIONS);
    expect(d.defaultMaxSizeMb).toBe(DEFAULT_DEST_MAX_SIZE_MB);
  });
});
