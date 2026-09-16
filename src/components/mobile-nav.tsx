import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Link } from "@tanstack/react-router";
import { LogOut, Menu, X } from "lucide-react";
import { type ComponentType, useState } from "react";
import { ROLE_LABEL, type Restaurant, type Staff } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

type NavItem = { to: string; label: string; icon: ComponentType<{ className?: string }> };

/**
 * The bottom tab bar (see AppShell) only has room for ~4 items, so anyone
 * with more than 4 visible nav entries (any manager/admin: Floor, Orders,
 * Menu, Reports, Staff, Settings, Guide — seven) had no way to reach Staff,
 * Settings, Guide, or even Clock out from a phone. This drawer surfaces the
 * complete nav list plus clock-out, reachable from a hamburger button in the
 * mobile header.
 */
export function MobileNav({
  items,
  pathname,
  staff,
  restaurant,
  onClockOut,
}: {
  items: readonly NavItem[];
  pathname: string;
  staff: Staff;
  restaurant: Restaurant;
  onClockOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu className="size-5" />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex h-dvh w-72 max-w-[85vw] flex-col border-r border-border bg-card p-0 outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
          )}
        >
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <div className="flex items-center justify-between px-4 py-5">
            <p className="font-display text-lg leading-tight">{restaurant.name}</p>
            <DialogPrimitive.Close className="rounded-sm p-1 text-muted-foreground hover:text-foreground">
              <X className="size-5" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>
          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
            {items.map((n) => {
              const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex h-12 items-center gap-3 rounded-md px-3 text-sm font-medium",
                    active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
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
                setOpen(false);
                onClockOut();
              }}
            >
              <LogOut className="size-4" />
              Clock out
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
