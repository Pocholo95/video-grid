/**
 * Tests for ProcessingPanel component.
 *
 * Verifies button visibility based on state, progress display,
 * status messages, and callback invocation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProcessingPanel from "@/components/ProcessingPanel";
import type { ProcessorStatus } from "@/types";

const defaultStatus: ProcessorStatus = {
  text: "",
  currentPct: 0,
  batchDone: 0,
  batchTotal: 0,
  batchStartTime: null,
  batchDurationMs: null,
};

const mockHandlers = {
  onStart: vi.fn(),
  onCancel: vi.fn(),
  onClear: vi.fn(),
  onRequeueAll: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProcessingPanel - buttons", () => {
  it("renders Start, Cancel, and Clear buttons", () => {
    render(
      <ProcessingPanel
        status={defaultStatus}
        isProcessing={false}
        hasFiles={true}
        allMetadataReady={true}
        hasRequeuableItems={false}
        effectiveBatchTotal={0}
        effectiveBatchDone={0}
        {...mockHandlers}
      />,
    );
    expect(screen.getByText("Start Processing")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
    expect(screen.getByText("Remove All Tasks")).toBeTruthy();
  });

  it("enables Start button when files ready", () => {
    render(
      <ProcessingPanel
        status={defaultStatus}
        isProcessing={false}
        hasFiles={true}
        allMetadataReady={true}
        hasRequeuableItems={false}
        effectiveBatchTotal={0}
        effectiveBatchDone={0}
        {...mockHandlers}
      />,
    );
    const startBtn = screen.getByText("Start Processing");
    expect(startBtn.hasAttribute("disabled")).toBe(false);
  });

  it("disables Start button when no files", () => {
    render(
      <ProcessingPanel
        status={defaultStatus}
        isProcessing={false}
        hasFiles={false}
        allMetadataReady={true}
        hasRequeuableItems={false}
        effectiveBatchTotal={0}
        effectiveBatchDone={0}
        {...mockHandlers}
      />,
    );
    const startBtn = screen.getByText("Start Processing");
    expect(startBtn.hasAttribute("disabled")).toBe(true);
  });

  it("disables Start button when metadata not ready", () => {
    render(
      <ProcessingPanel
        status={defaultStatus}
        isProcessing={false}
        hasFiles={true}
        allMetadataReady={false}
        hasRequeuableItems={false}
        effectiveBatchTotal={0}
        effectiveBatchDone={0}
        {...mockHandlers}
      />,
    );
    const startBtn = screen.getByText("Start Processing");
    expect(startBtn.hasAttribute("disabled")).toBe(true);
  });

  it("disables Start button while processing", () => {
    render(
      <ProcessingPanel
        status={defaultStatus}
        isProcessing={true}
        hasFiles={true}
        allMetadataReady={true}
        hasRequeuableItems={false}
        effectiveBatchTotal={0}
        effectiveBatchDone={0}
        {...mockHandlers}
      />,
    );
    const startBtn = screen.getByText("Start Processing");
    expect(startBtn.hasAttribute("disabled")).toBe(true);
  });

  it("calls onStart when Start button clicked", () => {
    render(
      <ProcessingPanel
        status={defaultStatus}
        isProcessing={false}
        hasFiles={true}
        allMetadataReady={true}
        hasRequeuableItems={false}
        effectiveBatchTotal={0}
        effectiveBatchDone={0}
        {...mockHandlers}
      />,
    );
    fireEvent.click(screen.getByText("Start Processing"));
    expect(mockHandlers.onStart).toHaveBeenCalled();
  });

  it("calls onCancel when Cancel button clicked", () => {
    render(
      <ProcessingPanel
        status={defaultStatus}
        isProcessing={true}
        hasFiles={true}
        allMetadataReady={true}
        hasRequeuableItems={false}
        effectiveBatchTotal={0}
        effectiveBatchDone={0}
        {...mockHandlers}
      />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(mockHandlers.onCancel).toHaveBeenCalled();
  });

  it("disables Cancel button when not processing", () => {
    render(
      <ProcessingPanel
        status={defaultStatus}
        isProcessing={false}
        hasFiles={true}
        allMetadataReady={true}
        hasRequeuableItems={false}
        effectiveBatchTotal={0}
        effectiveBatchDone={0}
        {...mockHandlers}
      />,
    );
    const cancelBtn = screen.getByText("Cancel");
    expect(cancelBtn.hasAttribute("disabled")).toBe(true);
  });

  it("calls onClear when Clear button clicked", () => {
    render(
      <ProcessingPanel
        status={defaultStatus}
        isProcessing={false}
        hasFiles={true}
        allMetadataReady={true}
        hasRequeuableItems={false}
        effectiveBatchTotal={0}
        effectiveBatchDone={0}
        {...mockHandlers}
      />,
    );
    fireEvent.click(screen.getByText("Remove All Tasks"));
    expect(mockHandlers.onClear).toHaveBeenCalled();
  });

  it("shows Requeue All button when requeuable items exist", () => {
    render(
      <ProcessingPanel
        status={defaultStatus}
        isProcessing={false}
        hasFiles={false}
        allMetadataReady={true}
        hasRequeuableItems={true}
        effectiveBatchTotal={0}
        effectiveBatchDone={0}
        {...mockHandlers}
      />,
    );
    expect(screen.getByText("Requeue All")).toBeTruthy();
  });

  it("hides Requeue All button when no requeuable items", () => {
    render(
      <ProcessingPanel
        status={defaultStatus}
        isProcessing={false}
        hasFiles={false}
        allMetadataReady={true}
        hasRequeuableItems={false}
        effectiveBatchTotal={0}
        effectiveBatchDone={0}
        {...mockHandlers}
      />,
    );
    expect(screen.queryByText("Requeue All")).toBeNull();
  });

  it("calls onRequeueAll when Requeue All clicked", () => {
    render(
      <ProcessingPanel
        status={defaultStatus}
        isProcessing={false}
        hasFiles={false}
        allMetadataReady={true}
        hasRequeuableItems={true}
        effectiveBatchTotal={0}
        effectiveBatchDone={0}
        {...mockHandlers}
      />,
    );
    fireEvent.click(screen.getByText("Requeue All"));
    expect(mockHandlers.onRequeueAll).toHaveBeenCalled();
  });
});

describe("ProcessingPanel - progress bars", () => {
  it("shows current file progress at 0% by default", () => {
    const { container } = render(
      <ProcessingPanel
        status={defaultStatus}
        isProcessing={false}
        hasFiles={true}
        allMetadataReady={true}
        hasRequeuableItems={false}
        effectiveBatchTotal={0}
        effectiveBatchDone={0}
        {...mockHandlers}
      />,
    );
    const currentProgress = container.querySelector('[role="progressbar"]');
    expect(currentProgress).toBeTruthy();
  });

  it("displays current file percentage", () => {
    render(
      <ProcessingPanel
        status={{ ...defaultStatus, currentPct: 42 }}
        isProcessing={true}
        hasFiles={true}
        allMetadataReady={true}
        hasRequeuableItems={false}
        effectiveBatchTotal={3}
        effectiveBatchDone={1}
        {...mockHandlers}
      />,
    );
    expect(screen.getByText("42%")).toBeTruthy();
  });

  it("displays batch progress with counts", () => {
    render(
      <ProcessingPanel
        status={{ ...defaultStatus, currentPct: 50 }}
        isProcessing={true}
        hasFiles={true}
        allMetadataReady={true}
        hasRequeuableItems={false}
        effectiveBatchTotal={4}
        effectiveBatchDone={2}
        {...mockHandlers}
      />,
    );
    expect(screen.getByText(/2\/4/)).toBeTruthy();
  });
});

describe("ProcessingPanel - status messages", () => {
  it("shows info status message", () => {
    render(
      <ProcessingPanel
        status={{
          ...defaultStatus,
          text: "Analyzing file...",
          textKind: "info",
        }}
        isProcessing={true}
        hasFiles={true}
        allMetadataReady={true}
        hasRequeuableItems={false}
        effectiveBatchTotal={2}
        effectiveBatchDone={0}
        {...mockHandlers}
      />,
    );
    expect(screen.getByText("Analyzing file...")).toBeTruthy();
  });

  it("shows success status message", () => {
    render(
      <ProcessingPanel
        status={{
          ...defaultStatus,
          text: "Batch complete!",
          textKind: "success",
        }}
        isProcessing={false}
        hasFiles={false}
        allMetadataReady={true}
        hasRequeuableItems={false}
        effectiveBatchTotal={2}
        effectiveBatchDone={2}
        {...mockHandlers}
      />,
    );
    expect(screen.getByText("Batch complete!")).toBeTruthy();
  });

  it("shows warning status message", () => {
    render(
      <ProcessingPanel
        status={{
          ...defaultStatus,
          text: "Slow progress detected",
          textKind: "warning",
        }}
        isProcessing={true}
        hasFiles={true}
        allMetadataReady={true}
        hasRequeuableItems={false}
        effectiveBatchTotal={2}
        effectiveBatchDone={0}
        {...mockHandlers}
      />,
    );
    expect(screen.getByText("Slow progress detected")).toBeTruthy();
  });

  it("does not show status message when text is null", () => {
    const { container } = render(
      <ProcessingPanel
        status={defaultStatus}
        isProcessing={false}
        hasFiles={false}
        allMetadataReady={true}
        hasRequeuableItems={false}
        effectiveBatchTotal={0}
        effectiveBatchDone={0}
        {...mockHandlers}
      />,
    );
    // No alert should be rendered when text is null
    const alerts = container.querySelectorAll('[role="alert"]');
    expect(alerts.length).toBe(0);
  });
});

describe("ProcessingPanel - batch progress calculation", () => {
  it("calculates 0% when no items", () => {
    render(
      <ProcessingPanel
        status={defaultStatus}
        isProcessing={false}
        hasFiles={false}
        allMetadataReady={true}
        hasRequeuableItems={false}
        effectiveBatchTotal={0}
        effectiveBatchDone={0}
        {...mockHandlers}
      />,
    );
    const matches = screen.getAllByText("0%");
    expect(matches.length).toBeGreaterThan(0);
  });

  it("calculates granular progress with partial current file", () => {
    // 2 done + current at 50% of 3 total = (2 + 0.5) / 3 = 83%
    render(
      <ProcessingPanel
        status={{ ...defaultStatus, currentPct: 50 }}
        isProcessing={true}
        hasFiles={true}
        allMetadataReady={true}
        hasRequeuableItems={false}
        effectiveBatchTotal={3}
        effectiveBatchDone={2}
        {...mockHandlers}
      />,
    );
    expect(screen.getByText("83%")).toBeTruthy();
  });
});
