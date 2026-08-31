import { getSupabaseBrowserClient } from './supabase';

export type Product = { id: number; productCode: number; productName: string };
export type BasicItem = { productId: number; quantity: number };
export type OrderItem = BasicItem & { productCode: number; productName: string };
export type Customer = {
  id: number;
  name: string;
  phone: string;
  address: string;
  mapUrl: string;
  preferredCallDay: number;
  preferredDeliveryDay: number;
  notes: string;
  usualItems: BasicItem[];
};
export type OrderStatus = 'draft' | 'call_again' | 'confirmed' | 'skipped';
export type Order = {
  id: number;
  customerId: number;
  orderMonth: string;
  status: OrderStatus;
  nextCallAt: string;
  deliveryDate: string;
  contactNote: string;
  confirmedAt: string | null;
  customerName: string;
  phone: string;
  address: string;
  mapUrl: string;
  items: OrderItem[];
};
export type StoreData = { month: string; customers: Customer[]; products: Product[]; orders: Order[] };

type Row = Record<string, unknown>;

function fail(error: { message: string; code?: string } | null, fallback: string): never | void {
  if (!error) return;
  if (error.code === '23505') throw new Error('รหัสสินค้านี้มีอยู่แล้ว');
  throw new Error(error.message || fallback);
}

function toBangkokDateTimeLocal(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

function bangkokDateTimeToIso(value: unknown): string | null {
  const localValue = String(value ?? '').trim();
  if (!localValue) return null;
  const date = new Date(`${localValue}:00+07:00`);
  if (Number.isNaN(date.getTime())) throw new Error('วันเวลาที่จะโทรกลับไม่ถูกต้อง');
  return date.toISOString();
}

export async function loadStoreData(month: string): Promise<StoreData> {
  const supabase = getSupabaseBrowserClient();
  const [customersResult, productsResult, templatesResult, ordersResult] = await Promise.all([
    supabase.from('customers').select('*').eq('is_active', true).order('name'),
    supabase.from('products').select('*').eq('is_active', true).order('product_code'),
    supabase.from('usual_order_items').select('customer_id, product_id, quantity').order('customer_id'),
    supabase.from('monthly_orders').select(`
      id, customer_id, order_month, status, next_call_at, delivery_date,
      contact_note, confirmed_at,
      customer:customers!inner(name, phone, address, map_url, is_active),
      items:monthly_order_items(product_id, product_code_snapshot, product_name_snapshot, quantity)
    `).eq('order_month', month).eq('customer.is_active', true).order('customer_id'),
  ]);

  fail(customersResult.error, 'โหลดข้อมูลลูกค้าไม่สำเร็จ');
  fail(productsResult.error, 'โหลดข้อมูลสินค้าไม่สำเร็จ');
  fail(templatesResult.error, 'โหลดสินค้าประจำไม่สำเร็จ');
  fail(ordersResult.error, 'โหลดออเดอร์ไม่สำเร็จ');

  const templates = new Map<number, BasicItem[]>();
  for (const row of (templatesResult.data ?? []) as Row[]) {
    const customerId = Number(row.customer_id);
    const current = templates.get(customerId) ?? [];
    current.push({ productId: Number(row.product_id), quantity: Number(row.quantity) });
    templates.set(customerId, current);
  }

  const customers: Customer[] = ((customersResult.data ?? []) as Row[]).map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    phone: String(row.phone),
    address: String(row.address),
    mapUrl: String(row.map_url ?? ''),
    preferredCallDay: Number(row.preferred_call_day),
    preferredDeliveryDay: Number(row.preferred_delivery_day),
    notes: String(row.notes ?? ''),
    usualItems: templates.get(Number(row.id)) ?? [],
  }));

  const products: Product[] = ((productsResult.data ?? []) as Row[]).map((row) => ({
    id: Number(row.id),
    productCode: Number(row.product_code),
    productName: String(row.product_name),
  }));

  const orders: Order[] = ((ordersResult.data ?? []) as Row[]).map((row) => {
    const customerValue = Array.isArray(row.customer) ? row.customer[0] : row.customer;
    const customer = (customerValue ?? {}) as Row;
    const rawItems = Array.isArray(row.items) ? row.items as Row[] : [];
    return {
      id: Number(row.id),
      customerId: Number(row.customer_id),
      orderMonth: String(row.order_month),
      status: String(row.status) as OrderStatus,
      nextCallAt: toBangkokDateTimeLocal(row.next_call_at),
      deliveryDate: String(row.delivery_date ?? ''),
      contactNote: String(row.contact_note ?? ''),
      confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
      customerName: String(customer.name ?? ''),
      phone: String(customer.phone ?? ''),
      address: String(customer.address ?? ''),
      mapUrl: String(customer.map_url ?? ''),
      items: rawItems.map((item) => ({
        productId: Number(item.product_id),
        productCode: Number(item.product_code_snapshot),
        productName: String(item.product_name_snapshot),
        quantity: Number(item.quantity),
      })),
    };
  });

  return { month, customers, products, orders };
}

