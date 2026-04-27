import { useCallback, useEffect, useRef, useState } from "react";
import type { TaskItem } from "../types";
import { calculateSampleTimes } from "../gridUtils";
import { formatTimeExact } from "../utils";
import { useLongPress } from "../hooks/useLongPress";
import { useScrollLock } from "../hooks/useScrollLock";

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
  Number.isFinite(t) && t >= 0 ? formatTimeExact(t) : "00:00:00.0";

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

  return (
    <div
      className={`ts-marker-pin${idx < totalCells ? " ts-marker-pin--used" : " ts-marker-pin--overflow"}${selected === idx ? " ts-marker-pin--selected" : ""}`}
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
      <span className="ts-marker-pin-label">{idx + 1}</span>
    </div>
  );
}

export default function TimestampEditor({
  item,
  totalCells,
  onSave,
  onClose,
}: Props) {
  useScrollLock();

  const duration = item.metadata?.duration ?? 0;
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekbarRef = useRef<HTMLDivElement>(null);
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

  // Create object URL for the video file.
  useEffect(() => {
    const url = URL.createObjectURL(item.file);
    setBlobUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    };
  }, [item.file]);

  // Sync currentTime display while playing.
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
  }, []);

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
      setMarkers((prev) => [...prev, t].sort((a, b) => a - b));
    },
    [duration],
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
    setMarkers((prev) => [...prev, t].sort((a, b) => a - b));
    setSelectedMarker(null);
  }, [currentTime]);

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

  // Keyboard shortcuts: Space = play/pause, Escape = close, M = add marker.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") onClose();
      else if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        addMarkerAtCurrentTime();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        seekBy(
          e.key === "ArrowLeft" ? -(e.shiftKey ? 5 : 1) : e.shiftKey ? 5 : 1,
        );
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, addMarkerAtCurrentTime, seekBy]);

  const handleSeekbarPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".ts-marker-pin")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    seekbarHandler(e.clientX);
  };

  const handleSeekbarClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".ts-marker-pin")) return;
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

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
    } else {
      v.pause();
    }
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  // How many markers will actually be used (capped at totalCells).
  const effectiveCount = Math.min(markers.length, totalCells);
  const autoFilledCount = Math.max(0, totalCells - markers.length);

  return (
    <div
      className="modal-backdrop ts-editor-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-box ts-editor-box">
        <div className="modal-header">
          <h2>
            <span className="ts-editor-title-icon">🎯</span> Timestamps for{" "}
            <span className="ts-editor-filename" title={item.file.name}>
              {item.file.name}
            </span>
          </h2>
          <button className="icon-btn" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </div>

        <div className="ts-editor-body">
          {/* Left: video + controls */}
          <div className="ts-editor-left">
            {videoError ? (
              <div className="ts-video-error">
                ⚠️ Browser cannot play this file for preview. You can still edit
                markers using the seekbar below.
              </div>
            ) : (
              <video
                ref={videoRef}
                className="ts-video"
                src={blobUrl ?? undefined}
                muted
                playsInline
                preload="metadata"
              />
            )}

            {/* Seekbar */}
            <div
              ref={seekbarRef}
              className="ts-seekbar"
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
                className="ts-seekbar-fill"
                style={{ width: `${progressPct}%` }}
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

              {/* Playhead */}
              <div
                className="ts-playhead"
                style={{ left: `${progressPct}%` }}
              />
            </div>

            {/* Transport controls */}
            <div className="ts-transport">
              <button
                className="icon-btn ts-play-btn"
                onClick={togglePlay}
                disabled={!videoReady && !videoError}
                title={isPlaying ? "Pause (Space)" : "Play (Space)"}
              >
                {isPlaying ? "⏸" : "▶️"}
              </button>
              <span className="ts-timecode">
                {fmtT(currentTime)} <span className="ts-timecode-sep">/</span>{" "}
                {fmtT(duration)}
              </span>
              <button
                className="icon-btn ts-add-btn"
                onClick={addMarkerAtCurrentTime}
                title="Add marker at current position (M)"
              >
                + Add Marker
              </button>
            </div>

            {/* Marker count summary */}
            <div className="ts-summary">
              {markers.length === 0 ? (
                <span className="ts-summary-auto">
                  No markers — all {totalCells} cells will use auto timestamps.
                </span>
              ) : (
                <>
                  <span className="ts-summary-used">
                    {effectiveCount} marker{effectiveCount !== 1 ? "s" : ""} set
                    for {effectiveCount} cell{effectiveCount !== 1 ? "s" : ""}
                  </span>
                  {autoFilledCount > 0 && (
                    <span className="ts-summary-auto">
                      {" · "}
                      {autoFilledCount} cell{autoFilledCount !== 1 ? "s" : ""}{" "}
                      use auto fallback
                    </span>
                  )}
                  {markers.length > totalCells && (
                    <span className="ts-summary-overflow">
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

          {/* Right: marker list */}
          <div className="ts-editor-right">
            <div className="ts-marker-list-header">
              <span className="ts-marker-list-title">
                Markers ({markers.length})
              </span>
              {markers.length > 0 && (
                <button
                  className="icon-btn danger-btn ts-clear-btn"
                  onClick={clearAllMarkers}
                  title="Remove all markers"
                >
                  🗑️ Clear all
                </button>
              )}
            </div>

            <div className="ts-marker-list">
              {markers.length === 0 ? (
                <p className="ts-marker-empty">
                  {isTouch ? (
                    <>
                      No markers yet. Seek to a position and click{" "}
                      <strong>+&nbsp;Add&nbsp;Marker</strong> or double tap the
                      seekbar.
                    </>
                  ) : (
                    <>
                      No markers yet. Seek to a position and click{" "}
                      <strong>+&nbsp;Add&nbsp;Marker</strong>, or press{" "}
                      <kbd>M</kbd>.
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
                      className={`ts-marker-row${isSelected ? " ts-marker-row--selected" : ""}${!isUsed ? " ts-marker-row--overflow" : ""}`}
                      onClick={() => seekToMarker(t, idx)}
                    >
                      <span className="ts-marker-num">#{idx + 1}</span>
                      <span className="ts-marker-time">{fmtT(t)}</span>
                      {!isUsed && (
                        <span className="ts-marker-overflow-badge">
                          ignored
                        </span>
                      )}
                      <button
                        className="icon-btn ts-marker-delete"
                        title="Delete this marker"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMarker(idx);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <p className="ts-editor-hint">
            {isTouch ? (
              <>
                Tap seekbar to seek &nbsp;·&nbsp; Double-tap seekbar to add
                marker &nbsp;·&nbsp; Long-press marker to remove
              </>
            ) : (
              <>
                <kbd>Space</kbd> Play/Pause &nbsp;·&nbsp; <kbd>M</kbd> Add
                Marker &nbsp;·&nbsp; Double-click seekbar to add marker
                &nbsp;·&nbsp; Right-click marker to remove
              </>
            )}
          </p>
          <div className="ts-editor-actions">
            <button
              className="icon-btn"
              onClick={() => {
                setMarkers(
                  calculateSampleTimes(totalCells, Math.max(1, duration)),
                );
                setSelectedMarker(null);
              }}
              title="Reset to evenly-spaced auto timestamps"
            >
              ↺ Reset
            </button>
            <button className="icon-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="icon-btn primary"
              onClick={() => onSave(markers)}
            >
              ✓ Save Markers
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
