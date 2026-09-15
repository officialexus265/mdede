import { createHash, randomBytes } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { asBool, asInt, asIso, asIsoOrNull, computeTotals } from "@/lib/money";
import type {
  DiscountType,
  ItemKind,
  Order,
  OrderEvent,
  OrderItem,
  OrderStatus,
  Payment,
  Restaurant,
  Staff,
  StaffRole,
} from "@/lib/types";

export function hashPin(userId: string, pin: string) {
  return createHash("sha256").update(`mdede:${userId}:${pin}`).digest("hex");
}

export function newToken() {
  return randomBytes(24).toString("hex");
}

export async function sqlClient() {
  return getSql();
}

export function mapRestaurant(row: Record<string, unknown>): Restaurant {
  return {
    userId: String(row.user_id),
    name: String(row.name),
    address: String(row.address ?? ""),
    phone: String(row.phone ?? ""),
    currency: String(row.currency ?? "MWK"),
    timezone: String(row.timezone ?? "Africa/Blantyre"),
    taxRate: asInt(row.tax_rate),
    serviceCharge: asInt(row.service_charge),
    receiptHeader: String(row.receipt_header ?? ""),
    receiptFooter: String(row.receipt_footer ?? ""),
    kitchenPrinter: String(row.kitchen_printer ?? "browser"),
    receiptPrinter: String(row.receipt_printer ?? "browser"),
    nextOrderNumber: asInt(row.next_order_number),
    setupComplete: asBool(row.setup_complete),
    sampleSeeded: asBool(row.sample_seeded),
  };
}

export function mapStaff(row: Record<string, unknown>): Staff {
  return {
    id: asInt(row.id),
    name: String(row.name),
    role: String(row.role) as StaffRole,
    active: asBool(row.active),
    canClosePayments: asBool(row.can_close_payments),
  };
}

export async function getRestaurantRow(sql: Sql, userId: string) {
  const rows = await sql.query<Record<string, unknown>>(
    "select * from restaurants where user_id = $1",
    [userId],
  );
  return rows[0] ? mapRestaurant(rows[0]) : null;
}

export async function requireStaff(sql: Sql, userId: string, token: string) {
  const rows = await sql.query<Record<string, unknown>>(
    `select s.* from staff_sessions ss
     join staff s on s.id = ss.staff_id
     where ss.token = $1 and ss.user_id = $2 and ss.expires_at > now() and s.active = true`,
    [token, userId],
  );
  if (!rows[0]) throw new Error("Staff session expired. Clock in again.");
  return mapStaff(rows[0]);
}

export async function ensureOpenShift(sql: Sql, userId: string, staff: Staff) {
  const open = await sql.query<{ id: number }>(
    "select id from shifts where user_id = $1 and status = 'open' order by opened_at desc limit 1",
    [userId],
  );
  if (open[0]) return asInt(open[0].id);
  const created = await sql.query<{ id: number }>(
    `insert into shifts (user_id, opened_by_staff_id, opened_by_name, status)
     values ($1, $2, $3, 'open') returning id`,
    [userId, staff.id, staff.name],
  );
  return asInt(created[0]?.id);
}

export async function addEvent(
  sql: Sql,
  userId: string,
  orderId: number,
  staff: Staff,
  eventType: string,
  detail = "",
) {
  await sql.query(
    `insert into order_events (user_id, order_id, event_type, detail, staff_id, staff_name)
     values ($1, $2, $3, $4, $5, $6)`,
    [userId, orderId, eventType, detail, staff.id, staff.name],
  );
}

export async function recalculateOrder(sql: Sql, userId: string, orderId: number) {
  const items = await sql.query<{ extras: unknown; quantity: unknown; unit_price: unknown; voided: unknown }>(
    `select oi.quantity, oi.unit_price, oi.voided,
            coalesce((select sum(extra_price) from order_item_modifiers m where m.order_item_id = oi.id), 0) as extras
     from order_items oi where oi.order_id = $1 and oi.user_id = $2`,
    [orderId, userId],
  );
  let subtotal = 0;
  for (const it of items) {
    if (asBool(it.voided)) continue;
    subtotal += (asInt(it.unit_price) + asInt(it.extras)) * asInt(it.quantity);
  }
  const [order] = await sql.query<Record<string, unknown>>(
    "select discount_type, discount_value, tax_rate, service_charge from orders where id = $1 and user_id = $2",
    [orderId, userId],
  );
  const dtype = (order?.discount_type as DiscountType | null) ?? null;
  const totals = computeTotals({
    subtotal,
    discountType: dtype,
    discountValue: asInt(order?.discount_value),
    taxRate: asInt(order?.tax_rate),
    serviceCharge: asInt(order?.service_charge),
  });
  await sql.query(
    `update orders set subtotal = $3, discount_amount = $4, tax_amount = $5, service_amount = $6, total = $7
     where id = $1 and user_id = $2`,
    [orderId, userId, totals.subtotal, totals.discountAmount, totals.taxAmount, totals.serviceAmount, totals.total],
  );
  return totals;
}

