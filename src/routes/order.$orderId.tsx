import { createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate";
import { OrderPage } from "@/components/pos/order-page";

export const Route = createFileRoute("/order/$orderId")({ component: OrderRoute });

function OrderRoute() {
  const { orderId } = Route.useParams();
  return (
    <AppGate>
      <OrderPage orderId={Number(orderId)} />
    </AppGate>
  );
}
