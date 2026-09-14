export function formatMoney(amount: number, currency = "UGX"): string {
  const n = Math.round(Number(amount) || 0);
  const formatted = n.toLocaleString("en-UG");
  return `${currency} ${formatted}`;
}

export function asInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return 0;
}

export function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1 || value === "1";
}

export function asIso(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  const s = String(value);
  if (!s) return "";
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return s;
}

export function asIsoOrNull(value: unknown): string | null {
  if (value == null || value === "") return null;
  const s = asIso(value);
  return s || null;
}

export function clockInZone(timezone: string, date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function computeTotals(input: {
  subtotal: number;
  discountType: "percent" | "fixed" | null;
  discountValue: number;
  taxRate: number;
  serviceCharge: number;
}) {
  const subtotal = Math.max(0, Math.round(input.subtotal));
  let discountAmount = 0;
  if (input.discountType === "percent") {
    discountAmount = Math.round((subtotal * input.discountValue) / 100);
  } else if (input.discountType === "fixed") {
    discountAmount = Math.round(input.discountValue);
  }
  discountAmount = Math.min(discountAmount, subtotal);
  const net = subtotal - discountAmount;
  const taxAmount = Math.round((net * input.taxRate) / 100);
  const serviceAmount = Math.round((net * input.serviceCharge) / 100);
  const total = net + taxAmount + serviceAmount;
  return { subtotal, discountAmount, taxAmount, serviceAmount, total, net };
}
