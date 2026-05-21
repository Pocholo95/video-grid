import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { autoAnimate } from "@formkit/auto-animate";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import type {
  AppSettings,
  ProcessorStatus,
  SavedOptions,
  TaskItem,
} from "@/types";
import { DEFAULTS } from "@/constants";
import { makeUniqueName } from "@/utils";
import { yieldToBrowser } from "@/lib/utils";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useProcessor } from "@/hooks/useProcessor";
import { useUpload } from "@/hooks/useUpload";

/** App-level state shared across the entire UI tree. */
interface AppContextValue {
  // --- Task Items ---
  items: TaskItem[];
  setItems: (updater: (prev: TaskItem[]) => TaskItem[]) => void;
  itemsRef: React.MutableRefObject<TaskItem[]>;
  updateItem: (id: string, patch: Partial<TaskItem>) => void;
  handleUpdateTimestamps: (
    id: string,
    mode: "auto" | "custom",
    markers: number[],
  ) => void;
  handleRemoveItem: (id: string) => void;
  handleRequeueItem: (id: string) => void;
  handleRequeueAll: () => void;
  onClear: () => Promise<void>;

  // --- Processing ---
  isProcessing: boolean;
  isProcessingRef: React.MutableRefObject<boolean>;
  isStale: boolean;
  staleTaskId: string | null;
  status: ProcessorStatus;
  analyzeFiles: (
    files: File[],
    onItemReady?: (item: TaskItem) => void | Promise<void>,
  ) => Promise<TaskItem[]>;
  processAll: (
    tasks: TaskItem[],
    opts: SavedOptions,
    isProcessingRef: { current: boolean },
    isTaskActive?: (id: string) => boolean,
  ) => Promise<void>;
  requestCancel: () => void;
  forceCancel: () => void;

  // --- Options (ControlPanel state) ---
  opts: SavedOptions;
  setOpts: (o: SavedOptions | ((prev: SavedOptions) => SavedOptions)) => void;

  // --- Handlers ---
  handleFilesChange: (files: File[]) => Promise<void>;
  handleStart: () => Promise<void>;
  handleUploadItem: (id: string) => void;
  handleUploadAll: () => void;
  handleEnablePreviews: () => void;

  // --- Theme ---
  applyTheme: (theme: "dark" | "light" | "dimmed" | "classic") => void;
  handleThemeChange: (theme: "dark" | "light" | "dimmed" | "classic") => void;
  handleShowPreviewChange: (show: boolean) => void;

  // --- Upload ---
  isUploadingAll: boolean;
  uploadProgress: { attempted: number; total: number };
  uploadItem: (id: string, destinations: AppSettings["destinations"]) => void;
  uploadAll: (destinations: AppSettings["destinations"]) => void;

  // --- ZIP ---
  isZipping: boolean;
  downloadAll: () => Promise<void>;

  // --- Preview ---
  previewUrl: string | null;
  setPreviewUrl: (url: string | null) => void;

  // --- Settings ---
  savedSettings: AppSettings;
  getCurrentSettings: () => AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => AppSettings;
  saveSettings: () => AppSettings;
  resetPending: () => void;
  updateSettingAndPersist: (key: keyof AppSettings, value: unknown) => void;
  updateDestinations: (dests: AppSettings["destinations"]) => AppSettings;
  showSettingsDialog: boolean;
  setShowSettingsDialog: (open: boolean) => void;
  handleOpenSettingsDialog: () => void;
  handleCancelSettings: () => void;

  // --- Derived ---
  hasQueuedFiles: boolean;
  allMetadataReady: boolean;
  hasRequeuableItems: boolean;
  effectiveBatchDone: number;
  effectiveBatchTotal: number;
  totalCells: number;

  // --- DOM ---
  mainRef: (el: HTMLDivElement | null) => void;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
}

const AppContext = createContext<AppContextValue | null>(null);

