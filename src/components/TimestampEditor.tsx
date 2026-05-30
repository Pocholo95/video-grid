import { useCallback, useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  Loader2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Timeline,
  Trash2,
  X,
} from "lucide-react";
import { Dialog, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { getOrCreateUrl } from "@/lib/blobCache";
import type { TaskItem } from "../types";
import { calculateSampleTimes } from "../gridUtils";
import { formatTimeExact } from "../utils";
import { useLongPress } from "../hooks/useLongPress";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";
import GridPreview from "./GridPreview";
import { templateFromUniform } from "../gridTemplate";
import { useUiStore } from "../store";

interface Props {
  item: TaskItem;
  totalCells: number;
  onSave: (markers: number[]) => void;
  onClose: () => void;
}

/**
 * Formats a time value as HH:MM:SS.f for display inside the editor.
 * Delegates to formatTimeExact but guards against bad values.
 *
 * @param t - Time in seconds.
 */
const fmtT = (t: number) =>
  Number.isFinite(t) && t >= 0 ? formatTimeExact(t) : "00:00:00.000";

interface MarkerPinProps {
  t: number;
  idx: number;
  totalCells: number;
  selected: number | null;
  duration: number;
  isTouch: boolean;
  onSeek: (t: number, idx: number) => void;
  onDelete: (idx: number) => void;
}

function MarkerPin({
  t,
  idx,
  totalCells,
  selected,
  duration,
  isTouch,
  onSeek,
  onDelete,
}: MarkerPinProps) {
  // Long-press suppression is owned by TimestampEditor via the guarded
  // onSeek / onDelete callbacks, so no local ref is needed here.
  const longPress = useLongPress(() => onDelete(idx), { thresholdMs: 500 });
  const isUsed = idx < totalCells;
  const isSelected = selected === idx;

  return (
    <div
      data-marker-pin
      className={cn(
        "absolute top-0 flex h-full -translate-x-1/2 cursor-pointer flex-col items-center",
      )}
      style={{ left: `${duration > 0 ? (t / duration) * 100 : 0}%` }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (isTouch) longPress.onPointerDown(e);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        if (isTouch) longPress.onPointerUp();
      }}
      onPointerLeave={(e) => {
        e.stopPropagation();
        if (isTouch) longPress.onPointerLeave();
      }}
      onPointerCancel={(e) => {
        e.stopPropagation();
        if (isTouch) longPress.onPointerCancel();
      }}
      onClick={(e) => {
        e.stopPropagation();
        // onSeek is guarded by seekToMarkerGuarded in the parent, so calling
        // it unconditionally is safe — phantom clicks after a long press are
        // suppressed at the TimestampEditor level regardless of which marker
        // element they land on.
        onSeek(t, idx);
      }}
      onContextMenu={(e) => {
        e.stopPropagation();
        e.preventDefault();
        // On touch devices deletion is handled exclusively by the long-press
        // timer. Skipping contextmenu here prevents the browser's native
        // contextmenu event (also synthesized on long-press release) from
        // landing on the marker underneath and triggering a phantom deletion.
        if (!isTouch) onDelete(idx);
      }}
    >
      <span
        className={cn(
          "rounded px-1 text-[10px] leading-tight font-semibold tabular-nums",
          isUsed
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground border",
          isSelected && "ring-foreground ring-2 ring-offset-1",
        )}
      >
        {idx + 1}
      </span>
      <div
        className={cn(
          "w-0.5 flex-1",
          isUsed ? "bg-primary" : "bg-muted-foreground/50",
        )}
      />
    </div>
  );
}

