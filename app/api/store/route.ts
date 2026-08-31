import { headers } from 'next/headers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensureStoreDatabase, getStoreDb, writeAudit } from '@/db/store';

export const dynamic = 'force-dynamic';

type ItemInput = { productId: number; quantity: number };
const STATUSES = new Set(['draft', 'call_again', 'confirmed', 'skipped']);

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function actorId(): Promise<string | null> {
  const user = await getChatGPTUser();
  if (user) return user.userId;
  const requestHeaders = await headers();
  const host = requestHeaders.get('host') ?? '';
  return host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'local-preview' : null;
}

function stringValue(value: unknown, name: string, max = 500): string {
  if (typeof value !== 'string') throw new Error(`${name} ไม่ถูกต้อง`);
  const result = value.trim();
  if (!result || result.length > max) throw new Error(`${name} ไม่ถูกต้อง`);
  return result;
}

function optionalString(value: unknown, max = 1000): string {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw new Error('ข้อมูลไม่ถูกต้อง');
  return value.trim();
}

function integerValue(value: unknown, name: string, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${name} ต้องอยู่ระหว่าง ${min.toLocaleString()} ถึง ${max.toLocaleString()}`);
  return parsed;
}

function monthValue(value: unknown): string {
  const month = stringValue(value, 'เดือน', 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('รูปแบบเดือนไม่ถูกต้อง');
  return month;
}

function idValue(value: unknown, name = 'รหัส'): number {
  return integerValue(value, name, 1, 2_147_483_647);
}

function itemValues(value: unknown): ItemInput[] {
  if (!Array.isArray(value)) throw new Error('รายการสินค้าไม่ถูกต้อง');
  const seen = new Set<number>();
  return value.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('รายการสินค้าไม่ถูกต้อง');
    const item = raw as Record<string, unknown>;
    const productId = idValue(item.productId, 'รหัสสินค้า');
    const quantity = integerValue(item.quantity, 'จำนวน', 0, 1_000_000);
    if (seen.has(productId)) throw new Error('มีสินค้าซ้ำในออเดอร์');
    seen.add(productId);
    return { productId, quantity };
  }).filter((item) => item.quantity > 0);
}

export async function GET(request: Request) {
  const actor = await actorId();
  if (!actor) return json({ error: 'กรุณาเข้าสู่ระบบ' }, 401);
  try {
    await ensureStoreDatabase();
    const db = getStoreDb();
    const month = monthValue(new URL(request.url).searchParams.get('month'));
    const [customerRows, productRows, templateRows, orderRows, orderItemRows] = await Promise.all([
      db.prepare(`SELECT id, name, phone, address, map_url AS mapUrl,
        preferred_call_day AS preferredCallDay, preferred_delivery_day AS preferredDeliveryDay,
        notes FROM customers WHERE is_active = 1 ORDER BY name COLLATE NOCASE`).all(),
      db.prepare(`SELECT id, product_code AS productCode, product_name AS productName
        FROM products WHERE is_active = 1 ORDER BY product_code`).all(),
      db.prepare(`SELECT customer_id AS customerId, product_id AS productId, quantity
        FROM usual_order_items ORDER BY customer_id, product_id`).all(),
      db.prepare(`SELECT o.id, o.customer_id AS customerId, o.order_month AS orderMonth,
        o.status, o.next_call_at AS nextCallAt, o.delivery_date AS deliveryDate,
        o.contact_note AS contactNote, o.confirmed_at AS confirmedAt,
        c.name AS customerName, c.phone, c.address, c.map_url AS mapUrl
        FROM monthly_orders o JOIN customers c ON c.id = o.customer_id
        WHERE o.order_month = ? AND c.is_active = 1 ORDER BY c.name COLLATE NOCASE`).bind(month).all(),
      db.prepare(`SELECT i.order_id AS orderId, i.product_id AS productId,
        i.product_code_snapshot AS productCode, i.product_name_snapshot AS productName, i.quantity
        FROM monthly_order_items i JOIN monthly_orders o ON o.id = i.order_id
        WHERE o.order_month = ? ORDER BY i.product_code_snapshot`).bind(month).all(),
    ]);

    const templates = new Map<number, unknown[]>();
    for (const row of templateRows.results as Array<Record<string, unknown>>) {
      const customerId = Number(row.customerId);
      const current = templates.get(customerId) ?? [];
      current.push({ productId: Number(row.productId), quantity: Number(row.quantity) });
      templates.set(customerId, current);
    }
    const orderItems = new Map<number, unknown[]>();
    for (const row of orderItemRows.results as Array<Record<string, unknown>>) {
      const orderId = Number(row.orderId);
      const current = orderItems.get(orderId) ?? [];
      current.push({ productId: Number(row.productId), productCode: Number(row.productCode), productName: String(row.productName), quantity: Number(row.quantity) });
      orderItems.set(orderId, current);
    }

    const customers = (customerRows.results as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      id: Number(row.id), preferredCallDay: Number(row.preferredCallDay), preferredDeliveryDay: Number(row.preferredDeliveryDay),
      usualItems: templates.get(Number(row.id)) ?? [],
    }));
    const products = (productRows.results as Array<Record<string, unknown>>).map((row) => ({ ...row, id: Number(row.id), productCode: Number(row.productCode) }));
    const orders = (orderRows.results as Array<Record<string, unknown>>).map((row) => ({ ...row, id: Number(row.id), customerId: Number(row.customerId), items: orderItems.get(Number(row.id)) ?? [] }));
    return json({ month, customers, products, orders });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'ไม่สามารถโหลดข้อมูลได้' }, 400);
  }
}

export async function POST(request: Request) {
  const actor = await actorId();
  if (!actor) return json({ error: 'กรุณาเข้าสู่ระบบ' }, 401);
  try {
    await ensureStoreDatabase();
    const db = getStoreDb();
    const body = await request.json() as Record<string, unknown>;
    const operation = stringValue(body.operation, 'คำสั่ง', 40);
    const now = new Date().toISOString();

    if (operation === 'save_customer') {
      const name = stringValue(body.name, 'ชื่อลูกค้า', 160);
      const phone = stringValue(body.phone, 'เบอร์โทรศัพท์', 40);
      const address = stringValue(body.address, 'ที่อยู่', 500);
      const mapUrl = optionalString(body.mapUrl, 500);
      if (mapUrl && !/^https:\/\//i.test(mapUrl)) throw new Error('ลิงก์แผนที่ต้องขึ้นต้นด้วย https://');
      const preferredCallDay = integerValue(body.preferredCallDay, 'วันที่โทร', 1, 31);
      const preferredDeliveryDay = integerValue(body.preferredDeliveryDay, 'วันที่จัดส่ง', 1, 31);
      const notes = optionalString(body.notes, 1000);
      let id: number;
      if (body.id) {
        id = idValue(body.id);
        await db.prepare(`UPDATE customers SET name=?, phone=?, address=?, map_url=?, preferred_call_day=?,
          preferred_delivery_day=?, notes=?, updated_at=? WHERE id=? AND is_active=1`)
          .bind(name, phone, address, mapUrl, preferredCallDay, preferredDeliveryDay, notes, now, id).run();
      } else {
        const result = await db.prepare(`INSERT INTO customers
          (name, phone, address, map_url, preferred_call_day, preferred_delivery_day, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(name, phone, address, mapUrl, preferredCallDay, preferredDeliveryDay, notes, now, now).run();
        id = Number(result.meta.last_row_id);
      }
      await writeAudit(actor, body.id ? 'update' : 'create', 'customer', id, { name });
      return json({ ok: true, id });
    }

    if (operation === 'archive_customer') {
      const id = idValue(body.id);
      await db.prepare('UPDATE customers SET is_active=0, updated_at=? WHERE id=?').bind(now, id).run();
      await writeAudit(actor, 'archive', 'customer', id);
      return json({ ok: true });
    }

    if (operation === 'save_product') {
      const productCode = integerValue(body.productCode, 'รหัสสินค้า', 1, 10_000_000);
      const productName = stringValue(body.productName, 'ชื่อสินค้า', 200);
      let id: number;
      try {
        if (body.id) {
          id = idValue(body.id);
          await db.prepare('UPDATE products SET product_code=?, product_name=?, updated_at=? WHERE id=? AND is_active=1')
            .bind(productCode, productName, now, id).run();
        } else {
          const result = await db.prepare('INSERT INTO products (product_code, product_name, created_at, updated_at) VALUES (?, ?, ?, ?)')
            .bind(productCode, productName, now, now).run();
          id = Number(result.meta.last_row_id);
        }
      } catch {
        throw new Error('รหัสสินค้านี้มีอยู่แล้ว');
      }
      await writeAudit(actor, body.id ? 'update' : 'create', 'product', id, { productCode, productName });
      return json({ ok: true, id });
    }

    if (operation === 'archive_product') {
      const id = idValue(body.id);
      await db.prepare('UPDATE products SET is_active=0, updated_at=? WHERE id=?').bind(now, id).run();
      await writeAudit(actor, 'archive', 'product', id);
      return json({ ok: true });
    }

    if (operation === 'save_template') {
      const customerId = idValue(body.customerId, 'รหัสลูกค้า');
      const items = itemValues(body.items);
      const statements = [db.prepare('DELETE FROM usual_order_items WHERE customer_id=?').bind(customerId)];
      for (const item of items) statements.push(db.prepare('INSERT INTO usual_order_items (customer_id, product_id, quantity) VALUES (?, ?, ?)').bind(customerId, item.productId, item.quantity));
      await db.batch(statements);
      await writeAudit(actor, 'update', 'usual_order', customerId, { itemCount: items.length });
      return json({ ok: true });
    }

    if (operation === 'generate_orders') {
      const month = monthValue(body.month);
      await db.prepare(`INSERT OR IGNORE INTO monthly_orders
        (customer_id, order_month, status, created_at, updated_at)
        SELECT id, ?, 'draft', ?, ? FROM customers WHERE is_active=1`).bind(month, now, now).run();
      await db.prepare(`INSERT OR IGNORE INTO monthly_order_items
        (order_id, product_id, product_code_snapshot, product_name_snapshot, quantity)
        SELECT o.id, u.product_id, p.product_code, p.product_name, u.quantity
        FROM monthly_orders o JOIN usual_order_items u ON u.customer_id=o.customer_id
        JOIN products p ON p.id=u.product_id WHERE o.order_month=? AND p.is_active=1`).bind(month).run();
      await writeAudit(actor, 'generate', 'monthly_orders', null, { month });
      return json({ ok: true });
    }

    if (operation === 'create_order') {
      const month = monthValue(body.month);
      const customerId = idValue(body.customerId, 'รหัสลูกค้า');
      await db.prepare(`INSERT OR IGNORE INTO monthly_orders (customer_id, order_month, status, created_at, updated_at)
        VALUES (?, ?, 'draft', ?, ?)`).bind(customerId, month, now, now).run();
      const order = await db.prepare('SELECT id FROM monthly_orders WHERE customer_id=? AND order_month=?').bind(customerId, month).first<{ id: number }>();
      if (!order) throw new Error('สร้างออเดอร์ไม่สำเร็จ');
      await db.prepare(`INSERT OR IGNORE INTO monthly_order_items
        (order_id, product_id, product_code_snapshot, product_name_snapshot, quantity)
        SELECT ?, u.product_id, p.product_code, p.product_name, u.quantity
        FROM usual_order_items u JOIN products p ON p.id=u.product_id
        WHERE u.customer_id=? AND p.is_active=1`).bind(order.id, customerId).run();
      await writeAudit(actor, 'create', 'monthly_order', Number(order.id), { month });
      return json({ ok: true, id: Number(order.id) });
    }

    if (operation === 'save_order') {
      const id = idValue(body.id, 'รหัสออเดอร์');
      const status = stringValue(body.status, 'สถานะ', 20);
      if (!STATUSES.has(status)) throw new Error('สถานะไม่ถูกต้อง');
      const nextCallAt = optionalString(body.nextCallAt, 30);
      const deliveryDate = optionalString(body.deliveryDate, 10);
      const contactNote = optionalString(body.contactNote, 1000);
      const items = itemValues(body.items);
      const productRows = await db.prepare('SELECT id, product_code AS productCode, product_name AS productName FROM products WHERE is_active=1').all<Record<string, unknown>>();
      const productMap = new Map(productRows.results.map((row) => [Number(row.id), row]));
      const statements = [
        db.prepare(`UPDATE monthly_orders SET status=?, next_call_at=?, delivery_date=?, contact_note=?,
          confirmed_at=?, updated_at=? WHERE id=?`)
          .bind(status, nextCallAt, deliveryDate, contactNote, status === 'confirmed' ? now : null, now, id),
        db.prepare('DELETE FROM monthly_order_items WHERE order_id=?').bind(id),
      ];
      for (const item of items) {
        const product = productMap.get(item.productId);
        if (!product) throw new Error('พบสินค้าที่ไม่มีในระบบ');
        statements.push(db.prepare(`INSERT INTO monthly_order_items
          (order_id, product_id, product_code_snapshot, product_name_snapshot, quantity) VALUES (?, ?, ?, ?, ?)`)
          .bind(id, item.productId, Number(product.productCode), String(product.productName), item.quantity));
      }
      await db.batch(statements);
      await writeAudit(actor, 'update', 'monthly_order', id, { status, itemCount: items.length });
      return json({ ok: true });
    }

    throw new Error('ไม่รู้จักคำสั่งนี้');
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'บันทึกข้อมูลไม่สำเร็จ' }, 400);
  }
}
