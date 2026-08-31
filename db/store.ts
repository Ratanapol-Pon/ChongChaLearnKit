import { env } from 'cloudflare:workers';

let ready: Promise<void> | null = null;

export function getStoreDb(): D1Database {
  if (!env.DB) throw new Error('Cloudflare D1 binding `DB` is unavailable.');
  return env.DB;
}

export async function ensureStoreDatabase(): Promise<void> {
  if (ready) return ready;
  const db = getStoreDb();
  ready = (async () => {
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL,
        address TEXT NOT NULL, map_url TEXT NOT NULL DEFAULT '',
        preferred_call_day INTEGER NOT NULL DEFAULT 25 CHECK(preferred_call_day BETWEEN 1 AND 31),
        preferred_delivery_day INTEGER NOT NULL DEFAULT 1 CHECK(preferred_delivery_day BETWEEN 1 AND 31),
        notes TEXT NOT NULL DEFAULT '', is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_customers_active_name ON customers(is_active, name)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_code INTEGER NOT NULL UNIQUE CHECK(product_code BETWEEN 1 AND 10000000),
        product_name TEXT NOT NULL CHECK(length(trim(product_name)) > 0),
        is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )`),
      db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_products_code_unique ON products(product_code)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_products_active_name ON products(is_active, product_name)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS usual_order_items (
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 1000000),
        PRIMARY KEY(customer_id, product_id)
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS monthly_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL REFERENCES customers(id),
        order_month TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','call_again','confirmed','skipped')),
        next_call_at TEXT NOT NULL DEFAULT '', delivery_date TEXT NOT NULL DEFAULT '',
        contact_note TEXT NOT NULL DEFAULT '', confirmed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(customer_id, order_month)
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_orders_month_status ON monthly_orders(order_month, status)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON monthly_orders(delivery_date)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS monthly_order_items (
        order_id INTEGER NOT NULL REFERENCES monthly_orders(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id), product_code_snapshot INTEGER NOT NULL,
        product_name_snapshot TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 1000000),
        PRIMARY KEY(order_id, product_id)
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL, action TEXT NOT NULL,
        entity_type TEXT NOT NULL, entity_id INTEGER, details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id)'),
    ]);
    await db.prepare('PRAGMA optimize').run();
  })().catch((error) => { ready = null; throw error; });
  return ready;
}

export async function writeAudit(actorId: string, action: string, entityType: string, entityId: number | null, details: unknown = {}): Promise<void> {
  const db = getStoreDb();
  await db.prepare('INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(actorId, action, entityType, entityId, JSON.stringify(details), new Date().toISOString()).run();
}
