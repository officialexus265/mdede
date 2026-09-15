import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { listStaff, saveStaff } from "@/lib/server/pos";
import { ROLE_LABEL, type Staff, type StaffRole } from "@/lib/types";
import { useStaffSession } from "@/store/session";

const ROLES: StaffRole[] = ["waiter", "cashier", "manager", "admin"];

export function StaffPage() {
  const token = useStaffSession((s) => s.token);
  const currentStaffId = useStaffSession((s) => s.staff?.id);
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["staff"],
    queryFn: () => listStaff({ data: { token } }),
    enabled: !!token,
  });
  const [edit, setEdit] = useState<Partial<Staff> & { pin?: string } | "new" | null>(null);

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Staff</h1>
          <p className="text-sm text-muted-foreground">PINs clock people into this station.</p>
        </div>
        <Button onClick={() => setEdit("new")}>New staff</Button>
      </div>
      <div className="mt-5 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="bg-secondary text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Can close bills</th>
              <th className="px-3 py-2">Active</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-3 py-3">
                  <button type="button" className="font-medium hover:underline" onClick={() => setEdit(s)}>
                    {s.name}
                  </button>
                </td>
                <td className="px-3 py-3">
                  <Badge>{ROLE_LABEL[s.role]}</Badge>
                </td>
                <td className="px-3 py-3">{s.canClosePayments ? "Yes" : "No"}</td>
                <td className="px-3 py-3">{s.active ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit ? (
        <StaffEditor
          staff={edit === "new" ? null : edit}
          token={token}
          isSelf={edit !== "new" && edit.id === currentStaffId}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            void qc.invalidateQueries({ queryKey: ["staff"] });
          }}
        />
      ) : null}
    </div>
  );
}

function StaffEditor({
  staff,
  token,
  isSelf,
  onClose,
  onSaved,
}: {
  staff: (Partial<Staff> & { pin?: string }) | null;
  token: string;
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(staff?.name ?? "");
  const [role, setRole] = useState<StaffRole>(staff?.role ?? "waiter");
  const [pin, setPin] = useState("");
  const [active, setActive] = useState(staff?.active ?? true);
  const [canClose, setCanClose] = useState(staff?.canClosePayments ?? role !== "waiter");

  const save = useMutation({
    mutationFn: () =>
      saveStaff({
        data: {
          token,
          id: staff?.id,
          name,
          role,
          pin: pin || undefined,
          active,
          canClosePayments: role === "waiter" ? canClose : true,
        },
      }),
    onSuccess: onSaved,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{staff?.id ? "Edit staff" : "New staff"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          {isSelf ? (
            <p className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
              You're editing your own account, so role and active status are locked — ask another manager or admin
              to change those.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <Button
                key={r}
                variant={role === r ? "default" : "outline"}
                size="sm"
                disabled={isSelf}
                onClick={() => setRole(r)}
              >
                {ROLE_LABEL[r]}
              </Button>
            ))}
          </div>
          <Input
            placeholder={staff?.id ? "New PIN (leave blank to keep)" : "4–6 digit PIN"}
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          <label className="flex items-center justify-between text-sm">
            Active <Switch checked={active} disabled={isSelf} onCheckedChange={setActive} />
          </label>
          {role === "waiter" ? (
            <label className="flex items-center justify-between text-sm">
              May close payments <Switch checked={canClose} onCheckedChange={setCanClose} />
            </label>
          ) : null}
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
