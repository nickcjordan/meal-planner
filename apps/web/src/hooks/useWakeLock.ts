import { useEffect, useRef, useSyncExternalStore } from "react";

const isSupported = typeof navigator !== "undefined" && "wakeLock" in navigator;

export function useWakeLock() {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const listenersRef = useRef(new Set<() => void>());
  const activeRef = useRef(false);

  function subscribe(listener: () => void) {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }

  function getSnapshot() {
    return activeRef.current;
  }

  const isActive = useSyncExternalStore(subscribe, getSnapshot, () => false);

  useEffect(() => {
    if (!isSupported) return;

    function notify() {
      for (const listener of listenersRef.current) listener();
    }

    async function acquire() {
      try {
        sentinelRef.current = await navigator.wakeLock.request("screen");
        sentinelRef.current.addEventListener("release", () => {
          sentinelRef.current = null;
          activeRef.current = false;
          notify();
        });
        activeRef.current = true;
        notify();
      } catch {
        activeRef.current = false;
        notify();
      }
    }

    acquire();

    function handleVisibility() {
      if (document.visibilityState === "visible" && !sentinelRef.current) {
        acquire();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      sentinelRef.current?.release();
      sentinelRef.current = null;
      activeRef.current = false;
    };
  }, []);

  return { isActive, isSupported };
}
