"use client";
import { useSyncExternalStore } from "react";

/** true khi media query khớp (VD "(min-width: 768px)"). Trên server luôn trả false. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
