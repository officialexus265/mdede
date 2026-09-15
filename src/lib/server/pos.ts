import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { asBool, asInt, asIso } from "@/lib/money";
import {
  canBackup,
  canClosePayments,
  canCloseShift,
  canDiscount,
  canManageSettings,
  canManageStaff,
  canVoid,
} from "@/lib/permissions";
import type {
  DiningTable,
  FloorOrder,
  OrderStatus,
  PaymentKind,
  PaymentMethod,
  Restaurant,
  Shift,
  Staff,
  StaffRole,
  TableStatus,
} from "@/lib/types";
import {
  addEvent,
  assertOpen,
  ensureOpenShift,
  findManagerByPin,
  getRestaurantRow,
  hashPin,
  loadOrder,
  mapRestaurant,
  mapStaff,
  newToken,
  recalculateOrder,
  requireStaff,
  sqlClient,
} from "./core";
import {
  SAMPLE_CATEGORIES,
  SAMPLE_MODIFIERS,
  SAMPLE_PAYMENTS,
  SAMPLE_STAFF,
  SAMPLE_TABLES,
} from "./seed-data";

type Token = { token: string };

async function seedSample(sql: Awaited<ReturnType<typeof sqlClient>>, userId: string) {
  for (const [i, t] of SAMPLE_TABLES.entries()) {
    await sql.query(
      `insert into dining_tables (user_id, name, zone, seats, sort_order) values ($1,$2,$3,$4,$5)`,
      [userId, t.name, t.zone, t.seats, i],
    );
  }
  for (const s of SAMPLE_STAFF) {
    await sql.query(
      `insert into staff (user_id, name, role, pin_hash, can_close_payments) values ($1,$2,$3,$4,$5)`,
      [userId, s.name, s.role, hashPin(userId, s.pin), s.canClosePayments],
    );
  }
  for (const [i, p] of SAMPLE_PAYMENTS.entries()) {
    await sql.query(
      `insert into payment_methods (user_id, name, kind, sort_order) values ($1,$2,$3,$4)`,
      [userId, p.name, p.kind, i],
    );
  }
  const modifierIds = new Map<string, number>();
  for (const m of SAMPLE_MODIFIERS) {
    const [row] = await sql.query<{ id: number }>(
      `insert into modifiers (user_id, name, required) values ($1,$2,$3) returning id`,
      [userId, m.name, m.required],
    );
    const mid = asInt(row.id);
    modifierIds.set(m.name, mid);
    for (const [i, opt] of m.options.entries()) {
      await sql.query(
        `insert into modifier_options (user_id, modifier_id, name, extra_price, sort_order) values ($1,$2,$3,$4,$5)`,
        [userId, mid, opt.name, opt.extraPrice, i],
      );
    }
  }
  for (const [ci, cat] of SAMPLE_CATEGORIES.entries()) {
    const [crow] = await sql.query<{ id: number }>(
      `insert into categories (user_id, name, kind, sort_order) values ($1,$2,$3,$4) returning id`,
      [userId, cat.name, cat.kind, ci],
    );
    const cid = asInt(crow.id);
    for (const [ii, item] of cat.items.entries()) {
      const [irow] = await sql.query<{ id: number }>(
        `insert into menu_items (user_id, category_id, name, description, price, is_special, low_stock, stock_note, sort_order)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [
          userId,
          cid,
          item.name,
          item.description,
          item.price,
          item.isSpecial ?? false,
          item.lowStock ?? false,
          item.stockNote ?? "",
          ii,
        ],
      );
      const iid = asInt(irow.id);
      for (const mn of item.modifierNames ?? []) {
        const mid = modifierIds.get(mn);
        if (mid) {
          await sql.query(
            `insert into item_modifiers (user_id, item_id, modifier_id) values ($1,$2,$3)`,
            [userId, iid, mid],
          );
        }
      }
    }
  }
}

export const getRestaurant = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await sqlClient();
    return getRestaurantRow(sql, context.userId);
  });

export const setupRestaurant = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: {
    name: string;
    address?: string;
    phone?: string;
    currency?: string;
    timezone?: string;
    taxRate: number;
    serviceCharge: number;
    tableCount: number;
    managerName: string;
    managerPin: string;
    sample: boolean;
  }) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const existing = await getRestaurantRow(sql, context.userId);
    if (existing?.setupComplete) throw new Error("Restaurant already set up.");
    const name = data.name.trim() || "M'dede Restaurant";
    const currency = data.currency?.trim() || "MWK";
    const timezone = data.timezone?.trim() || "Africa/Blantyre";
    const pin = data.managerPin.trim();
    if (!/^\d{4,6}$/.test(pin)) throw new Error("Manager PIN must be 4–6 digits.");
    if (existing) {
      await sql.query(
        `update restaurants set name=$2, address=$3, phone=$4, currency=$5, timezone=$6, tax_rate=$7, service_charge=$8, setup_complete=true, sample_seeded=$9
         where user_id=$1`,
        [context.userId, name, data.address ?? "", data.phone ?? "", currency, timezone, data.taxRate, data.serviceCharge, data.sample],
      );
    } else {
      await sql.query(
        `insert into restaurants (user_id, name, address, phone, currency, timezone, tax_rate, service_charge, setup_complete, sample_seeded, receipt_header)
         values ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$2)`,
        [context.userId, name, data.address ?? "", data.phone ?? "", currency, timezone, data.taxRate, data.serviceCharge, data.sample],
      );
    }
    const staffCount = await sql.query<{ n: number }>(
      "select count(*)::int as n from staff where user_id=$1",
      [context.userId],
    );
    if (asInt(staffCount[0]?.n) === 0) {
      if (data.sample) {
        await seedSample(sql, context.userId);
      } else {
        await sql.query(
          `insert into staff (user_id, name, role, pin_hash, can_close_payments) values ($1,$2,'manager',$3,true)`,
          [context.userId, data.managerName.trim() || "Manager", hashPin(context.userId, pin)],
        );
        const count = Math.min(30, Math.max(4, asInt(data.tableCount) || 8));
        for (let i = 1; i <= count; i += 1) {
          await sql.query(
            `insert into dining_tables (user_id, name, zone, seats, sort_order) values ($1,$2,'Dining',4,$3)`,
            [context.userId, `T${i}`, i],
          );
        }
        for (const [i, p] of SAMPLE_PAYMENTS.entries()) {
          await sql.query(
            `insert into payment_methods (user_id, name, kind, sort_order) values ($1,$2,$3,$4)`,
            [context.userId, p.name, p.kind, i],
          );
        }
      }
    }
    return getRestaurantRow(sql, context.userId);
  });

export const pinLogin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { pin: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const pin = data.pin.trim();
    if (!/^\d{4,6}$/.test(pin)) throw new Error("PIN must be 4–6 digits.");
    const rows = await sql.query<Record<string, unknown>>(
      `select * from staff where user_id=$1 and pin_hash=$2 and active=true`,
      [context.userId, hashPin(context.userId, pin)],
    );
    if (!rows[0]) throw new Error("Unknown PIN.");
    const staff = mapStaff(rows[0]);
    const token = newToken();
    await sql.query(
      `insert into staff_sessions (token, user_id, staff_id, expires_at) values ($1,$2,$3, now() + interval '16 hours')`,
      [token, context.userId, staff.id],
    );
    await ensureOpenShift(sql, context.userId, staff);
    return { token, staff };
  });

export const pinLogout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    await sql.query("delete from staff_sessions where token=$1 and user_id=$2", [data.token, context.userId]);
    return { ok: true };
  });

export const getSessionStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    try {
      const staff = await requireStaff(sql, context.userId, data.token);
      const restaurant = await getRestaurantRow(sql, context.userId);
      return { staff, restaurant };
    } catch {
      return { staff: null, restaurant: await getRestaurantRow(sql, context.userId) };
    }
  });

export const getFloor = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    await requireStaff(sql, context.userId, data.token);
    const tables = await sql.query<Record<string, unknown>>(
      "select * from dining_tables where user_id=$1 and active=true order by sort_order, id",
      [context.userId],
    );
    const open = await sql.query<Record<string, unknown>>(
      `select o.id, o.order_number, o.table_id, o.waiter_name, o.waiter_staff_id, o.status, o.total, o.entered_at,
              (select coalesce(sum(quantity),0)::int from order_items i where i.order_id=o.id and i.voided=false) as item_count
       from orders o where o.user_id=$1 and o.status in ('open','bill_requested')`,
      [context.userId],
    );
    const byTable = new Map<number, FloorOrder>();
    for (const o of open) {
      if (o.table_id == null) continue;
      byTable.set(asInt(o.table_id), {
        id: asInt(o.id),
        orderNumber: asInt(o.order_number),
        waiterName: String(o.waiter_name),
        waiterStaffId: o.waiter_staff_id == null ? null : asInt(o.waiter_staff_id),
        status: String(o.status) as OrderStatus,
        total: asInt(o.total),
        itemCount: asInt(o.item_count),
        enteredAt: asIso(o.entered_at),
      });
    }
    const mapped: DiningTable[] = tables.map((t) => {
      const order = byTable.get(asInt(t.id)) ?? null;
      let status: TableStatus = "free";
      if (order?.status === "bill_requested") status = "bill_requested";
      else if (order) status = "occupied";
      return {
        id: asInt(t.id),
        name: String(t.name),
        zone: String(t.zone),
        seats: asInt(t.seats),
        sortOrder: asInt(t.sort_order),
        active: asBool(t.active),
        status,
        order,
      };
    });
    const restaurant = await getRestaurantRow(sql, context.userId);
    const today = await sql.query<{ sales: unknown; n: unknown }>(
      `select coalesce(sum(total),0)::int as sales, count(*)::int as n
       from orders where user_id=$1 and status='paid' and paid_at::date = current_date`,
      [context.userId],
    );
    return {
      tables: mapped,
      restaurant,
      stats: {
        openOrders: open.length,
        occupied: mapped.filter((t) => t.status === "occupied").length,
        free: mapped.filter((t) => t.status === "free").length,
        billRequested: mapped.filter((t) => t.status === "bill_requested").length,
        todaySales: asInt(today[0]?.sales),
        todayOrders: asInt(today[0]?.n),
      },
    };
  });

export const openTable = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token & { tableId: number }) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    const [table] = await sql.query<Record<string, unknown>>(
      "select * from dining_tables where id=$1 and user_id=$2 and active=true",
      [data.tableId, context.userId],
    );
    if (!table) throw new Error("Table not found.");
    const [existing] = await sql.query<{ id: number }>(
      `select id from orders where user_id=$1 and table_id=$2 and status in ('open','bill_requested') limit 1`,
      [context.userId, data.tableId],
    );
    if (existing) return loadOrder(sql, context.userId, asInt(existing.id));
    const restaurant = await getRestaurantRow(sql, context.userId);
    if (!restaurant) throw new Error("Restaurant not set up.");
    const shiftId = await ensureOpenShift(sql, context.userId, staff);
    const [num] = await sql.query<{ next_order_number: number }>(
      `update restaurants set next_order_number = next_order_number + 1 where user_id=$1 returning next_order_number`,
      [context.userId],
    );
    const orderNumber = asInt(num.next_order_number) - 1;
    const [created] = await sql.query<{ id: number }>(
      `insert into orders (user_id, order_number, table_id, table_name, waiter_staff_id, waiter_name, status, tax_rate, service_charge, shift_id)
       values ($1,$2,$3,$4,$5,$6,'open',$7,$8,$9) returning id`,
      [
        context.userId,
        orderNumber,
        data.tableId,
        String(table.name),
        staff.id,
        staff.name,
        restaurant.taxRate,
        restaurant.serviceCharge,
        shiftId,
      ],
    );
    const orderId = asInt(created.id);
    await addEvent(sql, context.userId, orderId, staff, "created", `Table ${String(table.name)}`);
    return loadOrder(sql, context.userId, orderId);
  });

export const getOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token & { orderId: number }) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    await requireStaff(sql, context.userId, data.token);
    const order = await loadOrder(sql, context.userId, data.orderId);
    if (!order) throw new Error("Order not found.");
    return order;
  });

export const addOrderItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: Token & {
      orderId: number;
      menuItemId: number;
      quantity: number;
      notes?: string;
      modifiers?: { name: string; extraPrice: number }[];
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    const order = await loadOrder(sql, context.userId, data.orderId);
    if (!order) throw new Error("Order not found.");
    assertOpen(order);
    const [item] = await sql.query<Record<string, unknown>>(
      `select i.*, c.name as category_name, c.kind
       from menu_items i join categories c on c.id=i.category_id
       where i.id=$1 and i.user_id=$2`,
      [data.menuItemId, context.userId],
    );
    if (!item) throw new Error("Menu item not found.");
    if (asBool(item.sold_out) || !asBool(item.active)) throw new Error(`${String(item.name)} is 86'd / unavailable.`);
    const qty = Math.max(1, asInt(data.quantity) || 1);
    const [row] = await sql.query<{ id: number }>(
      `insert into order_items (user_id, order_id, menu_item_id, name, category_name, kind, quantity, unit_price, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [
        context.userId,
        data.orderId,
        data.menuItemId,
        String(item.name),
        String(item.category_name),
        String(item.kind),
        qty,
        asInt(item.price),
        (data.notes ?? "").trim(),
      ],
    );
    const oid = asInt(row.id);
    for (const m of data.modifiers ?? []) {
      await sql.query(
        `insert into order_item_modifiers (user_id, order_item_id, name, extra_price) values ($1,$2,$3,$4)`,
        [context.userId, oid, m.name, asInt(m.extraPrice)],
      );
    }
    await recalculateOrder(sql, context.userId, data.orderId);
    await addEvent(sql, context.userId, data.orderId, staff, "item_added", `${qty}× ${String(item.name)}`);
    return loadOrder(sql, context.userId, data.orderId);
  });

export const updateOrderItemQty = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token & { orderId: number; itemId: number; quantity: number }) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    const order = await loadOrder(sql, context.userId, data.orderId);
    if (!order) throw new Error("Order not found.");
    assertOpen(order);
    const qty = Math.max(1, asInt(data.quantity));
    await sql.query(
      `update order_items set quantity=$3 where id=$1 and order_id=$2 and user_id=$4 and voided=false`,
      [data.itemId, data.orderId, qty, context.userId],
    );
    await recalculateOrder(sql, context.userId, data.orderId);
    await addEvent(sql, context.userId, data.orderId, staff, "qty_changed", `Item #${data.itemId} → ${qty}`);
    return loadOrder(sql, context.userId, data.orderId);
  });

export const setOrderItemNotes = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token & { orderId: number; itemId: number; notes: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    const order = await loadOrder(sql, context.userId, data.orderId);
    if (!order) throw new Error("Order not found.");
    assertOpen(order);
    await sql.query(
      `update order_items set notes=$3 where id=$1 and order_id=$2 and user_id=$4`,
      [data.itemId, data.orderId, data.notes.trim(), context.userId],
    );
    await addEvent(sql, context.userId, data.orderId, staff, "notes", data.notes.trim());
    return loadOrder(sql, context.userId, data.orderId);
  });

export const setOrderNotes = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token & { orderId: number; notes: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    const order = await loadOrder(sql, context.userId, data.orderId);
    if (!order) throw new Error("Order not found.");
    assertOpen(order);
    await sql.query("update orders set notes=$3 where id=$1 and user_id=$2", [
      data.orderId,
      context.userId,
      data.notes.trim(),
    ]);
    await addEvent(sql, context.userId, data.orderId, staff, "order_notes", data.notes.trim());
    return loadOrder(sql, context.userId, data.orderId);
  });