export async function storeRequest(operation: string, payload: Record<string, unknown> = {}): Promise<unknown> {
  const supabase = getSupabaseBrowserClient();

  if (operation === 'save_customer') {
    const record = {
      name: payload.name,
      phone: payload.phone,
      address: payload.address,
      map_url: payload.mapUrl ?? '',
      preferred_call_day: payload.preferredCallDay,
      preferred_delivery_day: payload.preferredDeliveryDay,
      notes: payload.notes ?? '',
    };
    const result = payload.id
      ? await supabase.from('customers').update(record).eq('id', payload.id).select('id').single()
      : await supabase.from('customers').insert(record).select('id').single();
    fail(result.error, 'บันทึกข้อมูลลูกค้าไม่สำเร็จ');
    return result.data;
  }

  if (operation === 'archive_customer') {
    const result = await supabase.from('customers').update({ is_active: false }).eq('id', payload.id);
    fail(result.error, 'เก็บลูกค้าไม่สำเร็จ');
    return result.data;
  }

  if (operation === 'save_product') {
    const record = { product_code: payload.productCode, product_name: payload.productName };
    const result = payload.id
      ? await supabase.from('products').update(record).eq('id', payload.id).select('id').single()
      : await supabase.from('products').insert(record).select('id').single();
    fail(result.error, 'บันทึกสินค้าไม่สำเร็จ');
    return result.data;
  }

  if (operation === 'archive_product') {
    const result = await supabase.from('products').update({ is_active: false }).eq('id', payload.id);
    fail(result.error, 'เก็บสินค้าไม่สำเร็จ');
    return result.data;
  }

  if (operation === 'save_template') {
    const result = await supabase.rpc('replace_usual_order_items', {
      p_customer_id: payload.customerId,
      p_items: payload.items ?? [],
    });
    fail(result.error, 'บันทึกสินค้าประจำไม่สำเร็จ');
    return result.data;
  }

  if (operation === 'generate_orders') {
    const result = await supabase.rpc('generate_monthly_orders', { p_order_month: payload.month });
    fail(result.error, 'สร้างออเดอร์ประจำเดือนไม่สำเร็จ');
    return result.data;
  }

  if (operation === 'create_order') {
    const result = await supabase.rpc('create_monthly_order', {
      p_customer_id: payload.customerId,
      p_order_month: payload.month,
    });
    fail(result.error, 'สร้างออเดอร์ไม่สำเร็จ');
    return result.data;
  }

  if (operation === 'save_order') {
    const result = await supabase.rpc('save_monthly_order', {
      p_order_id: payload.id,
      p_status: payload.status,
      p_next_call_at: bangkokDateTimeToIso(payload.nextCallAt),
      p_delivery_date: payload.deliveryDate || null,
      p_contact_note: payload.contactNote ?? '',
      p_items: payload.items ?? [],
    });
    fail(result.error, 'บันทึกออเดอร์ไม่สำเร็จ');
    return result.data;
  }

  throw new Error('ไม่รู้จักคำสั่งนี้');
}
