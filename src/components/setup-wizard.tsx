import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setupRestaurant } from "@/lib/server/pos";

export function SetupWizard({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("M'dede Restaurant");
  const [address, setAddress] = useState("Lilongwe");
  const [currency, setCurrency] = useState("MWK");
  const [timezone, setTimezone] = useState("Africa/Blantyre");
  const [phone, setPhone] = useState("");
  const [taxRate, setTaxRate] = useState(18);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [tableCount, setTableCount] = useState(12);
  const [managerName, setManagerName] = useState("Manager");
  const [managerPin, setManagerPin] = useState("1234");

  const mutate = useMutation({
    mutationFn: (sample: boolean) =>
      setupRestaurant({
        data: {
          name,
          address,
          phone,
          currency,
          timezone,
          taxRate,
          serviceCharge,
          tableCount,
          managerName,
          managerPin,
          sample,
        },
      }),
    onSuccess: () => onDone(),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-5 py-10">
      <p className="text-xs tracking-[0.22em] text-primary uppercase">First-time setup</p>
      <h1 className="font-display mt-2 text-4xl tracking-tight">Open M'dede</h1>
      <p className="mt-3 text-muted-foreground">
        Paper pads stay on the floor. This station captures every order, prints the kitchen ticket, and
        balances the till.
      </p>

      <div className="mt-8 grid gap-4">
        <Field label="Restaurant name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Address">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
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
            <Input
              type="number"
              value={taxRate}
              onChange={(e) => setTaxRate(Number(e.target.value))}
            />
          </Field>
          <Field label="Service charge %">
            <Input
              type="number"
              value={serviceCharge}
              onChange={(e) => setServiceCharge(Number(e.target.value))}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Manager name">
            <Input value={managerName} onChange={(e) => setManagerName(e.target.value)} />
          </Field>
          <Field label="Manager PIN">
            <Input
              inputMode="numeric"
              value={managerPin}
              onChange={(e) => setManagerPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </Field>
        </div>
        <Field label="Tables (if starting empty)">
          <Input
            type="number"
            value={tableCount}
            onChange={(e) => setTableCount(Number(e.target.value))}
          />
        </Field>
      </div>

      <div className="mt-8 grid gap-3">
        <Button size="xl" disabled={mutate.isPending} onClick={() => mutate.mutate(true)}>
          Open with M'dede sample floor & menu
        </Button>
        <Button
          size="lg"
          variant="outline"
          disabled={mutate.isPending}
          onClick={() => mutate.mutate(false)}
        >
          Start empty (tables + manager only)
        </Button>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Sample staff PINs: Waiter 1111 / 2222 · Cashier 3333 · Manager 1234 · Admin 9999
      </p>
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
