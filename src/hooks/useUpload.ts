import { useCallback, useState } from "react";
import { uploadBlob } from "../upload";
import type {
  DestinationUploadState,
  OutputItem,
  UploadDestination,
  UploadResult,
} from "../types";

/** Delay between sequential uploads to avoid rate-limiting. */
const UPLOAD_DELAY_MS = 1200;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Merges a partial DestinationUploadState into item.uploads[destId].
 *
 * @param prev   - Previous OutputItem array.
 * @param id     - ID of the item to update.
 * @param destId - Destination ID whose upload state should be patched.
 * @param patch  - Partial state to merge.
 * @returns Updated array with the target item replaced.
 */
function patchUpload(
  prev: OutputItem[],
  id: string,
  destId: string,
  patch: Partial<DestinationUploadState>,
): OutputItem[] {
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

/**
 * Hook providing upload logic for one or multiple destinations.
 *
 * @param items    - Current output item list (used read-only for lookups).
 * @param setItems - Setter for the output item list.
 */
export function useUpload(
  items: OutputItem[],
  setItems: React.Dispatch<React.SetStateAction<OutputItem[]>>,
) {
  const [isUploadingAll, setIsUploadingAll] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({
    completed: 0,
    total: 0,
  });

  /**
   * Upload a single output item to a single destination.
   *
   * @param itemId - ID of the OutputItem to upload.
   * @param dest   - The destination to upload to.
   */
  const uploadItemToDest = useCallback(
    async (itemId: string, dest: UploadDestination) => {
      const item = items.find((i) => i.id === itemId);
      if (!item?.outputBlob || !item.outputName) return;

      setItems((prev) =>
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
            setItems((prev) =>
              patchUpload(prev, itemId, dest.id, { progress: pct }),
            ),
        );
        setItems((prev) =>
          patchUpload(prev, itemId, dest.id, {
            status: "done",
            progress: 100,
            result,
          }),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Upload failed";
        setItems((prev) =>
          patchUpload(prev, itemId, dest.id, {
            status: "error",
            error: msg,
          }),
        );
      }
    },
    [items, setItems],
  );

  /**
   * Upload a single output item to all enabled destinations that haven't
   * already received it.
   *
   * @param itemId       - ID of the OutputItem to upload.
   * @param destinations - Full list of configured destinations.
   */
  const uploadItem = useCallback(
    async (itemId: string, destinations: UploadDestination[]) => {
      const enabled = destinations.filter((d) => d.enabled);
      for (const dest of enabled) {
        const item = items.find((i) => i.id === itemId);
        const state = item?.uploads?.[dest.id];
        if (state?.status === "done" || state?.status === "uploading") continue;
        await uploadItemToDest(itemId, dest);
      }
    },
    [items, uploadItemToDest],
  );

  /**
   * Upload all completed, not-yet-uploaded items to all enabled destinations.
   * Runs sequentially with a small delay between each upload to respect rate limits.
   *
   * @param destinations - Full list of configured destinations.
   */
  const uploadAll = useCallback(
    async (destinations: UploadDestination[]) => {
      if (isUploadingAll) return;
      const enabled = destinations.filter((d) => d.enabled);
      if (!enabled.length) return;

      const pending = items.filter(
        (i) => i.status === "done" && i.outputBlob && i.outputName,
      );
      if (!pending.length) return;

      const totalUploads = pending.length * enabled.length;
      setUploadProgress({ completed: 0, total: totalUploads });
      setIsUploadingAll(true);
      try {
        let opCount = 0;
        for (const item of pending) {
          for (const dest of enabled) {
            const state = item.uploads?.[dest.id];
            if (state?.status === "done" || state?.status === "uploading")
              continue;
            if (opCount > 0) await sleep(UPLOAD_DELAY_MS);
            await uploadItemToDest(item.id, dest);
            opCount++;
            setUploadProgress({ completed: opCount, total: totalUploads });
          }
        }
      } finally {
        setIsUploadingAll(false);
      }
    },
    [isUploadingAll, items, uploadItemToDest],
  );

  return { isUploadingAll, uploadProgress, uploadItem, uploadAll };
}
