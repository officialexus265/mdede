import { createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate";
import { FloorPage } from "@/components/pos/floor-page";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <AppGate>
      <FloorPage />
    </AppGate>
  );
}
