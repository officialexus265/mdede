import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  ClipboardList,
  LayoutGrid,
  LogOut,
  Settings,
  UtensilsCrossed,
  Users,
  BarChart3,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { UserButton } from "@/lib/auth/gates";
import { InstallAppButton } from "./install-app-button";
import { clockInZone } from "@/lib/money";
import {
  canManageMenu,
  canManageSettings,
  canManageStaff,
  canViewReports,
} from "@/lib/permissions";
import { pinLogout } from "@/lib/server/pos";
import type { Restaurant, Staff } from "@/lib/types";
import { ROLE_LABEL } from "@/lib/types";
import { useStaffSession } from "@/store/session";
import { Button } from "./ui/button";

const NAV = [
  { to: "/", label: "Floor", icon: LayoutGrid, show: () => true },
  { to: "/orders", label: "Orders", icon: ClipboardList, show: () => true },
  { to: "/menu", label: "Menu", icon: UtensilsCrossed, show: canManageMenu },
  { to: "/reports", label: "Reports", icon: BarChart3, show: canViewReports },
  { to: "/staff", label: "Staff", icon: Users, show: canManageStaff },
  { to: "/settings", label: "Settings", icon: Settings, show: canManageSettings },
  { to: "/guide", label: "Guide", icon: BookOpen, show: canViewReports },
] as const;

export function AppShell({
  staff,
  restaurant,
  children,
}: {
  staff: Staff;
  restaurant: Restaurant;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const clear = useStaffSession((s) => s.clearSession);
  const token = useStaffSession((s) => s.token);
  const [now, setNow] = useState(() => clockInZone(restaurant.timezone));

  useEffect(() => {
    const t = setInterval(() => setNow(clockInZone(restaurant.timezone)), 30_000);
    return () => clearInterval(t);
  }, [restaurant.timezone]);

  const items = NAV.filter((n) => n.show(staff));

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="no-print sticky top-0 hidden h-dvh w-52 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="px-4 py-5">
          <p className="font-display text-lg leading-tight">{restaurant.name}</p>
          <p className="mt-1 text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Station</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2">
          {items.map((n) => {
            const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex h-11 items-center gap-2 rounded-md px-3 text-sm font-medium ${
                  active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                }`}
              >
                <n.icon className="size-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <p className="truncate text-sm font-medium">{staff.name}</p>
          <p className="text-xs text-muted-foreground">{ROLE_LABEL[staff.role]}</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start"
            onClick={() => {
              void pinLogout({ data: { token } });
              clear();
            }}
          >
            <LogOut className="size-4" />
            Clock out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex h-14 items-center justify-between gap-3 border-b border-border px-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium md:hidden">{restaurant.name}</p>
            <p className="text-xs text-muted-foreground tabular-nums">{now}</p>
          </div>
          <div className="flex items-center gap-3">
            <InstallAppButton />
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {staff.name} · {ROLE_LABEL[staff.role]}
            </span>
            <UserButton />
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
        <nav className="no-print sticky bottom-0 grid grid-cols-4 gap-1 border-t border-border bg-card p-2 md:hidden">
          {items.slice(0, 4).map((n) => {
            const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex min-h-11 flex-col items-center justify-center rounded-md text-[11px] ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <n.icon className="size-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
