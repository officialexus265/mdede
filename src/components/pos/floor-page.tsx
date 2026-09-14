import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Banknote,
  Clock,
  LayoutGrid,
  Receipt,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { getFloor, openTable } from "@/lib/server/pos";
import { getDashboard } from "@/lib/server/reports";
import type { DiningTable, TableStatus } from "@/lib/types";
import { useStaffSession } from "@/store/session";
import { Skeleton } from "../ui/skeleton";

const STATUS_STYLE: Record<TableStatus, string> = {
  free: "border-success/30 bg-success/10 hover:border-success",
  occupied: "border-primary/40 bg-primary/10 hover:border-primary",
  bill_requested:
    "border-warning/50 bg-warning/15 hover:border-warning",
};

export function FloorPage() {
  const token = useStaffSession((state) => state.token);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const floor = useQuery({
    queryKey: ["floor"],
    queryFn: () => getFloor({ data: { token } }),
    refetchInterval: 8_000,
    enabled: Boolean(token),
  });

  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => getDashboard({ data: { token } }),
    refetchInterval: 15_000,
    enabled: Boolean(token),
  });

  const openTableMutation = useMutation({
    mutationFn: (tableId: number) =>
      openTable({
        data: {
          token,
          tableId,
        },
      }),

    onSuccess: (order) => {
      void queryClient.invalidateQueries({
        queryKey: ["floor"],
      });

      if (order) {
        void navigate({
          to: "/order/$orderId",
          params: {
            orderId: String(order.id),
          },
        });
      }
    },

    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  if (floor.isPending) {
    return (
      <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton
            key={index}
            className="h-28 rounded-xl"
          />
        ))}
      </div>
    );
  }

  if (floor.isError) {
    return (
      <p className="p-6 text-destructive">
        {floor.error instanceof Error
          ? floor.error.message
          : "Failed to load floor"}
      </p>
    );
  }

  const tables = floor.data.tables;

  const currency =
    floor.data.restaurant?.currency ?? "UGX";

  const zones = [
    ...new Set(
      tables.map((table) => table.zone)
    ),
  ];

  const stats =
    dashboard.data ?? floor.data.stats;

  return (
    <div className="p-4 pb-24 md:p-6">
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={Banknote}
          label="Today's sales"
          value={formatMoney(
            stats.todaySales ?? 0,
            currency
          )}
        />

        <Stat
          icon={Receipt}
          label="Open tickets"
          value={String(
            stats.openOrders ?? 0
          )}
        />

        <Stat
          icon={LayoutGrid}
          label="Free tables"
          value={String(
            "freeTables" in stats
              ? stats.freeTables
              : stats.free
          )}
        />

        <Stat
          icon={Clock}
          label="Bill requested"
          value={String(
            stats.billRequested ??
              floor.data.stats.billRequested
          )}
        />
      </div>

      {zones.map((zone) => {
        const zoneTables = tables.filter(
          (table) => table.zone === zone
        );

        return (
          <section
            key={zone}
            className="mb-8"
          >
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-display text-xl">
                {zone}
              </h2>

              <span className="text-xs text-muted-foreground">
                {zoneTables.length} tables
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {zoneTables.map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  currency={currency}
                  busy={openTableMutation.isPending}
                  onOpen={() =>
                    openTableMutation.mutate(
                      table.id
                    )
                  }
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Banknote;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />

        <span className="text-xs uppercase tracking-wide">
          {label}
        </span>
      </div>

      <p className="mt-2 font-display text-2xl tabular-nums">
        {value}
      </p>
    </div>
  );
}

function TableCard({
  table,
  currency,
  busy,
  onOpen,
}: {
  table: DiningTable;
  currency: string;
  busy: boolean;
  onOpen: () => void;
}) {
  const statusStyle =
    STATUS_STYLE[table.status];

  const badgeVariant =
    table.status === "free"
      ? "success"
      : table.status === "bill_requested"
        ? "warning"
        : "primary";

  const statusLabel =
    table.status === "bill_requested"
      ? "Bill"
      : table.status;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={onOpen}
      className={`min-h-28 rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${statusStyle}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-2xl leading-none">
          {table.name}
        </p>

        <Badge variant={badgeVariant}>
          {statusLabel}
        </Badge>
      </div>

      <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
        <Users className="size-3" />
        {table.seats} seats
      </p>

      {table.order ? (
        <div className="mt-3 text-sm">
          <p className="truncate">
            {table.order.waiterName}
          </p>

          <p className="tabular-nums text-muted-foreground">
            #{table.order.orderNumber} ·{" "}
            {table.order.itemCount} items ·{" "}
            {formatMoney(
              table.order.total,
              currency
            )}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Tap to open ticket
        </p>
      )}
    </button>
  );
}