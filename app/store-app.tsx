'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Product = { id: number; productCode: number; productName: string };
type BasicItem = { productId: number; quantity: number };
type OrderItem = BasicItem & { productCode: number; productName: string };
type Customer = {
  id: number; name: string; phone: string; address: string; mapUrl: string;
  preferredCallDay: number; preferredDeliveryDay: number; notes: string; usualItems: BasicItem[];
};
type Order = {
  id: number; customerId: number; orderMonth: string; status: OrderStatus;
  nextCallAt: string; deliveryDate: string; contactNote: string; confirmedAt: string | null;
  customerName: string; phone: string; address: string; mapUrl: string; items: OrderItem[];
};
type OrderStatus = 'draft' | 'call_again' | 'confirmed' | 'skipped';
type StoreData = { month: string; customers: Customer[]; products: Product[]; orders: Order[] };
type Tab = 'dashboard' | 'customers' | 'orders' | 'products' | 'delivery';
type Modal =
  | { kind: 'customer'; customer?: Customer }
  | { kind: 'product'; product?: Product }
  | { kind: 'template'; customer: Customer }
  | { kind: 'order'; order: Order }
  | null;

const EMPTY_DATA: StoreData = { month: '', customers: [], products: [], orders: [] };
const STATUS_LABELS: Record<OrderStatus, string> = { draft: 'รอโทรยืนยัน', call_again: 'ให้โทรกลับ', confirmed: 'ยืนยันแล้ว', skipped: 'ข้ามเดือนนี้' };

function bangkokMonth() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
}