export const removeOrderItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token & { orderId: number; itemId: number }) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    const order = await loadOrder(sql, context.userId, data.orderId);
    if (!order) throw new Error("Order not found.");
    assertOpen(order);
    const item = order.items.find((i) => i.id === data.itemId);
    if (!item) throw new Error("Line not found.");
    if (item.kitchenSent) throw new Error("Item already sent to kitchen — void it instead.");
    await sql.query("delete from order_item_modifiers where order_item_id=$1 and user_id=$2", [
      data.itemId,
      context.userId,
    ]);
    await sql.query("delete from order_items where id=$1 and order_id=$2 and user_id=$3", [
      data.itemId,
      data.orderId,
      context.userId,
    ]);
    await recalculateOrder(sql, context.userId, data.orderId);
    await addEvent(sql, context.userId, data.orderId, staff, "item_removed", item.name);
    return loadOrder(sql, context.userId, data.orderId);
  });

export const markKitchenPrinted = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token & { orderId: number }) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    const order = await loadOrder(sql, context.userId, data.orderId);
    if (!order) throw new Error("Order not found.");
    assertOpen(order);
    await sql.query(
      `update order_items set kitchen_sent=true where order_id=$1 and user_id=$2 and voided=false`,
      [data.orderId, context.userId],
    );
    await sql.query(
      `update orders set kitchen_printed_at=now(), kitchen_print_count=kitchen_print_count+1 where id=$1 and user_id=$2`,
      [data.orderId, context.userId],
    );
    await addEvent(sql, context.userId, data.orderId, staff, "kitchen_print", "Kitchen ticket printed");
    return loadOrder(sql, context.userId, data.orderId);
  });

