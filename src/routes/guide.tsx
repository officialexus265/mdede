import { createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate";
import { GuidePage } from "@/components/pos/guide-page";

export const Route = createFileRoute("/guide")({ component: GuideRoute });

function GuideRoute() {
  return (
    <AppGate>
      <GuidePage />
    </AppGate>
  );
}
