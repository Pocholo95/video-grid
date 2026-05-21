import { useCallback } from "react";
import { Settings as SettingsIcon } from "lucide-react";

import { PROJECT_NAME } from "./constants";
import {
  useTasksContext,
  useProcessingContext,
  useUploadContext,
  useSettingsContext,
  useUiContext,
} from "./context";

import ControlPanel from "./components/ControlPanel";
import TaskList from "./components/TaskList";
import PreviewModal from "./components/PreviewModal";
import Footer from "./components/Footer";
import Settings from "./components/Settings";
import { Button } from "./components/ui/button";

export default function App() {
  const tasks = useTasksContext();
  const processing = useProcessingContext();
  const upload = useUploadContext();
  const settings = useSettingsContext();
  const ui = useUiContext();

  const handleClosePreview = useCallback(
    () => ui.setPreviewUrl(null),
    [ui.setPreviewUrl],
  );

  return (
    <div ref={ui.mainRef} className="mx-auto flex max-w-6xl flex-col gap-3 p-4">
      <header className="bg-card text-card-foreground flex items-start justify-between gap-4 rounded-xl border p-4 shadow-sm">
        <div className="flex items-center gap-4 flex-1">
          <a
            href="/"
            aria-label="Go to homepage"
            className="focus-visible:ring-ring/50 inline-flex shrink-0 rounded-md focus-visible:ring-2 focus-visible:outline-none"
          >
            <img src="favicon.svg" alt="Logo" className="size-14 rounded-md" />
          </a>
          <div className="min-w-0 flex flex-col gap-1">
            <h1 className="text-base min-[360px]:text-xl font-semibold leading-none tracking-tight text-nowrap">
              {PROJECT_NAME}
            </h1>
            <p className="text-muted-foreground text-sm hidden min-[360px]:block">
              Thumbnail Grids for Videos
            </p>
            <p className="text-muted-foreground text-sm hidden sm:block">
              Client-side only processing, no upload required!
            </p>
          </div>
        </div>

        <Button
          onClick={settings.handleOpenSettingsDialog}
          variant={"outline"}
          size={"icon"}
          aria-label="Open settings"
        >
          <SettingsIcon className="size-4" />
        </Button>
      </header>

      <TaskList
        items={tasks.items}
        totalCells={ui.totalCells}
        showPreview={settings.getCurrentSettings().showPreview}
        destinations={settings.getCurrentSettings().destinations}
        onFilesChange={ui.handleFilesChange}
        isUploadingAll={upload.isUploadingAll}
        uploadProgress={upload.uploadProgress}
        isZipping={ui.isZipping}
        onUploadAll={ui.handleUploadAll}
        onDownloadAll={ui.downloadAll}
        onPreview={ui.setPreviewUrl}
        onUpload={ui.handleUploadItem}
        onUpdateTimestamps={tasks.handleUpdateTimestamps}
        onRemove={tasks.handleRemoveItem}
        onRequeue={tasks.handleRequeueItem}
        handleEnablePreviews={ui.handleEnablePreviews}
        status={processing.status}
        isProcessing={processing.isProcessing}
        isStale={processing.isStale}
        staleTaskId={processing.staleTaskId}
        hasFiles={tasks.hasQueuedFiles}
        allMetadataReady={tasks.allMetadataReady}
        hasRequeuableItems={tasks.hasRequeuableItems}
        effectiveBatchTotal={ui.effectiveBatchTotal}
        effectiveBatchDone={tasks.effectiveBatchDone}
        onStart={ui.handleStart}
        onCancel={processing.requestCancel}
        onForceCancel={processing.forceCancel}
        onClear={ui.onClear}
        onRequeueAll={tasks.handleRequeueAll}
      />

      <ControlPanel
        opts={ui.opts}
        setOpts={ui.setOpts}
        presets={settings.getCurrentSettings().presets}
        setPresets={(p) => {
          settings.updateSettings({ presets: p });
        }}
      />

      {ui.previewUrl && (
        <PreviewModal url={ui.previewUrl} onClose={handleClosePreview} />
      )}

      <Footer />

      {/* Settings Dialog with nested Upload Destinations */}
      <Settings
        open={settings.showSettingsDialog}
        theme={settings.getCurrentSettings().theme}
        showPreview={settings.getCurrentSettings().showPreview}
        destinations={settings.getCurrentSettings().destinations}
        onThemeChange={settings.handleThemeChange}
        onShowPreviewChange={settings.handleShowPreviewChange}
        onSaveAndClose={() => {
          settings.saveSettings();
          settings.setShowSettingsDialog(false);
        }}
        onCancel={settings.handleCancelSettings}
        updateDestinations={settings.updateDestinations}
      />
    </div>
  );
}
