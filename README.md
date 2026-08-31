# ChongCha Order · ชงชา ออเดอร์

Employee-facing monthly retail order management for a physical grocery store. The application runs on Next.js, deploys to Netlify, and stores data in Supabase PostgreSQL.

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

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/migrations/20260831133000_initial_retail_order_schema.sql` in the Supabase SQL Editor, or link the Supabase CLI and run `supabase db push`.
3. Disable public user registration if employee accounts will be created only by the owner.
4. Create each employee under Authentication → Users.
5. Copy `.env.example` to `.env.local` and add the project URL and publishable key.

The database enables Row Level Security. Anonymous visitors cannot access store data; authenticated employees share access to the store's records.

## Local development

Requires Node.js 22.13 or later.

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and sign in with a Supabase employee account.

## Netlify deployment

Connect this GitHub repository to Netlify or deploy with the Netlify CLI. Add these environment variables before the production deploy:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL
```

`NEXT_PUBLIC_SITE_URL` should be the final HTTPS Netlify URL.

## Validation

```bash
npm run lint
npm run build
```

## Security and privacy

- Supabase Auth protects the app; the UI does not provide public sign-up.
- Row Level Security blocks anonymous database access.
- Customer names, phone numbers, addresses, maps, and real orders must never be committed to Git.
- Database triggers record important changes in `audit_logs`.
- Test database exports and restores before using the app as the store's only record.