export const requestBill = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token & { orderId: number }) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    const order = await loadOrder(sql, context.userId, data.orderId);
    if (!order) throw new Error("Order not found.");
    assertOpen(order);
    await sql.query(`update orders set status='bill_requested' where id=$1 and user_id=$2`, [
      data.orderId,
      context.userId,
    ]);
    await addEvent(sql, context.userId, data.orderId, staff, "bill_requested", "");
    return loadOrder(sql, context.userId, data.orderId);
  });

export const payOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: Token & {
      orderId: number;
      payments: { methodId: number; amount: number; tendered?: number }[];
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    if (!canClosePayments(staff)) throw new Error("You are not permitted to close payments.");
    const order = await loadOrder(sql, context.userId, data.orderId);
    if (!order) throw new Error("Order not found.");
    assertOpen(order);
    if (order.total <= 0) throw new Error("Nothing to pay — add items first.");
    const methods = await sql.query<Record<string, unknown>>(
      "select * from payment_methods where user_id=$1",
      [context.userId],
    );
    const byId = new Map(methods.map((m) => [asInt(m.id), m]));
    let paid = 0;
    for (const p of data.payments) {
      const method = byId.get(p.methodId);
      if (!method || !asBool(method.active)) throw new Error("Invalid payment method.");
      const amount = asInt(p.amount);
      if (amount <= 0) continue;
      const kind = String(method.kind);
      const tendered = kind === "cash" ? Math.max(amount, asInt(p.tendered)) : amount;
      const change = kind === "cash" ? Math.max(0, tendered - amount) : 0;
      await sql.query(
        `insert into payments (user_id, order_id, method_id, method_name, method_kind, amount, tendered, change_amount, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          context.userId,
          data.orderId,
          p.methodId,
          String(method.name),
          kind,
          amount,
          tendered,
          change,
          staff.name,
        ],
      );
      paid += amount;
    }
    if (paid < order.total) throw new Error("Payment does not cover the bill.");
    await sql.query(`update orders set status='paid', paid_at=now() where id=$1 and user_id=$2`, [
      data.orderId,
      context.userId,
    ]);
    await addEvent(sql, context.userId, data.orderId, staff, "paid", `Collected ${paid}`);
    return loadOrder(sql, context.userId, data.orderId);
  });

export const moveOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token & { orderId: number; tableId: number }) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    const order = await loadOrder(sql, context.userId, data.orderId);
    if (!order) throw new Error("Order not found.");
    assertOpen(order);
    const [table] = await sql.query<Record<string, unknown>>(
      "select * from dining_tables where id=$1 and user_id=$2 and active=true",
      [data.tableId, context.userId],
    );
    if (!table) throw new Error("Table not found.");
    const [busy] = await sql.query<{ id: number }>(
      `select id from orders where user_id=$1 and table_id=$2 and status in ('open','bill_requested') and id<>$3`,
      [context.userId, data.tableId, data.orderId],
    );
    if (busy) throw new Error(`Table ${String(table.name)} already has an open order.`);
    await sql.query(`update orders set table_id=$3, table_name=$4 where id=$1 and user_id=$2`, [
      data.orderId,
      context.userId,
      data.tableId,
      String(table.name),
    ]);
    await addEvent(sql, context.userId, data.orderId, staff, "moved", `${order.tableName} → ${String(table.name)}`);
    return loadOrder(sql, context.userId, data.orderId);
  });

export const mergeOrders = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token & { sourceOrderId: number; targetOrderId: number }) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    if (data.sourceOrderId === data.targetOrderId) throw new Error("Pick two different tables.");
    const source = await loadOrder(sql, context.userId, data.sourceOrderId);
    const target = await loadOrder(sql, context.userId, data.targetOrderId);
    if (!source || !target) throw new Error("Order not found.");
    assertOpen(source);
    assertOpen(target);
    await sql.query(`update order_items set order_id=$2 where order_id=$1 and user_id=$3`, [
      data.sourceOrderId,
      data.targetOrderId,
      context.userId,
    ]);
    await sql.query(
      `update orders set status='voided', void_reason=$3, voided_by=$4, voided_at=now() where id=$1 and user_id=$2`,
      [data.sourceOrderId, context.userId, `Merged into #${target.orderNumber}`, staff.name],
    );
    await recalculateOrder(sql, context.userId, data.targetOrderId);
    await addEvent(
      sql,
      context.userId,
      data.targetOrderId,
      staff,
      "merged",
      `Absorbed #${source.orderNumber} from ${source.tableName}`,
    );
    return loadOrder(sql, context.userId, data.targetOrderId);
  });

