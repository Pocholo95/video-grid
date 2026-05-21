import { useContext, useMemo, createContext, type ReactNode } from "react";
import { useUpload } from "@/hooks/useUpload";
import type { UploadDestination } from "@/types";
import { useTasksContext } from "./tasksContext";

/** Upload lifecycle: single-item upload, bulk upload, progress. */
interface UploadContextValue {
  isUploadingAll: boolean;
  uploadProgress: { attempted: number; total: number };
  uploadItem: (id: string, destinations: UploadDestination[]) => Promise<void>;
  uploadAll: (destinations: UploadDestination[]) => Promise<void>;
  resetUploadState: () => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);

/** Consume the upload context. */
export function useUploadContext(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx)
    throw new Error("useUploadContext must be used within UploadProvider");
  return ctx;
}

interface UploadProviderProps {
  children: ReactNode;
}

export function UploadProvider({ children }: UploadProviderProps) {
  // --- Consume tasks context for items state ---
  const tasks = useTasksContext();

  const {
    isUploadingAll,
    uploadProgress,
    uploadItem,
    uploadAll,
    resetUploadState,
  } = useUpload(tasks.items, tasks.setItems);

  const value = useMemo(
    (): UploadContextValue => ({
      isUploadingAll,
      uploadProgress,
      uploadItem,
      uploadAll,
      resetUploadState,
    }),
    [isUploadingAll, uploadProgress, uploadItem, uploadAll, resetUploadState],
  );

  return (
    <UploadContext.Provider value={value}>{children}</UploadContext.Provider>
  );
}
