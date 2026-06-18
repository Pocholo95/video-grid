import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { uploadBlob } from "@/upload";
import { UPLOAD_DELAY_MS } from "@/constants";
import { isUploadEligible } from "@/uploadUtils";
import type {
  DestinationUploadState,
  TaskItem,
  UploadDestination,
  UploadResult,
} from "@/types";
import { useTaskStore } from "./taskStore";

/**
 * Zustand store for upload state.
 * Replaces: src/context/uploadContext.tsx (state portion)
 *
 * Upload mutations on TaskItem.uploads[] are performed via taskStore.setItems()
 * so the upload store itself tracks only progress counters and the uploading flag.
 */
interface UploadState {
  isUploadingAll: boolean;
  uploadProgress: { attempted: number; total: number };

  resetUploadState: () => void;

  /**
   * Upload a single task item to a single destination.
   * Mutates taskStore items directly via setItems().
   */
  uploadItemToDest: (itemId: string, dest: UploadDestination) => Promise<void>;

  /**
   * Upload a single task item to all enabled destinations that haven't
   * already received it.
   */
  uploadItem: (
    itemId: string,
    destinations: UploadDestination[],
  ) => Promise<void>;

  /**
   * Upload all completed, not-yet-uploaded items to all enabled destinations.
   */
  uploadAll: (destinations: UploadDestination[]) => Promise<void>;

  /**
   * Remove the upload result for a specific destination on a task item.
   * Used after deleting a file from the host so the links are cleared.
   */
  clearUploadResult: (itemId: string, destId: string) => void;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function patchUpload(
  prev: TaskItem[],
  id: string,
  destId: string,
  patch: Partial<DestinationUploadState>,
): TaskItem[] {
  return prev.map((item) => {
    if (item.id !== id) return item;
    const current: DestinationUploadState = item.uploads?.[destId] ?? {
      status: "idle",
      progress: 0,
    };
    return {
      ...item,
      uploads: {
        ...item.uploads,
        [destId]: { ...current, ...patch },
      },
    };
  });
}

export const useUploadStore = create<UploadState>()(
  immer((set) => ({
    isUploadingAll: false,
    uploadProgress: { total: 0, attempted: 0 },

    resetUploadState: () =>
      set(() => ({
        uploadProgress: { total: 0, attempted: 0 },
        isUploadingAll: false,
      })),

    uploadItemToDest: async (itemId, dest) => {
      const items = useTaskStore.getState().items;
      const item = items.find((i) => i.id === itemId);
      if (!item?.outputBlob || !item.outputName) return;

      useTaskStore.getState().setItems((prev) =>
        patchUpload(prev, itemId, dest.id, {
          status: "uploading",
          progress: 0,
          error: undefined,
        }),
      );

      try {
        const result: UploadResult = await uploadBlob(
          item.outputBlob,
          item.outputName,
          dest,
          (pct) =>
            useTaskStore
              .getState()
              .setItems((prev) =>
                patchUpload(prev, itemId, dest.id, { progress: pct }),
              ),
        );
        useTaskStore.getState().setItems((prev) =>
          patchUpload(prev, itemId, dest.id, {
            status: "done",
            progress: 100,
            result,
          }),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Upload failed";
        useTaskStore.getState().setItems((prev) =>
          patchUpload(prev, itemId, dest.id, {
            status: "error",
            error: msg,
          }),
        );
      }
    },

    uploadItem: async (itemId, destinations) => {
      const enabled = destinations.filter((d) => d.enabled);
      const uploadToDest = useUploadStore.getState().uploadItemToDest;
      for (const dest of enabled) {
        const items = useTaskStore.getState().items;
        const item = items.find((i) => i.id === itemId);
        const state = item?.uploads?.[dest.id];
        if (state?.status === "done" || state?.status === "uploading") continue;
        // Skip destinations that don't accept this file's type or size
        if (
          item?.outputName &&
          !isUploadEligible(item.outputName, item.outputSize, dest)
        )
          continue;
        await uploadToDest(itemId, dest);
      }
    },

    uploadAll: async (destinations) => {
      const state = useUploadStore.getState();
      if (state.isUploadingAll) return;
      const enabled = destinations.filter((d) => d.enabled);
      if (!enabled.length) return;

      const items = useTaskStore.getState().items;
      const pending = items.filter(
        (i) => i.status === "done" && i.outputBlob && i.outputName,
      );
      if (!pending.length) return;

      const totalUploads = pending.length * enabled.length;
      set(() => ({
        uploadProgress: { total: totalUploads, attempted: 0 },
        isUploadingAll: true,
      }));

      try {
        let attempted = 0;
        const uploadToDest = useUploadStore.getState().uploadItemToDest;
        for (const item of pending) {
          for (const dest of enabled) {
            const currentItems = useTaskStore.getState().items;
            const currentItem = currentItems.find((i) => i.id === item.id);
            const uploadState = currentItem?.uploads?.[dest.id];
            if (uploadState?.status === "done") continue;
            // Skip destinations that don't accept this file's type or size
            if (
              currentItem?.outputName &&
              !isUploadEligible(
                currentItem.outputName,
                currentItem.outputSize,
                dest,
              )
            )
              continue;

            if (attempted > 0) await sleep(UPLOAD_DELAY_MS);

            await uploadToDest(item.id, dest);
            attempted++;

            set(() => ({
              uploadProgress: { total: totalUploads, attempted },
            }));
          }
        }
      } finally {
        set(() => ({ isUploadingAll: false }));
      }
    },

    clearUploadResult: (itemId, destId) => {
      useTaskStore.getState().setItems((prev) =>
        patchUpload(prev, itemId, destId, {
          status: "idle",
          progress: 0,
          result: undefined,
          error: undefined,
        }),
      );
    },
  })),
);