export async function loadOrder(sql: Sql, userId: string, orderId: number): Promise<Order | null> {
  const [row] = await sql.query<Record<string, unknown>>(
    "select * from orders where id = $1 and user_id = $2",
    [orderId, userId],
  );
  if (!row) return null;
  const itemRows = await sql.query<Record<string, unknown>>(
    "select * from order_items where order_id = $1 and user_id = $2 order by id",
    [orderId, userId],
  );
  const modRows = itemRows.length
    ? await sql.query<Record<string, unknown>>(
        `select * from order_item_modifiers where order_item_id = any($1::int[])`,
        [itemRows.map((r) => asInt(r.id))],
      )
    : [];
  const payRows = await sql.query<Record<string, unknown>>(
    "select * from payments where order_id = $1 and user_id = $2 order by id",
    [orderId, userId],
  );
  const eventRows = await sql.query<Record<string, unknown>>(
    "select * from order_events where order_id = $1 and user_id = $2 order by id",
    [orderId, userId],
  );
  const items: OrderItem[] = itemRows.map((it) => {
    const modifiers = modRows
      .filter((m) => asInt(m.order_item_id) === asInt(it.id))
      .map((m) => ({
        id: asInt(m.id),
        name: String(m.name),
        extraPrice: asInt(m.extra_price),
      }));
    const extras = modifiers.reduce((s, m) => s + m.extraPrice, 0);
    const qty = asInt(it.quantity);
    const unit = asInt(it.unit_price);
    return {
      id: asInt(it.id),
      menuItemId: it.menu_item_id == null ? null : asInt(it.menu_item_id),
      name: String(it.name),
      categoryName: String(it.category_name ?? ""),
      kind: (String(it.kind) as ItemKind) || "food",
      quantity: qty,
      unitPrice: unit,
      notes: String(it.notes ?? ""),
      kitchenSent: asBool(it.kitchen_sent),
      voided: asBool(it.voided),
      voidReason: String(it.void_reason ?? ""),
      modifiers,
      lineTotal: asBool(it.voided) ? 0 : (unit + extras) * qty,
    };
  });
  const payments: Payment[] = payRows.map((p) => ({
    id: asInt(p.id),
    methodId: p.method_id == null ? null : asInt(p.method_id),
    methodName: String(p.method_name),
    methodKind: String(p.method_kind ?? "other"),
    amount: asInt(p.amount),
    tendered: asInt(p.tendered),
    changeAmount: asInt(p.change_amount),
    createdBy: String(p.created_by ?? ""),
    createdAt: asIso(p.created_at),
  }));
  const events: OrderEvent[] = eventRows.map((e) => ({
    id: asInt(e.id),
    eventType: String(e.event_type),
    detail: String(e.detail ?? ""),
    staffName: String(e.staff_name ?? ""),
    createdAt: asIso(e.created_at),
  }));
  return {
    id: asInt(row.id),
    orderNumber: asInt(row.order_number),
    tableId: row.table_id == null ? null : asInt(row.table_id),
    tableName: String(row.table_name),
    waiterStaffId: row.waiter_staff_id == null ? null : asInt(row.waiter_staff_id),
    waiterName: String(row.waiter_name),
    status: String(row.status) as OrderStatus,
    notes: String(row.notes ?? ""),
    discountType: (row.discount_type as DiscountType | null) ?? null,
    discountValue: asInt(row.discount_value),
    discountReason: String(row.discount_reason ?? ""),
    discountBy: String(row.discount_by ?? ""),
    taxRate: asInt(row.tax_rate),
    serviceCharge: asInt(row.service_charge),
    subtotal: asInt(row.subtotal),
    discountAmount: asInt(row.discount_amount),
    taxAmount: asInt(row.tax_amount),
    serviceAmount: asInt(row.service_amount),
    total: asInt(row.total),
    shiftId: row.shift_id == null ? null : asInt(row.shift_id),
    enteredAt: asIso(row.entered_at),
    paidAt: asIsoOrNull(row.paid_at),
    kitchenPrintedAt: asIsoOrNull(row.kitchen_printed_at),
    kitchenPrintCount: asInt(row.kitchen_print_count),
    voidReason: String(row.void_reason ?? ""),
    voidedBy: String(row.voided_by ?? ""),
    items,
    payments,
    events,
  };
}

export function assertOpen(order: Order) {
  if (order.status === "paid") throw new Error("This order is paid and locked.");
  if (order.status === "voided") throw new Error("This order was voided.");
}

export async function findManagerByPin(sql: Sql, userId: string, pin: string) {
  const pinHash = hashPin(userId, pin);
  const rows = await sql.query<Record<string, unknown>>(
    `select * from staff where user_id = $1 and pin_hash = $2 and active = true and role in ('manager', 'admin')`,
    [userId, pinHash],
  );
  return rows[0] ? mapStaff(rows[0]) : null;
}
