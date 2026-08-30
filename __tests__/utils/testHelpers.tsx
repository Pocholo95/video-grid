import React from "react";
import { render } from "@testing-library/react";

// Helper to create a mock File object for testing
export function createMockFile(
  options: {
    name?: string;
    type?: string;
    content?: string;
  } = {},
): File {
  const {
    name = "test-video.mp4",
    type = "video/mp4",
    content = "test content",
  } = options;

  return new File([content], name, { type });
}

// Helper to create a mock Blob URL
export function createMockBlobUrl(url = "blob:test/abc-123"): string {
  return url;
}

// Custom render with common providers if needed
export function customRender(ui: React.ReactElement) {
  return render(ui);
}

// Wait for async operations to complete
export function waitForNextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Create a mock video element
export function createMockVideoElement(): HTMLVideoElement {
  const video = document.createElement("video");
  video.src = "blob:test/mock-video";
  Object.defineProperty(video, "readyState", {
    value: 4, // HAVE_ENOUGH_DATA
    writable: true,
  });
  return video;
}