export const splitOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token & { orderId: number; itemIds: number[]; tableId: number }) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    const order = await loadOrder(sql, context.userId, data.orderId);
    if (!order) throw new Error("Order not found.");
    assertOpen(order);
    if (!data.itemIds.length) throw new Error("Select items to split.");
    const [table] = await sql.query<Record<string, unknown>>(
      "select * from dining_tables where id=$1 and user_id=$2 and active=true",
      [data.tableId, context.userId],
    );
    if (!table) throw new Error("Table not found.");
    const [busy] = await sql.query<{ id: number }>(
      `select id from orders where user_id=$1 and table_id=$2 and status in ('open','bill_requested')`,
      [context.userId, data.tableId],
    );
    if (busy) throw new Error(`Table ${String(table.name)} already has an open order.`);
    const restaurant = await getRestaurantRow(sql, context.userId);
    if (!restaurant) throw new Error("Restaurant not set up.");
    const shiftId = await ensureOpenShift(sql, context.userId, staff);
    const [num] = await sql.query<{ next_order_number: number }>(
      `update restaurants set next_order_number = next_order_number + 1 where user_id=$1 returning next_order_number`,
      [context.userId],
    );
    const [created] = await sql.query<{ id: number }>(
      `insert into orders (user_id, order_number, table_id, table_name, waiter_staff_id, waiter_name, status, tax_rate, service_charge, shift_id)
       values ($1,$2,$3,$4,$5,$6,'open',$7,$8,$9) returning id`,
      [
        context.userId,
        asInt(num.next_order_number) - 1,
        data.tableId,
        String(table.name),
        staff.id,
        staff.name,
        restaurant.taxRate,
        restaurant.serviceCharge,
        shiftId,
      ],
    );
    const newId = asInt(created.id);
    for (const itemId of data.itemIds) {
      await sql.query(`update order_items set order_id=$2 where id=$1 and order_id=$3 and user_id=$4`, [
        itemId,
        newId,
        data.orderId,
        context.userId,
      ]);
    }
    await recalculateOrder(sql, context.userId, data.orderId);
    await recalculateOrder(sql, context.userId, newId);
    await addEvent(sql, context.userId, data.orderId, staff, "split", `Items moved to ${String(table.name)}`);
    await addEvent(sql, context.userId, newId, staff, "created", `Split from #${order.orderNumber}`);
    return { source: await loadOrder(sql, context.userId, data.orderId), target: await loadOrder(sql, context.userId, newId) };
  });

