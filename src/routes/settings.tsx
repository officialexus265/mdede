import { createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate";
import { SettingsPage } from "@/components/pos/settings-page";

export const Route = createFileRoute("/settings")({ component: SettingsRoute });

function SettingsRoute() {
  return (
    <AppGate>
      <SettingsPage />
    </AppGate>
  );
}
