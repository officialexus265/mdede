import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { asInt, asIso } from "@/lib/money";
import { canViewReports } from "@/lib/permissions";
import type { DashboardStats } from "@/lib/types";
import { requireStaff, sqlClient } from "./core";

type Token = { token: string };
type Range = Token & { from: string; to: string };

function dates(from: string, to: string) {
  const a = from.slice(0, 10);
  const b = to.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) {
    throw new Error("Invalid date range.");
  }
  return { a, b };
}

export const getDashboard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    await requireStaff(sql, context.userId, data.token);
    const [sales] = await sql.query<{ sales: unknown; n: unknown; avg: unknown }>(
      `select coalesce(sum(total),0)::int as sales, count(*)::int as n,
              coalesce(avg(total),0)::int as avg
       from orders where user_id=$1 and status='paid' and paid_at::date = current_date`,
      [context.userId],
    );
    const [open] = await sql.query<{ n: unknown }>(
      `select count(*)::int as n from orders where user_id=$1 and status in ('open','bill_requested')`,
      [context.userId],
    );
    const [tables] = await sql.query<{ occ: unknown; free: unknown; bill: unknown }>(
      `select
         (select count(*)::int from dining_tables t where t.user_id=$1 and t.active=true and exists (
            select 1 from orders o where o.table_id=t.id and o.status='open' and o.user_id=$1)) as occ,
         (select count(*)::int from dining_tables t where t.user_id=$1 and t.active=true and not exists (
            select 1 from orders o where o.table_id=t.id and o.status in ('open','bill_requested') and o.user_id=$1)) as free,
         (select count(*)::int from orders o where o.user_id=$1 and o.status='bill_requested') as bill`,
      [context.userId],
    );
    const [disc] = await sql.query<{ d: unknown; v: unknown }>(
      `select coalesce(sum(discount_amount),0)::int as d,
              coalesce(sum(case when status='voided' then subtotal else 0 end),0)::int as v
       from orders where user_id=$1 and entered_at::date = current_date`,
      [context.userId],
    );
    const hours = await sql.query<{ hour: unknown; total: unknown }>(
      `select to_char(date_trunc('hour', paid_at), 'HH24:00') as hour, coalesce(sum(total),0)::int as total
       from orders where user_id=$1 and status='paid' and paid_at::date = current_date
       group by 1 order by 1`,
      [context.userId],
    );
    const mix = await sql.query<{ name: unknown; total: unknown }>(
      `select method_name as name, coalesce(sum(amount),0)::int as total
       from payments p join orders o on o.id=p.order_id
       where p.user_id=$1 and o.status='paid' and o.paid_at::date = current_date
       group by method_name order by total desc`,
      [context.userId],
    );
    const top = await sql.query<{ name: unknown; qty: unknown; total: unknown }>(
      `select i.name, coalesce(sum(i.quantity),0)::int as qty,
              coalesce(sum((i.unit_price + coalesce((select sum(extra_price) from order_item_modifiers m where m.order_item_id=i.id),0)) * i.quantity),0)::int as total
       from order_items i join orders o on o.id=i.order_id
       where i.user_id=$1 and i.voided=false and o.status='paid' and o.paid_at::date = current_date
       group by i.name order by qty desc limit 8`,
      [context.userId],
    );
    const stats: DashboardStats = {
      todaySales: asInt(sales?.sales),
      todayOrders: asInt(sales?.n),
      openOrders: asInt(open?.n),
      occupiedTables: asInt(tables?.occ),
      freeTables: asInt(tables?.free),
      billRequested: asInt(tables?.bill),
      voidsValue: asInt(disc?.v),
      discountsValue: asInt(disc?.d),
      averageTicket: asInt(sales?.avg),
      hourBuckets: hours.map((h) => ({ hour: String(h.hour), total: asInt(h.total) })),
      paymentMix: mix.map((m) => ({ name: String(m.name), total: asInt(m.total) })),
      topItems: top.map((t) => ({ name: String(t.name), qty: asInt(t.qty), total: asInt(t.total) })),
    };
    return stats;
  });

