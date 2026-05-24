import { describe, it, expect, beforeEach } from "vitest";
import {
  useTaskStore,
  selectHasQueuedFiles,
  selectAllMetadataReady,
  selectHasRequeuableItems,
  selectEffectiveBatchDone,
  selectCancelledCount,
  selectInFlight,
} from "@/store/taskStore";
import type { TaskItem } from "@/types";

describe("taskStore", () => {
  beforeEach(() => {
    useTaskStore.setState({ items: [] });
  });

  const createItem = (overrides: Partial<TaskItem> = {}): TaskItem => ({
    id: overrides.id ?? "test-id",
    file: new File([""], "test.mp4", { type: "video/mp4" }),
    status: overrides.status ?? "queued",
    ...overrides,
  });

  describe("addItem", () => {
    it("adds an item to the store", () => {
      const item = createItem();
      useTaskStore.getState().addItem(item);
      expect(useTaskStore.getState().items.length).toBe(1);
    });

    it("adds multiple items", () => {
      useTaskStore.getState().addItem(createItem({ id: "a" }));
      useTaskStore.getState().addItem(createItem({ id: "b" }));
      expect(useTaskStore.getState().items.length).toBe(2);
    });
  });

  describe("updateItem", () => {
    it("updates an existing item", () => {
      const item = createItem();
      useTaskStore.getState().addItem(item);
      useTaskStore.getState().updateItem("test-id", { status: "done" });
      expect(useTaskStore.getState().items[0].status).toBe("done");
    });

    it("does nothing for non-existent id", () => {
      useTaskStore.getState().updateItem("nope", { status: "done" });
      expect(useTaskStore.getState().items.length).toBe(0);
    });
  });

  describe("handleRemoveItem", () => {
    it("removes an item by id", () => {
      useTaskStore.getState().addItem(createItem({ id: "a" }));
      useTaskStore.getState().addItem(createItem({ id: "b" }));
      useTaskStore.getState().handleRemoveItem("a");
      expect(useTaskStore.getState().items.length).toBe(1);
      expect(useTaskStore.getState().items[0].id).toBe("b");
    });
  });

  describe("handleRequeueItem", () => {
    it("resets a done item to queued", () => {
      useTaskStore.getState().addItem(createItem({ status: "done" }));
      useTaskStore.getState().handleRequeueItem("test-id");
      expect(useTaskStore.getState().items[0].status).toBe("queued");
      expect(useTaskStore.getState().items[0].outputBlob).toBeUndefined();
    });

    it("resets an error item to queued", () => {
      useTaskStore
        .getState()
        .addItem(createItem({ status: "error", error: "boom" }));
      useTaskStore.getState().handleRequeueItem("test-id");
      expect(useTaskStore.getState().items[0].status).toBe("queued");
      expect(useTaskStore.getState().items[0].error).toBeUndefined();
    });

    it("resets a cancelled item to queued", () => {
      useTaskStore.getState().addItem(createItem({ status: "cancelled" }));
      useTaskStore.getState().handleRequeueItem("test-id");
      expect(useTaskStore.getState().items[0].status).toBe("queued");
    });
  });

  describe("handleRequeueAll", () => {
    it("resets all terminal items", () => {
      useTaskStore.getState().addItem(createItem({ id: "a", status: "done" }));
      useTaskStore.getState().addItem(createItem({ id: "b", status: "error" }));
      useTaskStore
        .getState()
        .addItem(createItem({ id: "c", status: "cancelled" }));
      useTaskStore
        .getState()
        .addItem(createItem({ id: "d", status: "queued" }));
      useTaskStore
        .getState()
        .addItem(createItem({ id: "e", status: "processing" }));

      useTaskStore.getState().handleRequeueAll();

      expect(useTaskStore.getState().items[0].status).toBe("queued");
      expect(useTaskStore.getState().items[1].status).toBe("queued");
      expect(useTaskStore.getState().items[2].status).toBe("queued");
      expect(useTaskStore.getState().items[3].status).toBe("queued");
      expect(useTaskStore.getState().items[4].status).toBe("processing");
    });
  });

  describe("handleUpdateTimestamps", () => {
    it("updates timestamp mode and markers", () => {
      useTaskStore.getState().addItem(createItem());
      useTaskStore
        .getState()
        .handleUpdateTimestamps("test-id", "custom", [10, 20, 30]);

      expect(useTaskStore.getState().items[0].timestampMode).toBe("custom");
      expect(useTaskStore.getState().items[0].customTimestamps).toEqual([
        10, 20, 30,
      ]);
    });
  });

  describe("setItems", () => {
    it("replaces items via updater", () => {
      useTaskStore.getState().addItem(createItem({ id: "a" }));
      useTaskStore.getState().setItems(() => []);
      expect(useTaskStore.getState().items.length).toBe(0);
    });
  });

  describe("selectors", () => {
    it("selectHasQueuedFiles returns true when queued items exist", () => {
      useTaskStore.getState().addItem(createItem({ status: "queued" }));
      const state = useTaskStore.getState();
      expect(selectHasQueuedFiles(state)).toBe(true);
    });

    it("selectHasQueuedFiles returns false when no queued items", () => {
      useTaskStore.getState().addItem(createItem({ status: "done" }));
      const state = useTaskStore.getState();
      expect(selectHasQueuedFiles(state)).toBe(false);
    });

    it("selectHasRequeuableItems returns true for done items", () => {
      useTaskStore.getState().addItem(createItem({ status: "done" }));
      const state = useTaskStore.getState();
      expect(selectHasRequeuableItems(state)).toBe(true);
    });

    it("selectHasRequeuableItems returns false for only queued items", () => {
      useTaskStore.getState().addItem(createItem({ status: "queued" }));
      const state = useTaskStore.getState();
      expect(selectHasRequeuableItems(state)).toBe(false);
    });

    it("selectEffectiveBatchDone counts done and error", () => {
      useTaskStore.getState().addItem(createItem({ status: "done" }));
      useTaskStore.getState().addItem(createItem({ status: "error" }));
      useTaskStore.getState().addItem(createItem({ status: "queued" }));
      const state = useTaskStore.getState();
      expect(selectEffectiveBatchDone(state)).toBe(2);
    });

    it("selectCancelledCount counts cancelled items", () => {
      useTaskStore
        .getState()
        .addItem(createItem({ id: "a", status: "cancelled" }));
      useTaskStore
        .getState()
        .addItem(createItem({ id: "b", status: "cancelled" }));
      useTaskStore.getState().addItem(createItem({ id: "c", status: "done" }));
      const state = useTaskStore.getState();
      expect(selectCancelledCount(state)).toBe(2);
    });

    it("selectInFlight counts queued and processing", () => {
      useTaskStore.getState().addItem(createItem({ status: "queued" }));
      useTaskStore.getState().addItem(createItem({ status: "processing" }));
      useTaskStore.getState().addItem(createItem({ status: "done" }));
      const state = useTaskStore.getState();
      expect(selectInFlight(state)).toBe(2);
    });

    it("selectAllMetadataReady returns false for empty store", () => {
      const state = useTaskStore.getState();
      expect(selectAllMetadataReady(state)).toBe(false);
    });
  });
});