function thaiMonth(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  return new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00+07:00`));
}

function initials(name: string) {
  return name.replace(/\s+/g, '').slice(0, 2) || 'ลค';
}

async function storeRequest(operation: string, payload: Record<string, unknown> = {}) {
  const response = await fetch('/api/store', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, ...payload }),
  });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || 'บันทึกข้อมูลไม่สำเร็จ');
  return result;
}

export default function StoreApp({ displayName }: { displayName: string }) {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [month, setMonth] = useState(bangkokMonth);
  const [data, setData] = useState<StoreData>(EMPTY_DATA);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  async function loadData(showSpinner = true) {
    if (showSpinner) setLoading(true);
    try {
      const response = await fetch(`/api/store?month=${encodeURIComponent(month)}`, { cache: 'no-store' });
      const result = await response.json() as StoreData & { error?: string };
      if (!response.ok) throw new Error(result.error || 'โหลดข้อมูลไม่สำเร็จ');
      setData(result);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally { setLoading(false); }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadMonth() {
      try {
        const response = await fetch(`/api/store?month=${encodeURIComponent(month)}`, { cache: 'no-store' });
        const result = await response.json() as StoreData & { error?: string };
        if (!response.ok) throw new Error(result.error || 'โหลดข้อมูลไม่สำเร็จ');
        if (!cancelled) setData(result);
      } catch (error) {
        if (!cancelled) {
          setToast(error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ');
          window.setTimeout(() => setToast(''), 3200);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadMonth();
    return () => { cancelled = true; };
  }, [month]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  }

  async function mutate(operation: string, payload: Record<string, unknown>, success: string) {
    setLoading(true);
    try {
      await storeRequest(operation, payload);
      await loadData(false);
      setModal(null);
      showToast(success);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'บันทึกข้อมูลไม่สำเร็จ');
    } finally { setLoading(false); }
  }

  const stats = useMemo(() => ({
    draft: data.orders.filter((order) => order.status === 'draft').length,
    callAgain: data.orders.filter((order) => order.status === 'call_again').length,
    confirmed: data.orders.filter((order) => order.status === 'confirmed').length,
    deliveries: data.orders.filter((order) => order.status === 'confirmed' && order.deliveryDate).length,
  }), [data.orders]);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('th');
    if (!query) return data.customers;
    return data.customers.filter((customer) => [customer.name, customer.phone, customer.address].some((value) => value.toLocaleLowerCase('th').includes(query)));
  }, [data.customers, search]);

  const callQueue = data.orders.filter((order) => order.status === 'draft' || order.status === 'call_again');
  const dateLabel = new Intl.DateTimeFormat('th-TH', { dateStyle: 'full', timeZone: 'Asia/Bangkok' }).format(new Date());
  const displayUser = displayName.includes('@') ? 'พนักงานร้าน' : displayName;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">ช</span><div><strong>ชงชา ออเดอร์</strong><small>ร้านค้าปลีก</small></div></div>
        <nav aria-label="เมนูหลัก">
          <NavButton icon="⌂" label="ภาพรวม" tab="dashboard" active={activeTab} onClick={setActiveTab} />
          <NavButton icon="♙" label="ลูกค้า" tab="customers" active={activeTab} onClick={setActiveTab} />
          <NavButton icon="▣" label="ออเดอร์รายเดือน" tab="orders" active={activeTab} onClick={setActiveTab} />
          <NavButton icon="□" label="สินค้า" tab="products" active={activeTab} onClick={setActiveTab} />
          <NavButton icon="⌖" label="รายการจัดส่ง" tab="delivery" active={activeTab} onClick={setActiveTab} />
        </nav>
        <div className="sidebar-footer"><div className="user-avatar">{initials(displayUser).slice(0, 1)}</div><div><strong>{displayUser}</strong><small>ผู้ใช้งาน</small></div><a aria-label="ออกจากระบบ" href="/signout-with-chatgpt?return_to=/">↪</a></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">ช</span><strong>ชงชา</strong></div>
          <label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="ค้นหา" placeholder="ค้นหาชื่อลูกค้า เบอร์โทร หรือที่อยู่..." /></label>
          <label className="month-picker"><span>เดือนออเดอร์</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
        </header>

        <div className="content">
          {activeTab === 'dashboard' && <Dashboard dateLabel={dateLabel} month={month} stats={stats} orders={callQueue} customers={data.customers} onAddCustomer={() => setModal({ kind: 'customer' })} onEditOrder={(order) => setModal({ kind: 'order', order })} onNavigate={setActiveTab} onGenerate={() => mutate('generate_orders', { month }, 'สร้างออเดอร์ประจำเดือนแล้ว')} />}
          {activeTab === 'customers' && <CustomersPage customers={filteredCustomers} products={data.products} onAdd={() => setModal({ kind: 'customer' })} onEdit={(customer) => setModal({ kind: 'customer', customer })} onTemplate={(customer) => setModal({ kind: 'template', customer })} onCreateOrder={async (customer) => { await mutate('create_order', { customerId: customer.id, month }, 'สร้างออเดอร์แล้ว'); setActiveTab('orders'); }} />}
          {activeTab === 'products' && <ProductsPage products={data.products} onAdd={() => setModal({ kind: 'product' })} onEdit={(product) => setModal({ kind: 'product', product })} />}
          {activeTab === 'orders' && <OrdersPage month={month} orders={data.orders} customers={data.customers} onEdit={(order) => setModal({ kind: 'order', order })} onGenerate={() => mutate('generate_orders', { month }, 'สร้างออเดอร์ประจำเดือนแล้ว')} />}
          {activeTab === 'delivery' && <DeliveryPage month={month} orders={data.orders.filter((order) => order.status === 'confirmed')} onEdit={(order) => setModal({ kind: 'order', order })} />}
        </div>

        <nav className="mobile-nav" aria-label="เมนูมือถือ">
          <NavButton icon="⌂" label="ภาพรวม" tab="dashboard" active={activeTab} onClick={setActiveTab} />
          <NavButton icon="♙" label="ลูกค้า" tab="customers" active={activeTab} onClick={setActiveTab} />
          <NavButton icon="▣" label="ออเดอร์" tab="orders" active={activeTab} onClick={setActiveTab} />
          <NavButton icon="⌖" label="จัดส่ง" tab="delivery" active={activeTab} onClick={setActiveTab} />
        </nav>
      </section>

      {modal?.kind === 'customer' && <CustomerModal customer={modal.customer} onClose={() => setModal(null)} onSave={(payload) => mutate('save_customer', payload, modal.customer ? 'แก้ไขข้อมูลลูกค้าแล้ว' : 'เพิ่มลูกค้าแล้ว')} />}
      {modal?.kind === 'product' && <ProductModal product={modal.product} onClose={() => setModal(null)} onSave={(payload) => mutate('save_product', payload, modal.product ? 'แก้ไขสินค้าแล้ว' : 'เพิ่มสินค้าแล้ว')} />}
      {modal?.kind === 'template' && <ItemsModal title={`สินค้าประจำ · ${modal.customer.name}`} products={data.products} initialItems={modal.customer.usualItems} onClose={() => setModal(null)} onSave={(items) => mutate('save_template', { customerId: modal.customer.id, items }, 'บันทึกสินค้าประจำแล้ว')} />}
      {modal?.kind === 'order' && <OrderModal order={modal.order} products={data.products} onClose={() => setModal(null)} onSave={(payload) => mutate('save_order', payload, 'บันทึกออเดอร์แล้ว')} />}
      {loading && <div className="loading-layer" role="status"><span className="spinner" /><small>กำลังทำงาน...</small></div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function NavButton({ icon, label, tab, active, onClick }: { icon: string; label: string; tab: Tab; active: Tab; onClick: (tab: Tab) => void }) {
  return <button className={`nav-item ${active === tab ? 'active' : ''}`} onClick={() => onClick(tab)}><span>{icon}</span>{label}</button>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function Dashboard({ dateLabel, month, stats, orders, customers, onAddCustomer, onEditOrder, onNavigate, onGenerate }: {
  dateLabel: string; month: string; stats: { draft: number; callAgain: number; confirmed: number; deliveries: number };
  orders: Order[]; customers: Customer[]; onAddCustomer: () => void; onEditOrder: (order: Order) => void; onNavigate: (tab: Tab) => void; onGenerate: () => void;
}) {
  const total = stats.draft + stats.callAgain + stats.confirmed;
  const percent = total ? Math.round((stats.confirmed / total) * 100) : 0;
  return <>
    <PageHeader eyebrow={dateLabel} title="ภาพรวมร้านวันนี้" description={`รอบออเดอร์ ${thaiMonth(month)}`} action={<button className="primary-button" onClick={onAddCustomer}><span>＋</span> เพิ่มลูกค้าใหม่</button>} />
    <div className="stats-grid">
      <StatCard tone="coral" icon="☎" label="รอโทรยืนยัน" value={stats.draft} note="ออเดอร์ที่ยังไม่ยืนยัน" onClick={() => onNavigate('orders')} />
      <StatCard tone="green" icon="✓" label="ยืนยันแล้ว" value={stats.confirmed} note={`สำหรับ${thaiMonth(month)}`} onClick={() => onNavigate('orders')} />
      <StatCard tone="blue" icon="▤" label="มีวันจัดส่ง" value={stats.deliveries} note="รายการที่ต้องเตรียม" onClick={() => onNavigate('delivery')} />
      <StatCard tone="yellow" icon="↻" label="ให้โทรกลับ" value={stats.callAgain} note="รายการที่ต้องติดตาม" onClick={() => onNavigate('orders')} />
    </div>
    <div className="dashboard-grid">
      <section className="panel call-panel">
        <div className="panel-heading"><div><h2>รายการที่ต้องติดต่อ</h2><p>รอโทรยืนยันและรายการให้โทรกลับ</p></div><button className="text-button" onClick={() => onNavigate('orders')}>ดูทั้งหมด →</button></div>
        {orders.length ? <div className="queue-list">{orders.slice(0, 5).map((order, index) => <article className="queue-item" key={order.id}>
          <div className={`avatar tone-${index % 4}`}>{initials(order.customerName)}</div>
          <div className="customer-info"><div><strong>{order.customerName}</strong><span className={`status-chip ${order.status}`}>{STATUS_LABELS[order.status]}</span></div><p>☎ {order.phone} <i>•</i> {order.items.length} รายการ</p></div>
          <div className="queue-actions"><button className="secondary-button" onClick={() => onEditOrder(order)}>เปิดออเดอร์</button><a className="call-button" href={`tel:${order.phone}`}>☎ <span>โทรเลย</span></a></div>
        </article>)}</div> : <EmptyState icon="☎" title={customers.length ? 'ยังไม่มีออเดอร์เดือนนี้' : 'เริ่มจากเพิ่มลูกค้าคนแรก'} description={customers.length ? 'สร้างออเดอร์จากสินค้าประจำของลูกค้าทั้งหมด' : 'บันทึกข้อมูลลูกค้าและสินค้าที่ซื้อเป็นประจำ'} action={customers.length ? <button className="primary-button" onClick={onGenerate}>สร้างออเดอร์ประจำเดือน</button> : <button className="primary-button" onClick={onAddCustomer}>เพิ่มลูกค้า</button>} />}
      </section>
      <aside className="panel month-panel">
        <div className="month-top"><span>รอบออเดอร์ปัจจุบัน</span><strong>{thaiMonth(month)}</strong></div>
        <div className="progress-ring" style={{ background: `conic-gradient(var(--green) 0 ${percent}%, #edf1ee ${percent}%)` }}><div><strong>{percent}%</strong><span>ยืนยันแล้ว</span></div></div>
        <div className="month-progress"><i style={{ width: `${percent}%` }} /></div>
        <div className="month-metrics"><div><span className="dot green-dot" /><p><strong>{stats.confirmed}</strong> ยืนยันแล้ว</p></div><div><span className="dot coral-dot" /><p><strong>{stats.draft + stats.callAgain}</strong> รอดำเนินการ</p></div></div>
        <button className="outline-button" onClick={() => onNavigate('orders')}>เปิดรอบเดือนนี้</button>
      </aside>
    </div>
  </>;
}

function StatCard({ tone, icon, label, value, note, onClick }: { tone: string; icon: string; label: string; value: number; note: string; onClick: () => void }) {
  return <button className={`stat-card ${tone}`} onClick={onClick}><div className="stat-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div><b>→</b></button>;
}

function CustomersPage({ customers, products, onAdd, onEdit, onTemplate, onCreateOrder }: { customers: Customer[]; products: Product[]; onAdd: () => void; onEdit: (customer: Customer) => void; onTemplate: (customer: Customer) => void; onCreateOrder: (customer: Customer) => void }) {
  return <>
    <PageHeader eyebrow={`${customers.length} คน`} title="ลูกค้า" description="ข้อมูลติดต่อ ที่อยู่ และสินค้าที่ซื้อเป็นประจำ" action={<button className="primary-button" onClick={onAdd}><span>＋</span> เพิ่มลูกค้า</button>} />
    {customers.length ? <div className="customer-grid">{customers.map((customer, index) => <article className="customer-card" key={customer.id}>
      <div className="customer-card-head"><div className={`avatar large tone-${index % 4}`}>{initials(customer.name)}</div><div><h3>{customer.name}</h3><p>{customer.phone}</p></div><button className="menu-button" onClick={() => onEdit(customer)}>แก้ไข</button></div>
      <div className="customer-detail"><span>⌖</span><p>{customer.address}</p>{customer.mapUrl && <a href={customer.mapUrl} target="_blank" rel="noreferrer">เปิดแผนที่ ↗</a>}</div>
      <div className="usual-summary"><span>สินค้าประจำ</span><strong>{customer.usualItems.length} รายการ</strong></div>
      <div className="card-actions"><button className="secondary-button" onClick={() => onTemplate(customer)} disabled={!products.length}>จัดการสินค้าประจำ</button><button className="call-button" onClick={() => onCreateOrder(customer)}>สร้างออเดอร์</button></div>
    </article>)}</div> : <div className="panel"><EmptyState icon="♙" title="ยังไม่มีลูกค้า" description="เพิ่มชื่อลูกค้า เบอร์โทร ที่อยู่ และลิงก์แผนที่" action={<button className="primary-button" onClick={onAdd}>เพิ่มลูกค้าคนแรก</button>} /></div>}
  </>;
}

function ProductsPage({ products, onAdd, onEdit }: { products: Product[]; onAdd: () => void; onEdit: (product: Product) => void }) {
  return <>
    <PageHeader eyebrow={`${products.length} รายการ`} title="สินค้า" description="รหัสสินค้าเป็นตัวเลข 1–10,000,000 และชื่อรองรับไทย/อังกฤษ" action={<button className="primary-button" onClick={onAdd}><span>＋</span> เพิ่มสินค้า</button>} />
    <section className="panel table-panel">{products.length ? <div className="data-table"><div className="table-row table-head"><span>รหัสสินค้า</span><span>ชื่อสินค้า</span><span>จัดการ</span></div>{products.map((product) => <div className="table-row" key={product.id}><strong className="code-pill">{product.productCode}</strong><span>{product.productName}</span><button className="secondary-button" onClick={() => onEdit(product)}>แก้ไข</button></div>)}</div> : <EmptyState icon="□" title="ยังไม่มีสินค้า" description="เพิ่มสินค้าอย่างน้อยหนึ่งรายการก่อนสร้างสินค้าประจำ" action={<button className="primary-button" onClick={onAdd}>เพิ่มสินค้าแรก</button>} />}</section>
  </>;
}

function OrdersPage({ month, orders, customers, onEdit, onGenerate }: { month: string; orders: Order[]; customers: Customer[]; onEdit: (order: Order) => void; onGenerate: () => void }) {
  return <>
    <PageHeader eyebrow={`${orders.length} ออเดอร์`} title={`ออเดอร์ ${thaiMonth(month)}`} description="แก้ไขจำนวน บันทึกผลการโทร และยืนยันวันจัดส่ง" action={<button className="primary-button" onClick={onGenerate} disabled={!customers.length}>↻ สร้างออเดอร์จากสินค้าประจำ</button>} />
    <section className="panel table-panel">{orders.length ? <div className="data-table orders-table"><div className="table-row table-head"><span>ลูกค้า</span><span>สถานะ</span><span>สินค้า</span><span>วันจัดส่ง</span><span>จัดการ</span></div>{orders.map((order) => <div className="table-row" key={order.id}><div><strong>{order.customerName}</strong><small>{order.phone}</small></div><span><i className={`status-chip ${order.status}`}>{STATUS_LABELS[order.status]}</i></span><span>{order.items.length} รายการ</span><span>{order.deliveryDate ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date(`${order.deliveryDate}T12:00:00+07:00`)) : '—'}</span><button className="secondary-button" onClick={() => onEdit(order)}>เปิดออเดอร์</button></div>)}</div> : <EmptyState icon="▣" title="ยังไม่มีออเดอร์ในเดือนนี้" description="ระบบจะคัดลอกสินค้าประจำของลูกค้าเป็นออเดอร์ฉบับร่าง" action={<button className="primary-button" onClick={onGenerate} disabled={!customers.length}>สร้างออเดอร์ประจำเดือน</button>} />}</section>
  </>;
}

