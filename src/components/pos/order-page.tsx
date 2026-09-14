import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Minus,
  Plus,
  Printer,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/money";
import {
  canClosePayments,
  canDiscount,
  canVoid,
  canViewAllOrders,
} from "@/lib/permissions";
import { kitchenTicketHtml, printHtml, receiptHtml } from "@/lib/print";
import { useOfflineQueue } from "@/lib/offline-queue";
import { listMenu } from "@/lib/server/menu";
import {
  addOrderItem,
  applyDiscount,
  cancelEmptyOrder,
  getFloor,
  getOrder,
  getRestaurant,
  markKitchenPrinted,
  mergeOrders,
  moveOrder,
  removeOrderItem,
  requestBill,
  setOrderNotes,
  splitOrder,
  updateOrderItemQty,
  voidOrder,
  voidOrderItem,
} from "@/lib/server/pos";
import type { MenuItem, ModifierOption, Order, OrderItem, Restaurant } from "@/lib/types";
import { useStaffSession } from "@/store/session";
import { PaymentDialog } from "./payment-dialog";
import { Skeleton } from "../ui/skeleton";

export function OrderPage({ orderId }: { orderId: number }) {
  const token = useStaffSession((s) => s.token);
  const staff = useStaffSession((s) => s.staff);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<number | "specials" | "all">("all");
  const [pendingItem, setPendingItem] = useState<MenuItem | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [tools, setTools] = useState<"move" | "merge" | "split" | "discount" | "void" | null>(null);

  const restaurantQ = useQuery({ queryKey: ["restaurant"], queryFn: () => getRestaurant() });
  const orderQ = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => getOrder({ data: { token, orderId } }),
    enabled: !!token,
  });
  const menuQ = useQuery({
    queryKey: ["menu"],
    queryFn: () => listMenu({ data: { token } }),
    enabled: !!token,
  });
  const floorQ = useQuery({
    queryKey: ["floor"],
    queryFn: () => getFloor({ data: { token } }),
    enabled: !!token,
  });

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["order", orderId] });
    await qc.invalidateQueries({ queryKey: ["floor"] });
    await qc.invalidateQueries({ queryKey: ["orders"] });
    await qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const add = useMutation({
    mutationFn: (payload: {
      menuItemId: number;
      quantity: number;
      notes?: string;
      modifiers?: { name: string; extraPrice: number }[];
    }) => addOrderItem({ data: { token, orderId, ...payload } }),
    onSuccess: () => {
      void refresh();
      setPendingItem(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Offline support (scoped): adding an item to the order is the one write
  // that's safe to queue blind — it's additive and the kitchen ticket isn't
  // printed until the waiter is back online and hits "Send to kitchen".
  // Payments, voids, discounts, etc. are NOT queued — those need a live
  // connection so staff see the real result (see `offline-queue.ts`).
  const offlineQueue = useOfflineQueue<{
    orderId: number;
    menuItemId: number;
    quantity: number;
    notes?: string;
    modifiers?: { name: string; extraPrice: number }[];
    displayName: string;
    displayPrice: number;
  }>({
    storageKey: `mdede:offline-order-items:${orderId}`,
    send: async (q) => {
      await addOrderItem({
        data: {
          token,
          orderId: q.orderId,
          menuItemId: q.menuItemId,
          quantity: q.quantity,
          notes: q.notes,
          modifiers: q.modifiers,
        },
      });
    },
    onSynced: () => void refresh(),
  });

  const order = orderQ.data;
  const restaurant = restaurantQ.data;
  const categories = menuQ.data ?? [];
  const items = useMemo(() => categories.flatMap((c) => c.items), [categories]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (cat === "specials" && !i.isSpecial) return false;
      if (typeof cat === "number" && i.categoryId !== cat) return false;
      if (q && !`${i.name} ${i.description} ${i.categoryName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, cat, query]);

  if (orderQ.isPending || !order || !restaurant || !staff) {
    return (
      <div className="grid gap-3 p-4 md:grid-cols-[1fr_22rem]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const locked = order.status === "paid" || order.status === "voided";
  const currency = restaurant.currency;

  function pickItem(item: MenuItem) {
    if (locked) return;
    if (item.soldOut) {
      toast.error(`${item.name} is 86'd`);
      return;
    }
    if (item.modifiers.some((m) => m.required) || item.modifiers.length) {
      setPendingItem(item);
      return;
    }
    if (!offlineQueue.isOnline) {
      offlineQueue.enqueue({
        orderId,
        menuItemId: item.id,
        quantity: 1,
        displayName: item.name,
        displayPrice: item.price,
      });
      toast.message(`${item.name} queued — will send once back online`);
      return;
    }
    add.mutate({ menuItemId: item.id, quantity: 1 });
  }

  return (
    <div className="grid min-h-0 md:grid-cols-[minmax(0,1fr)_24rem] lg:grid-cols-[minmax(0,1fr)_28rem]">
      <div className="min-w-0 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => void navigate({ to: "/" })}>
            <ArrowLeft />
          </Button>
          <div>
            <h1 className="font-display text-2xl leading-none">Table {order.tableName}</h1>
            <p className="text-xs text-muted-foreground">
              Ticket #{order.orderNumber} · {order.waiterName} · {order.status.replace("_", " ")}
            </p>
          </div>
        </div>

        {!offlineQueue.isOnline ? (
          <div className="mb-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            Offline — new items are saved on this device and will send to the
            kitchen once the connection's back. Payments, voids, and
            discounts need a connection.
          </div>
        ) : offlineQueue.pendingCount > 0 ? (
          <div className="mb-3 rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-muted-foreground">
            Syncing {offlineQueue.pendingCount} queued item
            {offlineQueue.pendingCount === 1 ? "" : "s"}…
          </div>
        ) : null}

        {!locked ? (
          <>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" />
              <Input
                autoFocus
                className="h-12 pl-10"
                placeholder="Search the paper ticket…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              <Chip active={cat === "all"} onClick={() => setCat("all")}>
                All
              </Chip>
              <Chip active={cat === "specials"} onClick={() => setCat("specials")}>
                Specials
              </Chip>
              {categories.map((c) => (
                <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
                  {c.name}
                </Chip>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={item.soldOut}
                  onClick={() => pickItem(item)}
                  className="min-h-24 rounded-xl border border-border bg-card p-3 text-left hover:border-primary disabled:opacity-40"
                >
                  <div className="flex flex-wrap gap-1">
                    {item.isSpecial ? <Badge variant="special">Special</Badge> : null}
                    {item.soldOut ? <Badge variant="warning">86</Badge> : null}
                    {item.lowStock ? <Badge variant="outline">Low</Badge> : null}
                    {item.kind === "drink" ? <Badge variant="outline">Drink</Badge> : null}
                  </div>
                  <p className="mt-1 font-medium leading-tight">{item.name}</p>
                  <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                    {formatMoney(item.price, currency)}
                  </p>
                  {item.stockNote ? <p className="mt-1 text-[11px] text-warning">{item.stockNote}</p> : null}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">This ticket is {order.status} and locked.</p>
        )}
      </div>

      <aside className="border-t border-border bg-card md:border-t-0 md:border-l">
        <Ticket
          order={order}
          restaurant={restaurant}
          currency={currency}
          locked={locked}
          token={token}
          onRefresh={refresh}
          pendingOfflineItems={offlineQueue.queue}
          onPay={() => setPayOpen(true)}
          onPrintKitchen={async () => {
            const unsent = order.items.some((i) => !i.voided && !i.kitchenSent);
            printHtml(kitchenTicketHtml(order, restaurant, !unsent && order.kitchenPrintCount > 0));
            try {
              await markKitchenPrinted({ data: { token, orderId } });
              await refresh();
              toast.success("Kitchen ticket sent");
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
          onBill={async () => {
            try {
              await requestBill({ data: { token, orderId } });
              await refresh();
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
          onTools={setTools}
          canPay={canClosePayments(staff)}
        />
      </aside>

      {pendingItem ? (
        <ModifierDialog
          item={pendingItem}
          currency={currency}
          busy={add.isPending}
          onClose={() => setPendingItem(null)}
          onAdd={(payload) => {
            if (!offlineQueue.isOnline) {
              offlineQueue.enqueue({
                orderId,
                menuItemId: pendingItem.id,
                quantity: payload.quantity,
                notes: payload.notes,
                modifiers: payload.modifiers,
                displayName: pendingItem.name,
                displayPrice: pendingItem.price,
              });
              toast.message(`${pendingItem.name} queued — will send once back online`);
              setPendingItem(null);
              return;
            }
            add.mutate({ menuItemId: pendingItem.id, ...payload });
          }}
        />
      ) : null}

      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        order={order}
        restaurant={restaurant}
        onPaid={(paid) => {
          void refresh();
          printHtml(receiptHtml(paid, restaurant));
        }}
      />

      {tools && floorQ.data ? (
        <ToolsDialog
          kind={tools}
          onClose={() => setTools(null)}
          order={order}
          tables={floorQ.data.tables}
          token={token}
          staffCanDiscount={canDiscount(staff)}
          staffCanVoid={canVoid(staff)}
          staffCanSeeAll={canViewAllOrders(staff)}
          onDone={async () => {
            setTools(null);
            await refresh();
          }}
          onCancelEmpty={async () => {
            await cancelEmptyOrder({ data: { token, orderId } });
            setTools(null);
            void navigate({ to: "/" });
          }}
        />
      ) : null}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 shrink-0 rounded-full px-3 text-sm ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
    >
      {children}
    </button>
  );
}

function Ticket({
  order,
  restaurant,
  currency,
  locked,
  token,
  onRefresh,
  onPay,
  onPrintKitchen,
  onBill,
  onTools,
  canPay,
  pendingOfflineItems,
}: {
  order: Order;
  restaurant: Restaurant;
  currency: string;
  locked: boolean;
  token: string;
  onRefresh: () => Promise<void>;
  onPay: () => void;
  onPrintKitchen: () => void;
  onBill: () => void;
  onTools: (k: "move" | "merge" | "split" | "discount" | "void") => void;
  canPay: boolean;
  pendingOfflineItems: { localId: string; displayName: string; quantity: number; displayPrice: number }[];
}) {
  const live = order.items.filter((i) => !i.voided);
  const [notes, setNotes] = useState(order.notes);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {live.length === 0 ? (
          <p className="text-sm text-muted-foreground">Type the paper pad into the search, then send to kitchen.</p>
        ) : null}
        {live.map((line) => (
          <LineRow
            key={line.id}
            line={line}
            currency={currency}
            locked={locked}
            token={token}
            orderId={order.id}
            onRefresh={onRefresh}
          />
        ))}
        {pendingOfflineItems.map((q) => (
          <div
            key={q.localId}
            className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-warning/50 bg-warning/5 px-3 py-2 text-sm"
          >
            <span>
              {q.quantity}× {q.displayName}{" "}
              <span className="text-xs text-warning">(queued offline)</span>
            </span>
            <span className="tabular-nums">{formatMoney(q.displayPrice * q.quantity, currency)}</span>
          </div>
        ))}
        {!locked ? (
          <Textarea
            value={notes}
            placeholder="Order notes for the kitchen"
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (notes !== order.notes) void setOrderNotes({ data: { token, orderId: order.id, notes } }).then(onRefresh);
            }}
          />
        ) : order.notes ? (
          <p className="text-sm">Note: {order.notes}</p>
        ) : null}
      </div>
      <div className="border-t border-border p-4">
        <Row label="Subtotal" value={formatMoney(order.subtotal, currency)} />
        {order.discountAmount ? (
          <Row label={`Discount (${order.discountReason})`} value={`-${formatMoney(order.discountAmount, currency)}`} />
        ) : null}
        {order.taxAmount ? <Row label={`Tax ${order.taxRate}%`} value={formatMoney(order.taxAmount, currency)} /> : null}
        {order.serviceAmount ? (
          <Row label={`Service ${order.serviceCharge}%`} value={formatMoney(order.serviceAmount, currency)} />
        ) : null}
        <Row label="Total" value={formatMoney(order.total, currency)} strong />
        {!locked ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button size="lg" variant="paper" onClick={onPrintKitchen}>
              <Printer /> Send to kitchen
            </Button>
            <Button size="lg" variant="outline" onClick={onBill}>
              Bill requested
            </Button>
            <Button size="lg" disabled={!canPay} onClick={onPay}>
              Pay
            </Button>
            <Button size="lg" variant="secondary" onClick={() => onTools("discount")}>
              Discount
            </Button>
          </div>
        ) : order.status === "paid" ? (
          <Button className="mt-3 w-full" variant="paper" onClick={() => printHtml(receiptHtml(order, restaurant))}>
            Reprint receipt
          </Button>
        ) : null}
        {!locked ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => onTools("move")}>
              Move table
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onTools("merge")}>
              Merge
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onTools("split")}>
              Split
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onTools("void")}>
              Void
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${strong ? "font-display text-lg" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function LineRow({
  line,
  currency,
  locked,
  token,
  orderId,
  onRefresh,
}: {
  line: OrderItem;
  currency: string;
  locked: boolean;
  token: string;
  orderId: number;
  onRefresh: () => Promise<void>;
}) {
  return (
    <div className={`rounded-lg border border-border p-3 ${line.kitchenSent ? "opacity-90" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {line.quantity}× {line.name}
          </p>
          {line.modifiers.map((m) => (
            <p key={m.id} className="text-xs text-muted-foreground">
              {m.name}
              {m.extraPrice ? ` +${formatMoney(m.extraPrice, currency)}` : ""}
            </p>
          ))}
          {line.notes ? <p className="text-xs text-warning">{line.notes}</p> : null}
          {line.kitchenSent ? <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Sent</p> : null}
        </div>
        <p className="tabular-nums">{formatMoney(line.lineTotal, currency)}</p>
      </div>
      {!locked ? (
        <div className="mt-2 flex items-center gap-2">
          <Button
            size="icon"
            variant="secondary"
            className="size-8"
            onClick={() =>
              void updateOrderItemQty({
                data: { token, orderId, itemId: line.id, quantity: Math.max(1, line.quantity - 1) },
              }).then(onRefresh)
            }
          >
            <Minus />
          </Button>
          <span className="w-6 text-center tabular-nums">{line.quantity}</span>
          <Button
            size="icon"
            variant="secondary"
            className="size-8"
            onClick={() =>
              void updateOrderItemQty({
                data: { token, orderId, itemId: line.id, quantity: line.quantity + 1 },
              }).then(onRefresh)
            }
          >
            <Plus />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="ml-auto size-8"
            onClick={() =>
              void removeOrderItem({ data: { token, orderId, itemId: line.id } })
                .then(onRefresh)
                .catch((e: Error) => toast.error(e.message))
            }
          >
            <Trash2 />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ModifierDialog({
  item,
  currency,
  busy,
  onClose,
  onAdd,
}: {
  item: MenuItem;
  currency: string;
  busy: boolean;
  onClose: () => void;
  onAdd: (p: { quantity: number; notes?: string; modifiers: { name: string; extraPrice: number }[] }) => void;
}) {
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [picked, setPicked] = useState<Record<number, ModifierOption | ModifierOption[]>>({});

  function toggle(modId: number, opt: ModifierOption, required: boolean) {
    setPicked((prev) => {
      const cur = prev[modId];
      if (required) return { ...prev, [modId]: opt };
      const arr = Array.isArray(cur) ? cur : [];
      const exists = arr.some((o) => o.id === opt.id);
      return { ...prev, [modId]: exists ? arr.filter((o) => o.id !== opt.id) : [...arr, opt] };
    });
  }

  function submit() {
    for (const m of item.modifiers) {
      if (m.required && !picked[m.id]) {
        toast.error(`Choose ${m.name}`);
        return;
      }
    }
    const modifiers: { name: string; extraPrice: number }[] = [];
    for (const m of item.modifiers) {
      const val = picked[m.id];
      if (!val) continue;
      const list = Array.isArray(val) ? val : [val];
      for (const o of list) modifiers.push({ name: `${m.name}: ${o.name}`, extraPrice: o.extraPrice });
    }
    onAdd({ quantity: qty, notes, modifiers });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
        </DialogHeader>
        {item.modifiers.map((m) => (
          <div key={m.id} className="mb-4">
            <p className="mb-2 text-sm font-medium">
              {m.name} {m.required ? "*" : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              {m.options.map((o) => {
                const val = picked[m.id];
                const on = m.required
                  ? !Array.isArray(val) && val?.id === o.id
                  : Array.isArray(val) && val.some((x) => x.id === o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => toggle(m.id, o, m.required)}
                    className={`h-10 rounded-full px-3 text-sm ${on ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                  >
                    {o.name}
                    {o.extraPrice ? ` +${formatMoney(o.extraPrice, currency)}` : ""}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <Textarea placeholder="Special notes (print on ticket)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="mt-3 flex items-center gap-3">
          <Button variant="secondary" size="icon" onClick={() => setQty((q) => Math.max(1, q - 1))}>
            <Minus />
          </Button>
          <span className="w-6 text-center tabular-nums">{qty}</span>
          <Button variant="secondary" size="icon" onClick={() => setQty((q) => q + 1)}>
            <Plus />
          </Button>
          <Button className="ml-auto" disabled={busy} onClick={submit}>
            Add to ticket
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ToolsDialog({
  kind,
  onClose,
  order,
  tables,
  token,
  staffCanDiscount,
  staffCanVoid,
  onDone,
  onCancelEmpty,
}: {
  kind: "move" | "merge" | "split" | "discount" | "void";
  onClose: () => void;
  order: Order;
  tables: { id: number; name: string; status: string; order: { id: number; orderNumber: number } | null }[];
  token: string;
  staffCanDiscount: boolean;
  staffCanVoid: boolean;
  staffCanSeeAll: boolean;
  onDone: () => Promise<void>;
  onCancelEmpty: () => Promise<void>;
}) {
  const [tableId, setTableId] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [dtype, setDtype] = useState<"percent" | "fixed">("percent");
  const [dval, setDval] = useState("10");
  const [splitIds, setSplitIds] = useState<number[]>([]);
  const [itemId, setItemId] = useState<number | "">("");

  async function run() {
    try {
      if (kind === "move") {
        if (!tableId) throw new Error("Pick a table.");
        await moveOrder({ data: { token, orderId: order.id, tableId: Number(tableId) } });
      } else if (kind === "merge") {
        const target = tables.find((t) => t.id === Number(tableId))?.order;
        if (!target) throw new Error("Pick an occupied table to merge into.");
        await mergeOrders({ data: { token, sourceOrderId: order.id, targetOrderId: target.id } });
      } else if (kind === "split") {
        if (!tableId || !splitIds.length) throw new Error("Pick items and a free table.");
        await splitOrder({ data: { token, orderId: order.id, itemIds: splitIds, tableId: Number(tableId) } });
      } else if (kind === "discount") {
        await applyDiscount({
          data: {
            token,
            orderId: order.id,
            type: dtype,
            value: Number(dval) || 0,
            reason,
            managerPin: staffCanDiscount ? undefined : pin,
          },
        });
      } else if (kind === "void") {
        if (order.items.filter((i) => !i.voided).length === 0) {
          await onCancelEmpty();
          return;
        }
        if (itemId) {
          await voidOrderItem({
            data: { token, orderId: order.id, itemId: Number(itemId), reason, managerPin: pin },
          });
        } else {
          await voidOrder({ data: { token, orderId: order.id, reason, managerPin: pin } });
        }
      }
      toast.success("Updated");
      await onDone();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const title =
    kind === "move"
      ? "Move table"
      : kind === "merge"
        ? "Merge into another table"
        : kind === "split"
          ? "Split items to a new table"
          : kind === "discount"
            ? "Apply discount"
            : "Void item or ticket";

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {kind === "move" || kind === "merge" || kind === "split" ? (
          <select
            className="h-11 w-full rounded-md border border-input bg-background px-3"
            value={tableId}
            onChange={(e) => setTableId(Number(e.target.value))}
          >
            <option value="">Select table</option>
            {tables
              .filter((t) => (kind === "merge" ? t.status !== "free" && t.order?.id !== order.id : t.status === "free"))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.order ? ` · #${t.order.orderNumber}` : ""}
                </option>
              ))}
          </select>
        ) : null}
        {kind === "split" ? (
          <div className="grid gap-1">
            {order.items
              .filter((i) => !i.voided)
              .map((i) => (
                <label key={i.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={splitIds.includes(i.id)}
                    onChange={(e) =>
                      setSplitIds((p) => (e.target.checked ? [...p, i.id] : p.filter((x) => x !== i.id)))
                    }
                  />
                  {i.quantity}× {i.name}
                </label>
              ))}
          </div>
        ) : null}
        {kind === "discount" ? (
          <div className="grid gap-2">
            <div className="flex gap-2">
              <Button variant={dtype === "percent" ? "default" : "outline"} onClick={() => setDtype("percent")}>
                Percent
              </Button>
              <Button variant={dtype === "fixed" ? "default" : "outline"} onClick={() => setDtype("fixed")}>
                Fixed
              </Button>
            </div>
            <Input value={dval} onChange={(e) => setDval(e.target.value)} />
            <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            {!staffCanDiscount ? (
              <Input placeholder="Manager PIN" value={pin} onChange={(e) => setPin(e.target.value)} />
            ) : null}
          </div>
        ) : null}
        {kind === "void" ? (
          <div className="grid gap-2">
            <select
              className="h-11 w-full rounded-md border border-input bg-background px-3"
              value={itemId}
              onChange={(e) => setItemId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Entire order</option>
              {order.items
                .filter((i) => !i.voided)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
            </select>
            <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            {!staffCanVoid ? (
              <Input placeholder="Manager PIN" value={pin} onChange={(e) => setPin(e.target.value)} />
            ) : null}
          </div>
        ) : null}
        <Button className="mt-3 w-full" onClick={() => void run()}>
          Confirm
        </Button>
      </DialogContent>
    </Dialog>
  );
}
