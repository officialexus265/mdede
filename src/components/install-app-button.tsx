import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari's own flag for "launched from home screen"
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * Chrome only fires `beforeinstallprompt` once its own engagement heuristics
 * are satisfied (repeat visits, time on site, valid manifest + icons + SW).
 * Rather than rely on users noticing the small omnibox icon, we capture that
 * event the moment it's available and surface an explicit "Install app"
 * button so the invitation is obvious. Renders nothing until the browser
 * says installation is actually possible, and nothing once installed.
 */
export function InstallAppButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone()) setInstalled(true);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || !deferred) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        void deferred.prompt().then(() => {
          // The prompt can only be used once; clear it either way.
          setDeferred(null);
        });
      }}
    >
      <Download className="size-4" />
      Install app
    </Button>
  );
}