function DeliveryPage({ month, orders, onEdit }: { month: string; orders: Order[]; onEdit: (order: Order) => void }) {
  const sorted = [...orders].sort((a, b) => (a.deliveryDate || '9999').localeCompare(b.deliveryDate || '9999'));
  return <>
    <PageHeader eyebrow={`${sorted.length} ออเดอร์ยืนยันแล้ว`} title="รายการจัดส่ง" description={`เตรียมสินค้าสำหรับ ${thaiMonth(month)}`} />
    {sorted.length ? <div className="delivery-grid">{sorted.map((order) => <article className="panel delivery-card" key={order.id}><div className="delivery-date"><span>{order.deliveryDate ? new Date(`${order.deliveryDate}T12:00:00+07:00`).getDate() : '—'}</span><small>{order.deliveryDate ? new Intl.DateTimeFormat('th-TH', { month: 'short' }).format(new Date(`${order.deliveryDate}T12:00:00+07:00`)) : 'ยังไม่กำหนด'}</small></div><div className="delivery-customer"><h3>{order.customerName}</h3><p>{order.address}</p><span>☎ {order.phone} · {order.items.length} รายการ</span></div><div className="delivery-actions">{order.mapUrl && <a className="secondary-button" href={order.mapUrl} target="_blank" rel="noreferrer">แผนที่ ↗</a>}<button className="call-button" onClick={() => onEdit(order)}>ดูออเดอร์</button></div></article>)}</div> : <div className="panel"><EmptyState icon="⌖" title="ยังไม่มีรายการจัดส่ง" description="ออเดอร์ที่ยืนยันแล้วจะแสดงที่นี่" /></div>}
  </>;
}

