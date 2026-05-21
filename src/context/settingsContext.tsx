import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  createContext,
  type ReactNode,
} from "react";
import { useAppSettings } from "@/hooks/useAppSettings";
import type { AppSettings } from "@/types";

/** Settings persistence, theme, preview toggle, and settings dialog state. */
interface SettingsContextValue {
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
  applyTheme: (theme: "dark" | "light" | "dimmed" | "classic") => void;
  handleThemeChange: (theme: "dark" | "light" | "dimmed" | "classic") => void;
  handleShowPreviewChange: (show: boolean) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/** Consume the settings context. */
export function useSettingsContext(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx)
    throw new Error("useSettingsContext must be used within SettingsProvider");
  return ctx;
}

interface SettingsProviderProps {
  children: ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const {
    savedSettings,
    getCurrentSettings,
    updateSettings,
    saveSettings,
    resetPending,
    updateSettingAndPersist,
    updateDestinations,
  } = useAppSettings();

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

  const value = useMemo(
    (): SettingsContextValue => ({
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
      applyTheme,
      handleThemeChange,
      handleShowPreviewChange,
    }),
    [
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
      applyTheme,
      handleThemeChange,
      handleShowPreviewChange,
    ],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
