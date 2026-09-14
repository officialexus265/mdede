import { createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate";
import { ReportsPage } from "@/components/pos/reports-page";

export const Route = createFileRoute("/reports")({ component: ReportsRoute });

function ReportsRoute() {
  return (
    <AppGate>
      <ReportsPage />
    </AppGate>
  );
}
