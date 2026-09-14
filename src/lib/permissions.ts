import type { Staff, StaffRole } from "./types";

export function canEnterOrders(_staff: Staff) {
  return _staff.active;
}

export function canClosePayments(staff: Staff) {
  if (!staff.active) return false;
  if (staff.role === "waiter") return staff.canClosePayments;
  return true;
}

export function canViewAllOrders(staff: Staff) {
  return staff.role !== "waiter";
}

export function canVoid(staff: Staff) {
  return staff.role === "manager" || staff.role === "admin";
}

export function canDiscount(staff: Staff) {
  return staff.role === "cashier" || staff.role === "manager" || staff.role === "admin";
}

export function canManageMenu(staff: Staff) {
  return staff.role === "manager" || staff.role === "admin";
}

export function canManageStaff(staff: Staff) {
  return staff.role === "manager" || staff.role === "admin";
}

export function canViewReports(staff: Staff) {
  return staff.role === "manager" || staff.role === "admin";
}

export function canManageSettings(staff: Staff) {
  return staff.role === "manager" || staff.role === "admin";
}

export function canBackup(staff: Staff) {
  return staff.role === "admin";
}

export function canCloseShift(staff: Staff) {
  return staff.role === "manager" || staff.role === "admin";
}

export function roleRank(role: StaffRole): number {
  switch (role) {
    case "admin":
      return 4;
    case "manager":
      return 3;
    case "cashier":
      return 2;
    default:
      return 1;
  }
}
