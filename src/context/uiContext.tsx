import {
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  createContext,
  type ReactNode,
} from "react";
import { autoAnimate } from "@formkit/auto-animate";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import { DEFAULTS } from "@/constants";
import { makeUniqueName } from "@/utils";
import { yieldToBrowser } from "@/lib/utils";
import type { SavedOptions } from "@/types";
import { useTasksContext } from "./tasksContext";
import { useProcessingContext } from "./processingContext";
import { useUploadContext } from "./uploadContext";
import { useSettingsContext } from "./settingsContext";

/** UI-layer state: ZIP, preview, file handlers, options, DOM refs. */
interface UiContextValue {
  isZipping: boolean;
  downloadAll: () => Promise<void>;
  previewUrl: string | null;
  setPreviewUrl: (url: string | null) => void;
  onClear: () => Promise<void>;
  mainRef: (el: HTMLDivElement | null) => void;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  handleFilesChange: (files: File[]) => Promise<void>;
  handleStart: () => Promise<void>;
  handleUploadItem: (id: string) => void;
  handleUploadAll: () => void;
  handleEnablePreviews: () => void;
  opts: SavedOptions;
  setOpts: (o: SavedOptions | ((prev: SavedOptions) => SavedOptions)) => void;
  totalCells: number;
  effectiveBatchTotal: number;
}

const UiContext = createContext<UiContextValue | null>(null);

/** Consume the UI context. */
export function useUiContext(): UiContextValue {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUiContext must be used within UiProvider");
  return ctx;
}

interface UiProviderProps {
  children: ReactNode;
}

export function UiProvider({ children }: UiProviderProps) {
  // --- Consume sibling contexts ---
  const tasks = useTasksContext();
  const processing = useProcessingContext();
  const upload = useUploadContext();
  const settings = useSettingsContext();

  // --- Options (ControlPanel state) ---
  const [opts, setOptsState] = useState<SavedOptions>(() => {
    const { lastUsed, entries } = settings.savedSettings.presets;
    if (lastUsed && entries[lastUsed]) {
      return structuredClone(entries[lastUsed]);
    }
    return structuredClone(DEFAULTS);
  });
  const setOpts = setOptsState;

  // --- File input ref ---
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- Files handler ---
  const handleFilesChange = useCallback(
    async (files: File[]) => {
      await processing.analyzeFiles(files, (item) => {
        tasks.setItems((prev) => [...prev, item]);
        return yieldToBrowser();
      });
    },
    [processing.analyzeFiles, tasks.setItems],
  );

  // --- Start processing ---
  const handleStart = useCallback(async () => {
    const queued = tasks.items.filter((it) => it.status === "queued");
    await processing.processAll(
      queued,
      opts,
      processing.isProcessingRef,
      (id: string) => tasks.itemsRef.current.some((it) => it.id === id),
    );
  }, [tasks.items, opts, processing]);

  // --- Upload handlers ---
  const handleUploadItem = useCallback(
    (id: string) =>
      upload.uploadItem(id, settings.getCurrentSettings().destinations),
    [upload.uploadItem, settings.getCurrentSettings],
  );

  const handleUploadAll = useCallback(
    () => upload.uploadAll(settings.getCurrentSettings().destinations),
    [upload.uploadAll, settings.getCurrentSettings],
  );

  const handleEnablePreviews = useCallback(
    () => settings.updateSettingAndPersist("showPreview", true),
    [settings.updateSettingAndPersist],
  );

  // --- Clear ---
  const onClear = useCallback(async () => {
    tasks.setItems([]);
    await yieldToBrowser();
    await processing.resetState();
    upload.resetUploadState();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [tasks.setItems, processing.resetState, upload.resetUploadState]);

  // --- ZIP ---
  const [isZipping, setIsZipping] = useState(false);
  const downloadAll = useCallback(async () => {
    const done = tasks.items.filter(
      (i) => i.status === "done" && i.outputBlob && i.outputName,
    );
    if (!done.length) return;

    setIsZipping(true);
    try {
      const zip = new JSZip();
      const existingNames = new Set<string>();

      for (const item of done) {
        const uniqueName = makeUniqueName(item.outputName!, existingNames);
        existingNames.add(uniqueName);
        zip.file(uniqueName, item.outputBlob!);
      }

      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, "vidgrid-outputs.zip");
    } finally {
      setIsZipping(false);
    }
  }, [tasks.items]);

  // --- Preview ---
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // --- Derived ---
  const totalCells = useMemo(
    () =>
      opts.gridTemplate && opts.gridTemplate.cells.length > 0
        ? opts.gridTemplate.cells.length
        : Math.max(1, opts.cols) * Math.max(1, opts.rows),
    [opts],
  );

  const effectiveBatchTotal = useMemo(
    () =>
      processing.isProcessing
        ? tasks.effectiveBatchDone + tasks.cancelledCount + tasks.inFlight
        : tasks.effectiveBatchDone + tasks.cancelledCount,
    [
      processing.isProcessing,
      tasks.effectiveBatchDone,
      tasks.cancelledCount,
      tasks.inFlight,
    ],
  );

  // --- DOM ---
  const mainRef = useCallback((el: HTMLDivElement | null) => {
    if (el) autoAnimate(el);
  }, []);

  const value = useMemo(
    (): UiContextValue => ({
      isZipping,
      downloadAll,
      previewUrl,
      setPreviewUrl,
      onClear,
      mainRef,
      fileInputRef,
      handleFilesChange,
      handleStart,
      handleUploadItem,
      handleUploadAll,
      handleEnablePreviews,
      opts,
      setOpts,
      totalCells,
      effectiveBatchTotal,
    }),
    [
      isZipping,
      downloadAll,
      previewUrl,
      setPreviewUrl,
      onClear,
      mainRef,
      fileInputRef,
      handleFilesChange,
      handleStart,
      handleUploadItem,
      handleUploadAll,
      handleEnablePreviews,
      opts,
      setOpts,
      totalCells,
      effectiveBatchTotal,
    ],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}
