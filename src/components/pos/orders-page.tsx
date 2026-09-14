import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { canViewAllOrders } from "@/lib/permissions";
import { getRestaurant, listOrders } from "@/lib/server/pos";
import { useStaffSession } from "@/store/session";

export function OrdersPage() {
  const token = useStaffSession((s) => s.token);
  const staff = useStaffSession((s) => s.staff);
  const [scope, setScope] = useState<"open" | "today" | "all">("open");
  const navigate = useNavigate();
  const restaurantQ = useQuery({ queryKey: ["restaurant"], queryFn: () => getRestaurant() });
  const orders = useQuery({
    queryKey: ["orders", scope],
    queryFn: () => listOrders({ data: { token, scope } }),
    enabled: !!token,
  });
  const currency = restaurantQ.data?.currency ?? "UGX";

  return (
    <div className="p-4 md:p-6">
      <h1 className="font-display text-3xl">Orders</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {staff && !canViewAllOrders(staff) ? "Your tickets" : "Live book"}
      </p>
      <div className="mt-4 flex gap-2">
        {(["open", "today", "all"] as const).map((s) => (
          <Button key={s} variant={scope === s ? "default" : "outline"} size="sm" onClick={() => setScope(s)}>
            {s === "open" ? "Open" : s === "today" ? "Today" : "Recent"}
          </Button>
        ))}
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-secondary text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Table</th>
              <th className="px-3 py-2 font-medium">Waiter</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Total</th>
              <th className="px-3 py-2 font-medium">Entered</th>
            </tr>
          </thead>
          <tbody>
            {(orders.data ?? []).map((o) => (
              <tr
                key={o.id}
                className="cursor-pointer border-t border-border hover:bg-accent/40"
                onClick={() => void navigate({ to: "/order/$orderId", params: { orderId: String(o.id) } })}
              >
                <td className="px-3 py-3 tabular-nums">{o.orderNumber}</td>
                <td className="px-3 py-3">{o.tableName}</td>
                <td className="px-3 py-3">{o.waiterName}</td>
                <td className="px-3 py-3">
                  <Badge
                    variant={
                      o.status === "paid" ? "success" : o.status === "voided" ? "outline" : o.status === "bill_requested" ? "warning" : "primary"
                    }
                  >
                    {o.status.replace("_", " ")}
                  </Badge>
                </td>
                <td className="px-3 py-3 tabular-nums">{formatMoney(o.total, currency)}</td>
                <td className="px-3 py-3 text-muted-foreground tabular-nums">
                  {new Date(o.enteredAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.data?.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No orders in this view.</p> : null}
      </div>
    </div>
  );
}
