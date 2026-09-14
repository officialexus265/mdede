import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { asBool, asInt } from "@/lib/money";
import { canManageMenu } from "@/lib/permissions";
import type { Category, ItemKind, MenuItem, Modifier } from "@/lib/types";
import { requireStaff, sqlClient } from "./core";

type Token = { token: string };

async function loadModifiersForUser(sql: Awaited<ReturnType<typeof sqlClient>>, userId: string) {
  const mods = await sql.query<Record<string, unknown>>(
    "select * from modifiers where user_id=$1 and active=true order by id",
    [userId],
  );
  const opts = await sql.query<Record<string, unknown>>(
    "select * from modifier_options where user_id=$1 order by sort_order, id",
    [userId],
  );
  const links = await sql.query<{ item_id: unknown; modifier_id: unknown }>(
    "select item_id, modifier_id from item_modifiers where user_id=$1",
    [userId],
  );
  const modifiers: Modifier[] = mods.map((m) => ({
    id: asInt(m.id),
    name: String(m.name),
    required: asBool(m.required),
    options: opts
      .filter((o) => asInt(o.modifier_id) === asInt(m.id))
      .map((o) => ({ id: asInt(o.id), name: String(o.name), extraPrice: asInt(o.extra_price) })),
  }));
  const byItem = new Map<number, Modifier[]>();
  for (const l of links) {
    const mod = modifiers.find((m) => m.id === asInt(l.modifier_id));
    if (!mod) continue;
    const iid = asInt(l.item_id);
    const arr = byItem.get(iid) ?? [];
    arr.push(mod);
    byItem.set(iid, arr);
  }
  return { modifiers, byItem };
}

export const listMenu = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    await requireStaff(sql, context.userId, data.token);
    const cats = await sql.query<Record<string, unknown>>(
      "select * from categories where user_id=$1 and active=true order by sort_order, id",
      [context.userId],
    );
    const items = await sql.query<Record<string, unknown>>(
      "select * from menu_items where user_id=$1 and active=true order by sort_order, name",
      [context.userId],
    );
    const { byItem } = await loadModifiersForUser(sql, context.userId);
    return cats.map((c): Category => {
      const cid = asInt(c.id);
      const kind = String(c.kind) as ItemKind;
      return {
        id: cid,
        name: String(c.name),
        kind,
        sortOrder: asInt(c.sort_order),
        active: true,
        items: items
          .filter((i) => asInt(i.category_id) === cid)
          .map(
            (i): MenuItem => ({
              id: asInt(i.id),
              categoryId: cid,
              categoryName: String(c.name),
              kind,
              name: String(i.name),
              description: String(i.description ?? ""),
              price: asInt(i.price),
              available: asBool(i.available),
              soldOut: asBool(i.sold_out),
              isSpecial: asBool(i.is_special),
              lowStock: asBool(i.low_stock),
              stockNote: String(i.stock_note ?? ""),
              active: asBool(i.active),
              modifiers: byItem.get(asInt(i.id)) ?? [],
            }),
          ),
      };
    });
  });

export const adminListMenu = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    if (!canManageMenu(staff)) throw new Error("Managers only.");
    const cats = await sql.query<Record<string, unknown>>(
      "select * from categories where user_id=$1 order by sort_order, id",
      [context.userId],
    );
    const items = await sql.query<Record<string, unknown>>(
      "select * from menu_items where user_id=$1 order by sort_order, name",
      [context.userId],
    );
    const { modifiers, byItem } = await loadModifiersForUser(sql, context.userId);
    const categories = cats.map((c): Category => {
      const cid = asInt(c.id);
      const kind = String(c.kind) as ItemKind;
      return {
        id: cid,
        name: String(c.name),
        kind,
        sortOrder: asInt(c.sort_order),
        active: asBool(c.active),
        items: items
          .filter((i) => asInt(i.category_id) === cid)
          .map(
            (i): MenuItem => ({
              id: asInt(i.id),
              categoryId: cid,
              categoryName: String(c.name),
              kind,
              name: String(i.name),
              description: String(i.description ?? ""),
              price: asInt(i.price),
              available: asBool(i.available),
              soldOut: asBool(i.sold_out),
              isSpecial: asBool(i.is_special),
              lowStock: asBool(i.low_stock),
              stockNote: String(i.stock_note ?? ""),
              active: asBool(i.active),
              modifiers: byItem.get(asInt(i.id)) ?? [],
            }),
          ),
      };
    });
    return { categories, modifiers };
  });

