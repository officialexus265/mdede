export function GuidePage() {
  return (
    <article className="mx-auto max-w-3xl p-4 pb-16 md:p-8">
      <p className="text-xs tracking-[0.2em] text-primary uppercase">System 2 · Variation B</p>
      <h1 className="font-display mt-2 text-4xl">M'dede Restaurant</h1>
      <p className="mt-3 text-muted-foreground">
        Paper pads on the floor. One desktop station for cashiers, waiters, and managers. Kitchen works from
        printed tickets — no waiter phones, no kitchen display.
      </p>

      <H>How a ticket moves</H>
      <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
        <li>Waiter writes the full order on a paper pad (table, items, modifiers, notes).</li>
        <li>Waiter brings the pad to this station and opens the table.</li>
        <li>Items, quantities, modifiers and notes are typed in. Search is built for that pad.</li>
        <li>
          <strong className="text-foreground">Send to kitchen</strong> prints a thermal ticket immediately.
        </li>
        <li>A runner walks the ticket to the kitchen. Kitchen cooks from paper only.</li>
        <li>When food is ready, kitchen calls the waiter (verbal — no screen).</li>
        <li>Guest ready to pay: open the ticket, take split tenders, lock as Paid.</li>
        <li>Manager runs end-of-day: expected cash vs declared drawer, payment mix, voids.</li>
      </ol>

      <H>Roles</H>
      <ul className="space-y-2 text-sm leading-relaxed">
        <li>
          <strong className="text-foreground">Waiter</strong> — enter orders, print kitchen tickets, see own
          tickets. Close bills only if permitted.
        </li>
        <li>
          <strong className="text-foreground">Cashier</strong> — any table, any payment, split tenders, receipts.
        </li>
        <li>
          <strong className="text-foreground">Manager</strong> — menu, staff, discounts, voids, reports, EOD.
        </li>
        <li>
          <strong className="text-foreground">Admin</strong> — settings plus JSON backup.
        </li>
      </ul>

      <H>Architecture</H>
      <p className="text-sm leading-relaxed">
        Multi-tenant desktop web app. Each signed-in owner has one restaurant. Staff clock in with a PIN on
        this station. Orders, payments, and the menu live in Postgres. Kitchen and receipt printing use the
        browser print dialog aimed at 80mm printers. Reports export CSV for Excel and print-to-PDF.
      </p>

      <H>Main data</H>
      <ul className="space-y-1 text-sm leading-relaxed">
        <li>restaurants — identity, tax, service, printers, next ticket number</li>
        <li>staff / staff_sessions — roles and hashed PINs</li>
        <li>dining_tables — floor with Free / Occupied / Bill requested</li>
        <li>categories, menu_items, modifiers — price snapshots at order time</li>
        <li>orders, order_items, order_item_modifiers — full ticket history</li>
        <li>payments — method, amount, tendered, change</li>
        <li>order_events — created, kitchen print, paid, void, move, merge</li>
        <li>shifts — open/close, declared cash, variance</li>
      </ul>

      <H>Kitchen ticket</H>
      <p className="text-sm leading-relaxed">
        Restaurant name, ticket number, table, waiter, time, items with quantities, modifiers, special notes,
        food vs drinks. Reprints are marked REPRINT; items added after the first send print as ADDITION.
      </p>

      <H>Assumptions</H>
      <ul className="space-y-1 text-sm leading-relaxed">
        <li>Meals and drinks only — no rooms, no spa, no inventory purchasing.</li>
        <li>One restaurant per owner account. Several browsers can share that restaurant.</li>
        <li>Currency defaults to MWK (Malawian Kwacha); tax default 18% exclusive of prices. Both can be changed under Settings.</li>
        <li>Kitchen printer is the OS print dialog (configure the 80mm device there).</li>
        <li>Manager PIN authorises voids when the signed-in role cannot void.</li>
      </ul>
    </article>
  );
}

function H({ children }: { children: string }) {
  return <h2 className="font-display mt-10 mb-3 text-2xl">{children}</h2>;
}