export const getSalesReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Range) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    if (!canViewReports(staff)) throw new Error("Managers only.");
    const { a, b } = dates(data.from, data.to);
    const rows = await sql.query<Record<string, unknown>>(
      `select paid_at::date::text as day, count(*)::int as orders, coalesce(sum(total),0)::int as sales,
              coalesce(sum(discount_amount),0)::int as discounts, coalesce(sum(tax_amount),0)::int as tax
       from orders
       where user_id=$1 and status='paid' and paid_at::date >= $2::date and paid_at::date <= $3::date
       group by 1 order by 1`,
      [context.userId, a, b],
    );
    return rows.map((r) => ({
      day: String(r.day),
      orders: asInt(r.orders),
      sales: asInt(r.sales),
      discounts: asInt(r.discounts),
      tax: asInt(r.tax),
    }));
  });

export const getWaiterReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Range) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    if (!canViewReports(staff)) throw new Error("Managers only.");
    const { a, b } = dates(data.from, data.to);
    const rows = await sql.query<Record<string, unknown>>(
      `select waiter_name, count(*)::int as orders, coalesce(sum(total),0)::int as sales,
              coalesce(avg(total),0)::int as avg_ticket
       from orders
       where user_id=$1 and status='paid' and paid_at::date >= $2::date and paid_at::date <= $3::date
       group by waiter_name order by sales desc`,
      [context.userId, a, b],
    );
    return rows.map((r) => ({
      waiterName: String(r.waiter_name),
      orders: asInt(r.orders),
      sales: asInt(r.sales),
      avgTicket: asInt(r.avg_ticket),
    }));
  });

export const getItemReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Range) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    if (!canViewReports(staff)) throw new Error("Managers only.");
    const { a, b } = dates(data.from, data.to);
    const rows = await sql.query<Record<string, unknown>>(
      `select i.name, i.kind, i.category_name,
              coalesce(sum(i.quantity),0)::int as qty,
              coalesce(sum((i.unit_price) * i.quantity),0)::int as sales
       from order_items i join orders o on o.id=i.order_id
       where i.user_id=$1 and i.voided=false and o.status='paid'
         and o.paid_at::date >= $2::date and o.paid_at::date <= $3::date
       group by i.name, i.kind, i.category_name
       order by qty desc`,
      [context.userId, a, b],
    );
    return rows.map((r) => ({
      name: String(r.name),
      kind: String(r.kind),
      category: String(r.category_name),
      qty: asInt(r.qty),
      sales: asInt(r.sales),
    }));
  });

export const getCategoryReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Range) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    if (!canViewReports(staff)) throw new Error("Managers only.");
    const { a, b } = dates(data.from, data.to);
    const rows = await sql.query<Record<string, unknown>>(
      `select i.category_name, i.kind,
              coalesce(sum(i.quantity),0)::int as qty,
              coalesce(sum(i.unit_price * i.quantity),0)::int as sales
       from order_items i join orders o on o.id=i.order_id
       where i.user_id=$1 and i.voided=false and o.status='paid'
         and o.paid_at::date >= $2::date and o.paid_at::date <= $3::date
       group by i.category_name, i.kind
       order by sales desc`,
      [context.userId, a, b],
    );
    return rows.map((r) => ({
      category: String(r.category_name),
      kind: String(r.kind),
      qty: asInt(r.qty),
      sales: asInt(r.sales),
    }));
  });

export const getPaymentReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Range) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    if (!canViewReports(staff)) throw new Error("Managers only.");
    const { a, b } = dates(data.from, data.to);
    const rows = await sql.query<Record<string, unknown>>(
      `select p.method_name, p.method_kind, count(*)::int as n, coalesce(sum(p.amount),0)::int as total,
              coalesce(sum(p.change_amount),0)::int as change
       from payments p join orders o on o.id=p.order_id
       where p.user_id=$1 and o.status='paid' and o.paid_at::date >= $2::date and o.paid_at::date <= $3::date
       group by p.method_name, p.method_kind
       order by total desc`,
      [context.userId, a, b],
    );
    return rows.map((r) => ({
      method: String(r.method_name),
      kind: String(r.method_kind),
      count: asInt(r.n),
      total: asInt(r.total),
      change: asInt(r.change),
    }));
  });

