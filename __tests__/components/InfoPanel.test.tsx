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

/**
 * Create a mock destination with all required fields.
 * By default allows all extensions and has no size limit so most test
 * outputs are eligible for upload.
 */
function makeDest(
  overrides: Partial<UploadDestination> = {},
): UploadDestination {
  return {
    id: "dest1",
    name: "ImgBB",
    type: "chevereto",
    apiKey: "key1",
    url: "https://imgbb.com/upload?key={key}",
    enabled: true,
    allowedExtensions: "",
    maxSizeMb: 0,
    ...overrides,
  };
}

const mockDestinations: UploadDestination[] = [
  makeDest({ id: "dest1", name: "ImgBB" }),
  makeDest({ id: "dest2", name: "Postimages" }),
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

  it("shows popover upload button for ineligible done tasks", () => {
    // Use destinations that only allow .jpg (not .webp)
    const jpgOnlyDests: UploadDestination[] = [
      makeDest({
        id: "dest1",
        name: "ImgBB",
        allowedExtensions: ".jpg",
      }),
    ];

    const item = createTestTaskItem({
      status: "done",
      outputName: "output.webp",
      outputBlob: new Blob(["test"], { type: "image/webp" }),
      outputSize: 12345,
    });

    render(
      <InfoPanel
        item={item}
        blobUrl="blob://test"
        statusText="done"
        outputDimensions={{ width: 1920, height: 1080 }}
        destinations={jpgOnlyDests}
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
    // Use a destination that only allows .jpg, so .webp is ineligible
    const singleDest: UploadDestination[] = [
      makeDest({
        id: "dest1",
        name: "ImgBB",
        allowedExtensions: ".jpg",
      }),
    ];

    const item = createTestTaskItem({
      status: "done",
      outputName: "output.webp",
      outputBlob: new Blob(["test"], { type: "image/webp" }),
      outputSize: 12345,
    });

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
    // Destinations only allow .jpg so .webp is ineligible
    const jpgOnlyDests: UploadDestination[] = [
      makeDest({ id: "dest1", name: "ImgBB", allowedExtensions: ".jpg" }),
      makeDest({ id: "dest2", name: "Postimages", allowedExtensions: ".jpg" }),
    ];

    const item = createTestTaskItem({
      status: "done",
      outputName: "output.webp",
      outputBlob: new Blob(["test"], { type: "image/webp" }),
      outputSize: 12345,
    });

    render(
      <InfoPanel
        item={item}
        blobUrl="blob://test"
        statusText="done"
        outputDimensions={{ width: 1920, height: 1080 }}
        destinations={jpgOnlyDests}
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
  it("regular upload and ineligible popover are never both visible", () => {
    // Ineligible case - only popover (dest only allows .jpg, output is .webp)
    const jpgOnlyDests: UploadDestination[] = [
      makeDest({ id: "dest1", name: "ImgBB", allowedExtensions: ".jpg" }),
    ];

    const ineligibleItem = createTestTaskItem({
      status: "done",
      outputName: "output.webp",
      outputBlob: new Blob(["test"], { type: "image/webp" }),
      outputSize: 12345,
    });

    const { container, unmount } = render(
      <InfoPanel
        item={ineligibleItem}
        blobUrl="blob://test"
        statusText="done"
        outputDimensions={{ width: 1920, height: 1080 }}
        destinations={jpgOnlyDests}
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

    // Eligible case - only regular upload button
    const eligibleItem = createTestTaskItem({
      status: "done",
      outputName: "output.jpg",
      outputBlob: new Blob(["test"], { type: "image/jpeg" }),
      outputSize: 12345,
    });

    render(
      <InfoPanel
        item={eligibleItem}
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
    // Dest only allows .jpg so .webp is ineligible
    const jpgOnlyDests: UploadDestination[] = [
      makeDest({ id: "dest1", name: "ImgBB", allowedExtensions: ".jpg" }),
    ];

    const item = createTestTaskItem({
      status: "done",
      outputName: "output.webp",
      outputBlob: new Blob(["test"], { type: "image/webp" }),
      outputSize: 12345,
    });

    render(
      <InfoPanel
        item={item}
        blobUrl="blob://test"
        statusText="done"
        outputDimensions={{ width: 1920, height: 1080 }}
        destinations={jpgOnlyDests}
        canUpload={true}
        canRequeue={false}
        onUpload={mockHandlers.onUpload}
        onRequeue={mockHandlers.onRequeue}
      />,
    );

    expect(screen.getByText("Upload unavailable")).toBeTruthy();
  });
});

describe("InfoPanel - MP4 eligibility", () => {
  it("shows regular upload button when destination allows mp4 extension", () => {
    // Destination explicitly allows mp4
    const mp4AllowedDests: UploadDestination[] = [
      makeDest({
        id: "dest1",
        name: "MyHost",
        allowedExtensions: "jpg,webp,mp4",
        maxSizeMb: 0,
      }),
    ];

    const item = createTestTaskItem({
      status: "done",
      outputName: "output.mp4",
      outputBlob: new Blob(["test"], { type: "video/mp4" }),
      outputSize: 500000,
    });

    render(
      <InfoPanel
        item={item}
        blobUrl="blob://test"
        statusText="done"
        outputDimensions={null}
        destinations={mp4AllowedDests}
        canUpload={true}
        canRequeue={false}
        onUpload={mockHandlers.onUpload}
        onRequeue={mockHandlers.onRequeue}
      />,
    );

    // Should have regular upload button (not popover)
    expect(screen.getByText(/Upload to MyHost/i)).toBeTruthy();
    expect(screen.queryByTestId("popover-root")).toBeNull();
  });

  it("shows popover when destination does not allow mp4 extension", () => {
    // Destination only allows jpg,webp (no mp4)
    const imageOnlyDests: UploadDestination[] = [
      makeDest({
        id: "dest1",
        name: "ImgHost",
        allowedExtensions: "jpg,webp",
        maxSizeMb: 32,
      }),
    ];

    const item = createTestTaskItem({
      status: "done",
      outputName: "output.mp4",
      outputBlob: new Blob(["test"], { type: "video/mp4" }),
      outputSize: 500000,
    });

    render(
      <InfoPanel
        item={item}
        blobUrl="blob://test"
        statusText="done"
        outputDimensions={null}
        destinations={imageOnlyDests}
        canUpload={false}
        canRequeue={false}
        onUpload={mockHandlers.onUpload}
        onRequeue={mockHandlers.onRequeue}
      />,
    );

    // Should have popover (no regular upload button)
    expect(screen.getByTestId("popover-root")).toBeTruthy();
    expect(screen.getByText("Upload unavailable")).toBeTruthy();
  });

  it("shows upload button when destination allows all extensions (empty string)", () => {
    // Empty allowedExtensions means allow all
    const allowAllDests: UploadDestination[] = [
      makeDest({
        id: "dest1",
        name: "AnyHost",
        allowedExtensions: "",
        maxSizeMb: 0,
      }),
    ];

    const item = createTestTaskItem({
      status: "done",
      outputName: "output.mp4",
      outputBlob: new Blob(["test"], { type: "video/mp4" }),
      outputSize: 500000,
    });

    render(
      <InfoPanel
        item={item}
        blobUrl="blob://test"
        statusText="done"
        outputDimensions={null}
        destinations={allowAllDests}
        canUpload={true}
        canRequeue={false}
        onUpload={mockHandlers.onUpload}
        onRequeue={mockHandlers.onRequeue}
      />,
    );

    // Should have regular upload button
    expect(screen.getByText(/Upload to AnyHost/i)).toBeTruthy();
    expect(screen.queryByTestId("popover-root")).toBeNull();
  });

  it("blocks upload when file size exceeds destination max", () => {
    // 32 MB limit, file is 50 MB
    const sizeLimitedDests: UploadDestination[] = [
      makeDest({
        id: "dest1",
        name: "SmallHost",
        allowedExtensions: "",
        maxSizeMb: 32,
      }),
    ];

    const item = createTestTaskItem({
      status: "done",
      outputName: "output.jpg",
      outputBlob: new Blob(["test"], { type: "image/jpeg" }),
      outputSize: 50 * 1024 * 1024, // 50 MB
    });

    render(
      <InfoPanel
        item={item}
        blobUrl="blob://test"
        statusText="done"
        outputDimensions={{ width: 1920, height: 1080 }}
        destinations={sizeLimitedDests}
        canUpload={false}
        canRequeue={false}
        onUpload={mockHandlers.onUpload}
        onRequeue={mockHandlers.onRequeue}
      />,
    );

    // Should have popover (size exceeds limit)
    expect(screen.getByTestId("popover-root")).toBeTruthy();
    expect(screen.getByText("Upload unavailable")).toBeTruthy();
  });
});
