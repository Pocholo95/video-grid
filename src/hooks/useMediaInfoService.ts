/**
 * React hook that provides a MediaInfoService instance.
 * Creates the service on mount and destroys it on unmount.
 * Returns the service directly (implements IMediaInfoService).
 */

import { useEffect, useMemo, useRef } from "react";
import { MediaInfoService } from "../services/mediainfo.service";
import type { IMediaInfoService } from "../types/service";

/**
 * Returns a stable MediaInfoService instance that implements IMediaInfoService.
 * The service is destroyed when the component unmounts.
 */
export function useMediaInfoService(): IMediaInfoService {
  const serviceRef = useRef<MediaInfoService | null>(null);

  const service = useMemo(() => {
    if (!serviceRef.current) {
      serviceRef.current = new MediaInfoService();
    }
    return serviceRef.current;
  }, []);

  // Clean up MediaInfo resources when the component unmounts
  useEffect(() => {
    const s = serviceRef.current;
    return () => {
      s?.destroy();
    };
  }, []);

  return service;
}
