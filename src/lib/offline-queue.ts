import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A small, generic offline write-queue for React Query mutations.
 *
 * Scope (deliberate): this queues WRITES that are safe to retry blind and
 * don't need a human to see the result before the next step — e.g. "add this
 * item to the order". It is intentionally NOT used for payments, voids,
 * discounts, or shift-close: those move money or need an authorizer to see a
 * live result, so they correctly fail fast and ask the staff member to wait
 * for a connection rather than silently queuing.
 *
 * Storage is `localStorage` (not IndexedDB) — restaurant order volume is
 * small (a few dozen queued items at most between connectivity blips), so a
 * simple JSON blob keeps this easy to reason about and debug.
 *
 * Every queued item needs a stable `localId` so the UI can render it
 * optimistically and reconcile/dedupe once the real write lands.
 */

export type QueuedWrite<T> = T & { localId: string; queuedAt: string };

function readStorage<T>(key: string): QueuedWrite<T>[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupt/unavailable storage should never crash order entry.
    return [];
  }
}

function writeStorage<T>(key: string, items: QueuedWrite<T>[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Storage full/unavailable (e.g. private browsing) — queue just won't
    // survive a reload; the in-memory copy still works for this session.
  }
}

function makeLocalId() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useOfflineQueue<T>(options: {
  /** localStorage key — include the entity id if this is per-order/per-user. */
  storageKey: string;
  /** Performs the real write. Throwing leaves the item queued for next flush. */
  send: (item: T) => Promise<void>;
  /** Called after an item is successfully synced (e.g. to refetch a list). */
  onSynced?: (item: QueuedWrite<T>) => void;
}) {
  const { storageKey, send, onSynced } = options;
  const [queue, setQueue] = useState<QueuedWrite<T>[]>(() => readStorage<T>(storageKey));
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  // Avoids overlapping flushes (e.g. an 'online' event firing mid-flush).
  const flushing = useRef(false);
  // Keep the latest callbacks without re-subscribing the online/offline
  // listeners or re-running the auto-flush effect every render.
  const sendRef = useRef(send);
  sendRef.current = send;
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const enqueue = useCallback(
    (item: T) => {
      const queued: QueuedWrite<T> = {
        ...item,
        localId: makeLocalId(),
        queuedAt: new Date().toISOString(),
      };
      setQueue((prev) => {
        const next = [...prev, queued];
        writeStorage(storageKey, next);
        return next;
      });
      return queued;
    },
    [storageKey],
  );

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      // Sequential, in queued order — a table's items should hit the kitchen
      // in the order the waiter entered them, and stopping at the first
      // failure (rather than skipping it) avoids items landing out of order.
      while (true) {
        const current = readStorage<T>(storageKey);
        const next = current[0];
        if (!next) break;
        try {
          await sendRef.current(next);
        } catch {
          // Still offline, or the server rejected it — stop here and retry
          // the whole remaining queue on the next flush (next reconnect,
          // manual retry, or periodic tick).
          break;
        }
        const remaining = readStorage<T>(storageKey).filter((i) => i.localId !== next.localId);
        writeStorage(storageKey, remaining);
        setQueue(remaining);
        onSyncedRef.current?.(next);
      }
    } finally {
      flushing.current = false;
    }
  }, [storageKey]);

  // Auto-flush on reconnect, and poll gently in case the 'online' event
  // doesn't fire (e.g. flaky wifi that never fully drops the OS-level link).
  useEffect(() => {
    if (!isOnline) return;
    void flush();
    const id = window.setInterval(() => void flush(), 15_000);
    return () => window.clearInterval(id);
  }, [isOnline, flush]);

  const removeLocal = useCallback(
    (localId: string) => {
      setQueue((prev) => {
        const next = prev.filter((i) => i.localId !== localId);
        writeStorage(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  return { queue, isOnline, enqueue, flush, removeLocal, pendingCount: queue.length };
}
