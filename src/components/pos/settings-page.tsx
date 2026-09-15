import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { canBackup } from "@/lib/permissions";
import {
  exportBackup,
  getRestaurant,
  listPaymentMethods,
  listTablesAdmin,
  savePaymentMethod,
  saveTable,
  updateSettings,
} from "@/lib/server/pos";
import type { PaymentKind } from "@/lib/types";
import { useStaffSession } from "@/store/session";

export function SettingsPage() {
  const token = useStaffSession((s) => s.token);
  const staff = useStaffSession((s) => s.staff);
  const qc = useQueryClient();
  const restaurantQ = useQuery({ queryKey: ["restaurant"], queryFn: () => getRestaurant() });
  const tables = useQuery({
    queryKey: ["admin-tables"],
    queryFn: () => listTablesAdmin({ data: { token } }),
    enabled: !!token,
  });
  const methods = useQuery({
    queryKey: ["pay-methods"],
    queryFn: () => listPaymentMethods({ data: { token } }),
    enabled: !!token,
  });
  const r = restaurantQ.data;
  const [name, setName] = useState(r?.name ?? "M'dede Restaurant");
  const [address, setAddress] = useState(r?.address ?? "");
  const [phone, setPhone] = useState(r?.phone ?? "");
  const [currency, setCurrency] = useState(r?.currency ?? "MWK");
  const [timezone, setTimezone] = useState(r?.timezone ?? "Africa/Blantyre");
  const [tax, setTax] = useState(String(r?.taxRate ?? 18));
  const [service, setService] = useState(String(r?.serviceCharge ?? 0));
  const [header, setHeader] = useState(r?.receiptHeader ?? "");
  const [footer, setFooter] = useState(r?.receiptFooter ?? "");
  const [kitchen, setKitchen] = useState(r?.kitchenPrinter ?? "browser");
  const [receipt, setReceipt] = useState(r?.receiptPrinter ?? "browser");

  useEffect(() => {
    if (!r) return;
    setName(r.name);
    setAddress(r.address);
    setPhone(r.phone);
    setCurrency(r.currency);
    setTimezone(r.timezone);
    setTax(String(r.taxRate));
    setService(String(r.serviceCharge));
    setHeader(r.receiptHeader);
    setFooter(r.receiptFooter);
    setKitchen(r.kitchenPrinter);
    setReceipt(r.receiptPrinter);
  }, [r]);

  const save = useMutation({
    mutationFn: () =>
      updateSettings({
        data: {
          token,
          name,
          address,
          phone,
          currency,
          timezone,
          taxRate: Number(tax) || 0,
          serviceCharge: Number(service) || 0,
          receiptHeader: header,
          receiptFooter: footer,
          kitchenPrinter: kitchen,
          receiptPrinter: receipt,
        },
      }),
    onSuccess: () => {
      toast.success("Settings saved");
      void qc.invalidateQueries({ queryKey: ["restaurant"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <h1 className="font-display text-3xl">Settings</h1>
      <p className="text-sm text-muted-foreground">Restaurant identity, tax, printers, tables, payments.</p>

      <section className="mt-6 grid gap-3 rounded-xl border border-border bg-card p-5">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Address">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Currency">
            <select
              className="h-11 rounded-md border border-input bg-background px-3"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="MWK">MWK — Malawian Kwacha</option>
              <option value="UGX">UGX — Ugandan Shilling</option>
              <option value="KES">KES — Kenyan Shilling</option>
              <option value="TZS">TZS — Tanzanian Shilling</option>
              <option value="ZMW">ZMW — Zambian Kwacha</option>
              <option value="ZAR">ZAR — South African Rand</option>
              <option value="USD">USD — US Dollar</option>
            </select>
          </Field>
          <Field label="Timezone">
            <select
              className="h-11 rounded-md border border-input bg-background px-3"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              <option value="Africa/Blantyre">Africa/Blantyre (Malawi)</option>
              <option value="Africa/Lusaka">Africa/Lusaka</option>
              <option value="Africa/Nairobi">Africa/Nairobi</option>
              <option value="Africa/Kampala">Africa/Kampala</option>
              <option value="Africa/Dar_es_Salaam">Africa/Dar_es_Salaam</option>
              <option value="Africa/Johannesburg">Africa/Johannesburg</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tax %">
            <Input value={tax} onChange={(e) => setTax(e.target.value)} />
          </Field>
          <Field label="Service charge %">
            <Input value={service} onChange={(e) => setService(e.target.value)} />
          </Field>
        </div>
        <Field label="Receipt header">
          <Textarea value={header} onChange={(e) => setHeader(e.target.value)} />
        </Field>
        <Field label="Receipt footer">
          <Textarea value={footer} onChange={(e) => setFooter(e.target.value)} />
        </Field>
        <Field label="Kitchen printer">
          <Input value={kitchen} onChange={(e) => setKitchen(e.target.value)} placeholder="browser or printer name" />
        </Field>
        <Field label="Receipt printer">
          <Input value={receipt} onChange={(e) => setReceipt(e.target.value)} />
        </Field>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          Save settings
        </Button>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-xl">Tables</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-secondary text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Zone</th>
                <th className="px-3 py-2">Seats</th>
                <th className="px-3 py-2">Active</th>
              </tr>
            </thead>
            <tbody>
              {(tables.data ?? []).map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-3 py-2">{t.name}</td>
                  <td className="px-3 py-2">{t.zone}</td>
                  <td className="px-3 py-2">{t.seats}</td>
                  <td className="px-3 py-2">
                    <Switch
                      checked={t.active}
                      onCheckedChange={(v) =>
                        void saveTable({
                          data: { token, id: t.id, name: t.name, zone: t.zone, seats: t.seats, active: v },
                        }).then(() => qc.invalidateQueries({ queryKey: ["admin-tables"] }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <NewTable token={token} onSaved={() => void qc.invalidateQueries({ queryKey: ["admin-tables"] })} />
      </section>

      <section className="mt-8">
        <h2 className="font-display text-xl">Payment methods</h2>
        <div className="mt-3 grid gap-2">
          {(methods.data ?? []).map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span>
                {m.name} <span className="text-xs text-muted-foreground">{m.kind}</span>
              </span>
              <Switch
                checked={m.active}
                onCheckedChange={(v) =>
                  void savePaymentMethod({
                    data: { token, id: m.id, name: m.name, kind: m.kind, active: v },
                  }).then(() => qc.invalidateQueries({ queryKey: ["pay-methods"] }))
                }
              />
            </div>
          ))}
        </div>
        <NewMethod token={token} onSaved={() => void qc.invalidateQueries({ queryKey: ["pay-methods"] })} />
      </section>

      {staff && canBackup(staff) ? (
        <section className="mt-8 rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-xl">Backup</h2>
          <p className="mt-1 text-sm text-muted-foreground">Download a JSON snapshot of this restaurant.</p>
          <Button
            className="mt-3"
            variant="outline"
            onClick={() =>
              void exportBackup({ data: { token } }).then((dump) => {
                const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `mdede-backup-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              })
            }
          >
            Download backup
          </Button>
        </section>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </label>
  );
}

function NewTable({ token, onSaved }: { token: string; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [zone, setZone] = useState("Dining");
  return (
    <form
      className="mt-3 flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void saveTable({ data: { token, name, zone, seats: 4, active: true } })
          .then(() => {
            setName("");
            onSaved();
          })
          .catch((err: Error) => toast.error(err.message));
      }}
    >
      <Input className="w-32" placeholder="T13" value={name} onChange={(e) => setName(e.target.value)} />
      <Input className="w-32" placeholder="Zone" value={zone} onChange={(e) => setZone(e.target.value)} />
      <Button type="submit" variant="outline">
        Add table
      </Button>
    </form>
  );
}

function NewMethod({ token, onSaved }: { token: string; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PaymentKind>("other");
  return (
    <form
      className="mt-3 flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void savePaymentMethod({ data: { token, name, kind, active: true } })
          .then(() => {
            setName("");
            onSaved();
          })
          .catch((err: Error) => toast.error(err.message));
      }}
    >
      <Input className="w-40" placeholder="Method name" value={name} onChange={(e) => setName(e.target.value)} />
      <select
        className="h-11 rounded-md border border-input bg-background px-3"
        value={kind}
        onChange={(e) => setKind(e.target.value as PaymentKind)}
      >
        <option value="cash">cash</option>
        <option value="mobile">mobile</option>
        <option value="card">card</option>
        <option value="transfer">transfer</option>
        <option value="other">other</option>
      </select>
      <Button type="submit" variant="outline">
        Add method
      </Button>
    </form>
  );
}
