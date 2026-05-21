/**
 * React hook that provides an FFmpegService instance.
 * Creates the service on mount and destroys it on unmount.
 * Returns the service directly (implements IFFmpegService).
 */

import { useEffect, useMemo, useRef } from "react";
import { FFmpegService } from "../services/ffmpeg.service";
import type { IFFmpegService } from "../types/service";

/**
 * Returns a stable FFmpegService instance that implements IFFmpegService.
 * The service is destroyed when the component unmounts.
 */
export function useFFmpegService(): IFFmpegService {
  const serviceRef = useRef<FFmpegService | null>(null);

  const service = useMemo(() => {
    if (!serviceRef.current) {
      serviceRef.current = new FFmpegService();
    }
    return serviceRef.current;
  }, []);

  // Clean up FFmpeg resources when the component unmounts
  useEffect(() => {
    const s = serviceRef.current;
    return () => {
      s?.destroy();
    };
  }, []);

  return service;
}
