import { useCallback } from "react";
import type { IMediaInfoService } from "../types/service";
import type { TaskItem, ProcessorStatus } from "../types";
import { hasUsableMetadata, makeId, warn } from "../utils";

type Updater = (id: string, patch: Partial<TaskItem>) => void;
type StatusSetter = (
  status: ProcessorStatus | ((prev: ProcessorStatus) => ProcessorStatus),
) => void;

/**
 * Hook that handles file analysis: reading video metadata via MediaInfo
 * for each selected file, updating items in-place, and notifying callers.
 *
 * @param updateItem - Callback to patch a single TaskItem by id.
 * @param setStatus - Callback to update the processor UI status.
 * @param mediainfo - MediaInfo service instance.
 */
export function useFileAnalyzer(
  updateItem: Updater,
  setStatus: StatusSetter,
  mediainfo: IMediaInfoService,
) {
  /**
   * Analyze newly selected files with MediaInfo to populate metadata.
   * Updates each item in-place and calls updateItem after each file.
   * Calls onItemReady callback after each file is analyzed so the caller
   * can add items one-by-one (triggering enter animations).
   *
   * @param files - The File objects selected by the user.
   * @param onItemReady - Optional callback called after each file is analyzed.
   * @returns A fully-populated TaskItem array ready for processing.
   */
  const analyzeFiles = useCallback(
    async (
      files: File[],
      onItemReady?: (item: TaskItem) => void | Promise<void>,
    ): Promise<TaskItem[]> => {
      setStatus({
        text: `Analyzing ${files.length} file(s)…`,
        currentPct: 0,
        batchDone: 0,
        batchTotal: files.length,
        batchStartTime: null,
        batchDurationMs: null,
      });

      const items: TaskItem[] = files.map((file) => ({
        id: makeId(),
        file,
        status: "queued",
      }));

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const progress = ((i + 1) / files.length) * 100;
        setStatus({
          text: `Analyzing "${item.file.name}"…`,
          currentPct: progress,
          batchDone: i + 1,
          batchTotal: files.length,
          batchStartTime: null,
          batchDurationMs: null,
        });

        try {
          const meta = await mediainfo.analyze(item.file);
          item.metadata = meta;
          if (!hasUsableMetadata(meta)) {
            item.warning =
              "Could not read required metadata from this file. Processing may fail or produce incorrect output.";
          }
          updateItem(item.id, {
            metadata: item.metadata,
            warning: item.warning,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Metadata read failed";
          item.warning = `Metadata analysis failed: ${msg}`;
          updateItem(item.id, { warning: item.warning });
          warn(`Metadata failed for "${item.file.name}":`, e);
        }

        // Notify caller so the item can be added to state one-by-one
        if (onItemReady) {
          await onItemReady(item);
        }
      }

      setStatus({
        text: `${files.length} new file(s) analyzed. Set your options/preset and press Start Processing.`,
        currentPct: 0,
        batchDone: 0,
        batchTotal: 0,
        batchStartTime: null,
        batchDurationMs: null,
      });

      return items;
    },
    [updateItem, setStatus, mediainfo],
  );

  return { analyzeFiles };
}
