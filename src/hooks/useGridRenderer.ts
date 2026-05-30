/**
 * useGridRenderer Hook
 *
 * Provides the GridRenderer service instance to React components.
 * The GridRenderer depends on IFFmpegService which is obtained via useFFmpegService.
 */

import { useMemo } from "react";
import { createGridRenderer } from "../services/gridRenderer.service";
import { useFFmpegService } from "./useFFmpegService";

export function useGridRenderer() {
  const ffmpegService = useFFmpegService();

  const gridRenderer = useMemo(
    () => createGridRenderer(ffmpegService),
    [ffmpegService],
  );

  return gridRenderer;
}