export const getDiscountVoidReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Range) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    if (!canViewReports(staff)) throw new Error("Managers only.");
    const { a, b } = dates(data.from, data.to);
    const discounts = await sql.query<Record<string, unknown>>(
      `select order_number, table_name, waiter_name, discount_type, discount_value, discount_amount, discount_reason, discount_by, entered_at
       from orders
       where user_id=$1 and discount_amount > 0 and entered_at::date >= $2::date and entered_at::date <= $3::date
       order by entered_at desc`,
      [context.userId, a, b],
    );
    const voids = await sql.query<Record<string, unknown>>(
      `select o.order_number, o.table_name, i.name as item_name, i.quantity, i.void_reason, i.voided_by, i.voided_at
       from order_items i join orders o on o.id=i.order_id
       where i.user_id=$1 and i.voided=true and coalesce(i.voided_at, o.voided_at)::date >= $2::date
         and coalesce(i.voided_at, o.voided_at)::date <= $3::date
       order by i.voided_at desc`,
      [context.userId, a, b],
    );
    return {
      discounts: discounts.map((r) => ({
        orderNumber: asInt(r.order_number),
        tableName: String(r.table_name),
        waiterName: String(r.waiter_name),
        type: String(r.discount_type ?? ""),
        value: asInt(r.discount_value),
        amount: asInt(r.discount_amount),
        reason: String(r.discount_reason ?? ""),
        by: String(r.discount_by ?? ""),
        at: asIso(r.entered_at),
      })),
      voids: voids.map((r) => ({
        orderNumber: asInt(r.order_number),
        tableName: String(r.table_name),
        itemName: String(r.item_name),
        quantity: asInt(r.quantity),
        reason: String(r.void_reason ?? ""),
        by: String(r.voided_by ?? ""),
        at: r.voided_at ? asIso(r.voided_at) : "",
      })),
    };
  });

export const getEodReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token & { shiftId?: number }) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    if (!canViewReports(staff)) throw new Error("Managers only.");
    const [shift] = data.shiftId
      ? await sql.query<Record<string, unknown>>("select * from shifts where id=$1 and user_id=$2", [
          data.shiftId,
          context.userId,
        ])
      : await sql.query<Record<string, unknown>>(
          "select * from shifts where user_id=$1 order by opened_at desc limit 1",
          [context.userId],
        );
    if (!shift) throw new Error("No shift found.");
    const shiftId = asInt(shift.id);
    const paid = await sql.query<Record<string, unknown>>(
      `select * from orders where user_id=$1 and shift_id=$2 and status='paid'`,
      [context.userId, shiftId],
    );
    const mix = await sql.query<{ name: unknown; kind: unknown; total: unknown; change: unknown; tendered: unknown }>(
      `select p.method_name as name, p.method_kind as kind, coalesce(sum(p.amount),0)::int as total,
              coalesce(sum(p.change_amount),0)::int as change, coalesce(sum(p.tendered),0)::int as tendered
       from payments p join orders o on o.id=p.order_id
       where p.user_id=$1 and o.shift_id=$2 and o.status='paid'
       group by p.method_name, p.method_kind`,
      [context.userId, shiftId],
    );
    const cash = mix.find((m) => String(m.kind) === "cash");
    const expectedCash = asInt(cash?.total);
    const declared = shift.declared_cash == null ? null : asInt(shift.declared_cash);
    const voids = await sql.query<{ n: unknown; total: unknown }>(
      `select count(*)::int as n, coalesce(sum(subtotal),0)::int as total from orders where user_id=$1 and shift_id=$2 and status='voided'`,
      [context.userId, shiftId],
    );
    return {
      shift: {
        id: shiftId,
        openedByName: String(shift.opened_by_name),
        closedByName: shift.closed_by_name ? String(shift.closed_by_name) : null,
        openedAt: asIso(shift.opened_at),
        closedAt: shift.closed_at ? asIso(shift.closed_at) : null,
        declaredCash: declared,
        notes: String(shift.notes ?? ""),
        status: String(shift.status),
      },
      tickets: paid.length,
      sales: paid.reduce((s, o) => s + asInt(o.total), 0),
      discounts: paid.reduce((s, o) => s + asInt(o.discount_amount), 0),
      tax: paid.reduce((s, o) => s + asInt(o.tax_amount), 0),
      service: paid.reduce((s, o) => s + asInt(o.service_amount), 0),
      voids: asInt(voids[0]?.n),
      voidsValue: asInt(voids[0]?.total),
      methods: mix.map((m) => ({
        name: String(m.name),
        kind: String(m.kind),
        total: asInt(m.total),
        change: asInt(m.change),
        tendered: asInt(m.tendered),
      })),
      expectedCash,
      declaredCash: declared,
      variance: declared == null ? null : declared - expectedCash,
    };
  });
