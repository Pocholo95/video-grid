import { useCallback } from "react";
import { Settings as SettingsIcon } from "lucide-react";

import { PROJECT_NAME } from "./constants";
import { useAppContext } from "./context/AppContext";

import ControlPanel from "./components/ControlPanel";
import TaskList from "./components/TaskList";
import PreviewModal from "./components/PreviewModal";
import Footer from "./components/Footer";
import Settings from "./components/Settings";
import { Button } from "./components/ui/button";

export default function App() {
  const ctx = useAppContext();

  const handleClosePreview = useCallback(() => ctx.setPreviewUrl(null), [ctx]);

  return (
    <div
      ref={ctx.mainRef}
      className="mx-auto flex max-w-6xl flex-col gap-3 p-4"
    >
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
          onClick={ctx.handleOpenSettingsDialog}
          variant={"outline"}
          size={"icon"}
          aria-label="Open settings"
        >
          <SettingsIcon className="size-4" />
        </Button>
      </header>

      <TaskList
        items={ctx.items}
        totalCells={ctx.totalCells}
        showPreview={ctx.getCurrentSettings().showPreview}
        destinations={ctx.getCurrentSettings().destinations}
        onFilesChange={ctx.handleFilesChange}
        isUploadingAll={ctx.isUploadingAll}
        uploadProgress={ctx.uploadProgress}
        isZipping={ctx.isZipping}
        onUploadAll={ctx.handleUploadAll}
        onDownloadAll={ctx.downloadAll}
        onPreview={ctx.setPreviewUrl}
        onUpload={ctx.handleUploadItem}
        onUpdateTimestamps={ctx.handleUpdateTimestamps}
        onRemove={ctx.handleRemoveItem}
        onRequeue={ctx.handleRequeueItem}
        handleEnablePreviews={ctx.handleEnablePreviews}
        status={ctx.status}
        isProcessing={ctx.isProcessing}
        isStale={ctx.isStale}
        staleTaskId={ctx.staleTaskId}
        hasFiles={ctx.hasQueuedFiles}
        allMetadataReady={ctx.allMetadataReady}
        hasRequeuableItems={ctx.hasRequeuableItems}
        effectiveBatchTotal={ctx.effectiveBatchTotal}
        effectiveBatchDone={ctx.effectiveBatchDone}
        onStart={ctx.handleStart}
        onCancel={ctx.requestCancel}
        onForceCancel={ctx.forceCancel}
        onClear={ctx.onClear}
        onRequeueAll={ctx.handleRequeueAll}
      />

      <ControlPanel
        opts={ctx.opts}
        setOpts={ctx.setOpts}
        presets={ctx.getCurrentSettings().presets}
        setPresets={(p) => {
          ctx.updateSettings({ presets: p });
        }}
      />

      {ctx.previewUrl && (
        <PreviewModal url={ctx.previewUrl} onClose={handleClosePreview} />
      )}

      <Footer />

      {/* Settings Dialog with nested Upload Destinations */}
      <Settings
        open={ctx.showSettingsDialog}
        theme={ctx.getCurrentSettings().theme}
        showPreview={ctx.getCurrentSettings().showPreview}
        destinations={ctx.getCurrentSettings().destinations}
        onThemeChange={ctx.handleThemeChange}
        onShowPreviewChange={ctx.handleShowPreviewChange}
        onSaveAndClose={() => {
          ctx.saveSettings();
          ctx.setShowSettingsDialog(false);
        }}
        onCancel={ctx.handleCancelSettings}
        updateDestinations={ctx.updateDestinations}
      />
    </div>
  );
}
