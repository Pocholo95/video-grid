import type { OutputItem } from "./types";

/** Files selected by the user, in order. */
export const selectedFiles: File[] = [];

/** Processing results keyed by OutputItem.id. */
export const results = new Map<string, OutputItem>();

/** True while processAll() is running. */
export let isProcessing = false;
export const setIsProcessing = (v: boolean) => { isProcessing = v; };

/** Set to true by the Cancel button; cleared at the start of each run. */
export let cancelRequested = false;
export const setCancelRequested = (v: boolean) => { cancelRequested = v; };
