import { createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate";
import { StaffPage } from "@/components/pos/staff-page";

export const Route = createFileRoute("/staff")({ component: StaffRoute });

function StaffRoute() {
  return (
    <AppGate>
      <StaffPage />
    </AppGate>
  );
}
