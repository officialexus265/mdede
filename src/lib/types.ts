export type StaffRole = "waiter" | "cashier" | "manager" | "admin";
export type OrderStatus = "open" | "bill_requested" | "paid" | "voided";
export type TableStatus = "free" | "occupied" | "bill_requested";
export type ItemKind = "food" | "drink";
export type PaymentKind = "cash" | "mobile" | "card" | "transfer" | "other";
export type DiscountType = "percent" | "fixed";

export type Restaurant = {
  userId: string;
  name: string;
  address: string;
  phone: string;
  currency: string;
  timezone: string;
  taxRate: number;
  serviceCharge: number;
  receiptHeader: string;
  receiptFooter: string;
  kitchenPrinter: string;
  receiptPrinter: string;
  nextOrderNumber: number;
  setupComplete: boolean;
  sampleSeeded: boolean;
};

export type Staff = {
  id: number;
  name: string;
  role: StaffRole;
  active: boolean;
  canClosePayments: boolean;
};

export type StaffSession = {
  token: string;
  staff: Staff;
};

export type DiningTable = {
  id: number;
  name: string;
  zone: string;
  seats: number;
  sortOrder: number;
  active: boolean;
  status: TableStatus;
  order: FloorOrder | null;
};

export type FloorOrder = {
  id: number;
  orderNumber: number;
  waiterName: string;
  waiterStaffId: number | null;
  status: OrderStatus;
  total: number;
  itemCount: number;
  enteredAt: string;
};

export type ModifierOption = {
  id: number;
  name: string;
  extraPrice: number;
};

export type Modifier = {
  id: number;
  name: string;
  required: boolean;
  options: ModifierOption[];
};

export type MenuItem = {
  id: number;
  categoryId: number;
  categoryName: string;
  kind: ItemKind;
  name: string;
  description: string;
  price: number;
  available: boolean;
  soldOut: boolean;
  isSpecial: boolean;
  lowStock: boolean;
  stockNote: string;
  active: boolean;
  modifiers: Modifier[];
};

export type Category = {
  id: number;
  name: string;
  kind: ItemKind;
  sortOrder: number;
  active: boolean;
  items: MenuItem[];
};

export type OrderItemModifier = {
  id: number;
  name: string;
  extraPrice: number;
};

export type OrderItem = {
  id: number;
  menuItemId: number | null;
  name: string;
  categoryName: string;
  kind: ItemKind;
  quantity: number;
  unitPrice: number;
  notes: string;
  kitchenSent: boolean;
  voided: boolean;
  voidReason: string;
  modifiers: OrderItemModifier[];
  lineTotal: number;
};

export type Payment = {
  id: number;
  methodId: number | null;
  methodName: string;
  methodKind: string;
  amount: number;
  tendered: number;
  changeAmount: number;
  createdBy: string;
  createdAt: string;
};

export type OrderEvent = {
  id: number;
  eventType: string;
  detail: string;
  staffName: string;
  createdAt: string;
};

export type Order = {
  id: number;
  orderNumber: number;
  tableId: number | null;
  tableName: string;
  waiterStaffId: number | null;
  waiterName: string;
  status: OrderStatus;
  notes: string;
  discountType: DiscountType | null;
  discountValue: number;
  discountReason: string;
  discountBy: string;
  taxRate: number;
  serviceCharge: number;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  serviceAmount: number;
  total: number;
  shiftId: number | null;
  enteredAt: string;
  paidAt: string | null;
  kitchenPrintedAt: string | null;
  kitchenPrintCount: number;
  voidReason: string;
  voidedBy: string;
  items: OrderItem[];
  payments: Payment[];
  events: OrderEvent[];
};

export type PaymentMethod = {
  id: number;
  name: string;
  kind: PaymentKind;
  active: boolean;
  sortOrder: number;
};

export type Shift = {
  id: number;
  openedByName: string;
  closedByName: string | null;
  openedAt: string;
  closedAt: string | null;
  declaredCash: number | null;
  notes: string;
  status: "open" | "closed";
};

export type DashboardStats = {
  todaySales: number;
  todayOrders: number;
  openOrders: number;
  occupiedTables: number;
  freeTables: number;
  billRequested: number;
  voidsValue: number;
  discountsValue: number;
  averageTicket: number;
  hourBuckets: { hour: string; total: number }[];
  paymentMix: { name: string; total: number }[];
  topItems: { name: string; qty: number; total: number }[];
};

export const ROLE_LABEL: Record<StaffRole, string> = {
  waiter: "Waiter",
  cashier: "Cashier",
  manager: "Manager",
  admin: "Admin",
};
