import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/money";
import { cloudinaryThumb, resizeImageToDataUrl } from "@/lib/image";
import {
  adminListMenu,
  saveCategory,
  saveMenuItem,
  saveModifier,
  toggleItemFlag,
  uploadMenuItemImage,
} from "@/lib/server/menu";
import { getRestaurant } from "@/lib/server/pos";
import type { ItemKind, MenuItem, Modifier } from "@/lib/types";
import { useStaffSession } from "@/store/session";

export function MenuPage() {
  const token = useStaffSession((s) => s.token);
  const qc = useQueryClient();
  const restaurantQ = useQuery({ queryKey: ["restaurant"], queryFn: () => getRestaurant() });
  const menu = useQuery({
    queryKey: ["admin-menu"],
    queryFn: () => adminListMenu({ data: { token } }),
    enabled: !!token,
  });
  const [edit, setEdit] = useState<MenuItem | "new" | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  const [modOpen, setModOpen] = useState(false);
  const currency = restaurantQ.data?.currency ?? "MWK";

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-menu"] });
    void qc.invalidateQueries({ queryKey: ["menu"] });
  };

  const flag = useMutation({
    mutationFn: (p: { itemId: number; field: "sold_out" | "is_special" | "active" | "low_stock"; value: boolean }) =>
      toggleItemFlag({ data: { token, ...p } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Menu</h1>
          <p className="text-sm text-muted-foreground">Specials, 86s, and modifiers for the station.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCatOpen(true)}>
            Category
          </Button>
          <Button variant="outline" onClick={() => setModOpen(true)}>
            Modifier
          </Button>
          <Button
            onClick={() => setEdit("new")}
            disabled={!menu.data?.categories.length}
            title={!menu.data?.categories.length ? "Add a category first" : undefined}
          >
            New item
          </Button>
        </div>
      </div>

      {menu.data && menu.data.categories.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No categories yet — add one with the <span className="font-medium">Category</span> button above before
          adding meals or beverages.
        </p>
      ) : null}

      {(menu.data?.categories ?? []).map((c) => (
        <section key={c.id} className="mt-8">
          <h2 className="font-display text-xl">
            {c.name} <span className="text-sm text-muted-foreground">{c.kind}</span>
          </h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="bg-secondary text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">86</th>
                  <th className="px-3 py-2">Special</th>
                  <th className="px-3 py-2">Low stock</th>
                  <th className="px-3 py-2">Active</th>
                </tr>
              </thead>
              <tbody>
                {c.items.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="px-3 py-3">
                      <div className="flex items-start gap-3">
                        {item.imageUrl ? (
                          <img
                            src={cloudinaryThumb(item.imageUrl, "w_80,h_80,c_fill,g_auto,f_auto,q_auto")}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-md border border-border object-cover"
                          />
                        ) : null}
                        <div>
                          <button type="button" className="text-left font-medium hover:underline" onClick={() => setEdit(item)}>
                            {item.name}
                          </button>
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                          {item.stockNote ? <p className="text-xs text-warning">{item.stockNote}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{formatMoney(item.price, currency)}</td>
                    <td className="px-3 py-3">
                      <Switch checked={item.soldOut} onCheckedChange={(v) => flag.mutate({ itemId: item.id, field: "sold_out", value: v })} />
                    </td>
                    <td className="px-3 py-3">
                      <Switch checked={item.isSpecial} onCheckedChange={(v) => flag.mutate({ itemId: item.id, field: "is_special", value: v })} />
                    </td>
                    <td className="px-3 py-3">
                      <Switch checked={item.lowStock} onCheckedChange={(v) => flag.mutate({ itemId: item.id, field: "low_stock", value: v })} />
                    </td>
                    <td className="px-3 py-3">
                      <Switch checked={item.active} onCheckedChange={(v) => flag.mutate({ itemId: item.id, field: "active", value: v })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {edit ? (
        <ItemEditor
          item={edit === "new" ? null : edit}
          categories={(menu.data?.categories ?? []).map((c) => ({ id: c.id, name: c.name }))}
          modifiers={menu.data?.modifiers ?? []}
          token={token}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            refresh();
          }}
        />
      ) : null}
      {catOpen ? (
        <CategoryDialog
          token={token}
          onClose={() => setCatOpen(false)}
          onSaved={() => {
            setCatOpen(false);
            refresh();
          }}
        />
      ) : null}
      {modOpen ? (
        <ModifierEditor
          token={token}
          onClose={() => setModOpen(false)}
          onSaved={() => {
            setModOpen(false);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function ItemEditor({
  item,
  categories,
  modifiers,
  token,
  onClose,
  onSaved,
}: {
  item: MenuItem | null;
  categories: { id: number; name: string }[];
  modifiers: Modifier[];
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? "");
  const [imageBusy, setImageBusy] = useState(false);
  const [price, setPrice] = useState(String(item?.price ?? 0));
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? categories[0]?.id ?? 0);
  // Categories can still be mid-fetch the instant this dialog opens (or a category
  // gets added while it's open) — keep the selection in sync so it never silently
  // saves against a stale/zero id that doesn't match any real category.
  useEffect(() => {
    if (item) return;
    if (categoryId === 0 && categories[0]) setCategoryId(categories[0].id);
  }, [categories, categoryId, item]);
  const [soldOut, setSoldOut] = useState(item?.soldOut ?? false);
  const [isSpecial, setIsSpecial] = useState(item?.isSpecial ?? false);
  const [lowStock, setLowStock] = useState(item?.lowStock ?? false);
  const [stockNote, setStockNote] = useState(item?.stockNote ?? "");
  const [active, setActive] = useState(item?.active ?? true);
  const [modifierIds, setModifierIds] = useState<number[]>(item?.modifiers.map((m) => m.id) ?? []);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Edit item" : "New item"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div>
            <p className="mb-2 text-sm text-muted-foreground">Photo</p>
            <div className="flex items-center gap-3">
              {imageUrl ? (
                <img
                  src={cloudinaryThumb(imageUrl, "w_128,h_128,c_fill,g_auto,f_auto,q_auto")}
                  alt=""
                  className="h-16 w-16 rounded-lg border border-border object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-muted-foreground">
                  No photo
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-sm hover:bg-accent">
                  {imageBusy ? "Processing…" : imageUrl ? "Change photo" : "Upload photo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={imageBusy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      setImageBusy(true);
                      resizeImageToDataUrl(file, 1600, 0.82)
                        .then((dataUrl) => uploadMenuItemImage({ data: { token, dataUrl } }))
                        .then((res) => setImageUrl(res.url))
                        .catch((err: Error) => toast.error(err.message))
                        .finally(() => setImageBusy(false));
                    }}
                  />
                </label>
                {imageUrl ? (
                  <button
                    type="button"
                    className="text-left text-xs text-muted-foreground hover:underline"
                    onClick={() => setImageUrl("")}
                  >
                    Remove photo
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <Input inputMode="numeric" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} />
          <select
            className="h-11 rounded-md border border-input bg-background px-3"
            value={categoryId}
            onChange={(e) => setCategoryId(Number(e.target.value))}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Input placeholder="Low-stock note" value={stockNote} onChange={(e) => setStockNote(e.target.value)} />
          <label className="flex items-center justify-between text-sm">
            86 / sold out <Switch checked={soldOut} onCheckedChange={setSoldOut} />
          </label>
          <label className="flex items-center justify-between text-sm">
            Daily special <Switch checked={isSpecial} onCheckedChange={setIsSpecial} />
          </label>
          <label className="flex items-center justify-between text-sm">
            Low stock <Switch checked={lowStock} onCheckedChange={setLowStock} />
          </label>
          <label className="flex items-center justify-between text-sm">
            Active <Switch checked={active} onCheckedChange={setActive} />
          </label>
          <div>
            <p className="mb-2 text-sm text-muted-foreground">Modifiers</p>
            <div className="flex flex-wrap gap-2">
              {modifiers.map((m) => {
                const on = modifierIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`h-9 rounded-full px-3 text-sm ${on ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                    onClick={() => setModifierIds((p) => (on ? p.filter((x) => x !== m.id) : [...p, m.id]))}
                  >
                    {m.name}
                  </button>
                );
              })}
            </div>
          </div>
          <Button
            disabled={imageBusy}
            onClick={() =>
              void saveMenuItem({
                data: {
                  token,
                  id: item?.id,
                  categoryId,
                  name,
                  description,
                  imageUrl,
                  price: Number(price) || 0,
                  soldOut,
                  isSpecial,
                  lowStock,
                  stockNote,
                  active,
                  modifierIds,
                },
              })
                .then(onSaved)
                .catch((e: Error) => toast.error(e.message))
            }
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoryDialog({
  token,
  onClose,
  onSaved,
}: {
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ItemKind>("food");
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New category</DialogTitle>
        </DialogHeader>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <div className="mt-3 flex gap-2">
          <Button variant={kind === "food" ? "default" : "outline"} onClick={() => setKind("food")}>
            Food
          </Button>
          <Button variant={kind === "drink" ? "default" : "outline"} onClick={() => setKind("drink")}>
            Drink
          </Button>
        </div>
        <Button
          className="mt-4"
          onClick={() =>
            void saveCategory({ data: { token, name, kind, active: true } })
              .then(onSaved)
              .catch((e: Error) => toast.error(e.message))
          }
        >
          Save
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function ModifierEditor({
  token,
  onClose,
  onSaved,
}: {
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState([{ name: "", extraPrice: 0 }]);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New modifier group</DialogTitle>
        </DialogHeader>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (Cooking, Size…)" />
        <label className="mt-3 flex items-center justify-between text-sm">
          Required <Switch checked={required} onCheckedChange={setRequired} />
        </label>
        <div className="mt-3 grid gap-2">
          {options.map((o, i) => (
            <div key={i} className="grid grid-cols-[1fr_7rem] gap-2">
              <Input
                value={o.name}
                placeholder="Option"
                onChange={(e) => setOptions((p) => p.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))}
              />
              <Input
                inputMode="numeric"
                value={o.extraPrice}
                onChange={(e) =>
                  setOptions((p) => p.map((x, idx) => (idx === i ? { ...x, extraPrice: Number(e.target.value) || 0 } : x)))
                }
              />
            </div>
          ))}
          <Button variant="outline" onClick={() => setOptions((p) => [...p, { name: "", extraPrice: 0 }])}>
            Add option
          </Button>
        </div>
        <Button
          className="mt-4"
          onClick={() =>
            void saveModifier({ data: { token, name, required, options } })
              .then(onSaved)
              .catch((e: Error) => toast.error(e.message))
          }
        >
          Save
        </Button>
      </DialogContent>
    </Dialog>
  );
}
