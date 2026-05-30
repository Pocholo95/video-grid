/**
 * Tests for TaskCard component.
 *
 * Verifies rendering in different task states (done/error/queued/processing/cancelled),
 * button visibility, status display, and callback invocation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TaskCard from "@/components/TaskCard";
import { createTestTaskItem } from "../helpers/mockServices";
import type { TaskItem } from "@/types";

// Mock stores
vi.mock("@/store/uiStore", () => ({
  useUiStore: vi.fn((selector) => selector?.(12) ?? 12),
  selectTotalCells: vi.fn((s) => s.cols * s.rows),
}));

vi.mock("@/store/settingsStore", () => ({
  useSettingsStore: vi.fn((selector) =>
    selector({
      settings: {
        showPreview: true,
        destinations: [],
      },
    }),
  ),
}));

// Mock sub-components
vi.mock("@/components/TaskCard/SourceInfoSection", () => ({
  default: function MockSourceInfoSection({
    filename,
  }: {
    metadata: unknown;
    filename: string;
  }) {
    return <div data-testid="source-info">{filename}</div>;
  },
}));

vi.mock("@/components/TaskCard/FfmpegLogsSection", () => ({
  default: function MockFfmpegLogsSection() {
    return <div data-testid="ffmpeg-logs">Logs</div>;
  },
}));

vi.mock("@/components/TaskCard/TimestampRow", () => ({
  default: function MockTimestampRow({
    isCustom,
    markerCount,
  }: {
    isCustom: boolean;
    markerCount: number;
  }) {
    return (
      <div data-testid="timestamp-row">
        {isCustom ? "custom" : "auto"} - {markerCount} markers
      </div>
    );
  },
}));

vi.mock("@/components/TaskCard/PreviewSection", () => ({
  default: function MockPreviewSection() {
    return <div data-testid="preview-section">Preview</div>;
  },
}));

vi.mock("@/components/TaskCard/InfoPanel", () => ({
  default: function MockInfoPanel({
    statusText,
    canUpload,
    canRequeue,
  }: {
    statusText: string;
    canUpload: boolean;
    canRequeue: boolean;
  }) {
    return (
      <div data-testid="info-panel">
        <span>{statusText}</span>
        {canUpload && <span>Can Upload</span>}
        {canRequeue && <span>Can Requeue</span>}
      </div>
    );
  },
}));

vi.mock("@/components/TaskCard/UploadResultsSection", () => ({
  default: function MockUploadResultsSection() {
    return <div data-testid="upload-results">Uploads</div>;
  },
}));

vi.mock("@/components/TimestampEditor", () => ({
  default: function MockTimestampEditor() {
    return <div data-testid="timestamp-editor">Editor</div>;
  },
}));

vi.mock("@/lib/useTick", () => ({
  useTick: vi.fn(),
}));

vi.mock("@/lib/blobCache", () => ({
  getOrCreateUrl: vi.fn(() => "blob://mock"),
}));

function createTaskItem(overrides: Partial<TaskItem> = {}): TaskItem {
  return createTestTaskItem({ id: "task-1", ...overrides });
}

const mockHandlers = {
  onPreview: vi.fn(),
  onUpload: vi.fn(),
  onUpdateTimestamps: vi.fn(),
  onRemove: vi.fn(),
  onRequeue: vi.fn(),
  handleEnablePreviews: vi.fn(),
  onForceCancel: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TaskCard - rendering", () => {
  it("renders the file name", () => {
    const item = createTaskItem();
    render(<TaskCard item={item} {...mockHandlers} />);
    const matches = screen.getAllByText("test.mp4");
    expect(matches.length).toBeGreaterThan(0);
  });

  it("renders the position badge when provided", () => {
    const item = createTaskItem();
    render(<TaskCard item={item} position={1} {...mockHandlers} />);
    expect(screen.getByText("#1")).toBeTruthy();
  });

  it("does not render position badge when not provided", () => {
    const item = createTaskItem();
    render(<TaskCard item={item} {...mockHandlers} />);
    expect(screen.queryByText("#1")).toBeNull();
  });
});

describe("TaskCard - status badges", () => {
  it("shows 'queued' status", () => {
    const item = createTaskItem({ status: "queued" });
    render(<TaskCard item={item} {...mockHandlers} />);
    const matches = screen.getAllByText(/queued/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("shows 'processing' status", () => {
    const item = createTaskItem({
      status: "processing",
      processingStartedAt: Date.now() - 5000,
    });
    render(<TaskCard item={item} {...mockHandlers} />);
    const matches = screen.getAllByText(/processing/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("shows 'done' status", () => {
    const item = createTaskItem({
      status: "done",
      outputBlob: new Blob(),
      processingDurationMs: 3000,
    });
    render(<TaskCard item={item} {...mockHandlers} />);
    const matches = screen.getAllByText(/done/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("shows 'error' status", () => {
    const item = createTaskItem({
      status: "error",
      error: "FFmpeg failed",
    });
    render(<TaskCard item={item} {...mockHandlers} />);
    const matches = screen.getAllByText(/error/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("shows 'cancelled' status", () => {
    const item = createTaskItem({ status: "cancelled" });
    render(<TaskCard item={item} {...mockHandlers} />);
    const matches = screen.getAllByText(/cancelled/i);
    expect(matches.length).toBeGreaterThan(0);
  });
});

describe("TaskCard - error & warning display", () => {
  it("shows error alert when error is present", () => {
    const item = createTaskItem({
      status: "error",
      error: "Something went wrong",
    });
    render(<TaskCard item={item} {...mockHandlers} />);
    expect(screen.getByText("Something went wrong")).toBeTruthy();
  });

  it("shows warning alert when warning is present", () => {
    const item = createTaskItem({
      status: "done",
      warning: "Low resolution detected",
    });
    render(<TaskCard item={item} {...mockHandlers} />);
    expect(screen.getByText("Low resolution detected")).toBeTruthy();
  });

  it("does not show error alert when no error", () => {
    const item = createTaskItem({ status: "queued" });
    render(<TaskCard item={item} {...mockHandlers} />);
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });
});

describe("TaskCard - remove button", () => {
  it("calls onRemove when remove button clicked", () => {
    const item = createTaskItem({ status: "queued" });
    render(<TaskCard item={item} {...mockHandlers} />);
    const removeBtn = screen.getByTitle("Remove this task");
    fireEvent.click(removeBtn);
    expect(mockHandlers.onRemove).toHaveBeenCalledWith("task-1");
  });

  it("disables remove button during processing", () => {
    const item = createTaskItem({ status: "processing" });
    render(<TaskCard item={item} {...mockHandlers} />);
    const removeBtn = screen.getByTitle("Remove this task");
    expect(removeBtn.hasAttribute("disabled")).toBe(true);
  });

  it("enables remove button when not processing", () => {
    const item = createTaskItem({ status: "done" });
    render(<TaskCard item={item} {...mockHandlers} />);
    const removeBtn = screen.getByTitle("Remove this task");
    expect(removeBtn.hasAttribute("disabled")).toBe(false);
  });
});

describe("TaskCard - source info", () => {
  it("shows source info when metadata is present", () => {
    const item = createTaskItem({
      metadata: {
        width: 1920,
        height: 1080,
        duration: 60,
        bitrate: 5000,
        codec: "h264",
        fps: 30,
      },
    });
    render(<TaskCard item={item} {...mockHandlers} />);
    expect(screen.getByTestId("source-info")).toBeTruthy();
  });

  it("does not show source info when metadata is missing", () => {
    const item = createTaskItem({ metadata: undefined });
    render(<TaskCard item={item} {...mockHandlers} />);
    expect(screen.queryByTestId("source-info")).toBeNull();
  });
});

describe("TaskCard - stale detection", () => {
  it("shows stale warning when isStale is true", () => {
    const item = createTaskItem({
      status: "processing",
      processingStartedAt: Date.now() - 60000,
    });
    render(<TaskCard item={item} isStale={true} {...mockHandlers} />);
    expect(screen.getByText(/FFmpeg processing might be stuck/i)).toBeTruthy();
  });

  it("does not show stale warning when isStale is false", () => {
    const item = createTaskItem({ status: "processing" });
    render(<TaskCard item={item} isStale={false} {...mockHandlers} />);
    expect(screen.queryByText(/FFmpeg processing might be stuck/i)).toBeNull();
  });
});

describe("TaskCard - expand/collapse", () => {
  it("renders a collapsible section", () => {
    const item = createTaskItem();
    const { container } = render(<TaskCard item={item} {...mockHandlers} />);
    // Section component renders as a div with data-state attribute
    const section = container.querySelector('[data-state="open"]');
    expect(section).toBeTruthy();
  });
});
