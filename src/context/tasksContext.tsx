import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { TaskItem } from "@/types";

/** Task-level state: items list, mutations, and derived computations. */
interface TasksContextValue {
  items: TaskItem[];
  setItems: React.Dispatch<React.SetStateAction<TaskItem[]>>;
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
  // Derived
  hasQueuedFiles: boolean;
  allMetadataReady: boolean;
  hasRequeuableItems: boolean;
  effectiveBatchDone: number;
  cancelledCount: number;
  inFlight: number;
}

const TasksContext = createContext<TasksContextValue | null>(null);

/** Consume the tasks context. Throws when used outside TasksProvider. */
export function useTasksContext(): TasksContextValue {
  const ctx = useContext(TasksContext);
  if (!ctx)
    throw new Error("useTasksContext must be used within TasksProvider");
  return ctx;
}

interface TasksProviderProps {
  children: ReactNode;
}

export function TasksProvider({ children }: TasksProviderProps) {
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

  const value = useMemo(
    (): TasksContextValue => ({
      items,
      setItems,
      itemsRef,
      updateItem,
      handleUpdateTimestamps,
      handleRemoveItem,
      handleRequeueItem,
      handleRequeueAll,
      hasQueuedFiles,
      allMetadataReady,
      hasRequeuableItems,
      effectiveBatchDone,
      cancelledCount,
      inFlight,
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
      hasQueuedFiles,
      allMetadataReady,
      hasRequeuableItems,
      effectiveBatchDone,
      cancelledCount,
      inFlight,
    ],
  );

  return (
    <TasksContext.Provider value={value}>{children}</TasksContext.Provider>
  );
}
