import { formatMoney } from "./money";
import type { Order, Restaurant } from "./types";

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function when(iso: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function kitchenTicketHtml(order: Order, restaurant: Restaurant, reprint: boolean) {
  const food = order.items.filter((i) => !i.voided && i.kind === "food");
  const drinks = order.items.filter((i) => !i.voided && i.kind === "drink");
  const unsent = order.items.filter((i) => !i.voided && !i.kitchenSent);
  const isAddition = order.kitchenPrintCount > 0 && unsent.length > 0;
  const list = isAddition ? unsent : order.items.filter((i) => !i.voided);
  const foodList = list.filter((i) => i.kind === "food");
  const drinkList = list.filter((i) => i.kind === "drink");

  const block = (title: string, items: typeof list) => {
    if (!items.length) return "";
    return `<h3>${escapeHtml(title)}</h3>
      ${items
        .map(
          (i) => `<div class="line">
            <div class="qty">${i.quantity}×</div>
            <div>
              <div class="name">${escapeHtml(i.name)}</div>
              ${i.modifiers.map((m) => `<div class="mod">• ${escapeHtml(m.name)}</div>`).join("")}
              ${i.notes ? `<div class="note">NOTE: ${escapeHtml(i.notes)}</div>` : ""}
            </div>
          </div>`,
        )
        .join("")}`;
  };

  return `<!doctype html><html><head><title>Kitchen #${order.orderNumber}</title>
    <style>
      @page { size: 80mm auto; margin: 4mm; }
      body { font-family: ui-monospace, "IBM Plex Mono", monospace; color: #111; width: 72mm; }
      h1 { font-size: 13px; text-align: center; margin: 0 0 4px; letter-spacing: .12em; text-transform: uppercase; }
      h2 { font-size: 22px; text-align: center; margin: 6px 0; }
      h3 { font-size: 12px; border-bottom: 1px dashed #111; margin: 10px 0 6px; letter-spacing: .08em; }
      .meta { font-size: 12px; }
      .line { display: flex; gap: 8px; margin: 6px 0; font-size: 14px; }
      .qty { font-weight: 700; min-width: 2.2em; }
      .name { font-weight: 700; }
      .mod, .note { font-size: 12px; }
      .note { font-weight: 700; text-transform: uppercase; }
      .banner { text-align: center; font-weight: 700; border: 2px solid #111; padding: 4px; margin: 6px 0; }
      hr { border: none; border-top: 1px dashed #111; }
    </style></head><body>
    <h1>${escapeHtml(restaurant.name)}</h1>
    <div class="banner">${isAddition ? "ADDITION" : reprint ? "REPRINT" : "KITCHEN TICKET"}</div>
    <h2>TABLE ${escapeHtml(order.tableName)}</h2>
    <div class="meta">Ticket #${order.orderNumber}<br>Waiter: ${escapeHtml(order.waiterName)}<br>${escapeHtml(when(new Date().toISOString(), restaurant.timezone))}</div>
    ${order.notes ? `<div class="note" style="margin-top:8px">ORDER NOTE: ${escapeHtml(order.notes)}</div>` : ""}
    <hr>
    ${block("FOOD", foodList.length ? foodList : food.filter((i) => list.includes(i)))}
    ${block("DRINKS", drinkList.length ? drinkList : drinks.filter((i) => list.includes(i)))}
    ${block("ITEMS", list.filter((i) => i.kind !== "food" && i.kind !== "drink"))}
    </body></html>`;
}

export function receiptHtml(order: Order, restaurant: Restaurant) {
  const live = order.items.filter((i) => !i.voided);
  return `<!doctype html><html><head><title>Receipt #${order.orderNumber}</title>
    <style>
      @page { size: 80mm auto; margin: 4mm; }
      body { font-family: ui-monospace, "IBM Plex Mono", monospace; color: #111; width: 72mm; font-size: 12px; }
      h1 { font-size: 16px; text-align: center; margin: 0; font-family: Georgia, serif; }
      .center { text-align: center; }
      .row { display: flex; justify-content: space-between; margin: 3px 0; }
      .tot { font-size: 14px; font-weight: 700; }
      hr { border: none; border-top: 1px dashed #111; }
      .mod { padding-left: 12px; font-size: 11px; }
    </style></head><body>
    <h1>${escapeHtml(restaurant.name)}</h1>
    <div class="center">${escapeHtml(restaurant.receiptHeader || restaurant.address)}</div>
    <div class="center">${escapeHtml(restaurant.phone)}</div>
    <hr>
    <div>Receipt #${order.orderNumber} · Table ${escapeHtml(order.tableName)}</div>
    <div>Waiter: ${escapeHtml(order.waiterName)}</div>
    <div>${escapeHtml(when(order.paidAt || order.enteredAt, restaurant.timezone))}</div>
    <hr>
    ${live
      .map(
        (i) => `<div>
          <div class="row"><span>${i.quantity}× ${escapeHtml(i.name)}</span><span>${escapeHtml(formatMoney(i.lineTotal, restaurant.currency))}</span></div>
          ${i.modifiers.map((m) => `<div class="mod">${escapeHtml(m.name)}${m.extraPrice ? " +" + formatMoney(m.extraPrice, restaurant.currency) : ""}</div>`).join("")}
          ${i.notes ? `<div class="mod">${escapeHtml(i.notes)}</div>` : ""}
        </div>`,
      )
      .join("")}
    <hr>
    <div class="row"><span>Subtotal</span><span>${escapeHtml(formatMoney(order.subtotal, restaurant.currency))}</span></div>
    ${order.discountAmount ? `<div class="row"><span>Discount</span><span>-${escapeHtml(formatMoney(order.discountAmount, restaurant.currency))}</span></div>` : ""}
    ${order.taxAmount ? `<div class="row"><span>Tax ${order.taxRate}%</span><span>${escapeHtml(formatMoney(order.taxAmount, restaurant.currency))}</span></div>` : ""}
    ${order.serviceAmount ? `<div class="row"><span>Service ${order.serviceCharge}%</span><span>${escapeHtml(formatMoney(order.serviceAmount, restaurant.currency))}</span></div>` : ""}
    <div class="row tot"><span>TOTAL</span><span>${escapeHtml(formatMoney(order.total, restaurant.currency))}</span></div>
    <hr>
    ${order.payments
      .map(
        (p) =>
          `<div class="row"><span>${escapeHtml(p.methodName)}</span><span>${escapeHtml(formatMoney(p.amount, restaurant.currency))}</span></div>${
            p.changeAmount ? `<div class="row"><span>Change</span><span>${escapeHtml(formatMoney(p.changeAmount, restaurant.currency))}</span></div>` : ""
          }`,
      )
      .join("")}
    <hr>
    <div class="center">${escapeHtml(restaurant.receiptFooter)}</div>
    </body></html>`;
}

export function printHtml(html: string) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  const run = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 1000);
  };
  iframe.onload = run;
  setTimeout(run, 250);
}

