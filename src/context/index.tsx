import { type ReactNode } from "react";
import { TasksProvider } from "./tasksContext";
import { ProcessingProvider } from "./processingContext";
import { UploadProvider } from "./uploadContext";
import { SettingsProvider } from "./settingsContext";
import { UiProvider } from "./uiContext";

// Re-export all consumer hooks
export { useTasksContext } from "./tasksContext";
export { useProcessingContext } from "./processingContext";
export { useUploadContext } from "./uploadContext";
export { useSettingsContext } from "./settingsContext";
export { useUiContext } from "./uiContext";

/**
 * Composition root wrapping all domain-specific context providers.
 *
 * Nesting order matters:
 *  - SettingsProvider is outermost (no dependencies on other contexts)
 *  - TasksProvider wraps next (provides items state)
 *  - ProcessingProvider consumes TasksProvider via useTasksContext()
 *  - UploadProvider consumes TasksProvider via useTasksContext()
 *  - UiProvider is innermost (consumes all four sibling contexts)
 */
export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <TasksProvider>
        <ProcessingProvider>
          <UploadProvider>
            <UiProvider>{children}</UiProvider>
          </UploadProvider>
        </ProcessingProvider>
      </TasksProvider>
    </SettingsProvider>
  );
}
