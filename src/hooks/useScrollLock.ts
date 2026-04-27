import { useEffect } from "react";

/**
 * Locks body scroll while the modal is active by setting `overflow: hidden`
 * on `document.body`. Restores the previous value on cleanup so nested or
 * sequential modals don't permanently clear the style.
 *
 * @param active - Whether the lock should be applied. Defaults to `true`.
 */
export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}
