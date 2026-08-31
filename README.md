# ChongCha Order · ชงชา ออเดอร์

Employee-facing monthly retail order management for a physical grocery store.

## What it does

- Stores customer contact details, delivery address, and Google Maps link.
- Stores products with a unique numeric code (`1–10,000,000`) and Thai/English name.
- Saves each customer's usual order with integer quantities (`0–1,000,000`; zero removes a line).
- Generates editable monthly draft orders from usual orders.
- Tracks four call states: draft, call again, confirmed, and skipped.
- Groups confirmed orders into a delivery list.
- Preserves product snapshots and audit records for monthly order history.
- Works on desktop, tablet, and mobile layouts.

Wholesale, pricing, inventory, payment, returns, and route optimization are intentionally outside the current scope.

## Local development

Requires Node.js 22.13 or later.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Local Sites development provides a test sign-in and a local D1 database.

## Validation

```bash
npm run db:generate
npm run lint
npm run build
```

The database schema is defined in `db/schema.ts`. Generated migrations are stored in `drizzle/`.

## Security and privacy

- The main route and API use authenticated-user identity.
- Hosted access should remain private and restricted to approved store employees.
- Customer names, phone numbers, addresses, maps, and real orders must never be committed to Git.
- Every write is validated on the server and important changes are recorded in `audit_logs`.
- Database exports and restore procedures should be tested before using the app as the store's only record.
