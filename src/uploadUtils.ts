import type { UploadResult, VideoMetadata } from "./types";

export type LinkFormat = {
  key: string;
  label: string;
  value: string;
  description: string;
  fieldType?: "input" | "textarea";
};

/**
 * Derives a human-readable resolution label (e.g. "1080p") from pixel height,
 * with BBCode colour tags for forum use. Returns an empty string if metadata
 * is missing or height is zero.
 *
 * @param meta - Optional VideoMetadata; height is used to pick the label.
 * @returns The formatted resolution label, or an empty string.
 */
export const resolutionLabel = (meta?: VideoMetadata): string => {
  if (!meta || meta.height === 0) return "";
  const h = meta.height;
  if (h >= 2160) return "[COLOR=rgb(85, 57, 130)]2160p[/COLOR]";
  if (h >= 1440) return "[COLOR=rgb(251, 160, 38)]1440p[/COLOR]";
  if (h >= 1080) return "[COLOR=rgb(184, 49, 47)]1080p[/COLOR]";
  if (h >= 720) return "[COLOR=rgb(250, 197, 28)]720p[/COLOR]";
  if (h >= 480) return "[COLOR=rgb(0, 0, 0)]480p[/COLOR]";
  if (h >= 360) return "[COLOR=rgb(204, 204, 204)]360p[/COLOR]";
  return `${h}p`;
};

/**
 * Build the list of copyable link formats for a given upload result.
 * Each item uses a named key so callers do not depend on array positions.
 *
 * @param r - The UploadResult from the host.
 * @param filename - Original output filename (extension stripped for alt text).
 * @param metadata - Optional video metadata used for the post template title.
 * @returns The available link formats for the upload result.
 */
export const buildFormats = (
  r: UploadResult,
  filename: string,
  metadata?: VideoMetadata,
): LinkFormat[] => {
  const filenameNoExt = filename
    .replace(/\.[^.]+$/, "") // Remove thumbnail image file extension
    .replace(/\.[^.]+$/, ""); // Remove video file extension
  const resolution = resolutionLabel(metadata);
  const formats: LinkFormat[] = [
    {
      key: "directUrl",
      label: "Direct URL",
      value: r.directUrl,
      description: "Full-resolution image link",
    },
    {
      key: "pageUrl",
      label: "Viewer page",
      value: r.pageUrl,
      description: "Host viewer page",
    },
    {
      key: "bbcodeFull",
      label: "BBCode — full image",
      value: `[img]${r.directUrl}[/img]`,
      description: "Displays the image inline",
    },
    {
      key: "bbcodeThumb",
      label: "BBCode — thumbnail → full",
      value: `[url=${r.pageUrl}][img]${r.thumbUrl}[/img][/url]`,
      description: "Thumbnail that links to the viewer page",
    },
    {
      key: "markdown",
      label: "Markdown",
      value: `![${filenameNoExt}](${r.directUrl})`,
      description: "For GitHub, GitLab, Reddit…",
    },
    {
      key: "htmlImg",
      label: "HTML img",
      value: `<img src="${r.directUrl}" alt="${filenameNoExt}" />`,
      description: "Inline HTML image tag",
    },
    {
      key: "postTemplate",
      label: "Post Template",
      value: `[b]${filenameNoExt}${resolution ? ` ${resolution}` : ""}[/b]\n[url=${r.pageUrl}][img]${r.mediumUrl ?? r.thumbUrl}[/img][/url]`,
      description: "Forum-style template for this upload",
      fieldType: "textarea",
    },
  ];

  if (r.mediumUrl) {
    formats.splice(3, 0, {
      key: "bbcodeMedium",
      label: "BBCode — medium → full",
      value: `[url=${r.pageUrl}][img]${r.mediumUrl}[/img][/url]`,
      description: "Medium image that links to the viewer page",
    });
  }

  return formats;
};
