import { useCallback } from "react";
import { useTaskStore } from "@/store/taskStore";
import { useUploadStore } from "@/store/uploadStore";
import { useSettingsStore } from "@/store/settingsStore";
import type { UploadDestination } from "@/types";

/**
 * Thin wrapper around useUploadStore that exposes upload state and actions.
 *
 * Replaces the previous implementation that maintained local useState for
 * isUploadingAll and uploadProgress — those states now live in the Zustand
 * upload store so TaskList.tsx and any other consumer sees the same live
 * values.
 */
export function useUpload() {
  // --- State from store ---
  const isUploadingAll = useUploadStore((s) => s.isUploadingAll);
  const uploadProgress = useUploadStore((s) => s.uploadProgress);

  // --- Actions from store ---
  const resetUploadState = useUploadStore((s) => s.resetUploadState);
  const uploadItemToDest = useUploadStore((s) => s.uploadItemToDest);

  const destinations = useSettingsStore((s) => s.settings.destinations);

  const uploadItem = useCallback(
    async (itemId: string) => {
      const enabled = destinations.filter((d) => d.enabled);
      for (const dest of enabled) {
        const items = useTaskStore.getState().items;
        const item = items.find((i) => i.id === itemId);
        const state = item?.uploads?.[dest.id];
        if (state?.status === "done" || state?.status === "uploading") continue;
        await uploadItemToDest(itemId, dest);
      }
    },
    [destinations, uploadItemToDest],
  );

  const uploadAll = useCallback(
    async (destinationsOverride?: UploadDestination[]) => {
      const dests = destinationsOverride ?? destinations;
      useUploadStore.getState().uploadAll(dests);
    },
    [destinations],
  );

  return {
    isUploadingAll,
    uploadProgress,
    uploadItem,
    uploadAll,
    resetUploadState,
    uploadItemToDest,
  };
}
