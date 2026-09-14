# M'dede Restaurant — POS

A paper-pad-plus-desktop restaurant & bar management system: waiters write
orders on paper, a cashier/waiter types them into this app, it prints a
kitchen ticket, and closes/balances payments at end of day.

Standalone build — no external platform dependency. Built with TanStack
Start (React 19), Postgres (or embedded PGLite for local dev), Better Auth
(email/password).

## Quick start (local)

```
npm install
npm run dev
```

Opens at http://localhost:8080 using an embedded local database (PGLite) —
no setup needed. First visit walks you through creating the restaurant and
an owner PIN.

## Deploying for real

See `docs/deploy-guide.md` in the accompanying system-docs package for a
full beginner walkthrough (Vercel + Neon Postgres). Short version:

```
DATABASE_URL=postgres://...        # Neon, Supabase, RDS, etc.
BETTER_AUTH_SECRET=<random 32+ chars>
BETTER_AUTH_URL=https://your-domain.example
```

then `npm run build` (also applies the DB schema) and start the server for
your platform's Nitro preset (`vite.config.ts` defaults to `"vercel"`; change
to `"node-server"` for a plain Node/Docker deploy).

## What's in here

- `src/routes/` — pages (floor, menu, orders, order detail, reports, staff,
  settings, login)
- `src/components/pos/` — the actual screens/UI
- `src/lib/server/` — server functions: `pos.ts` (orders/tables/shifts),
  `menu.ts`, `reports.ts`, `core.ts` (setup/staff/settings)
- `src/lib/auth/` — self-hosted Better Auth (email/password)
- `src/lib/print.ts` — kitchen ticket / receipt / PDF-report rendering
  (browser print-to-PDF, no external library)
- `src/lib/offline-queue.ts` — the offline order-entry queue (see below)
- `migrations/` — SQL schema
- `public/sw.js` — service worker for offline app-shell caching

## Offline behavior (scoped, by design)

- **Adding items to an open order** works offline — it's saved on-device and
  synced automatically once the connection returns. The UI shows a clear
  "queued offline" badge until it syncs.
- **Payments, voids, discounts, and shift-close still require a live
  connection.** This is deliberate: those move money or need an authorizer
  to see the real result, so they should fail fast and ask staff to wait for
  a connection rather than silently queue and risk a mismatch later.
- The app shell itself (so the screen doesn't go blank) is cached by
  `public/sw.js` once it's been loaded online at least once.

## Before you deploy

I don't have the ability to run `npm install` / a full build in the session
that produced this zip (no network access there), so this hasn't been
build-verified. Please run locally first:

```
npm install
npm run typecheck
npm run dev
```

and click through: setup wizard → add a menu item → open a table → add
items → send to kitchen → pay → reports. If `npm run typecheck` reports
anything, it's most likely in one of the files noted in
`docs/spec-compliance-check.md` / the conversation this was generated from —
paste the error back and it's a quick fix.
