import { useEffect, useRef } from "react";
import type { RgbConfig } from "../types";

export function useDebouncedSave(config: RgbConfig | null, save: (config: RgbConfig) => void, delay = 400) {
  const snapshot = useRef<string>("");
  useEffect(() => {
    if (!config) return;
    const current = JSON.stringify(config);
    if (snapshot.current === "") {
      snapshot.current = current;
      return;
    }
    if (current === snapshot.current) return;
    const timer = window.setTimeout(() => {
      snapshot.current = current;
      save(config);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [config]);
}
