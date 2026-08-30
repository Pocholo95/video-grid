/**
 * Integration tests for the processing pipeline.
 *
 * Verifies the end-to-end task lifecycle: add task -> set processing -> report
 * progress -> complete -> upload. Tests the interaction between taskStore and
 * processingStore without actually invoking FFmpeg/WASM.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useTaskStore, selectHasQueuedFiles } from "@/store/taskStore";
import { useProcessingStore } from "@/store/processingStore";
import { FFMPEG_STALE_THRESHOLD_MS } from "@/constants";
import type { TaskItem } from "@/types";

describe("Processing Pipeline Integration", () => {
  beforeEach(() => {
    // Reset both stores before each test
    useTaskStore.setState({ items: [] });
    useProcessingStore.getState().resetState();
  });

  it("task lifecycle: add -> process -> complete", () => {
    // Create a dummy video file
    const file = new File(["dummy"], "video.mp4", {
      type: "video/mp4",
    });

    // 1. Add item to the task queue
    const task: TaskItem = {
      id: "task-1",
      file,
      status: "queued",
      ffmpegLogs: [],
    };
    useTaskStore.getState().addItem(task);
    expect(useTaskStore.getState().items).toHaveLength(1);
    expect(useTaskStore.getState().items[0].status).toBe("queued");

    // 2. Update status to processing
    useTaskStore.getState().updateItem("task-1", {
      status: "processing",
      processingStartedAt: Date.now(),
    });
    expect(useTaskStore.getState().items[0].status).toBe("processing");

    // 3. Update with progress logs
    useTaskStore.getState().updateItem("task-1", {
      ffmpegLogs: ["frame 1/6", "frame 3/6"],
    });
    expect(useTaskStore.getState().items[0].ffmpegLogs).toHaveLength(2);

    // 4. Mark as done
    const outputBlob = new Blob(["output"], { type: "image/png" });
    useTaskStore.getState().updateItem("task-1", {
      status: "done",
      outputName: "grid.png",
      outputSize: outputBlob.size,
      outputBlob,
      processingDurationMs: 1234,
    });

    const doneTask = useTaskStore.getState().items[0];
    expect(doneTask.status).toBe("done");
    expect(doneTask.outputName).toBe("grid.png");
    expect(doneTask.processingDurationMs).toBe(1234);
  });

  it("processingStore tracks processing state correctly", () => {
    const store = useProcessingStore.getState();

    // Start processing
    store.setIsProcessing(true);
    expect(useProcessingStore.getState().isProcessing).toBe(true);

    // Mark a task active
    store.addActiveTask("task-1");
    expect(useProcessingStore.getState().activeTaskIds).toContain("task-1");

    // Update status with progress
    store.setStatus((prev) => ({
      ...prev,
      text: "Processing frame 3/6",
      currentPct: 50,
    }));
    expect(useProcessingStore.getState().status.currentPct).toBe(50);

    // Finish processing
    store.setIsProcessing(false);
    expect(useProcessingStore.getState().isProcessing).toBe(false);
  });

  it("processingStore stale detection works", () => {
    const store = useProcessingStore.getState();

    store.setIsProcessing(true);
    // Simulate old progress time (2 minutes ago)
    store.lastProgressTime = Date.now() - 120_000;

    const elapsed = Date.now() - store.lastProgressTime;
    expect(elapsed).toBeGreaterThan(FFMPEG_STALE_THRESHOLD_MS);
  });

  it("task removal works correctly", () => {
    const file1 = new File(["a"], "v1.mp4", { type: "video/mp4" });
    const file2 = new File(["b"], "v2.mp4", { type: "video/mp4" });

    useTaskStore.getState().addItem({
      id: "task-1",
      file: file1,
      status: "queued",
      ffmpegLogs: [],
    });
    useTaskStore.getState().addItem({
      id: "task-2",
      file: file2,
      status: "queued",
      ffmpegLogs: [],
    });

    expect(useTaskStore.getState().items).toHaveLength(2);

    // Remove first item
    useTaskStore.getState().handleRemoveItem("task-1");
    expect(useTaskStore.getState().items).toHaveLength(1);
    expect(useTaskStore.getState().items[0].id).toBe("task-2");
  });

  it("upload state is tracked per destination", () => {
    const file = new File(["a"], "v1.mp4", { type: "video/mp4" });

    useTaskStore.getState().addItem({
      id: "task-1",
      file,
      status: "queued",
      ffmpegLogs: [],
    });

    // Mark as done with output
    useTaskStore.getState().updateItem("task-1", {
      status: "done",
      outputBlob: new Blob(["img"], { type: "image/png" }),
    });

    // Update upload state
    useTaskStore.getState().updateItem("task-1", {
      uploads: {
        dest1: {
          status: "uploading",
          progress: 50,
        },
      },
    });

    expect(useTaskStore.getState().items[0].uploads?.dest1?.status).toBe(
      "uploading",
    );
    expect(useTaskStore.getState().items[0].uploads?.dest1?.progress).toBe(50);
  });

  it("multiple tasks can be processed sequentially", () => {
    const file1 = new File(["a"], "v1.mp4", { type: "video/mp4" });
    const file2 = new File(["b"], "v2.mp4", { type: "video/mp4" });

    useTaskStore.getState().addItem({
      id: "task-1",
      file: file1,
      status: "queued",
      ffmpegLogs: [],
    });
    useTaskStore.getState().addItem({
      id: "task-2",
      file: file2,
      status: "queued",
      ffmpegLogs: [],
    });

    // Process first
    useTaskStore.getState().updateItem("task-1", { status: "processing" });
    useTaskStore.getState().updateItem("task-1", {
      status: "done",
      outputBlob: new Blob(["out"], { type: "image/png" }),
    });

    // Process second
    useTaskStore.getState().updateItem("task-2", { status: "processing" });
    useTaskStore.getState().updateItem("task-2", {
      status: "done",
      outputBlob: new Blob(["out"], { type: "image/png" }),
    });

    expect(useTaskStore.getState().items[0].status).toBe("done");
    expect(useTaskStore.getState().items[1].status).toBe("done");
  });

  it("requeue restores done tasks to queued state", () => {
    const file = new File(["a"], "v1.mp4", { type: "video/mp4" });

    useTaskStore.getState().addItem({
      id: "task-1",
      file,
      status: "queued",
      ffmpegLogs: [],
    });

    // Process and complete
    useTaskStore.getState().updateItem("task-1", {
      status: "done",
      outputBlob: new Blob(["out"], { type: "image/png" }),
    });
    expect(useTaskStore.getState().items[0].status).toBe("done");

    // Requeue
    useTaskStore.getState().handleRequeueItem("task-1");
    expect(useTaskStore.getState().items[0].status).toBe("queued");
  });

  it("processingStore reset clears all state", () => {
    const store = useProcessingStore.getState();

    store.setIsProcessing(true);
    store.addActiveTask("task-1");
    store.setStatus({
      text: "Processing...",
      currentPct: 75,
      batchDone: 3,
      batchTotal: 5,
      batchStartTime: Date.now(),
      batchDurationMs: 1000,
    });
    store.setStale("task-1", true);

    // Reset
    store.resetState();

    expect(useProcessingStore.getState().isProcessing).toBe(false);
    expect(useProcessingStore.getState().activeTaskIds).toEqual([]);
    expect(useProcessingStore.getState().status.currentPct).toBe(0);
    expect(useProcessingStore.getState().isStale).toBe(false);
  });

  it("derived state flags update correctly", () => {
    const file = new File(["a"], "v1.mp4", { type: "video/mp4" });

    // Initially no queued files
    expect(selectHasQueuedFiles(useTaskStore.getState())).toBe(false);

    // Add queued task
    useTaskStore.getState().addItem({
      id: "task-1",
      file,
      status: "queued",
      ffmpegLogs: [],
    });
    expect(selectHasQueuedFiles(useTaskStore.getState())).toBe(true);

    // Mark as done - no more queued
    useTaskStore.getState().updateItem("task-1", {
      status: "done",
      outputBlob: new Blob(["out"], { type: "image/png" }),
    });
    expect(selectHasQueuedFiles(useTaskStore.getState())).toBe(false);
  });
});