export const voidOrderItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token & { orderId: number; itemId: number; reason: string; managerPin: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    const order = await loadOrder(sql, context.userId, data.orderId);
    if (!order) throw new Error("Order not found.");
    assertOpen(order);
    let authorizer = staff;
    if (!canVoid(staff)) {
      const manager = await findManagerByPin(sql, context.userId, data.managerPin);
      if (!manager) throw new Error("Manager PIN required to void.");
      authorizer = manager;
    }
    const reason = data.reason.trim();
    if (!reason) throw new Error("A void reason is required.");
    await sql.query(
      `update order_items set voided=true, void_reason=$3, voided_by=$4, voided_at=now()
       where id=$1 and order_id=$2 and user_id=$5`,
      [data.itemId, data.orderId, reason, authorizer.name, context.userId],
    );
    await recalculateOrder(sql, context.userId, data.orderId);
    await addEvent(sql, context.userId, data.orderId, staff, "item_voided", `${reason} (by ${authorizer.name})`);
    return loadOrder(sql, context.userId, data.orderId);
  });

export const voidOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token & { orderId: number; reason: string; managerPin: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    const order = await loadOrder(sql, context.userId, data.orderId);
    if (!order) throw new Error("Order not found.");
    assertOpen(order);
    let authorizer = staff;
    if (!canVoid(staff)) {
      const manager = await findManagerByPin(sql, context.userId, data.managerPin);
      if (!manager) throw new Error("Manager PIN required to void.");
      authorizer = manager;
    }
    const reason = data.reason.trim();
    if (!reason) throw new Error("A void reason is required.");
    await sql.query(
      `update order_items set voided=true, void_reason=$3, voided_by=$4, voided_at=now()
       where order_id=$1 and user_id=$2 and voided=false`,
      [data.orderId, context.userId, reason, authorizer.name],
    );
    await sql.query(
      `update orders set status='voided', void_reason=$3, voided_by=$4, voided_at=now(), total=0, subtotal=0, tax_amount=0, service_amount=0, discount_amount=0
       where id=$1 and user_id=$2`,
      [data.orderId, context.userId, reason, authorizer.name],
    );
    await addEvent(sql, context.userId, data.orderId, staff, "voided", `${reason} (by ${authorizer.name})`);
    return loadOrder(sql, context.userId, data.orderId);
  });

