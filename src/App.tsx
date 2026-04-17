import { useCallback, useState } from "react";
import { saveAs } from "file-saver";
import JSZip from "jszip";

import { DEFAULTS } from "./constants";
import {
  loadAppSettings,
  persistAppSettings,
  persistDestinations,
} from "./presets";
import { useProcessor } from "./hooks/useProcessor";
import { useUpload } from "./hooks/useUpload";

import type {
  AppSettings,
  OutputItem,
  SavedOptions,
  UploadDestination,
} from "./types";

import ControlPanel from "./components/ControlPanel";
import OutputCard from "./components/OutputCard";
import DestinationManager from "./components/DestinationManager";
import PreviewModal from "./components/PreviewModal";
import CopyAllPanel from "./components/CopyAllPanel";

export default function App() {
  // - Persisted app settings
  const [appSettings, setAppSettingsState] = useState<AppSettings>(() =>
    loadAppSettings(),
  );

  const [opts, setOptsState] = useState<SavedOptions>(() => {
    const s = loadAppSettings();
    if (s.presets.lastUsed && s.presets.entries[s.presets.lastUsed]) {
      return s.presets.entries[s.presets.lastUsed];
    }
    return { ...DEFAULTS };
  });

  const setAppSettings = useCallback((s: AppSettings) => {
    setAppSettingsState(s);
    persistAppSettings(s);
  }, []);

  const setOpts = useCallback((o: SavedOptions) => setOptsState(o), []);

  // - Destinations
  const destinations = appSettings.destinations;
  const [showDestManager, setShowDestManager] = useState(false);

  const handleSaveDestinations = useCallback(
    (dests: UploadDestination[]) => {
      persistDestinations(dests);
      setAppSettings({ ...appSettings, destinations: dests });
    },
    [appSettings, setAppSettings],
  );
  const enabledDests = destinations.filter((d) => d.enabled);

  // - Output items
  const [items, setItems] = useState<OutputItem[]>([]);

  const updateItem = useCallback((id: string, patch: Partial<OutputItem>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  }, []);

  // - Processing
  const {
    isProcessing,
    status,
    analyseFiles,
    processAll,
    requestCancel,
    resetState,
  } = useProcessor(updateItem);

  const handleFilesChange = useCallback(
    async (files: File[]) => {
      setItems([]);
      const newItems = await analyseFiles(files);
      setItems(newItems);
    },
    [analyseFiles],
  );

  const handleStart = useCallback(
    () => processAll(items, opts),
    [items, opts, processAll],
  );
  const handleClear = useCallback(() => {
    setItems([]);
    resetState();
  }, [resetState]);

  // - Upload
  const { isUploadingAll, uploadProgress, uploadItem, uploadAll } = useUpload(
    items,
    setItems,
  );

  // - Download all as ZIP
  const [isZipping, setIsZipping] = useState(false);

  const downloadAll = useCallback(async () => {
    const done = items.filter(
      (i) => i.status === "done" && i.outputBlob && i.outputName,
    );
    if (!done.length) return;
    setIsZipping(true);
    try {
      const zip = new JSZip();
      for (const item of done) zip.file(item.outputName!, item.outputBlob!);
      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, "vidgrid-outputs.zip");
    } finally {
      setIsZipping(false);
    }
  }, [items]);

  // - Preview modal
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // - Derived from Outputs
  const doneItems = items.filter(
    (i) =>
      (i.status === "done" || i.status === "processing") &&
      i.outputBlob &&
      i.outputName,
  );
  const allMetaReady =
    items.length > 0 && items.every((i) => i.metadata !== undefined);

  const totalPossibleUploads = doneItems.length * enabledDests.length;
  const completedUploads =
    items.filter((item) =>
      enabledDests.every((dest) => item.uploads?.[dest.id]?.status === "done"),
    ).length * enabledDests.length;
  const hasPendingUploads = completedUploads < totalPossibleUploads;

  return (
    <>
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">
          <img src="favicon.svg" alt="Logo" />
        </div>
        <div className="header-text">
          <h1>VidGrid-HTML</h1>
          <p className="subtitle">
            Thumbnail Grids Generator for Videos. Client-Side only processing,
            no upload required!
          </p>
        </div>
        <div className="header-actions">
          <button
            className="icon-btn dest-manager-btn"
            title="Manage upload destinations"
            onClick={() => setShowDestManager(true)}
          >
            ☁️ Upload Destinations{" "}
            {destinations.length > 0
              ? `(${destinations.filter((d) => d.enabled).length}/${destinations.length})`
              : ""}
          </button>
        </div>
      </header>

      <ControlPanel
        opts={opts}
        setOpts={setOpts}
        presets={appSettings.presets}
        setPresets={(p) => setAppSettings({ ...appSettings, presets: p })}
        status={status}
        isProcessing={isProcessing}
        hasFiles={items.length > 0}
        allMetadataReady={allMetaReady}
        onFilesChange={handleFilesChange}
        onStart={handleStart}
        onCancel={requestCancel}
        onClear={handleClear}
      />

      <section className="panel">
        <div className="outputs-header">
          <h2>Outputs</h2>
          <div className="outputs-bulk-actions">
            {enabledDests.length > 0 && doneItems.length > 0 && (
              <button
                className="icon-btn primary upload-all-btn"
                disabled={isUploadingAll || !hasPendingUploads}
                onClick={() => uploadAll(destinations)}
                title={`Upload all to ${enabledDests.map((d) => d.name).join(", ")} ${
                  hasPendingUploads ? "" : "(All uploads complete)"
                }`}
              >
                {isUploadingAll
                  ? `⏳ Uploading… (${uploadProgress.attempted}/${uploadProgress.total})`
                  : `☁️ Upload All (${completedUploads}/${totalPossibleUploads})`}
              </button>
            )}
            {doneItems.length > 1 && (
              <button
                className="icon-btn primary"
                disabled={isZipping}
                onClick={downloadAll}
              >
                {isZipping
                  ? "⏳ Zipping…"
                  : `⏬ Download All (${doneItems.length})`}
              </button>
            )}
          </div>
        </div>

        {doneItems.length > 0 && <CopyAllPanel items={doneItems} />}

        <div className="outputs">
          {items.length === 0 ? (
            <div className="empty">No outputs yet.</div>
          ) : (
            items.map((item) => (
              <OutputCard
                key={item.id}
                item={item}
                showPreview={opts.preview}
                destinations={destinations}
                onPreview={setPreviewUrl}
                onUpload={(id) => uploadItem(id, destinations)}
              />
            ))
          )}
        </div>
      </section>

      <PreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />

      {showDestManager && (
        <DestinationManager
          destinations={destinations}
          onSave={handleSaveDestinations}
          onClose={() => setShowDestManager(false)}
        />
      )}
    </>
  );
}