function CustomerModal({ customer, onClose, onSave }: { customer?: Customer; onClose: () => void; onSave: (payload: Record<string, unknown>) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    onSave({ id: customer?.id, ...values, preferredCallDay: Number(values.preferredCallDay), preferredDeliveryDay: Number(values.preferredDeliveryDay) });
  }
  return <ModalShell title={customer ? 'แก้ไขข้อมูลลูกค้า' : 'เพิ่มลูกค้าใหม่'} subtitle="ข้อมูลสำหรับติดต่อและจัดส่งสินค้า" onClose={onClose}><form onSubmit={submit} className="modal-form">
    <label className="full"><span>ชื่อลูกค้า *</span><input name="name" required maxLength={160} defaultValue={customer?.name} placeholder="ชื่อบุคคลหรือชื่อร้าน" autoFocus /></label>
    <label><span>เบอร์โทรศัพท์ *</span><input name="phone" required maxLength={40} defaultValue={customer?.phone} placeholder="08X-XXX-XXXX" /></label>
    <label><span>ลิงก์ Google Maps</span><input name="mapUrl" type="url" maxLength={500} defaultValue={customer?.mapUrl} placeholder="https://maps.app.goo.gl/..." /></label>
    <label className="full"><span>ที่อยู่จัดส่ง *</span><textarea name="address" required maxLength={500} rows={3} defaultValue={customer?.address} placeholder="บ้านเลขที่ หมู่ ถนน ตำบล อำเภอ จังหวัด" /></label>
    <label><span>วันที่โทรประจำเดือน</span><input name="preferredCallDay" type="number" min={1} max={31} defaultValue={customer?.preferredCallDay ?? 25} required /></label>
    <label><span>วันที่จัดส่งที่ต้องการ</span><input name="preferredDeliveryDay" type="number" min={1} max={31} defaultValue={customer?.preferredDeliveryDay ?? 1} required /></label>
    <label className="full"><span>หมายเหตุ</span><textarea name="notes" maxLength={1000} rows={2} defaultValue={customer?.notes} placeholder="จุดสังเกตหรือเวลาที่สะดวกรับสาย" /></label>
    <FormActions onClose={onClose} label={customer ? 'บันทึกการแก้ไข' : 'เพิ่มลูกค้า'} />
  </form></ModalShell>;
}

