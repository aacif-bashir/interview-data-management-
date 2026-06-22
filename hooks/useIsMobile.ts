"use client";

import { useEffect, useState } from "react";

/** Tailwind's `md` breakpoint — below this we render the single-view layout. */
const MOBILE_QUERY = "(max-width: 767px)";

/**
 * Tracks whether the viewport is below Tailwind's `md` breakpoint. Returns
 * `false` on the server / first paint (desktop-first) and syncs to the real
 * match after mount, so the desktop resizable layout is the SSR default.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return isMobile;
}