export const applyDiscount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: Token & { orderId: number; type: "percent" | "fixed"; value: number; reason: string; managerPin?: string }) =>
      d,
  )
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    const order = await loadOrder(sql, context.userId, data.orderId);
    if (!order) throw new Error("Order not found.");
    assertOpen(order);
    let authorizer = staff;
    if (!canDiscount(staff)) {
      const manager = await findManagerByPin(sql, context.userId, data.managerPin ?? "");
      if (!manager) throw new Error("Manager PIN required to discount.");
      authorizer = manager;
    }
    const reason = data.reason.trim();
    if (!reason) throw new Error("A discount reason is required.");
    const value = Math.max(0, asInt(data.value));
    if (data.type === "percent" && value > 100) throw new Error("Percent cannot exceed 100.");
    await sql.query(
      `update orders set discount_type=$3, discount_value=$4, discount_reason=$5, discount_by=$6 where id=$1 and user_id=$2`,
      [data.orderId, context.userId, data.type, value, reason, authorizer.name],
    );
    await recalculateOrder(sql, context.userId, data.orderId);
    await addEvent(sql, context.userId, data.orderId, staff, "discount", `${data.type} ${value} — ${reason}`);
    return loadOrder(sql, context.userId, data.orderId);
  });

export const cancelEmptyOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token & { orderId: number }) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    const order = await loadOrder(sql, context.userId, data.orderId);
    if (!order) throw new Error("Order not found.");
    assertOpen(order);
    const live = order.items.filter((i) => !i.voided);
    if (live.length > 0) throw new Error("Order has items — void it instead.");
    await sql.query(
      `update orders set status='voided', void_reason='Cancelled empty ticket', voided_by=$3, voided_at=now() where id=$1 and user_id=$2`,
      [data.orderId, context.userId, staff.name],
    );
    return { ok: true };
  });