function ProductModal({ product, onClose, onSave }: { product?: Product; onClose: () => void; onSave: (payload: Record<string, unknown>) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    onSave({ id: product?.id, productCode: Number(values.productCode), productName: values.productName });
  }
  return <ModalShell title={product ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'} subtitle="ไม่มีราคา สต็อก หรือข้อมูลขายส่งในรุ่นนี้" onClose={onClose}><form onSubmit={submit} className="modal-form">
    <label><span>รหัสสินค้า *</span><input name="productCode" type="number" min={1} max={10000000} step={1} required defaultValue={product?.productCode} placeholder="1–10000000" autoFocus /></label>
    <label><span>ชื่อสินค้า *</span><input name="productName" required maxLength={200} defaultValue={product?.productName} placeholder="ไทย English หรือผสมกัน" /></label>
    <p className="validation-note full">รหัสสินค้าต้องไม่ซ้ำและเป็นจำนวนเต็ม 1–10,000,000</p>
    <FormActions onClose={onClose} label={product ? 'บันทึกการแก้ไข' : 'เพิ่มสินค้า'} />
  </form></ModalShell>;
}

function ItemsModal({ title, products, initialItems, onClose, onSave }: { title: string; products: Product[]; initialItems: BasicItem[]; onClose: () => void; onSave: (items: BasicItem[]) => void }) {
  const [items, setItems] = useState<BasicItem[]>(initialItems);
  return <ModalShell title={title} subtitle="จำนวนต้องเป็นจำนวนเต็ม 0–1,000,000; จำนวน 0 จะลบรายการ" onClose={onClose} wide>
    <ItemEditor products={products} items={items} onChange={setItems} />
    <div className="form-actions"><button className="secondary-button" onClick={onClose}>ยกเลิก</button><button className="primary-button" onClick={() => onSave(items)}>บันทึกสินค้าประจำ</button></div>
  </ModalShell>;
}

function OrderModal({ order, products, onClose, onSave }: { order: Order; products: Product[]; onClose: () => void; onSave: (payload: Record<string, unknown>) => void }) {
  const [items, setItems] = useState<BasicItem[]>(order.items.map(({ productId, quantity }) => ({ productId, quantity })));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    onSave({ id: order.id, status: values.status, nextCallAt: values.nextCallAt, deliveryDate: values.deliveryDate, contactNote: values.contactNote, items });
  }
  return <ModalShell title={order.customerName} subtitle={`ออเดอร์ ${thaiMonth(order.orderMonth)} · ${order.phone}`} onClose={onClose} wide><form onSubmit={submit} className="order-form">
    <div className="modal-form compact">
      <label><span>สถานะ *</span><select name="status" defaultValue={order.status}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span>วันจัดส่ง</span><input name="deliveryDate" type="date" defaultValue={order.deliveryDate} /></label>
      <label><span>นัดโทรกลับ</span><input name="nextCallAt" type="datetime-local" defaultValue={order.nextCallAt} /></label>
      <label><span>หมายเหตุการติดต่อ</span><input name="contactNote" maxLength={1000} defaultValue={order.contactNote} placeholder="สิ่งที่ลูกค้าแจ้งเพิ่มเติม" /></label>
    </div>
    <div className="section-label"><strong>รายการสินค้า</strong><span>{items.filter((item) => item.quantity > 0).length} รายการ</span></div>
    <ItemEditor products={products} items={items} onChange={setItems} />
    <FormActions onClose={onClose} label="บันทึกออเดอร์" />
  </form></ModalShell>;
}

