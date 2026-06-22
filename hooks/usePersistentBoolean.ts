"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * A boolean preference persisted to localStorage. Returns `defaultValue` on the
 * server / first paint (SSR-safe), then syncs to the stored value after mount —
 * so the rendered default matches between server and client.
 */
export function usePersistentBoolean(
  key: string,
  defaultValue: boolean
): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount
      setValue(stored === "true");
    }
  }, [key]);

  const update = useCallback(
    (next: boolean) => {
      setValue(next);
      window.localStorage.setItem(key, String(next));
    },
    [key]
  );

  return [value, update];
}