export const listOrders = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token & { scope: "open" | "today" | "all"; waiterOnly?: boolean }) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    const params: unknown[] = [context.userId];
    let where = "user_id=$1";
    if (data.scope === "open") where += " and status in ('open','bill_requested')";
    if (data.scope === "today") where += " and entered_at::date = current_date";
    if (data.waiterOnly || staff.role === "waiter") {
      params.push(staff.id);
      where += ` and waiter_staff_id=$${params.length}`;
    }
    const rows = await sql.query<Record<string, unknown>>(
      `select * from orders where ${where} order by entered_at desc limit 200`,
      params,
    );
    return rows.map((r) => ({
      id: asInt(r.id),
      orderNumber: asInt(r.order_number),
      tableName: String(r.table_name),
      waiterName: String(r.waiter_name),
      status: String(r.status) as OrderStatus,
      total: asInt(r.total),
      enteredAt: asIso(r.entered_at),
      paidAt: r.paid_at ? asIso(r.paid_at) : null,
    }));
  });

export const listPaymentMethods = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    await requireStaff(sql, context.userId, data.token);
    const rows = await sql.query<Record<string, unknown>>(
      "select * from payment_methods where user_id=$1 order by sort_order, id",
      [context.userId],
    );
    return rows.map(
      (r): PaymentMethod => ({
        id: asInt(r.id),
        name: String(r.name),
        kind: String(r.kind) as PaymentKind,
        active: asBool(r.active),
        sortOrder: asInt(r.sort_order),
      }),
    );
  });

export const savePaymentMethod = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token & { id?: number; name: string; kind: PaymentKind; active: boolean }) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    if (!canManageSettings(staff)) throw new Error("Managers only.");
    if (data.id) {
      await sql.query(
        `update payment_methods set name=$3, kind=$4, active=$5 where id=$1 and user_id=$2`,
        [data.id, context.userId, data.name.trim(), data.kind, data.active],
      );
    } else {
      await sql.query(
        `insert into payment_methods (user_id, name, kind, active, sort_order) values ($1,$2,$3,$4,99)`,
        [context.userId, data.name.trim(), data.kind, data.active],
      );
    }
    return { ok: true };
  });

export const listStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    if (!canManageStaff(staff)) throw new Error("Managers only.");
    const rows = await sql.query<Record<string, unknown>>(
      "select id, name, role, active, can_close_payments, created_at from staff where user_id=$1 order by name",
      [context.userId],
    );
    return rows.map((r) => ({
      ...mapStaff(r),
      createdAt: asIso(r.created_at),
    }));
  });

export const saveStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: Token & {
      id?: number;
      name: string;
      role: StaffRole;
      pin?: string;
      active: boolean;
      canClosePayments: boolean;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const actor = await requireStaff(sql, context.userId, data.token);
    if (!canManageStaff(actor)) throw new Error("Managers only.");
    const name = data.name.trim();
    if (!name) throw new Error("Name is required.");
    // Self-service role/active changes are blocked outright — otherwise
    // whoever is signed in can freely re-grant or strip their own access
    // (e.g. an admin demoting themselves to cashier), and since the check
    // above re-reads the actor's role fresh from the DB, a self-change that
    // *does* slip through immediately invalidates that same actor's session
    // for any further staff-management action — which is exactly the
    // confusing "it said only a manager can do that, but it still changed"
    // situation this guard exists to prevent.
    if (data.id === actor.id && (data.role !== actor.role || data.active !== actor.active)) {
      throw new Error("You can't change your own role or active status. Ask another manager or admin.");
    }
    if (data.id) {
      if (data.pin && /^\d{4,6}$/.test(data.pin)) {
        await sql.query(
          `update staff set name=$3, role=$4, active=$5, can_close_payments=$6, pin_hash=$7 where id=$1 and user_id=$2`,
          [data.id, context.userId, name, data.role, data.active, data.canClosePayments, hashPin(context.userId, data.pin)],
        );
      } else {
        await sql.query(
          `update staff set name=$3, role=$4, active=$5, can_close_payments=$6 where id=$1 and user_id=$2`,
          [data.id, context.userId, name, data.role, data.active, data.canClosePayments],
        );
      }
    } else {
      const pin = data.pin ?? "";
      if (!/^\d{4,6}$/.test(pin)) throw new Error("PIN must be 4–6 digits.");
      await sql.query(
        `insert into staff (user_id, name, role, pin_hash, active, can_close_payments) values ($1,$2,$3,$4,$5,$6)`,
        [context.userId, name, data.role, hashPin(context.userId, pin), data.active, data.canClosePayments],
      );
    }
    return { ok: true };
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token & Partial<Restaurant>) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    if (!canManageSettings(staff)) throw new Error("Managers only.");
    const current = await getRestaurantRow(sql, context.userId);
    if (!current) throw new Error("Not set up.");
    const next = { ...current, ...data };
    await sql.query(
      `update restaurants set name=$2, address=$3, phone=$4, currency=$5, timezone=$6, tax_rate=$7, service_charge=$8,
        receipt_header=$9, receipt_footer=$10, kitchen_printer=$11, receipt_printer=$12
       where user_id=$1`,
      [
        context.userId,
        next.name,
        next.address,
        next.phone,
        next.currency,
        next.timezone,
        next.taxRate,
        next.serviceCharge,
        next.receiptHeader,
        next.receiptFooter,
        next.kitchenPrinter,
        next.receiptPrinter,
      ],
    );
    return getRestaurantRow(sql, context.userId);
  });