/** Consume the app context. Throws when used outside AppProvider. */
export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
}

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  // --- Settings ---
  const {
    savedSettings,
    getCurrentSettings,
    updateSettings,
    saveSettings,
    resetPending,
    updateSettingAndPersist,
    updateDestinations,
  } = useAppSettings();

  // --- Items ---
  const [items, setItems] = useState<TaskItem[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const updateItem = useCallback((id: string, patch: Partial<TaskItem>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  }, []);

  const handleUpdateTimestamps = useCallback(
    (id: string, mode: "auto" | "custom", markers: number[]) => {
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? { ...it, timestampMode: mode, customTimestamps: markers }
            : it,
        ),
      );
    },
    [],
  );

  const handleRemoveItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const handleRequeueItem = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              status: "queued" as const,
              error: undefined,
              outputBlob: undefined,
              outputName: undefined,
              outputSize: undefined,
              processingStartedAt: undefined,
              processingDurationMs: undefined,
              uploads: undefined,
            }
          : it,
      ),
    );
  }, []);

  const handleRequeueAll = useCallback(() => {
    setItems((prev) =>
      prev.map((it) =>
        it.status === "done" ||
        it.status === "error" ||
        it.status === "cancelled"
          ? {
              ...it,
              status: "queued" as const,
              error: undefined,
              outputBlob: undefined,
              outputName: undefined,
              outputSize: undefined,
              processingStartedAt: undefined,
              processingDurationMs: undefined,
              uploads: undefined,
            }
          : it,
      ),
    );
  }, []);

  // --- Processing ---
  const {
    isProcessing,
    isProcessingRef,
    isStale,
    staleTaskId,
    status,
    analyzeFiles,
    processAll,
    requestCancel,
    forceCancel,
    resetState,
  } = useProcessor(updateItem);

  // --- Options (ControlPanel state) ---
  const [opts, setOptsState] = useState<SavedOptions>(() => {
    const { lastUsed, entries } = savedSettings.presets;
    if (lastUsed && entries[lastUsed]) {
      return structuredClone(entries[lastUsed]);
    }
    return structuredClone(DEFAULTS);
  });
  const setOpts = setOptsState;

  // --- Files handler ---
  const handleFilesChange = useCallback(
    async (files: File[]) => {
      await analyzeFiles(files, (item) => {
        setItems((prev) => [...prev, item]);
        return yieldToBrowser();
      });
    },
    [analyzeFiles],
  );

  // --- Start processing ---
  const handleStart = useCallback(
    () =>
      processAll(
        items.filter((it) => it.status === "queued"),
        opts,
        isProcessingRef,
        (id: string) => itemsRef.current.some((it) => it.id === id),
      ),
    [items, opts, processAll, isProcessingRef],
  );

  // --- File input ref ---
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- Upload ---
  const {
    isUploadingAll,
    uploadProgress,
    uploadItem,
    uploadAll,
    resetUploadState,
  } = useUpload(items, setItems);

  // --- Upload handlers ---
  const handleUploadItem = useCallback(
    (id: string) => uploadItem(id, getCurrentSettings().destinations),
    [uploadItem, getCurrentSettings],
  );

  const handleUploadAll = useCallback(
    () => uploadAll(getCurrentSettings().destinations),
    [uploadAll, getCurrentSettings],
  );

  const handleEnablePreviews = useCallback(
    () => updateSettingAndPersist("showPreview", true),
    [updateSettingAndPersist],
  );

  // --- Theme ---
  const applyTheme = useCallback(
    (theme: "dark" | "light" | "dimmed" | "classic") => {
      document.documentElement.className = theme;
    },
    [],
  );

  useEffect(() => {
    applyTheme(getCurrentSettings().theme);
  }, [applyTheme, getCurrentSettings]);

  const handleThemeChange = useCallback(
    (theme: "dark" | "light" | "dimmed" | "classic") => {
      updateSettings({ theme });
    },
    [updateSettings],
  );

  const handleShowPreviewChange = useCallback(
    (show: boolean) => updateSettings({ showPreview: show }),
    [updateSettings],
  );

  // --- Clear ---
  const onClear = useCallback(async () => {
    setItems([]);
    await yieldToBrowser();
    resetState();
    resetUploadState();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [resetState, resetUploadState]);

  // --- ZIP ---
  const [isZipping, setIsZipping] = useState(false);
  const downloadAll = useCallback(async () => {
    const done = items.filter(
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
  }, [items]);

  // --- Preview ---
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // --- Settings dialog ---
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [originalAppSettings, setOriginalAppSettings] =
    useState<AppSettings | null>(null);

  const handleOpenSettingsDialog = useCallback(() => {
    if (!originalAppSettings) {
      setOriginalAppSettings(structuredClone(savedSettings));
    }
    setShowSettingsDialog(true);
  }, [savedSettings, originalAppSettings]);

  const handleCancelSettings = useCallback(() => {
    resetPending();
    setShowSettingsDialog(false);
  }, [resetPending]);

  // --- Derived ---
  const hasQueuedFiles = useMemo(
    () => items.some((i) => i.status === "queued"),
    [items],
  );

  const allMetadataReady = useMemo(
    () =>
      hasQueuedFiles &&
      items.every((i) => i.status !== "queued" || i.metadata !== undefined),
    [hasQueuedFiles, items],
  );

  const hasRequeuableItems = useMemo(
    () =>
      items.some(
        (i) =>
          i.status === "done" ||
          i.status === "error" ||
          i.status === "cancelled",
      ),
    [items],
  );

  const effectiveBatchDone = useMemo(
    () =>
      items.filter((i) => i.status === "done" || i.status === "error").length,
    [items],
  );

  const cancelledCount = useMemo(
    () => items.filter((i) => i.status === "cancelled").length,
    [items],
  );

  const inFlight = useMemo(
    () =>
      items.filter((i) => i.status === "queued" || i.status === "processing")
        .length,
    [items],
  );

  const effectiveBatchTotal = useMemo(
    () =>
      isProcessing
        ? effectiveBatchDone + cancelledCount + inFlight
        : effectiveBatchDone + cancelledCount,
    [isProcessing, effectiveBatchDone, cancelledCount, inFlight],
  );

  // --- totalCells (derived from opts) ---
  const totalCells = useMemo(
    () =>
      opts.gridTemplate && opts.gridTemplate.cells.length > 0
        ? opts.gridTemplate.cells.length
        : Math.max(1, opts.cols) * Math.max(1, opts.rows),
    [opts],
  );

  // --- DOM ---
  const mainRef = useCallback((el: HTMLDivElement | null) => {
    if (el) autoAnimate(el);
  }, []);

  // --- Context value ---
  const value = useMemo<AppContextValue>(
    () => ({
      // Items
      items,
      setItems,
      itemsRef,
      updateItem,
      handleUpdateTimestamps,
      handleRemoveItem,
      handleRequeueItem,
      handleRequeueAll,
      onClear,
      // Processing
      isProcessing,
      isProcessingRef,
      isStale,
      staleTaskId,
      status,
      analyzeFiles,
      processAll,
      requestCancel,
      forceCancel,
      // Options
      opts,
      setOpts,
      // Handlers
      handleFilesChange,
      handleStart,
      handleUploadItem,
      handleUploadAll,
      handleEnablePreviews,
      // Theme
      applyTheme,
      handleThemeChange,
      handleShowPreviewChange,
      // Upload
      isUploadingAll,
      uploadProgress,
      uploadItem,
      uploadAll,
      // ZIP Download
      isZipping,
      downloadAll,
      // Preview
      previewUrl,
      setPreviewUrl,
      // Settings
      savedSettings,
      getCurrentSettings,
      updateSettings,
      saveSettings,
      resetPending,
      updateSettingAndPersist,
      updateDestinations,
      showSettingsDialog,
      setShowSettingsDialog,
      handleOpenSettingsDialog,
      handleCancelSettings,
      // Derived
      hasQueuedFiles,
      allMetadataReady,
      hasRequeuableItems,
      effectiveBatchDone,
      effectiveBatchTotal,
      totalCells,
      // DOM
      mainRef,
      fileInputRef,
    }),
    [
      items,
      setItems,
      itemsRef,
      updateItem,
      handleUpdateTimestamps,
      handleRemoveItem,
      handleRequeueItem,
      handleRequeueAll,
      onClear,
      isProcessing,
      isProcessingRef,
      isStale,
      staleTaskId,
      status,
      analyzeFiles,
      processAll,
      requestCancel,
      forceCancel,
      opts,
      setOpts,
      handleFilesChange,
      handleStart,
      handleUploadItem,
      handleUploadAll,
      handleEnablePreviews,
      applyTheme,
      handleThemeChange,
      handleShowPreviewChange,
      isUploadingAll,
      uploadProgress,
      uploadItem,
      uploadAll,
      isZipping,
      downloadAll,
      previewUrl,
      setPreviewUrl,
      savedSettings,
      getCurrentSettings,
      updateSettings,
      saveSettings,
      resetPending,
      updateSettingAndPersist,
      updateDestinations,
      showSettingsDialog,
      setShowSettingsDialog,
      handleOpenSettingsDialog,
      handleCancelSettings,
      hasQueuedFiles,
      allMetadataReady,
      hasRequeuableItems,
      effectiveBatchDone,
      effectiveBatchTotal,
      totalCells,
      mainRef,
      fileInputRef,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