export type ReportColumn = { key: string; label: string; align?: "left" | "right" };

/**
 * A4-formatted printable report table. "Export PDF" in the UI opens this
 * through the browser print dialog with "Save as PDF" as the destination —
 * no PDF library needed, works on every platform, and the printed file looks
 * clean (title, generated-at stamp, restaurant name, a simple table).
 */
export function reportHtml(
  title: string,
  restaurant: Restaurant,
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  subtitle?: string,
) {
  const cell = (v: unknown) => (v == null || v === "" ? "—" : escapeHtml(String(v)));
  return `<!doctype html><html><head><title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4; margin: 16mm; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; }
      h1 { font-size: 20px; margin: 0 0 2px; }
      .meta { font-size: 12px; color: #555; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left; }
      th { text-transform: uppercase; letter-spacing: .04em; font-size: 10px; color: #555; }
      td.right, th.right { text-align: right; }
      tfoot td { font-weight: 700; border-top: 2px solid #111; border-bottom: none; }
    </style></head><body>
    <h1>${escapeHtml(restaurant.name)} — ${escapeHtml(title)}</h1>
    <div class="meta">${subtitle ? escapeHtml(subtitle) + " · " : ""}Generated ${escapeHtml(when(new Date().toISOString(), restaurant.timezone))}</div>
    <table>
      <thead><tr>${columns.map((c) => `<th class="${c.align === "right" ? "right" : ""}">${escapeHtml(c.label)}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows
          .map(
            (r) =>
              `<tr>${columns.map((c) => `<td class="${c.align === "right" ? "right" : ""}">${cell(r[c.key])}</td>`).join("")}</tr>`,
          )
          .join("")}
      </tbody>
    </table>
    ${!rows.length ? `<p style="color:#888;font-size:12px;margin-top:12px;">No data for this range.</p>` : ""}
    </body></html>`;
}

/** Open the print dialog on a formatted report table (see `reportHtml`). */
export function printReport(
  title: string,
  restaurant: Restaurant,
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  subtitle?: string,
) {
  printHtml(reportHtml(title, restaurant, columns, rows, subtitle));
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = r[h] == null ? "" : String(r[h]);
          return `"${v.replaceAll('"', '""')}"`;
        })
        .join(","),
    ),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
