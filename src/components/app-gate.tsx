import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getRestaurant, getSessionStaff } from "@/lib/server/pos";
import { useStaffSession } from "@/store/session";
import { AppShell } from "./app-shell";
import { PinLock } from "./pin-lock";
import { SetupWizard } from "./setup-wizard";
import { Skeleton } from "./ui/skeleton";

export function AppGate({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const token = useStaffSession((s) => s.token);
  const staff = useStaffSession((s) => s.staff);
  const hydrate = useStaffSession((s) => s.hydrate);
  const setSession = useStaffSession((s) => s.setSession);
  const clear = useStaffSession((s) => s.clearSession);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const restaurantQ = useQuery({
    queryKey: ["restaurant"],
    queryFn: () => getRestaurant(),
    enabled: !!user,
  });

  const sessionQ = useQuery({
    queryKey: ["staff-session", token],
    queryFn: () => getSessionStaff({ data: { token } }),
    enabled: !!user && !!token,
  });

  useEffect(() => {
    if (!sessionQ.data) return;
    if (sessionQ.data.staff) setSession(token, sessionQ.data.staff);
    else if (token) clear();
  }, [sessionQ.data, token, setSession, clear]);

  if (isPending) return <BootScreen />;
  if (!user) return <RedirectToSignIn />;
  if (restaurantQ.isPending) return <BootScreen />;
  if (restaurantQ.isError) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <p className="text-destructive">{(restaurantQ.error as Error).message}</p>
      </div>
    );
  }

  const restaurant = restaurantQ.data;
  if (!restaurant?.setupComplete) {
    return <SetupWizard onDone={() => void restaurantQ.refetch()} />;
  }

  if (token && !staff && sessionQ.isPending) return <BootScreen />;
  if (!staff) return <PinLock restaurant={restaurant} />;

  return (
    <AppShell staff={staff} restaurant={restaurant}>
      {children}
    </AppShell>
  );
}

function BootScreen() {
  return (
    <div className="flex min-h-dvh flex-col bg-background p-6">
      <Skeleton className="h-10 w-48" />
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
