import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/money";
import { downloadCsv, printReport } from "@/lib/print";
import { closeShift, getOpenShift, getRestaurant } from "@/lib/server/pos";
import type { Restaurant } from "@/lib/types";
import {
  getCategoryReport,
  getDashboard,
  getDiscountVoidReport,
  getEodReport,
  getItemReport,
  getPaymentReport,
  getSalesReport,
  getWaiterReport,
} from "@/lib/server/reports";
import { useStaffSession } from "@/store/session";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function ReportsPage() {
  const token = useStaffSession((s) => s.token);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const range = { token, from, to };
  const restaurantQ = useQuery({
  queryKey: ["restaurant"],
  queryFn: async () => (await getRestaurant()) ?? undefined,
});
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard({ data: { token } }), enabled: !!token });
  const sales = useQuery({ queryKey: ["rpt-sales", from, to], queryFn: () => getSalesReport({ data: range }), enabled: !!token });
  const waiters = useQuery({ queryKey: ["rpt-waiter", from, to], queryFn: () => getWaiterReport({ data: range }), enabled: !!token });
  const items = useQuery({ queryKey: ["rpt-item", from, to], queryFn: () => getItemReport({ data: range }), enabled: !!token });
  const cats = useQuery({ queryKey: ["rpt-cat", from, to], queryFn: () => getCategoryReport({ data: range }), enabled: !!token });
  const pays = useQuery({ queryKey: ["rpt-pay", from, to], queryFn: () => getPaymentReport({ data: range }), enabled: !!token });
  const voids = useQuery({ queryKey: ["rpt-void", from, to], queryFn: () => getDiscountVoidReport({ data: range }), enabled: !!token });
  const eod = useQuery({ queryKey: ["eod"], queryFn: () => getEodReport({ data: { token } }), enabled: !!token });
  const shift = useQuery({ queryKey: ["shift"], queryFn: () => getOpenShift({ data: { token } }), enabled: !!token });
  const currency = restaurantQ.data?.currency ?? "UGX";
  const [cash, setCash] = useState("");
  const close = useMutation({
    mutationFn: () => closeShift({ data: { token, declaredCash: Number(cash) || 0, notes: "" } }),
    onSuccess: () => {
      toast.success("Shift closed. A new shift is open.");
      void eod.refetch();
      void shift.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const salesTotal = useMemo(() => (sales.data ?? []).reduce((s, r) => s + r.sales, 0), [sales.data]);

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Reports</h1>
          <p className="text-sm text-muted-foreground">Balancing, waiters, items, and payment mix.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" className="h-10 w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" className="h-10 w-40" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button variant="outline" onClick={() => window.print()}>
            Print / PDF
          </Button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Today sales" value={formatMoney(dash.data?.todaySales ?? 0, currency)} />
        <Tile label="Tickets" value={String(dash.data?.todayOrders ?? 0)} />
        <Tile label="Avg ticket" value={formatMoney(dash.data?.averageTicket ?? 0, currency)} />
        <Tile label="Range sales" value={formatMoney(salesTotal, currency)} />
      </div>

      <Tabs defaultValue="sales" className="mt-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="waiters">Waiters</TabsTrigger>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="voids">Discounts / voids</TabsTrigger>
          <TabsTrigger value="eod">End of day</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-4">
          <ChartBlock data={(sales.data ?? []).map((r) => ({ name: r.day.slice(5), total: r.sales }))} />
          <Table
            rows={sales.data ?? []}
            onExport={() => downloadCsv("sales.csv", sales.data ?? [])}
            title="Sales report"
            restaurant={restaurantQ.data}
            cols={[
              ["day", "Day"],
              ["orders", "Orders"],
              ["sales", "Sales"],
              ["discounts", "Discounts"],
              ["tax", "Tax"],
            ]}
            money={["sales", "discounts", "tax"]}
            currency={currency}
          />
        </TabsContent>
        <TabsContent value="waiters" className="mt-4">
          <Table
            rows={waiters.data ?? []}
            onExport={() => downloadCsv("waiters.csv", waiters.data ?? [])}
            title="Sales by waiter"
            restaurant={restaurantQ.data}
            cols={[
              ["waiterName", "Waiter"],
              ["orders", "Orders"],
              ["sales", "Sales"],
              ["avgTicket", "Avg ticket"],
            ]}
            money={["sales", "avgTicket"]}
            currency={currency}
          />
        </TabsContent>
        <TabsContent value="items" className="mt-4">
          <Table
            rows={items.data ?? []}
            onExport={() => downloadCsv("items.csv", items.data ?? [])}
            title="Sales by item"
            restaurant={restaurantQ.data}
            cols={[
              ["name", "Item"],
              ["category", "Category"],
              ["kind", "Kind"],
              ["qty", "Qty"],
              ["sales", "Sales"],
            ]}
            money={["sales"]}
            currency={currency}
          />
        </TabsContent>
        <TabsContent value="categories" className="mt-4">
          <Table
            rows={cats.data ?? []}
            onExport={() => downloadCsv("categories.csv", cats.data ?? [])}
            title="Sales by category"
            restaurant={restaurantQ.data}
            cols={[
              ["category", "Category"],
              ["kind", "Kind"],
              ["qty", "Qty"],
              ["sales", "Sales"],
            ]}
            money={["sales"]}
            currency={currency}
          />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <Table
            rows={pays.data ?? []}
            onExport={() => downloadCsv("payments.csv", pays.data ?? [])}
            title="Payment method breakdown"
            restaurant={restaurantQ.data}
            cols={[
              ["method", "Method"],
              ["count", "Count"],
              ["total", "Total"],
              ["change", "Change given"],
            ]}
            money={["total", "change"]}
            currency={currency}
          />
        </TabsContent>
        <TabsContent value="voids" className="mt-4">
          <h3 className="mb-2 font-medium">Discounts</h3>
          <Table
            rows={voids.data?.discounts ?? []}
            onExport={() => downloadCsv("discounts.csv", voids.data?.discounts ?? [])}
            title="Discounts report"
            restaurant={restaurantQ.data}
            cols={[
              ["orderNumber", "Ticket"],
              ["tableName", "Table"],
              ["amount", "Amount"],
              ["reason", "Reason"],
              ["by", "By"],
            ]}
            money={["amount"]}
            currency={currency}
          />
          <h3 className="mt-6 mb-2 font-medium">Voids</h3>
          <Table
            rows={voids.data?.voids ?? []}
            onExport={() => downloadCsv("voids.csv", voids.data?.voids ?? [])}
            title="Voids report"
            restaurant={restaurantQ.data}
            cols={[
              ["orderNumber", "Ticket"],
              ["itemName", "Item"],
              ["quantity", "Qty"],
              ["reason", "Reason"],
              ["by", "By"],
            ]}
            money={[]}
            currency={currency}
          />
        </TabsContent>
        <TabsContent value="eod" className="mt-4">
          {eod.data ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-display text-xl">Shift balancing</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Opened by {eod.data.shift.openedByName} · {new Date(eod.data.shift.openedAt).toLocaleString()}
                </p>
                <div className="mt-4 grid gap-2 text-sm">
                  <Row k="Paid tickets" v={String(eod.data.tickets)} />
                  <Row k="Sales" v={formatMoney(eod.data.sales, currency)} />
                  <Row k="Tax" v={formatMoney(eod.data.tax, currency)} />
                  <Row k="Service" v={formatMoney(eod.data.service, currency)} />
                  <Row k="Discounts" v={formatMoney(eod.data.discounts, currency)} />
                  <Row k="Voids" v={`${eod.data.voids} / ${formatMoney(eod.data.voidsValue, currency)}`} />
                  <Row k="Expected cash" v={formatMoney(eod.data.expectedCash, currency)} />
                  <Row
                    k="Declared cash"
                    v={eod.data.declaredCash == null ? "—" : formatMoney(eod.data.declaredCash, currency)}
                  />
                  <Row
                    k="Variance"
                    v={eod.data.variance == null ? "—" : formatMoney(eod.data.variance, currency)}
                  />
                </div>
                {eod.data.methods.map((m) => (
                  <Row key={m.name} k={m.name} v={formatMoney(m.total, currency)} />
                ))}
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-display text-xl">Declare cash & close</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Count the drawer, then close. A new shift opens automatically.
                  {shift.data ? ` Current shift opened ${new Date(shift.data.openedAt).toLocaleString()}.` : ""}
                </p>
                <Input
                  className="mt-4"
                  inputMode="numeric"
                  placeholder="Actual cash in drawer"
                  value={cash}
                  onChange={(e) => setCash(e.target.value)}
                />
                <Button className="mt-3 w-full" disabled={close.isPending} onClick={() => close.mutate()}>
                  Close shift
                </Button>
                <Button
                  className="mt-2 w-full"
                  variant="outline"
                  disabled={!restaurantQ.data}
                  onClick={() =>
                    restaurantQ.data &&
                    printReport(
                      "End of day balancing",
                      restaurantQ.data,
                      [
                        { key: "name", label: "Method" },
                        { key: "total", label: "Total", align: "right" },
                      ],
                      (eod.data?.methods ?? []).map((m) => ({
                        name: m.name,
                        total: formatMoney(m.total, currency),
                      })),
                      `Shift opened by ${eod.data?.shift.openedByName ?? ""}`,
                    )
                  }
                >
                  Print / PDF
                </Button>
                <Button className="mt-2 w-full" variant="outline" onClick={() => downloadCsv("eod.csv", eod.data?.methods ?? [])}>
                  Export methods CSV
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No shift data yet.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-2 font-display text-2xl tabular-nums">{value}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}

function ChartBlock({ data }: { data: { name: string; total: number }[] }) {
  if (!data.length) return null;
  return (
    <div className="mb-4 h-56 rounded-xl border border-border bg-card p-3">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke="rgba(243,236,228,0.08)" vertical={false} />
          <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={12} />
          <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
          <Tooltip
            contentStyle={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              color: "var(--color-foreground)",
            }}
          />
          <Bar dataKey="total" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Table({
  rows,
  cols,
  money,
  currency,
  onExport,
  title,
  restaurant,
}: {
  rows: Record<string, unknown>[];
  cols: [string, string][];
  money: string[];
  currency: string;
  onExport: () => void;
  title: string;
  restaurant?: Restaurant;
}) {
  const handlePdf = () => {
    if (!restaurant) return;
    const columns = cols.map(([key, label]) => ({
      key,
      label,
      align: money.includes(key) ? ("right" as const) : ("left" as const),
    }));
    const formatted = rows.map((r) => {
      const out: Record<string, unknown> = { ...r };
      for (const key of money) out[key] = formatMoney(Number(r[key]) || 0, currency);
      return out;
    });
    printReport(title, restaurant, columns, formatted);
  };
  return (
    <div>
      <div className="mb-2 flex justify-end gap-2">
        <Button size="sm" variant="outline" disabled={!restaurant} onClick={handlePdf}>
          Print / PDF
        </Button>
        <Button size="sm" variant="outline" onClick={onExport}>
          Excel CSV
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-secondary text-muted-foreground">
            <tr>
              {cols.map(([k, l]) => (
                <th key={k} className="px-3 py-2 font-medium">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border">
                {cols.map(([k]) => (
                  <td key={k} className="px-3 py-2 tabular-nums">
                    {money.includes(k) ? formatMoney(Number(r[k]) || 0, currency) : String(r[k] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="p-4 text-sm text-muted-foreground">No rows in this range.</p> : null}
      </div>
    </div>
  );
}
