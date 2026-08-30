/**
 * Tests for isUploadEligible utility.
 *
 * Verifies that upload eligibility is determined correctly based on
 * destination allowedExtensions and maxSizeMb settings.
 */

import { describe, it, expect } from "vitest";
import { isUploadEligible } from "@/uploadUtils";
import type { UploadDestination } from "@/types";

const baseDest: UploadDestination = {
  id: "d1",
  name: "Test Host",
  type: "chevereto",
  apiKey: "key",
  url: "https://example.com",
  enabled: true,
  allowedExtensions: "",
  maxSizeMb: 0,
};

describe("isUploadEligible - extension checks", () => {
  it("allows any extension when allowedExtensions is empty", () => {
    expect(isUploadEligible("output.jpg", 1024, baseDest)).toBe(true);
    expect(isUploadEligible("output.webp", 1024, baseDest)).toBe(true);
    expect(isUploadEligible("output.mp4", 1024, baseDest)).toBe(true);
    expect(isUploadEligible("output.png", 1024, baseDest)).toBe(true);
  });

  it("allows matching extensions (case-insensitive)", () => {
    const dest = { ...baseDest, allowedExtensions: "jpg,webp" };
    expect(isUploadEligible("output.JPG", 1024, dest)).toBe(true);
    expect(isUploadEligible("output.jpg", 1024, dest)).toBe(true);
    expect(isUploadEligible("output.WebP", 1024, dest)).toBe(true);
    expect(isUploadEligible("output.webp", 1024, dest)).toBe(true);
  });

  it("rejects non-matching extensions", () => {
    const dest = { ...baseDest, allowedExtensions: "jpg,webp" };
    expect(isUploadEligible("output.mp4", 1024, dest)).toBe(false);
    expect(isUploadEligible("output.png", 1024, dest)).toBe(false);
    expect(isUploadEligible("output.gif", 1024, dest)).toBe(false);
  });

  it("handles undefined outputName gracefully", () => {
    expect(isUploadEligible(undefined, 1024, baseDest)).toBe(false);
    expect(isUploadEligible("", 1024, baseDest)).toBe(false);
  });

  it("handles file without extension", () => {
    expect(isUploadEligible("noext", 1024, baseDest)).toBe(false);
  });

  it("handles extensions with or without dots", () => {
    const destDot = { ...baseDest, allowedExtensions: ".jpg,.png" };
    const destNoDot = { ...baseDest, allowedExtensions: "jpg,png" };
    expect(isUploadEligible("output.jpg", 1024, destDot)).toBe(true);
    expect(isUploadEligible("output.jpg", 1024, destNoDot)).toBe(true);
  });
});

describe("isUploadEligible - size checks", () => {
  it("allows any size when maxSizeMb is 0 (unlimited)", () => {
    expect(isUploadEligible("output.jpg", 0, baseDest)).toBe(true);
    expect(isUploadEligible("output.jpg", 1, baseDest)).toBe(true);
    expect(isUploadEligible("output.jpg", 1024 * 1024 * 1024, baseDest)).toBe(
      true,
    );
  });

  it("allows file under size limit", () => {
    const dest = { ...baseDest, maxSizeMb: 10 };
    const sizeBytes = 5 * 1024 * 1024; // 5 MB
    expect(isUploadEligible("output.jpg", sizeBytes, dest)).toBe(true);
  });

  it("rejects file over size limit", () => {
    const dest = { ...baseDest, maxSizeMb: 10 };
    const sizeBytes = 15 * 1024 * 1024; // 15 MB
    expect(isUploadEligible("output.jpg", sizeBytes, dest)).toBe(false);
  });

  it("allows file exactly at size limit", () => {
    const dest = { ...baseDest, maxSizeMb: 10 };
    const sizeBytes = 10 * 1024 * 1024; // exactly 10 MB
    expect(isUploadEligible("output.jpg", sizeBytes, dest)).toBe(true);
  });

  it("handles undefined outputSize as allowed", () => {
    const dest = { ...baseDest, maxSizeMb: 10 };
    expect(isUploadEligible("output.jpg", undefined, dest)).toBe(true);
    expect(
      isUploadEligible("output.jpg", null as unknown as undefined, dest),
    ).toBe(true);
  });

  it("handles maxSizeMb undefined as unlimited (backward compat)", () => {
    const legacyDest = {
      id: "d1",
      name: "Legacy",
      type: "chevereto" as const,
      apiKey: "k",
      url: "u",
      enabled: true as const,
      allowedExtensions: undefined as unknown as string,
      maxSizeMb: undefined as unknown as number,
    };
    expect(isUploadEligible("output.mp4", 999 * 1024 * 1024, legacyDest)).toBe(
      true,
    );
  });
});

describe("isUploadEligible - combined extension + size", () => {
  it("requires both extension and size to match", () => {
    const dest = {
      ...baseDest,
      allowedExtensions: "jpg,webp",
      maxSizeMb: 32,
    };

    // Right ext, right size
    expect(isUploadEligible("output.jpg", 10 * 1024 * 1024, dest)).toBe(true);

    // Right ext, wrong size
    expect(isUploadEligible("output.jpg", 50 * 1024 * 1024, dest)).toBe(false);

    // Wrong ext, right size
    expect(isUploadEligible("output.mp4", 10 * 1024 * 1024, dest)).toBe(false);

    // Wrong ext, wrong size
    expect(isUploadEligible("output.mp4", 50 * 1024 * 1024, dest)).toBe(false);
  });
});
