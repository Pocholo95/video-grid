import { useCallback, useEffect, useRef, useState } from "react";
import type { OutputItem } from "../types";
import { calculateSampleTimes } from "../gridUtils";
import { formatTimeExact } from "../utils";

interface Props {
  item: OutputItem;
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

export default function TimestampEditor({
  item,
  totalCells,
  onSave,
  onClose,
}: Props) {
  const duration = item.metadata?.duration ?? 0;
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekbarRef = useRef<HTMLDivElement>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Local copy of markers — sorted ascending at all times.
  const [markers, setMarkers] = useState<number[]>(() => {
    if (
      item.timestampMode === "custom" &&
      item.customTimestamps &&
      item.customTimestamps.length > 0
    ) {
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

  // Create object URL for the video file.
  useEffect(() => {
    const url = URL.createObjectURL(item.file);
    blobUrlRef.current = url;
    return () => {
      URL.revokeObjectURL(url);
      blobUrlRef.current = null;
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

  // Keyboard shortcuts: Space = play/pause, Escape = close, M = add marker.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) {
          v.play();
        } else {
          v.pause();
        }
      }
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        addMarkerAtCurrentTime();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const addMarkerAtCurrentTime = useCallback(() => {
    const t = videoRef.current?.currentTime ?? currentTime;
    setMarkers((prev) => {
      const next = [...prev, t].sort((a, b) => a - b);
      return next;
    });
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

  // Seekbar click / drag
  const seekFromPointer = useCallback(
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

  const handleSeekbarDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    seekFromPointer(e.clientX);
  };
  const handleSeekbarMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    seekFromPointer(e.clientX);
  };
  const handleSeekbarUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    seekFromPointer(e.clientX);
    e.currentTarget.releasePointerCapture(e.pointerId);
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
                src={blobUrlRef.current ?? undefined}
                muted
                playsInline
                preload="metadata"
              />
            )}

            {/* Seekbar */}
            <div
              ref={seekbarRef}
              className="ts-seekbar"
              onPointerDown={handleSeekbarDown}
              onPointerMove={handleSeekbarMove}
              onPointerUp={handleSeekbarUp}
              title="Click or drag to seek"
            >
              {/* Track fill */}
              <div
                className="ts-seekbar-fill"
                style={{ width: `${progressPct}%` }}
              />

              {/* Marker pins on the seekbar */}
              {markers.map((t, idx) => {
                const pct = duration > 0 ? (t / duration) * 100 : 0;
                const isUsed = idx < totalCells;
                const isSelected = selectedMarker === idx;
                return (
                  <div
                    key={idx}
                    className={`ts-marker-pin${isUsed ? " ts-marker-pin--used" : " ts-marker-pin--overflow"}${isSelected ? " ts-marker-pin--selected" : ""}`}
                    style={{ left: `${pct}%` }}
                    title={`#${idx + 1} — ${fmtT(t)}${!isUsed ? " (beyond grid capacity)" : ""}`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      seekToMarker(t, idx);
                    }}
                  >
                    <span className="ts-marker-pin-label">{idx + 1}</span>
                  </div>
                );
              })}

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
                {fmtT(currentTime)}
                <span className="ts-timecode-sep"> / </span>
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
                  No markers yet. Seek to a position and click{" "}
                  <strong>+ Add Marker</strong>, or press <kbd>M</kbd>.
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
            <kbd>Space</kbd> play/pause &nbsp;·&nbsp; <kbd>M</kbd> add marker
            &nbsp;·&nbsp; <kbd>Esc</kbd> close
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
              ↺ Reset to Auto
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