function ItemEditor({ products, items, onChange }: { products: Product[]; items: BasicItem[]; onChange: (items: BasicItem[]) => void }) {
  const used = new Set(items.map((item) => item.productId));
  const nextProduct = products.find((product) => !used.has(product.id));
  function update(index: number, patch: Partial<BasicItem>) { onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)); }
  return <div className="item-editor">
    {items.length ? items.map((item, index) => <div className="item-row" key={`${item.productId}-${index}`}>
      <label><span>สินค้า</span><select value={item.productId} onChange={(event) => update(index, { productId: Number(event.target.value) })}>{products.map((product) => <option key={product.id} value={product.id} disabled={used.has(product.id) && product.id !== item.productId}>{product.productCode} · {product.productName}</option>)}</select></label>
      <label><span>จำนวน</span><input type="number" min={0} max={1000000} step={1} value={item.quantity} onChange={(event) => update(index, { quantity: Number(event.target.value) })} /></label>
      <button type="button" className="remove-button" aria-label="ลบสินค้า" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>×</button>
    </div>) : <p className="empty-line">ยังไม่มีสินค้าในรายการ</p>}
    <button type="button" className="add-line-button" disabled={!nextProduct} onClick={() => nextProduct && onChange([...items, { productId: nextProduct.id, quantity: 1 }])}>＋ เพิ่มสินค้าในรายการ</button>
  </div>;
}

function ModalShell({ title, subtitle, onClose, wide, children }: { title: string; subtitle: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal-card ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><div><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button aria-label="ปิด" onClick={onClose}>×</button></header><div className="modal-body">{children}</div></section></div>;
}

function FormActions({ onClose, label }: { onClose: () => void; label: string }) {
  return <div className="form-actions full"><button type="button" className="secondary-button" onClick={onClose}>ยกเลิก</button><button type="submit" className="primary-button">{label}</button></div>;
}

function EmptyState({ icon, title, description, action }: { icon: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{description}</p>{action}</div>;
}