export const listTablesAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    if (!canManageSettings(staff)) throw new Error("Managers only.");
    const rows = await sql.query<Record<string, unknown>>(
      "select * from dining_tables where user_id=$1 order by sort_order, id",
      [context.userId],
    );
    return rows.map((t) => ({
      id: asInt(t.id),
      name: String(t.name),
      zone: String(t.zone),
      seats: asInt(t.seats),
      sortOrder: asInt(t.sort_order),
      active: asBool(t.active),
    }));
  });

export const saveTable = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token & { id?: number; name: string; zone: string; seats: number; active: boolean }) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    if (!canManageSettings(staff)) throw new Error("Managers only.");
    if (data.id) {
      await sql.query(
        `update dining_tables set name=$3, zone=$4, seats=$5, active=$6 where id=$1 and user_id=$2`,
        [data.id, context.userId, data.name.trim(), data.zone.trim() || "Dining", asInt(data.seats) || 4, data.active],
      );
    } else {
      await sql.query(
        `insert into dining_tables (user_id, name, zone, seats, active, sort_order) values ($1,$2,$3,$4,$5,99)`,
        [context.userId, data.name.trim(), data.zone.trim() || "Dining", asInt(data.seats) || 4, data.active],
      );
    }
    return { ok: true };
  });

export const closeShift = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token & { declaredCash: number; notes?: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    if (!canCloseShift(staff)) throw new Error("Managers only.");
    const [open] = await sql.query<Record<string, unknown>>(
      "select * from shifts where user_id=$1 and status='open' order by opened_at desc limit 1",
      [context.userId],
    );
    if (!open) throw new Error("No open shift.");
    await sql.query(
      `update shifts set status='closed', closed_at=now(), closed_by_staff_id=$3, closed_by_name=$4, declared_cash=$5, notes=$6
       where id=$1 and user_id=$2`,
      [asInt(open.id), context.userId, staff.id, staff.name, asInt(data.declaredCash), (data.notes ?? "").trim()],
    );
    await sql.query(
      `insert into shifts (user_id, opened_by_staff_id, opened_by_name, status) values ($1,$2,$3,'open')`,
      [context.userId, staff.id, staff.name],
    );
    return { ok: true };
  });

export const getOpenShift = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    await requireStaff(sql, context.userId, data.token);
    const [row] = await sql.query<Record<string, unknown>>(
      "select * from shifts where user_id=$1 and status='open' order by opened_at desc limit 1",
      [context.userId],
    );
    if (!row) return null;
    const shift: Shift = {
      id: asInt(row.id),
      openedByName: String(row.opened_by_name),
      closedByName: row.closed_by_name ? String(row.closed_by_name) : null,
      openedAt: asIso(row.opened_at),
      closedAt: row.closed_at ? asIso(row.closed_at) : null,
      declaredCash: row.declared_cash == null ? null : asInt(row.declared_cash),
      notes: String(row.notes ?? ""),
      status: "open",
    };
    return shift;
  });

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function toJsonValue(value: unknown): JsonValue {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(toJsonValue);
  }

  if (typeof value === "object") {
    const result: { [key: string]: JsonValue } = {};

    for (const [key, val] of Object.entries(value)) {
      result[key] = toJsonValue(val);
    }

    return result;
  }

  return String(value);
}

export const exportBackup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();

    const staff = await requireStaff(sql, context.userId, data.token);

    if (!canBackup(staff)) {
      throw new Error("Admin only.");
    }

    const restaurant = await getRestaurantRow(sql, context.userId);

    const tables = [
      "staff",
      "dining_tables",
      "categories",
      "menu_items",
      "orders",
      "order_items",
      "payments",
      "shifts",
    ];

    const dump: { [key: string]: JsonValue } = {
      restaurant: toJsonValue(restaurant),
      exportedAt: new Date().toISOString(),
    };

    for (const t of tables) {
      const rows = await sql.query(
        `select * from ${t} where user_id=$1`,
        [context.userId],
      );

      dump[t] = toJsonValue(rows);
    }

    return dump;
  });