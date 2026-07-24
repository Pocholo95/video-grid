import { describe, it, expect } from "vitest";
import { isItemUploadEligible } from "@/uploadUtils";
import type { UploadDestination } from "@/types";

const destAny: UploadDestination = {
  id: "dest-any",
  name: "Any Extension",
  type: "chevereto",
  apiKey: "k",
  url: "https://any.com/upload?key={key}",
  enabled: true,
  allowedExtensions: "",
  maxSizeMb: 0,
};

const destJpgOnly: UploadDestination = {
  id: "dest-jpg",
  name: "JPG Only",
  type: "chevereto",
  apiKey: "k",
  url: "https://jpg.com/upload?key={key}",
  enabled: true,
  allowedExtensions: ".jpg,.jpeg",
  maxSizeMb: 0,
};

const destPngOnly: UploadDestination = {
  id: "dest-png",
  name: "PNG Only",
  type: "chevereto",
  apiKey: "k",
  url: "https://png.com/upload?key={key}",
  enabled: true,
  allowedExtensions: ".png",
  maxSizeMb: 0,
};

describe("isItemUploadEligible", () => {
  describe("non-gallery items", () => {
    it("returns true when outputName matches allowed extensions", () => {
      const item = { outputName: "grid.jpg", outputSize: 500000 };
      expect(isItemUploadEligible(item, destJpgOnly)).toBe(true);
    });

    it("returns false when outputName does not match allowed extensions", () => {
      const item = { outputName: "grid.png", outputSize: 500000 };
      expect(isItemUploadEligible(item, destJpgOnly)).toBe(false);
    });

    it("returns true when no extension restriction", () => {
      const item = { outputName: "grid.webp", outputSize: 500000 };
      expect(isItemUploadEligible(item, destAny)).toBe(true);
    });

    it("returns false when outputName is missing", () => {
      const item = { outputSize: 500000 };
      expect(isItemUploadEligible(item, destAny)).toBe(false);
    });

    it("returns false when outputName has no extension", () => {
      const item = { outputName: "noextension" };
      expect(isItemUploadEligible(item, destAny)).toBe(false);
    });
  });

  describe("gallery items", () => {
    it("uses galleryImageNames instead of outputName for eligibility", () => {
      // outputName is .mp4 (video), but gallery images are .jpg
      const item = {
        outputName: "video.mp4",
        galleryImageNames: ["frame_001.jpg", "frame_002.jpg"],
      };
      expect(isItemUploadEligible(item, destJpgOnly)).toBe(true);
    });

    it("returns false when galleryImageNames don't match allowed extensions", () => {
      const item = {
        outputName: "video.mp4",
        galleryImageNames: ["frame_001.jpg", "frame_002.jpg"],
      };
      expect(isItemUploadEligible(item, destPngOnly)).toBe(false);
    });

    it("returns true when at least one galleryImageName matches", () => {
      const item = {
        outputName: "video.mp4",
        galleryImageNames: ["frame_001.png", "frame_002.jpg"],
      };
      // .jpg matches destJpgOnly even though .png does not
      expect(isItemUploadEligible(item, destJpgOnly)).toBe(true);
    });

    it("returns true for gallery items when no extension restriction", () => {
      const item = {
        outputName: "video.mp4",
        galleryImageNames: ["frame_001.jpg", "frame_002.webp"],
      };
      expect(isItemUploadEligible(item, destAny)).toBe(true);
    });

    it("falls back to outputName when galleryImageNames is empty array", () => {
      const item = {
        outputName: "grid.png",
        galleryImageNames: [],
      };
      expect(isItemUploadEligible(item, destPngOnly)).toBe(true);
      expect(isItemUploadEligible(item, destJpgOnly)).toBe(false);
    });

    it("falls back to outputName when galleryImageNames is undefined", () => {
      const item = {
        outputName: "grid.jpg",
      };
      expect(isItemUploadEligible(item, destJpgOnly)).toBe(true);
      expect(isItemUploadEligible(item, destPngOnly)).toBe(false);
    });
  });
});
