import { useEffect, useState } from "react";

/** Re-render periodically so relative time labels stay fresh (default 30s). */
export function useRelativeClock(intervalMs = 30000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
