import { createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate";
import { OrdersPage } from "@/components/pos/orders-page";

export const Route = createFileRoute("/orders")({ component: OrdersRoute });

function OrdersRoute() {
  return (
    <AppGate>
      <OrdersPage />
    </AppGate>
  );
}
