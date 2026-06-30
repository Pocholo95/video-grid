import { describe, it, expect } from "vitest";
import { resolutionLabel, buildFormats } from "@/uploadUtils";
import type { LinkFormat } from "@/uploadUtils";
import type { VideoMetadata, UploadResult } from "@/types";

describe("resolutionLabel", () => {
  it("returns empty string for undefined metadata", () => {
    expect(resolutionLabel()).toBe("");
  });

  it("returns empty string for zero height", () => {
    expect(
      resolutionLabel({
        duration: 100,
        width: 1920,
        height: 0,
        videoBitrate: 1000000,
      }),
    ).toBe("");
  });

  it("returns 2160p label for 4K height", () => {
    const meta: VideoMetadata = {
      duration: 100,
      width: 3840,
      height: 2160,
      videoBitrate: 10000000,
    };
    expect(resolutionLabel(meta)).toContain("2160p");
  });

  it("returns 2160p label for 4K width (min of width/height)", () => {
    const meta: VideoMetadata = {
      duration: 100,
      width: 2160,
      height: 3840,
      videoBitrate: 10000000,
    };
    expect(resolutionLabel(meta)).toContain("2160p");
  });

  it("returns 1440p label for 1440 height", () => {
    const meta: VideoMetadata = {
      duration: 100,
      width: 2560,
      height: 1440,
      videoBitrate: 8000000,
    };
    expect(resolutionLabel(meta)).toContain("1440p");
  });

  it("returns 1080p label for 1080 height", () => {
    const meta: VideoMetadata = {
      duration: 100,
      width: 1920,
      height: 1080,
      videoBitrate: 5000000,
    };
    expect(resolutionLabel(meta)).toContain("1080p");
  });

  it("returns 720p label for 720 height", () => {
    const meta: VideoMetadata = {
      duration: 100,
      width: 1280,
      height: 720,
      videoBitrate: 3000000,
    };
    expect(resolutionLabel(meta)).toContain("720p");
  });

  it("returns 480p label for 480 height", () => {
    const meta: VideoMetadata = {
      duration: 100,
      width: 854,
      height: 480,
      videoBitrate: 1500000,
    };
    expect(resolutionLabel(meta)).toContain("480p");
  });

  it("returns 360p label for 360 height", () => {
    const meta: VideoMetadata = {
      duration: 100,
      width: 640,
      height: 360,
      videoBitrate: 800000,
    };
    expect(resolutionLabel(meta)).toContain("360p");
  });

  it("returns raw pixel label for heights below 360", () => {
    const meta: VideoMetadata = {
      duration: 100,
      width: 320,
      height: 240,
      videoBitrate: 400000,
    };
    expect(resolutionLabel(meta)).toBe("240p");
  });

  it("uses min(width, height) for landscape videos", () => {
    const meta: VideoMetadata = {
      duration: 100,
      width: 1920,
      height: 1080,
      videoBitrate: 5000000,
    };
    expect(resolutionLabel(meta)).toContain("1080p");
  });

  it("uses min(width, height) for portrait videos", () => {
    const meta: VideoMetadata = {
      duration: 100,
      width: 1080,
      height: 1920,
      videoBitrate: 5000000,
    };
    expect(resolutionLabel(meta)).toContain("1080p");
  });
});