export default function TimestampEditor({
  item,
  totalCells,
  onSave,
  onClose,
}: Props) {
  const duration = item.metadata?.duration ?? 0;
  // Use actual FPS from metadata for precise frame-stepping; fallback to 30.
  const fps = item.metadata?.fps ?? 30;
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekbarRef = useRef<HTMLDivElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const clickTimerRef = useRef<number | null>(null);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(
      "(hover: hover) and (any-pointer: fine)",
    );
    const coarseQuery = window.matchMedia("(any-pointer: coarse)");

    const updateIsTouch = () => {
      if (mediaQuery.matches) {
        // Device has mouse/trackpad with hover
        setIsTouch(false);
      } else if (coarseQuery.matches) {
        // Has any coarse pointer; assume touch-centric
        setIsTouch(true);
      } else {
        // Default catches very rare cases; still screen-adaptable
        setIsTouch(true);
      }
    };

    updateIsTouch();
    mediaQuery.addEventListener("change", updateIsTouch);
    coarseQuery.addEventListener("change", updateIsTouch);

    return () => {
      mediaQuery.removeEventListener("change", updateIsTouch);
      coarseQuery.removeEventListener("change", updateIsTouch);
    };
  }, []);

  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  // Local copy of markers — sorted ascending at all times.
  const [markers, setMarkers] = useState<number[]>(() => {
    if (item.timestampMode === "custom" && item.customTimestamps?.length) {
      return [...item.customTimestamps];
    }
    // Seed with auto-calculated times so the user has a ready starting point.
    return calculateSampleTimes(totalCells, Math.max(1, duration));
  });

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState<number | null>(null);

  // Seek to first marker (or 0) when video becomes ready
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoReady) return;

    const initialTime =
      markers.length > 0 && Number.isFinite(markers[0]) ? markers[0] : 0;

    v.pause();
    v.currentTime = initialTime;
    setCurrentTime(initialTime);

    setSelectedMarker(markers.length > 0 ? 0 : null);
  }, [videoReady]);

  // Create object URL for the video file (using blob cache).
  useEffect(() => {
    const url = getOrCreateUrl(item.file);
    setBlobUrl(url);
    return () => {
      // Blob cache handles URL lifecycle globally.
      if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    };
  }, [item.file]);

  // Sync currentTime display while playing.
  // Depend on blobUrl/videoError so listeners attach once the <video> element
  // is actually mounted (it is only rendered when !videoError && blobUrl is
  // set). Without this, the effect would run on first render when
  // videoRef.current is still null and the listeners would never be attached,
  // so timeupdate events would never reach React state and the seekbar
  // playhead would not move during playback.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => setCurrentTime(video.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onReady = () => setVideoReady(true);
    const onErr = () => setVideoError(true);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("error", onErr);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("error", onErr);
    };
  }, [blobUrl, videoError]);

  const addMarker = useCallback(
    (clientX: number) => {
      const bar = seekbarRef.current;
      if (!bar || duration <= 0) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.min(
        1,
        Math.max(0, (clientX - rect.left) / rect.width),
      );
      const t = ratio * duration;
      if (videoRef.current) videoRef.current.currentTime = t;
      setCurrentTime(t);
      setMarkers((prev) => {
        const next = [...prev, t].sort((a, b) => a - b);
        // Auto-select the newly added marker if within active range.
        const idx = next.indexOf(t);
        if (idx >= 0 && idx < totalCells) {
          setSelectedMarker(idx);
        } else {
          setSelectedMarker(null);
        }
        return next;
      });
    },
    [duration, totalCells],
  );

  const seekbarHandler = useCallback(
    (clientX: number) => {
      const bar = seekbarRef.current;
      if (!bar || duration <= 0) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.min(
        1,
        Math.max(0, (clientX - rect.left) / rect.width),
      );
      const t = ratio * duration;
      if (videoRef.current) videoRef.current.currentTime = t;
      setCurrentTime(t);
    },
    [duration],
  );

  const addMarkerAtCurrentTime = useCallback(() => {
    const t = videoRef.current?.currentTime ?? currentTime;
    setMarkers((prev) => {
      const next = [...prev, t].sort((a, b) => a - b);
      // Auto-select the newly added marker if within active range.
      const idx = next.indexOf(t);
      if (idx >= 0 && idx < totalCells) {
        setSelectedMarker(idx);
      } else {
        setSelectedMarker(null);
      }
      return next;
    });
  }, [currentTime, totalCells]);

  const deleteMarker = useCallback((idx: number) => {
    setMarkers((prev) => prev.filter((_, i) => i !== idx));
    setSelectedMarker(null);
  }, []);

  const clearAllMarkers = useCallback(() => {
    setMarkers([]);
    setSelectedMarker(null);
  }, []);

  const seekToMarker = useCallback((t: number, idx: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = t;
    setCurrentTime(t);
    setSelectedMarker(idx);
  }, []);

  /**
   * Subscribe only to the specific store fields we need for the grid preview.
   * Stable selectors avoid unnecessary re-renders.
   */
  const storeGridTpl = useUiStore((s) => s.opts?.gridTemplate);
  const storeCols = useUiStore((s) => s.opts?.cols);
  const storeRows = useUiStore((s) => s.opts?.rows);
  const gridTemplate = storeGridTpl?.cells?.length
    ? storeGridTpl
    : templateFromUniform(storeCols ?? 4, storeRows ?? 3);

  /**
   * Handler for clicking a cell in the grid preview: seeks to the marker
   * that corresponds to that cell index.
   */
  const handleGridCellClick = useCallback(
    (cellIndex: number) => {
      if (cellIndex < 0 || cellIndex >= markers.length) return;
      seekToMarker(markers[cellIndex], cellIndex);
    },
    [markers, seekToMarker],
  );

  // When a long press fires, the browser removes the marker element from the
  // DOM mid-gesture. Pointer capture is released at that point, so subsequent
  // pointer/click/contextmenu events are dispatched to whatever element is now
  // at those coordinates - possibly another marker underneath. This flag
  // suppresses any phantom interaction during the release window.
  const longPressSuppressRef = useRef(false);

  const deleteMarkerFromLongPress = useCallback(
    (idx: number) => {
      // Already suppressed — a phantom call arrived during the release window.
      if (longPressSuppressRef.current) return;
      longPressSuppressRef.current = true;
      deleteMarker(idx);
      // 300 ms covers all synthesized pointer/click/contextmenu events.
      setTimeout(() => {
        longPressSuppressRef.current = false;
      }, 300);
    },
    [deleteMarker],
  );

  const seekToMarkerGuarded = useCallback(
    (t: number, idx: number) => {
      if (longPressSuppressRef.current) return;
      seekToMarker(t, idx);
    },
    [seekToMarker],
  );

  const seekBy = useCallback(
    (delta: number) => {
      const v = videoRef.current;
      if (!v || duration <= 0) return;

      const nextTime = Math.min(duration, Math.max(0, v.currentTime + delta));
      v.currentTime = nextTime;
      setCurrentTime(nextTime);

      if (v.paused) {
        // keep it paused; just update position
        return;
      }
    },
    [duration],
  );

  // Mouse wheel seeking: same delta logic as arrow keys.
  // preventDefault + stopPropagation suppresses browser zoom (Ctrl+wheel)
  // and prevents the scroll from bubbling out of the dialog.
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const direction = e.deltaY > 0 ? 1 : -1;
      const delta = e.ctrlKey ? 1 / fps : e.shiftKey ? 5 : 1;
      seekBy(direction * delta);
    },
    [fps, seekBy],
  );

  const seekBack1s = useCallback(() => seekBy(-1), [seekBy]);
  const seekForward1s = useCallback(() => seekBy(1), [seekBy]);
  const seekBack5s = useCallback(() => seekBy(-5), [seekBy]);
  const seekForward5s = useCallback(() => seekBy(5), [seekBy]);
  const seekBackFrame = useCallback(() => seekBy(-1 / fps), [seekBy, fps]);
  const seekForwardFrame = useCallback(() => seekBy(1 / fps), [seekBy, fps]);

  // Attach wheel listener to video and seekbar elements for scroll-seeking.
  // Use native addEventListener (not React synthetic events) so that
  // preventDefault reliably suppresses the browser's Ctrl+wheel zoom.
  //
  // Depend on blobUrl/videoError so the effect re-runs after the conditional
  // render updates the DOM. The `if (video)` guard handles both the initial
  // null ref (first render) and the case where videoError replaced the <video>
  // with an <Alert>.
  useEffect(() => {
    const video = videoRef.current;
    const seekbar = seekbarRef.current;

    if (video) {
      video.addEventListener("wheel", handleWheel, { passive: false });
    }
    if (seekbar) {
      seekbar.addEventListener("wheel", handleWheel, { passive: false });
    }

    return () => {
      if (video) {
        video.removeEventListener("wheel", handleWheel);
      }
      if (seekbar) {
        seekbar.removeEventListener("wheel", handleWheel);
      }
    };
  }, [handleWheel, blobUrl, videoError]);

  const handleSeekbarPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-marker-pin]")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    seekbarHandler(e.clientX);
  };

  const handleSeekbarClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-marker-pin]")) return;
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      addMarker(e.clientX);
    } else {
      clickTimerRef.current = window.setTimeout(() => {
        clickTimerRef.current = null;
      }, 250);
    }
  };

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
    } else {
      v.pause();
    }
  }, []);

  // Keyboard shortcuts via useKeyboardShortcut:
  // Space = play/pause, M = add marker, Arrow = seek
  // Escape is handled by the surrounding Dialog primitive.
  useKeyboardShortcut([
    { key: " ", callback: togglePlay, deps: [] },
    {
      key: "m",
      callback: addMarkerAtCurrentTime,
      deps: [addMarkerAtCurrentTime],
    },
    { key: "ArrowLeft", callback: seekBack1s, deps: [seekBack1s] },
    { key: "ArrowRight", callback: seekForward1s, deps: [seekForward1s] },
    { key: "ArrowLeft", shift: true, callback: seekBack5s, deps: [seekBack5s] },
    {
      key: "ArrowRight",
      shift: true,
      callback: seekForward5s,
      deps: [seekForward5s],
    },
    {
      key: "ArrowLeft",
      ctrl: true,
      callback: seekBackFrame,
      deps: [seekBackFrame],
    },
    {
      key: "ArrowRight",
      ctrl: true,
      callback: seekForwardFrame,
      deps: [seekForwardFrame],
    },
  ]);

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  // How many markers will actually be used (capped at totalCells).
  const effectiveCount = Math.min(markers.length, totalCells);
  const autoFilledCount = Math.max(0, totalCells - markers.length);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className="bg-background fixed top-1/2 left-1/2 z-50 flex max-h-[92vh] w-[min(96vw,1100px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border p-4 shadow-lg"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            setTimeout(() => saveButtonRef.current?.focus(), 0);
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            Edit timestamps for {item.file.name}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Customize the timestamps used to capture the video frames
          </DialogPrimitive.Description>
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold sm:text-lg">
              <Timeline className="size-5 shrink-0 -rotate-90" />
              <span className="shrink-0">Timestamps for</span>
              <span className="truncate font-normal" title={item.file.name}>
                {item.file.name}
              </span>
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              title="Close (Esc)"
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] md:overflow-hidden">
            {/* Left: video + controls */}
            <div className="flex flex-col gap-3 overflow-y-auto">
              {videoError ? (
                <Alert>
                  <AlertTriangle />
                  <AlertDescription>
                    Browser cannot play this file for preview. You can still
                    edit markers using the seekbar below.
                  </AlertDescription>
                </Alert>
              ) : (
                <video
                  ref={videoRef}
                  src={blobUrl ?? undefined}
                  className="max-h-[23vh] md:max-h-9/12"
                  muted
                  playsInline
                  preload="metadata"
                />
              )}

              {/* Seekbar */}
              <div
                ref={seekbarRef}
                className="bg-muted relative h-8 w-full shrink-0 cursor-pointer touch-none rounded-md select-none"
                onPointerDown={handleSeekbarPointerDown}
                onPointerMove={(e) => isDragging && seekbarHandler(e.clientX)}
                onPointerUp={(e) => {
                  setIsDragging(false);
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }}
                onClick={handleSeekbarClick}
              >
                {/* Track fill */}
                <div
                  className="bg-primary/30 pointer-events-none absolute top-0 left-0 h-full rounded-md"
                  style={{ width: `${progressPct}%` }}
                />

                {/* Playhead */}
                <div
                  className="bg-foreground pointer-events-none absolute top-0 h-full w-0.5 -translate-x-1/2"
                  style={{ left: `${progressPct}%` }}
                />

                {markers.map((t, idx) => (
                  <MarkerPin
                    key={idx}
                    t={t}
                    idx={idx}
                    totalCells={totalCells}
                    selected={selectedMarker}
                    duration={duration}
                    isTouch={isTouch}
                    onSeek={seekToMarkerGuarded}
                    onDelete={deleteMarkerFromLongPress}
                  />
                ))}
              </div>

              {/* Transport controls */}
              <div className="flex items-center gap-3">
                {videoReady || videoError ? (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={togglePlay}
                    disabled={videoError}
                    title={isPlaying ? "Pause (Space)" : "Play (Space)"}
                  >
                    {isPlaying ? (
                      <Pause className="size-4" />
                    ) : (
                      <Play className="size-4" />
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="icon"
                    disabled
                    title="Loading video..."
                  >
                    <Loader2 className="size-4 animate-spin" />
                  </Button>
                )}
                <span className="font-mono text-sm tabular-nums">
                  {fmtT(currentTime)}{" "}
                  <span className="text-muted-foreground">/</span>{" "}
                  {fmtT(duration)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={addMarkerAtCurrentTime}
                  title="Add marker at current position (M)"
                >
                  <Plus className="size-4" />
                  Add Marker
                </Button>
              </div>

              {/* Marker count summary */}
              <div className="text-muted-foreground text-xs">
                {markers.length === 0 ? (
                  <span>
                    No markers — all {totalCells} cells will use auto
                    timestamps.
                  </span>
                ) : (
                  <>
                    <span className="text-foreground">
                      {effectiveCount} marker{effectiveCount !== 1 ? "s" : ""}{" "}
                      set for {totalCells} cell{effectiveCount !== 1 ? "s" : ""}
                    </span>
                    {autoFilledCount > 0 && (
                      <span>
                        {" · "}
                        {autoFilledCount} cell{autoFilledCount !== 1 ? "s" : ""}{" "}
                        use auto fallback
                      </span>
                    )}
                    {markers.length > totalCells && (
                      <span className="text-destructive">
                        {" · "}
                        {markers.length - totalCells} marker
                        {markers.length - totalCells !== 1 ? "s" : ""} ignored
                        (beyond {totalCells}-cell grid)
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Right: grid preview + marker list */}
            <div className="bg-muted/30 flex h-[30vh] shrink-0 flex-col gap-2 rounded-md border p-3 md:h-auto md:min-h-0 md:shrink">
              {/* Grid structure preview */}
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs font-medium">
                  Grid Layout
                </span>
                <div className="bg-card overflow-x-auto rounded-md border p-2">
                  <GridPreview
                    template={gridTemplate}
                    selectedCellIndex={selectedMarker}
                    onClickCell={handleGridCellClick}
                    assignedCount={effectiveCount}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">
                  Markers (
                  {markers.length > totalCells ? (
                    <span className="text-destructive">{markers.length}</span>
                  ) : (
                    markers.length
                  )}
                  /{totalCells})
                </span>
                {markers.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={clearAllMarkers}
                    title="Remove all markers"
                  >
                    <Trash2 className="size-4" />
                    Clear all
                  </Button>
                )}
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
                {markers.length === 0 ? (
                  <p className="text-muted-foreground p-2 text-xs">
                    {isTouch ? (
                      <>
                        No markers yet. Seek to a position and click{" "}
                        <strong>+&nbsp;Add&nbsp;Marker</strong> or double tap
                        the seekbar.
                      </>
                    ) : (
                      <>
                        No markers yet. Seek to a position and click{" "}
                        <strong>+&nbsp;Add&nbsp;Marker</strong>, or press{" "}
                        <Kbd>M</Kbd>.
                      </>
                    )}
                  </p>
                ) : (
                  markers.map((t, idx) => {
                    const isUsed = idx < totalCells;
                    const isSelected = selectedMarker === idx;
                    return (
                      <div
                        key={idx}
                        className={cn(
                          "bg-muted/50 hover:bg-primary/50 flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors",
                          isSelected &&
                            "bg-primary/75 text-primary-foreground border-primary ring-2 ring-foreground",
                          !isUsed && "opacity-60",
                        )}
                        onClick={() => seekToMarker(t, idx)}
                      >
                        <span className="text-foreground/75 w-8 font-mono text-xs tabular-nums">
                          #{idx + 1}
                        </span>
                        <span className="flex-1 font-mono text-xs tabular-nums">
                          {fmtT(t)}
                        </span>
                        {!isUsed && (
                          <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] uppercase">
                            ignored
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          title="Delete this marker"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMarker(idx);
                          }}
                        >
                          <X className="size-3" />
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-xs">
              {isTouch ? (
                <>
                  Tap seekbar to seek &nbsp;·&nbsp; Double-tap seekbar to add
                  marker &nbsp;·&nbsp; Long-press marker to remove
                </>
              ) : (
                <>
                  <Kbd>Space</Kbd> Play/Pause &nbsp;·&nbsp; <Kbd>M</Kbd> Add
                  Marker &nbsp;·&nbsp; <Kbd>Ctrl+Arrow</Kbd> for frame-step
                  &nbsp;·&nbsp; Double-click seekbar to add marker &nbsp;·&nbsp;
                  Right-click marker to remove
                </>
              )}
            </p>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMarkers(
                    calculateSampleTimes(totalCells, Math.max(1, duration)),
                  );
                  setSelectedMarker(null);
                }}
                title="Reset to evenly-spaced auto timestamps"
              >
                <RotateCcw className="size-4" />
                Reset
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                ref={saveButtonRef}
                variant="default"
                onClick={() => onSave(markers)}
              >
                Save Markers
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
