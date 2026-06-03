/**
 * Tests for InfoPanel component.
 *
 * Verifies upload button visibility logic, MP4 popover behavior,
 * and mutual exclusivity between regular upload and MP4 popover.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import InfoPanel from "@/components/TaskCard/InfoPanel";
import { createTestTaskItem } from "../helpers/mockServices";
import type { UploadDestination } from "@/types";

// Mock Radix Popover to avoid Portal/animation complexity in tests
vi.mock("@radix-ui/react-popover", () => ({
  Root: function MockRoot({ children }: { children: React.ReactNode }) {
    return <div data-testid="popover-root">{children}</div>;
  },
  Trigger: function MockTrigger({
    asChild,
    children,
  }: {
    asChild?: boolean;
    children: React.ReactNode;
  }) {
    if (asChild) {
      return <div data-testid="popover-trigger">{children}</div>;
    }
    return <button data-testid="popover-trigger">{children}</button>;
  },
  Content: function MockContent({ children }: { children: React.ReactNode }) {
    return <div data-testid="popover-content">{children}</div>;
  },
  Portal: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const mockDestinations: UploadDestination[] = [
  {
    id: "dest1",
    name: "ImgBB",
    type: "chevereto",
    apiKey: "key1",
    url: "https://imgbb.com/upload?key={key}",
    enabled: true,
  },
  {
    id: "dest2",
    name: "Postimages",
    type: "chevereto",
    apiKey: "key2",
    url: "https://postimages.org/upload?key={key}",
    enabled: true,
  },
];

const mockHandlers = {
  onUpload: vi.fn(),
  onRequeue: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("InfoPanel - upload button logic", () => {
  it("shows regular upload button for non-MP4 done tasks", () => {
    const item = createTestTaskItem({
      status: "done",
      outputName: "output.jpg",
      outputBlob: new Blob(["test"], { type: "image/jpeg" }),
      outputSize: 12345,
    });

    render(
      <InfoPanel
        item={item}
        blobUrl="blob://test"
        statusText="done"
        outputDimensions={{ width: 1920, height: 1080 }}
        destinations={mockDestinations}
        canUpload={true}
        canRequeue={false}
        onUpload={mockHandlers.onUpload}
        onRequeue={mockHandlers.onRequeue}
      />,
    );

    // Should have upload button
    const uploadButtons = screen.queryAllByText(/upload/i);
    expect(uploadButtons.length).toBeGreaterThan(0);

    // Should NOT have popover (no MP4)
    expect(screen.queryByTestId("popover-root")).toBeNull();
  });

  it("shows popover upload button for MP4 done tasks", () => {
    const item = createTestTaskItem({
      status: "done",
      outputName: "output.mp4",
      outputBlob: new Blob(["test"], { type: "video/mp4" }),
      outputSize: 98765,
    });

    render(
      <InfoPanel
        item={item}
        blobUrl="blob://test"
        statusText="done"
        outputDimensions={{ width: 1920, height: 1080 }}
        destinations={mockDestinations}
        canUpload={true}
        canRequeue={false}
        onUpload={mockHandlers.onUpload}
        onRequeue={mockHandlers.onRequeue}
      />,
    );

    // Should have popover
    expect(screen.getByTestId("popover-root")).toBeTruthy();

    // Should have popover content with explanation
    expect(screen.getByTestId("popover-content")).toBeTruthy();
    expect(
      screen.getByText(/MP4 files cannot be uploaded to image hosts/i),
    ).toBeTruthy();
  });

  it("does not show upload button or popover when no destinations enabled", () => {
    const item = createTestTaskItem({
      status: "done",
      outputName: "output.jpg",
      outputBlob: new Blob(["test"], { type: "image/jpeg" }),
      outputSize: 12345,
    });

    const disabledDests = mockDestinations.map((d) => ({
      ...d,
      enabled: false,
    }));

    render(
      <InfoPanel
        item={item}
        blobUrl="blob://test"
        statusText="done"
        outputDimensions={{ width: 1920, height: 1080 }}
        destinations={disabledDests}
        canUpload={true}
        canRequeue={false}
        onUpload={mockHandlers.onUpload}
        onRequeue={mockHandlers.onRequeue}
      />,
    );

    // No upload button
    expect(screen.queryByText(/upload/i)).toBeNull();
    // No popover
    expect(screen.queryByTestId("popover-root")).toBeNull();
  });

  it("does not show upload button when task is not done", () => {
    const item = createTestTaskItem({
      status: "queued",
      outputName: "output.jpg",
    });

    render(
      <InfoPanel
        item={item}
        blobUrl={null}
        statusText="queued"
        outputDimensions={null}
        destinations={mockDestinations}
        canUpload={false}
        canRequeue={false}
        onUpload={mockHandlers.onUpload}
        onRequeue={mockHandlers.onRequeue}
      />,
    );

    expect(screen.queryByText(/upload/i)).toBeNull();
    expect(screen.queryByTestId("popover-root")).toBeNull();
  });

  it("shows popover with correct destination count for single destination", () => {
    const item = createTestTaskItem({
      status: "done",
      outputName: "output.mp4",
      outputBlob: new Blob(["test"], { type: "video/mp4" }),
      outputSize: 98765,
    });

    const singleDest: UploadDestination[] = [
      {
        id: "dest1",
        name: "ImgBB",
        type: "chevereto",
        apiKey: "key1",
        url: "https://imgbb.com/upload?key={key}",
        enabled: true,
      },
    ];

    render(
      <InfoPanel
        item={item}
        blobUrl="blob://test"
        statusText="done"
        outputDimensions={{ width: 1920, height: 1080 }}
        destinations={singleDest}
        canUpload={true}
        canRequeue={false}
        onUpload={mockHandlers.onUpload}
        onRequeue={mockHandlers.onRequeue}
      />,
    );

    // Popover button should mention the single destination name
    expect(screen.getByText(/Upload to ImgBB/i)).toBeTruthy();
  });

  it("shows popover with destination count for multiple destinations", () => {
    const item = createTestTaskItem({
      status: "done",
      outputName: "output.mp4",
      outputBlob: new Blob(["test"], { type: "video/mp4" }),
      outputSize: 98765,
    });

    render(
      <InfoPanel
        item={item}
        blobUrl="blob://test"
        statusText="done"
        outputDimensions={{ width: 1920, height: 1080 }}
        destinations={mockDestinations}
        canUpload={true}
        canRequeue={false}
        onUpload={mockHandlers.onUpload}
        onRequeue={mockHandlers.onRequeue}
      />,
    );

    // Should show count "(2 destinations)"
    expect(screen.getByText(/\(2 destinations\)/i)).toBeTruthy();
  });
});

describe("InfoPanel - mutual exclusivity", () => {
  it("regular upload and MP4 popover are never both visible", () => {
    // MP4 case - only popover
    const mp4Item = createTestTaskItem({
      status: "done",
      outputName: "output.mp4",
      outputBlob: new Blob(["test"], { type: "video/mp4" }),
      outputSize: 98765,
    });

    const { container, unmount } = render(
      <InfoPanel
        item={mp4Item}
        blobUrl="blob://test"
        statusText="done"
        outputDimensions={{ width: 1920, height: 1080 }}
        destinations={mockDestinations}
        canUpload={true}
        canRequeue={false}
        onUpload={mockHandlers.onUpload}
        onRequeue={mockHandlers.onRequeue}
      />,
    );

    // Has popover
    expect(
      container.querySelector('[data-testid="popover-root"]'),
    ).toBeTruthy();

    unmount();

    // JPG case - only regular upload button
    const jpgItem = createTestTaskItem({
      status: "done",
      outputName: "output.jpg",
      outputBlob: new Blob(["test"], { type: "image/jpeg" }),
      outputSize: 12345,
    });

    render(
      <InfoPanel
        item={jpgItem}
        blobUrl="blob://test"
        statusText="done"
        outputDimensions={{ width: 1920, height: 1080 }}
        destinations={mockDestinations}
        canUpload={true}
        canRequeue={false}
        onUpload={mockHandlers.onUpload}
        onRequeue={mockHandlers.onRequeue}
      />,
    );

    // No popover
    expect(container.querySelector('[data-testid="popover-root"]')).toBeNull();
  });
});

describe("InfoPanel - upload progress", () => {
  it("shows upload progress bar when uploading to destination", () => {
    const item = createTestTaskItem({
      status: "done",
      outputName: "output.jpg",
      outputBlob: new Blob(["test"], { type: "image/jpeg" }),
      outputSize: 12345,
      uploads: {
        dest1: { status: "uploading", progress: 42 },
      },
    });

    render(
      <InfoPanel
        item={item}
        blobUrl="blob://test"
        statusText="done"
        outputDimensions={{ width: 1920, height: 1080 }}
        destinations={mockDestinations}
        canUpload={true}
        canRequeue={false}
        onUpload={mockHandlers.onUpload}
        onRequeue={mockHandlers.onRequeue}
      />,
    );

    expect(screen.getByText(/Uploading to ImgBB/i)).toBeTruthy();
    expect(screen.getByText("42%")).toBeTruthy();
  });

  it("shows error message when upload failed", () => {
    const item = createTestTaskItem({
      status: "done",
      outputName: "output.jpg",
      outputBlob: new Blob(["test"], { type: "image/jpeg" }),
      outputSize: 12345,
      uploads: {
        dest1: { status: "error", progress: 0, error: "Rate limit exceeded" },
      },
    });

    render(
      <InfoPanel
        item={item}
        blobUrl="blob://test"
        statusText="done"
        outputDimensions={{ width: 1920, height: 1080 }}
        destinations={mockDestinations}
        canUpload={true}
        canRequeue={false}
        onUpload={mockHandlers.onUpload}
        onRequeue={mockHandlers.onRequeue}
      />,
    );

    expect(
      screen.getByText(/Upload to ImgBB failed: Rate limit exceeded/i),
    ).toBeTruthy();
  });
});

describe("InfoPanel - popover content", () => {
  it("popover contains 'Upload unavailable' heading", () => {
    const item = createTestTaskItem({
      status: "done",
      outputName: "output.mp4",
      outputBlob: new Blob(["test"], { type: "video/mp4" }),
      outputSize: 98765,
    });

    render(
      <InfoPanel
        item={item}
        blobUrl="blob://test"
        statusText="done"
        outputDimensions={{ width: 1920, height: 1080 }}
        destinations={mockDestinations}
        canUpload={true}
        canRequeue={false}
        onUpload={mockHandlers.onUpload}
        onRequeue={mockHandlers.onRequeue}
      />,
    );

    expect(screen.getByText("Upload unavailable")).toBeTruthy();
  });
});