describe("buildFormats", () => {
  const mockResult: UploadResult = {
    directUrl: "https://example.com/image.png",
    pageUrl: "https://example.com/view/123",
    thumbUrl: "https://example.com/thumb/123.png",
    deleteUrl: "https://example.com/delete/abc",
  };

  it("returns 7 base formats without mediumUrl", () => {
    const formats = buildFormats(mockResult, "test.png", true);
    expect(formats).toHaveLength(7);
  });

  it("returns 8 formats when mediumUrl is present", () => {
    const result = {
      ...mockResult,
      mediumUrl: "https://example.com/medium/123.png",
    };
    const formats = buildFormats(result, "test.png", true);
    expect(formats).toHaveLength(8);
  });

  it("includes bbcodeFull format", () => {
    const formats = buildFormats(mockResult, "test.png", true);
    const bbcode = formats.find((f: LinkFormat) => f.key === "bbcodeFull");
    expect(bbcode).toBeDefined();
    expect(bbcode!.value).toBe("[img]https://example.com/image.png[/img]");
  });

  it("includes bbcodeThumb format", () => {
    const formats = buildFormats(mockResult, "test.png", true);
    const bbcode = formats.find((f: LinkFormat) => f.key === "bbcodeThumb");
    expect(bbcode).toBeDefined();
    expect(bbcode!.value).toBe(
      "[url=https://example.com/view/123][img]https://example.com/thumb/123.png[/img][/url]",
    );
  });

  it("includes directUrl format", () => {
    const formats = buildFormats(mockResult, "test.png", true);
    const direct = formats.find((f: LinkFormat) => f.key === "directUrl");
    expect(direct!.value).toBe("https://example.com/image.png");
  });

  it("includes pageUrl format", () => {
    const formats = buildFormats(mockResult, "test.png", true);
    const page = formats.find((f: LinkFormat) => f.key === "pageUrl");
    expect(page!.value).toBe("https://example.com/view/123");
  });

  it("includes markdown format", () => {
    const formats = buildFormats(mockResult, "test.png", true);
    const md = formats.find((f: LinkFormat) => f.key === "markdown");
    expect(md!.value).toBe("![test](https://example.com/image.png)");
  });

  it("includes htmlImg format", () => {
    const formats = buildFormats(mockResult, "test.png", true);
    const html = formats.find((f: LinkFormat) => f.key === "htmlImg");
    expect(html!.value).toBe(
      '<img src="https://example.com/image.png" alt="test" />',
    );
  });

  it("strips file extension from filename for alt text", () => {
    const formats = buildFormats(mockResult, "my_video_output.webp", true);
    const md = formats.find((f: LinkFormat) => f.key === "markdown");
    expect(md!.value).toBe("![my_video_output](https://example.com/image.png)");
  });

  it("strips two extensions", () => {
    const formats = buildFormats(mockResult, "test.tar.gz.webp", true);
    const md = formats.find((f: LinkFormat) => f.key === "markdown");
    expect(md!.value).toBe("![test.tar](https://example.com/image.png)");
  });

  it("includes bbcodeMedium when mediumUrl exists", () => {
    const result = {
      ...mockResult,
      mediumUrl: "https://example.com/medium/123.png",
    };
    const formats = buildFormats(result, "test.png", true);
    const medium = formats.find((f: LinkFormat) => f.key === "bbcodeMedium");
    expect(medium).toBeDefined();
    expect(medium!.value).toBe(
      "[url=https://example.com/view/123][img]https://example.com/medium/123.png[/img][/url]",
    );
  });

  it("bbcodeMedium is inserted at index 3", () => {
    const result = {
      ...mockResult,
      mediumUrl: "https://example.com/medium/123.png",
    };
    const formats = buildFormats(result, "test.png", true);
    expect(formats[3].key).toBe("bbcodeMedium");
  });

  it("includes resolution in bbcodePostTemplate", () => {
    const meta: VideoMetadata = {
      duration: 100,
      width: 1920,
      height: 1080,
      videoBitrate: 5000000,
    };
    const formats = buildFormats(mockResult, "test.png", true, meta);
    const template = formats.find(
      (f: LinkFormat) => f.key === "bbcodePostTemplate",
    );
    expect(template!.value).toContain("1080p");
  });

  it("uses thumbUrl as fallback for mediumUrl in post template", () => {
    const formats = buildFormats(mockResult, "test.png", true);
    const template = formats.find(
      (f: LinkFormat) => f.key === "bbcodePostTemplate",
    );
    expect(template!.value).toContain(mockResult.thumbUrl);
  });

  it("uses mediumUrl in post template when available", () => {
    const result = {
      ...mockResult,
      mediumUrl: "https://example.com/medium/123.png",
    };
    const formats = buildFormats(result, "test.png", true);
    const template = formats.find(
      (f: LinkFormat) => f.key === "bbcodePostTemplate",
    );
    expect(template!.value).toContain("https://example.com/medium/123.png");
  });

  it("bbcodePostTemplate uses textarea field type", () => {
    const formats = buildFormats(mockResult, "test.png", true);
    const template = formats.find(
      (f: LinkFormat) => f.key === "bbcodePostTemplate",
    );
    expect(template!.fieldType).toBe("textarea");
  });

  it("includes resolution label with BBCode color tags", () => {
    const meta: VideoMetadata = {
      duration: 100,
      width: 1920,
      height: 1080,
      videoBitrate: 5000000,
    };
    const formats = buildFormats(mockResult, "test.png", true, meta);
    const template = formats.find(
      (f: LinkFormat) => f.key === "bbcodePostTemplate",
    );
    expect(template!.value).toContain("[COLOR=");
  });

  it("handles filename without extension", () => {
    const formats = buildFormats(mockResult, "test", true);
    const md = formats.find((f: LinkFormat) => f.key === "markdown");
    expect(md!.value).toBe("![test](https://example.com/image.png)");
  });

  it("each format has a description", () => {
    const formats = buildFormats(mockResult, "test.png", true);
    for (const f of formats) {
      expect(f.description!.length).toBeGreaterThan(0);
    }
  });

  it("each format has a unique key", () => {
    const formats = buildFormats(mockResult, "test.png", true);
    const keys = formats.map((f: LinkFormat) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses [url] wrapper for bbcodeFull when canHotlink is false", () => {
    const formats = buildFormats(mockResult, "test.png", false);
    const bbcode = formats.find((f: LinkFormat) => f.key === "bbcodeFull");
    expect(bbcode!.value).toBe(
      "[url=https://example.com/image.png][img]https://example.com/thumb/123.png[/img][/url]",
    );
    expect(bbcode!.description).toBe("Thumbnail that links to the full image");
  });

  it("wraps markdown thumbnail in link when canHotlink is false", () => {
    const formats = buildFormats(mockResult, "test.png", false);
    const md = formats.find((f: LinkFormat) => f.key === "markdown");
    expect(md!.value).toBe(
      "[![test](https://example.com/thumb/123.png)](https://example.com/image.png)",
    );
  });

  it("wraps html img in <a> tag when canHotlink is false", () => {
    const formats = buildFormats(mockResult, "test.png", false);
    const html = formats.find((f: LinkFormat) => f.key === "htmlImg");
    expect(html!.value).toBe(
      '<a href="https://example.com/image.png"><img src="https://example.com/thumb/123.png" alt="test" /></a>',
    );
    expect(html!.description).toBe("Thumbnail image linked to the full image");
  });

  it("uses pageUrl as linkTarget when directUrl is empty and canHotlink is false", () => {
    const noDirectResult: UploadResult = {
      directUrl: "",
      pageUrl: "https://example.com/view/123",
      thumbUrl: "https://example.com/thumb/123.png",
      deleteUrl: "https://example.com/delete/abc",
    };
    const formats = buildFormats(noDirectResult, "test.png", false);
    const md = formats.find((f: LinkFormat) => f.key === "markdown");
    expect(md!.value).toBe(
      "[![test](https://example.com/thumb/123.png)](https://example.com/view/123)",
    );
  });
});
