import { useMutation } from "@tanstack/react-query";
import { Delete, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { UserButton } from "@/lib/auth/gates";
import { pinLogin } from "@/lib/server/pos";
import type { Restaurant, Staff } from "@/lib/types";
import { useStaffSession } from "@/store/session";
import { Button } from "./ui/button";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "←"];

export function PinLock({ restaurant }: { restaurant: Restaurant | null }) {
  const [pin, setPin] = useState("");
  const setSession = useStaffSession((s) => s.setSession);

  const login = useMutation({
    mutationFn: (value: string) => pinLogin({ data: { pin: value } }),
    onSuccess: (res: { token: string; staff: Staff }) => {
      setSession(res.token, res.staff);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setPin("");
    },
  });

  function press(key: string) {
    if (key === "C") {
      setPin("");
      return;
    }
    if (key === "←") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const next = (pin + key).slice(0, 6);
    setPin(next);
    if (next.length >= 4) {
      /* wait for Enter / 6 digits — auto-submit at 4 if unique; keep 4–6 */
    }
  }

  function submit() {
    if (pin.length < 4) return;
    login.mutate(pin);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 py-10">
      <div className="mb-8 flex w-full items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
            <UtensilsCrossed className="size-5" />
          </span>
          <div>
            <p className="font-display text-lg leading-none">{restaurant?.name ?? "M'dede Restaurant"}</p>
            <p className="mt-1 text-xs text-muted-foreground">Clock in with your PIN</p>
          </div>
        </div>
        <UserButton />
      </div>

      <div className="mb-6 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <span
            key={i}
            className={`size-3 rounded-full ${i < pin.length ? "bg-primary" : "bg-accent"}`}
          />
        ))}
        {pin.length > 4 ? (
          <span className="text-xs text-muted-foreground tabular-nums">{pin.length}</span>
        ) : null}
      </div>

      <div className="grid w-full grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className="h-16 rounded-lg bg-secondary text-xl font-medium hover:bg-accent"
            onClick={() => press(k)}
          >
            {k === "←" ? <Delete className="mx-auto size-5" /> : k}
          </button>
        ))}
      </div>

      <Button className="mt-4 w-full" size="xl" disabled={pin.length < 4 || login.isPending} onClick={submit}>
        {login.isPending ? "Checking…" : "Clock in"}
      </Button>

      {restaurant?.sampleSeeded ? (
        <div className="mt-8 w-full rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <p className="text-foreground font-medium">Sample PINs</p>
          <ul className="mt-2 grid grid-cols-2 gap-y-1 tabular-nums">
            <li>Amina · waiter 1111</li>
            <li>Joseph · waiter 2222</li>
            <li>Grace · cashier 3333</li>
            <li>David · manager 1234</li>
            <li>Admin 9999</li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
