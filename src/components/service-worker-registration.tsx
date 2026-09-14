import { useEffect } from "react";

/**
 * Registers `/sw.js` (see `public/sw.js`) so the app shell (HTML/JS/CSS)
 * keeps loading if the network drops mid-shift — it does NOT intercept
 * writes (POST server functions), so it can't mask a failed order/payment;
 * see `offline-queue.ts` for the actual write-queuing.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // Registration failures (e.g. sandboxed preview iframes that block SW)
    // must never break the app — offline caching is a nice-to-have, not a
    // requirement for the app to function online.
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
