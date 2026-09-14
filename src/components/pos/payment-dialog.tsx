import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/money";
import { kitchenTicketHtml, printHtml, receiptHtml } from "@/lib/print";
import { listPaymentMethods, payOrder } from "@/lib/server/pos";
import type { Order, Restaurant } from "@/lib/types";
import { useStaffSession } from "@/store/session";

type Line = { methodId: number; amount: string; tendered: string };

export function PaymentDialog({
  open,
  onOpenChange,
  order,
  restaurant,
  onPaid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: Order;
  restaurant: Restaurant;
  onPaid: (order: Order) => void;
}) {
  const token = useStaffSession((s) => s.token);
  const methods = useQuery({
    queryKey: ["pay-methods"],
    queryFn: () => listPaymentMethods({ data: { token } }),
    enabled: open && !!token,
  });
  const active = (methods.data ?? []).filter((m) => m.active);
  const cash = active.find((m) => m.kind === "cash");
  const [lines, setLines] = useState<Line[]>([]);

  const remaining = useMemo(() => {
    const paid = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    return Math.max(0, order.total - paid);
  }, [lines, order.total]);

  useEffect(() => {
    if (!open) return;
    if (lines.length) return;
    if (cash) {
      setLines([{ methodId: cash.id, amount: String(order.total), tendered: String(order.total) }]);
    } else if (active[0]) {
      setLines([{ methodId: active[0].id, amount: String(order.total), tendered: "" }]);
    }
  }, [open, cash, active, lines.length, order.total]);

  const pay = useMutation({
    mutationFn: () =>
      payOrder({
        data: {
          token,
          orderId: order.id,
          payments: lines
            .map((l) => ({
              methodId: l.methodId,
              amount: Number(l.amount) || 0,
              tendered: Number(l.tendered) || 0,
            }))
            .filter((p) => p.amount > 0),
        },
      }),
    onSuccess: (paid) => {
      if (paid) {
        printHtml(receiptHtml(paid, restaurant));
        onPaid(paid);
        onOpenChange(false);
        toast.success(`Order #${paid.orderNumber} paid`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) setLines([]);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Close table {order.tableName}</DialogTitle>
        </DialogHeader>
        <p className="font-display text-3xl tabular-nums">{formatMoney(order.total, restaurant.currency)}</p>
        <p className="text-sm text-muted-foreground">
          Remaining {formatMoney(remaining, restaurant.currency)}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {active.map((m) => (
            <Button
              key={m.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setLines((prev) => [
                  ...prev,
                  { methodId: m.id, amount: String(remaining || order.total), tendered: m.kind === "cash" ? String(remaining || order.total) : "" },
                ])
              }
            >
              + {m.name}
            </Button>
          ))}
        </div>

        <div className="mt-4 grid gap-3">
          {lines.map((line, idx) => {
            const method = active.find((m) => m.id === line.methodId);
            const amount = Number(line.amount) || 0;
            const tendered = Number(line.tendered) || 0;
            const change = method?.kind === "cash" ? Math.max(0, tendered - amount) : 0;
            return (
              <div key={idx} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{method?.name ?? "Method"}</p>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground"
                    onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-xs text-muted-foreground">
                    Amount
                    <Input
                      inputMode="numeric"
                      value={line.amount}
                      onChange={(e) =>
                        setLines((p) => p.map((l, i) => (i === idx ? { ...l, amount: e.target.value } : l)))
                      }
                    />
                  </label>
                  {method?.kind === "cash" ? (
                    <label className="grid gap-1 text-xs text-muted-foreground">
                      Tendered
                      <Input
                        inputMode="numeric"
                        value={line.tendered}
                        onChange={(e) =>
                          setLines((p) => p.map((l, i) => (i === idx ? { ...l, tendered: e.target.value } : l)))
                        }
                      />
                    </label>
                  ) : (
                    <div />
                  )}
                </div>
                {method?.kind === "cash" ? (
                  <p className="mt-2 text-sm tabular-nums">Change {formatMoney(change, restaurant.currency)}</p>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <Button size="xl" disabled={pay.isPending || remaining > 0 || !lines.length} onClick={() => pay.mutate()}>
            {pay.isPending ? "Closing…" : "Take payment & lock order"}
          </Button>
          <Button
            variant="outline"
            onClick={() => printHtml(kitchenTicketHtml(order, restaurant, true))}
          >
            Reprint kitchen ticket
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