export const saveCategory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token & { id?: number; name: string; kind: ItemKind; active: boolean }) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    if (!canManageMenu(staff)) throw new Error("Managers only.");
    if (data.id) {
      await sql.query(`update categories set name=$3, kind=$4, active=$5 where id=$1 and user_id=$2`, [
        data.id,
        context.userId,
        data.name.trim(),
        data.kind,
        data.active,
      ]);
    } else {
      await sql.query(`insert into categories (user_id, name, kind, active, sort_order) values ($1,$2,$3,$4,99)`, [
        context.userId,
        data.name.trim(),
        data.kind,
        data.active,
      ]);
    }
    return { ok: true };
  });

export const saveMenuItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: Token & {
      id?: number;
      categoryId: number;
      name: string;
      description: string;
      price: number;
      soldOut: boolean;
      isSpecial: boolean;
      lowStock: boolean;
      stockNote: string;
      active: boolean;
      modifierIds: number[];
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    if (!canManageMenu(staff)) throw new Error("Managers only.");
    let itemId = data.id;
    if (itemId) {
      await sql.query(
        `update menu_items set category_id=$3, name=$4, description=$5, price=$6, sold_out=$7, is_special=$8,
          low_stock=$9, stock_note=$10, active=$11, available=$12
         where id=$1 and user_id=$2`,
        [
          itemId,
          context.userId,
          data.categoryId,
          data.name.trim(),
          data.description.trim(),
          asInt(data.price),
          data.soldOut,
          data.isSpecial,
          data.lowStock,
          data.stockNote.trim(),
          data.active,
          !data.soldOut && data.active,
        ],
      );
    } else {
      const [row] = await sql.query<{ id: number }>(
        `insert into menu_items (user_id, category_id, name, description, price, sold_out, is_special, low_stock, stock_note, active, available)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
        [
          context.userId,
          data.categoryId,
          data.name.trim(),
          data.description.trim(),
          asInt(data.price),
          data.soldOut,
          data.isSpecial,
          data.lowStock,
          data.stockNote.trim(),
          data.active,
          !data.soldOut && data.active,
        ],
      );
      itemId = asInt(row.id);
    }
    await sql.query("delete from item_modifiers where item_id=$1 and user_id=$2", [itemId, context.userId]);
    for (const mid of data.modifierIds) {
      await sql.query("insert into item_modifiers (user_id, item_id, modifier_id) values ($1,$2,$3)", [
        context.userId,
        itemId,
        mid,
      ]);
    }
    return { ok: true, id: itemId };
  });

export const toggleItemFlag = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: Token & { itemId: number; field: "sold_out" | "is_special" | "active" | "low_stock"; value: boolean }) => d)
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    if (!canManageMenu(staff)) throw new Error("Managers only.");
    const allowed = new Set(["sold_out", "is_special", "active", "low_stock"]);
    if (!allowed.has(data.field)) throw new Error("Invalid field.");
    await sql.query(`update menu_items set ${data.field}=$3 where id=$1 and user_id=$2`, [
      data.itemId,
      context.userId,
      data.value,
    ]);
    if (data.field === "sold_out") {
      await sql.query(`update menu_items set available=$3 where id=$1 and user_id=$2`, [
        data.itemId,
        context.userId,
        !data.value,
      ]);
    }
    return { ok: true };
  });

export const saveModifier = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: Token & {
      id?: number;
      name: string;
      required: boolean;
      options: { name: string; extraPrice: number }[];
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const sql = await sqlClient();
    const staff = await requireStaff(sql, context.userId, data.token);
    if (!canManageMenu(staff)) throw new Error("Managers only.");
    let id = data.id;
    if (id) {
      await sql.query(`update modifiers set name=$3, required=$4 where id=$1 and user_id=$2`, [
        id,
        context.userId,
        data.name.trim(),
        data.required,
      ]);
      await sql.query("delete from modifier_options where modifier_id=$1 and user_id=$2", [id, context.userId]);
    } else {
      const [row] = await sql.query<{ id: number }>(
        `insert into modifiers (user_id, name, required) values ($1,$2,$3) returning id`,
        [context.userId, data.name.trim(), data.required],
      );
      id = asInt(row.id);
    }
    for (const [i, opt] of data.options.entries()) {
      if (!opt.name.trim()) continue;
      await sql.query(
        `insert into modifier_options (user_id, modifier_id, name, extra_price, sort_order) values ($1,$2,$3,$4,$5)`,
        [context.userId, id, opt.name.trim(), asInt(opt.extraPrice), i],
      );
    }
    return { ok: true };
  });
