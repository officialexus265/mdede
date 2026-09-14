import { createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate";
import { MenuPage } from "@/components/pos/menu-page";

export const Route = createFileRoute("/menu")({ component: MenuRoute });

function MenuRoute() {
  return (
    <AppGate>
      <MenuPage />
    </AppGate>
  );
}
