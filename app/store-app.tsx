'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase';
import {
  loadStoreData,
  storeRequest,
  type BasicItem,
  type Customer,
  type Order,
  type OrderStatus,
  type Product,
  type StoreData,
} from '@/lib/store';
type Tab = 'dashboard' | 'customers' | 'orders' | 'products' | 'delivery';
type Modal =
  | { kind: 'customer'; customer?: Customer }
  | { kind: 'product'; product?: Product }
  | { kind: 'template'; customer: Customer }
  | { kind: 'order'; order: Order }
  | null;

const EMPTY_DATA: StoreData = { month: '', customers: [], products: [], orders: [] };
const STATUS_LABELS: Record<OrderStatus, string> = { draft: 'Awaiting confirmation', call_again: 'Call again', confirmed: 'Confirmed', skipped: 'Skipped this month' };

function bangkokMonth() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
}

function displayMonth(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00+07:00`));
}

function initials(name: string) {
  return name.replace(/\s+/g, '').slice(0, 2) || 'CU';
}

export default function StoreApp() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) return;
    const linkType = new URLSearchParams(window.location.hash.slice(1)).get('type')
      ?? new URLSearchParams(window.location.search).get('type');
    const linkRequiresPassword = linkType === 'invite' || linkType === 'recovery';
    const supabase = getSupabaseBrowserClient();
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setNeedsPassword(linkRequiresPassword);
        setUser(data.session?.user ?? null);
        setAuthReady(true);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setNeedsPassword(true);
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [configured]);

  if (!configured) return <ConfigurationNotice />;
  if (!authReady) return <div className="auth-screen"><span className="spinner" /><p>Checking your session...</p></div>;
  if (!user) return <LoginScreen />;
  if (needsPassword) return <PasswordSetupScreen onComplete={() => setNeedsPassword(false)} />;

  return <StoreWorkspace displayName={user.email ?? 'Store employee'} onSignOut={() => getSupabaseBrowserClient().auth.signOut()} />;
}

function StoreWorkspace({ displayName, onSignOut }: { displayName: string; onSignOut: () => Promise<unknown> }) {
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
      const result = await loadStoreData(month);
      setData(result);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not load data.');
    } finally { setLoading(false); }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadMonth() {
      try {
        const result = await loadStoreData(month);
        if (!cancelled) setData(result);
      } catch (error) {
        if (!cancelled) {
          setToast(error instanceof Error ? error.message : 'Could not load data.');
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
      showToast(error instanceof Error ? error.message : 'Could not save data.');
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
  const dateLabel = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'Asia/Bangkok' }).format(new Date());
  const displayUser = displayName.includes('@') ? 'Store employee' : displayName;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">C</span><div><strong>ChongCha Order</strong><small>Retail store</small></div></div>
        <nav aria-label="Main navigation">
          <NavButton icon="⌂" label="Dashboard" tab="dashboard" active={activeTab} onClick={setActiveTab} />
          <NavButton icon="♙" label="Customers" tab="customers" active={activeTab} onClick={setActiveTab} />
          <NavButton icon="▣" label="Monthly orders" tab="orders" active={activeTab} onClick={setActiveTab} />
          <NavButton icon="□" label="Products" tab="products" active={activeTab} onClick={setActiveTab} />
          <NavButton icon="⌖" label="Deliveries" tab="delivery" active={activeTab} onClick={setActiveTab} />
        </nav>
        <div className="sidebar-footer"><div className="user-avatar">{initials(displayUser).slice(0, 1)}</div><div><strong>{displayUser}</strong><small>Signed in</small></div><button aria-label="Sign out" onClick={() => void onSignOut()}>↪</button></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">C</span><strong>ChongCha</strong></div>
          <label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search" placeholder="Search customer name, phone, or address..." /></label>
          <label className="month-picker"><span>Order month</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
        </header>

        <div className="content">
          {activeTab === 'dashboard' && <Dashboard dateLabel={dateLabel} month={month} stats={stats} orders={callQueue} customers={data.customers} onAddCustomer={() => setModal({ kind: 'customer' })} onEditOrder={(order) => setModal({ kind: 'order', order })} onNavigate={setActiveTab} onGenerate={() => mutate('generate_orders', { month }, 'Monthly orders generated.')} />}
          {activeTab === 'customers' && <CustomersPage customers={filteredCustomers} products={data.products} onAdd={() => setModal({ kind: 'customer' })} onEdit={(customer) => setModal({ kind: 'customer', customer })} onTemplate={(customer) => setModal({ kind: 'template', customer })} onCreateOrder={async (customer) => { await mutate('create_order', { customerId: customer.id, month }, 'Order created.'); setActiveTab('orders'); }} />}
          {activeTab === 'products' && <ProductsPage products={data.products} onAdd={() => setModal({ kind: 'product' })} onEdit={(product) => setModal({ kind: 'product', product })} />}
          {activeTab === 'orders' && <OrdersPage month={month} orders={data.orders} customers={data.customers} onEdit={(order) => setModal({ kind: 'order', order })} onGenerate={() => mutate('generate_orders', { month }, 'Monthly orders generated.')} />}
          {activeTab === 'delivery' && <DeliveryPage month={month} orders={data.orders.filter((order) => order.status === 'confirmed')} onEdit={(order) => setModal({ kind: 'order', order })} />}
        </div>

        <nav className="mobile-nav" aria-label="Mobile navigation">
          <NavButton icon="⌂" label="Dashboard" tab="dashboard" active={activeTab} onClick={setActiveTab} />
          <NavButton icon="♙" label="Customers" tab="customers" active={activeTab} onClick={setActiveTab} />
          <NavButton icon="▣" label="Orders" tab="orders" active={activeTab} onClick={setActiveTab} />
          <NavButton icon="⌖" label="Delivery" tab="delivery" active={activeTab} onClick={setActiveTab} />
        </nav>
      </section>

      {modal?.kind === 'customer' && <CustomerModal customer={modal.customer} onClose={() => setModal(null)} onSave={(payload) => mutate('save_customer', payload, modal.customer ? 'Customer updated.' : 'Customer added.')} />}
      {modal?.kind === 'product' && <ProductModal product={modal.product} onClose={() => setModal(null)} onSave={(payload) => mutate('save_product', payload, modal.product ? 'Product updated.' : 'Product added.')} />}
      {modal?.kind === 'template' && <ItemsModal title={`Usual order · ${modal.customer.name}`} products={data.products} initialItems={modal.customer.usualItems} onClose={() => setModal(null)} onSave={(items) => mutate('save_template', { customerId: modal.customer.id, items }, 'Usual order saved.')} />}
      {modal?.kind === 'order' && <OrderModal order={modal.order} products={data.products} onClose={() => setModal(null)} onSave={(payload) => mutate('save_order', payload, 'Order saved.')} />}
      {loading && <div className="loading-layer" role="status"><span className="spinner" /><small>Working...</small></div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function LoginScreen() {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    const values = new FormData(event.currentTarget);
    const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({
      email: String(values.get('email') ?? '').trim(),
      password: String(values.get('password') ?? ''),
    });
    if (error) setMessage('Incorrect email or password.');
    setSubmitting(false);
  }

  return <main className="login-page">
    <section className="login-card">
      <div className="brand login-brand"><span className="brand-mark">C</span><div><strong>ChongCha Order</strong><small>Monthly order management</small></div></div>
      <div className="login-copy"><p className="eyebrow">Store employees</p><h1>Sign in</h1><p>Use the employee account created by the store owner.</p></div>
      <form onSubmit={submit} className="login-form">
        <label><span>Email</span><input name="email" type="email" autoComplete="username" required placeholder="employee@example.com" autoFocus /></label>
        <label><span>Password</span><input name="password" type="password" autoComplete="current-password" required minLength={6} placeholder="••••••••" /></label>
        {message && <p className="login-error" role="alert">{message}</p>}
        <button className="primary-button" disabled={submitting}>{submitting ? 'Signing in...' : 'Sign in'}</button>
      </form>
      <small className="login-help">Contact the store owner if you need an account or forgot your password.</small>
    </section>
  </main>;
}

function PasswordSetupScreen({ onComplete }: { onComplete: () => void }) {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    const values = new FormData(event.currentTarget);
    const password = String(values.get('password') ?? '');
    const confirmation = String(values.get('confirmation') ?? '');
    if (password !== confirmation) {
      setMessage('The passwords do not match.');
      setSubmitting(false);
      return;
    }
    const { error } = await getSupabaseBrowserClient().auth.updateUser({ password });
    if (error) {
      setMessage('Could not set the password. Please open a new invitation or reset link.');
      setSubmitting(false);
      return;
    }
    window.history.replaceState({}, '', '/');
    onComplete();
  }

  return <main className="login-page">
    <section className="login-card">
      <div className="brand login-brand"><span className="brand-mark">C</span><div><strong>ChongCha Order</strong><small>Monthly order management</small></div></div>
      <div className="login-copy"><p className="eyebrow">Activate employee account</p><h1>Set your password</h1><p>Create a password with at least 8 characters to continue.</p></div>
      <form onSubmit={submit} className="login-form">
        <label><span>New password</span><input name="password" type="password" autoComplete="new-password" required minLength={8} autoFocus /></label>
        <label><span>Confirm new password</span><input name="confirmation" type="password" autoComplete="new-password" required minLength={8} /></label>
        {message && <p className="login-error" role="alert">{message}</p>}
        <button className="primary-button" disabled={submitting}>{submitting ? 'Saving...' : 'Set password and continue'}</button>
      </form>
    </section>
  </main>;
}

function ConfigurationNotice() {
  return <main className="login-page"><section className="login-card configuration-card">
    <div className="brand login-brand"><span className="brand-mark">C</span><div><strong>ChongCha Order</strong><small>Supabase setup required</small></div></div>
    <div className="login-copy"><p className="eyebrow">Setup incomplete</p><h1>Connect the database</h1><p>Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in the deployment environment.</p></div>
  </section></main>;
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
    <PageHeader eyebrow={dateLabel} title="Today at the store" description={`Order cycle: ${displayMonth(month)}`} action={<button className="primary-button" onClick={onAddCustomer}><span>＋</span> Add customer</button>} />
    <div className="stats-grid">
      <StatCard tone="coral" icon="☎" label="Awaiting confirmation" value={stats.draft} note="Orders not yet confirmed" onClick={() => onNavigate('orders')} />
      <StatCard tone="green" icon="✓" label="Confirmed" value={stats.confirmed} note={`For ${displayMonth(month)}`} onClick={() => onNavigate('orders')} />
      <StatCard tone="blue" icon="▤" label="Scheduled deliveries" value={stats.deliveries} note="Orders to prepare" onClick={() => onNavigate('delivery')} />
      <StatCard tone="yellow" icon="↻" label="Call again" value={stats.callAgain} note="Customers to follow up" onClick={() => onNavigate('orders')} />
    </div>
    <div className="dashboard-grid">
      <section className="panel call-panel">
        <div className="panel-heading"><div><h2>Customers to contact</h2><p>Awaiting confirmation and scheduled callbacks</p></div><button className="text-button" onClick={() => onNavigate('orders')}>View all →</button></div>
        {orders.length ? <div className="queue-list">{orders.slice(0, 5).map((order, index) => <article className="queue-item" key={order.id}>
          <div className={`avatar tone-${index % 4}`}>{initials(order.customerName)}</div>
          <div className="customer-info"><div><strong>{order.customerName}</strong><span className={`status-chip ${order.status}`}>{STATUS_LABELS[order.status]}</span></div><p>☎ {order.phone} <i>•</i> {order.items.length} items</p></div>
          <div className="queue-actions"><button className="secondary-button" onClick={() => onEditOrder(order)}>Open order</button><a className="call-button" href={`tel:${order.phone}`}>☎ <span>Call now</span></a></div>
        </article>)}</div> : <EmptyState icon="☎" title={customers.length ? 'No orders this month' : 'Start with your first customer'} description={customers.length ? 'Generate draft orders from every customer’s usual order.' : 'Save customer details and the products they usually buy.'} action={customers.length ? <button className="primary-button" onClick={onGenerate}>Generate monthly orders</button> : <button className="primary-button" onClick={onAddCustomer}>Add customer</button>} />}
      </section>
      <aside className="panel month-panel">
        <div className="month-top"><span>Current order cycle</span><strong>{displayMonth(month)}</strong></div>
        <div className="progress-ring" style={{ background: `conic-gradient(var(--green) 0 ${percent}%, #edf1ee ${percent}%)` }}><div><strong>{percent}%</strong><span>confirmed</span></div></div>
        <div className="month-progress"><i style={{ width: `${percent}%` }} /></div>
        <div className="month-metrics"><div><span className="dot green-dot" /><p><strong>{stats.confirmed}</strong> confirmed</p></div><div><span className="dot coral-dot" /><p><strong>{stats.draft + stats.callAgain}</strong> pending</p></div></div>
        <button className="outline-button" onClick={() => onNavigate('orders')}>Open this month</button>
      </aside>
    </div>
  </>;
}

function StatCard({ tone, icon, label, value, note, onClick }: { tone: string; icon: string; label: string; value: number; note: string; onClick: () => void }) {
  return <button className={`stat-card ${tone}`} onClick={onClick}><div className="stat-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div><b>→</b></button>;
}

function CustomersPage({ customers, products, onAdd, onEdit, onTemplate, onCreateOrder }: { customers: Customer[]; products: Product[]; onAdd: () => void; onEdit: (customer: Customer) => void; onTemplate: (customer: Customer) => void; onCreateOrder: (customer: Customer) => void }) {
  return <>
    <PageHeader eyebrow={`${customers.length} customers`} title="Customers" description="Contact details, delivery addresses, and usual orders" action={<button className="primary-button" onClick={onAdd}><span>＋</span> Add customer</button>} />
    {customers.length ? <div className="customer-grid">{customers.map((customer, index) => <article className="customer-card" key={customer.id}>
      <div className="customer-card-head"><div className={`avatar large tone-${index % 4}`}>{initials(customer.name)}</div><div><h3>{customer.name}</h3><p>{customer.phone}</p></div><button className="menu-button" onClick={() => onEdit(customer)}>Edit</button></div>
      <div className="customer-detail"><span>⌖</span><p>{customer.address}</p>{customer.mapUrl && <a href={customer.mapUrl} target="_blank" rel="noreferrer">Open map ↗</a>}</div>
      <div className="usual-summary"><span>Usual order</span><strong>{customer.usualItems.length} items</strong></div>
      <div className="card-actions"><button className="secondary-button" onClick={() => onTemplate(customer)} disabled={!products.length}>Manage usual order</button><button className="call-button" onClick={() => onCreateOrder(customer)}>Create order</button></div>
    </article>)}</div> : <div className="panel"><EmptyState icon="♙" title="No customers yet" description="Add a customer’s name, phone, address, and map link." action={<button className="primary-button" onClick={onAdd}>Add first customer</button>} /></div>}
  </>;
}

function ProductsPage({ products, onAdd, onEdit }: { products: Product[]; onAdd: () => void; onEdit: (product: Product) => void }) {
  return <>
    <PageHeader eyebrow={`${products.length} products`} title="Products" description="Product codes use numbers from 1–10,000,000; names can be Thai or English." action={<button className="primary-button" onClick={onAdd}><span>＋</span> Add product</button>} />
    <section className="panel table-panel">{products.length ? <div className="data-table"><div className="table-row table-head"><span>Product code</span><span>Product name</span><span>Action</span></div>{products.map((product) => <div className="table-row" key={product.id}><strong className="code-pill">{product.productCode}</strong><span>{product.productName}</span><button className="secondary-button" onClick={() => onEdit(product)}>Edit</button></div>)}</div> : <EmptyState icon="□" title="No products yet" description="Add at least one product before creating usual orders." action={<button className="primary-button" onClick={onAdd}>Add first product</button>} />}</section>
  </>;
}

function OrdersPage({ month, orders, customers, onEdit, onGenerate }: { month: string; orders: Order[]; customers: Customer[]; onEdit: (order: Order) => void; onGenerate: () => void }) {
  return <>
    <PageHeader eyebrow={`${orders.length} orders`} title={`${displayMonth(month)} orders`} description="Adjust quantities, record call results, and confirm delivery dates." action={<button className="primary-button" onClick={onGenerate} disabled={!customers.length}>↻ Generate from usual orders</button>} />
    <section className="panel table-panel">{orders.length ? <div className="data-table orders-table"><div className="table-row table-head"><span>Customer</span><span>Status</span><span>Products</span><span>Delivery date</span><span>Action</span></div>{orders.map((order) => <div className="table-row" key={order.id}><div><strong>{order.customerName}</strong><small>{order.phone}</small></div><span><i className={`status-chip ${order.status}`}>{STATUS_LABELS[order.status]}</i></span><span>{order.items.length} items</span><span>{order.deliveryDate ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(`${order.deliveryDate}T12:00:00+07:00`)) : '—'}</span><button className="secondary-button" onClick={() => onEdit(order)}>Open order</button></div>)}</div> : <EmptyState icon="▣" title="No orders this month" description="Generate draft orders from each customer’s usual order." action={<button className="primary-button" onClick={onGenerate} disabled={!customers.length}>Generate monthly orders</button>} />}</section>
  </>;
}

function DeliveryPage({ month, orders, onEdit }: { month: string; orders: Order[]; onEdit: (order: Order) => void }) {
  const sorted = [...orders].sort((a, b) => (a.deliveryDate || '9999').localeCompare(b.deliveryDate || '9999'));
  return <>
    <PageHeader eyebrow={`${sorted.length} confirmed orders`} title="Deliveries" description={`Prepare products for ${displayMonth(month)}`} />
    {sorted.length ? <div className="delivery-grid">{sorted.map((order) => <article className="panel delivery-card" key={order.id}><div className="delivery-date"><span>{order.deliveryDate ? new Date(`${order.deliveryDate}T12:00:00+07:00`).getDate() : '—'}</span><small>{order.deliveryDate ? new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(`${order.deliveryDate}T12:00:00+07:00`)) : 'Not set'}</small></div><div className="delivery-customer"><h3>{order.customerName}</h3><p>{order.address}</p><span>☎ {order.phone} · {order.items.length} items</span></div><div className="delivery-actions">{order.mapUrl && <a className="secondary-button" href={order.mapUrl} target="_blank" rel="noreferrer">Map ↗</a>}<button className="call-button" onClick={() => onEdit(order)}>View order</button></div></article>)}</div> : <div className="panel"><EmptyState icon="⌖" title="No deliveries yet" description="Confirmed orders will appear here." /></div>}
  </>;
}

function CustomerModal({ customer, onClose, onSave }: { customer?: Customer; onClose: () => void; onSave: (payload: Record<string, unknown>) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    onSave({ id: customer?.id, ...values, preferredCallDay: Number(values.preferredCallDay), preferredDeliveryDay: Number(values.preferredDeliveryDay) });
  }
  return <ModalShell title={customer ? 'Edit customer' : 'Add customer'} subtitle="Contact and delivery information" onClose={onClose}><form onSubmit={submit} className="modal-form">
    <label className="full"><span>Customer name *</span><input name="name" required maxLength={160} defaultValue={customer?.name} placeholder="Person or business name" autoFocus /></label>
    <label><span>Phone number *</span><input name="phone" required maxLength={40} defaultValue={customer?.phone} placeholder="08X-XXX-XXXX" /></label>
    <label><span>Google Maps link</span><input name="mapUrl" type="url" maxLength={500} defaultValue={customer?.mapUrl} placeholder="https://maps.app.goo.gl/..." /></label>
    <label className="full"><span>Delivery address *</span><textarea name="address" required maxLength={500} rows={3} defaultValue={customer?.address} placeholder="House number, street, district, province" /></label>
    <label><span>Monthly call day</span><input name="preferredCallDay" type="number" min={1} max={31} defaultValue={customer?.preferredCallDay ?? 25} required /></label>
    <label><span>Preferred delivery day</span><input name="preferredDeliveryDay" type="number" min={1} max={31} defaultValue={customer?.preferredDeliveryDay ?? 1} required /></label>
    <label className="full"><span>Notes</span><textarea name="notes" maxLength={1000} rows={2} defaultValue={customer?.notes} placeholder="Landmark or preferred calling time" /></label>
    <FormActions onClose={onClose} label={customer ? 'Save changes' : 'Add customer'} />
  </form></ModalShell>;
}

function ProductModal({ product, onClose, onSave }: { product?: Product; onClose: () => void; onSave: (payload: Record<string, unknown>) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    onSave({ id: product?.id, productCode: Number(values.productCode), productName: values.productName });
  }
  return <ModalShell title={product ? 'Edit product' : 'Add product'} subtitle="Pricing, inventory, and wholesale are outside this version’s scope." onClose={onClose}><form onSubmit={submit} className="modal-form">
    <label><span>Product code *</span><input name="productCode" type="number" min={1} max={10000000} step={1} required defaultValue={product?.productCode} placeholder="1–10000000" autoFocus /></label>
    <label><span>Product name *</span><input name="productName" required maxLength={200} defaultValue={product?.productName} placeholder="Thai, English, or both" /></label>
    <p className="validation-note full">Product codes must be unique whole numbers from 1–10,000,000.</p>
    <FormActions onClose={onClose} label={product ? 'Save changes' : 'Add product'} />
  </form></ModalShell>;
}

function ItemsModal({ title, products, initialItems, onClose, onSave }: { title: string; products: Product[]; initialItems: BasicItem[]; onClose: () => void; onSave: (items: BasicItem[]) => void }) {
  const [items, setItems] = useState<BasicItem[]>(initialItems);
  return <ModalShell title={title} subtitle="Quantities must be whole numbers from 0–1,000,000. A quantity of 0 removes the item." onClose={onClose} wide>
    <ItemEditor products={products} items={items} onChange={setItems} />
    <div className="form-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={() => onSave(items)}>Save usual order</button></div>
  </ModalShell>;
}

function OrderModal({ order, products, onClose, onSave }: { order: Order; products: Product[]; onClose: () => void; onSave: (payload: Record<string, unknown>) => void }) {
  const [items, setItems] = useState<BasicItem[]>(order.items.map(({ productId, quantity }) => ({ productId, quantity })));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    onSave({ id: order.id, status: values.status, nextCallAt: values.nextCallAt, deliveryDate: values.deliveryDate, contactNote: values.contactNote, items });
  }
  return <ModalShell title={order.customerName} subtitle={`${displayMonth(order.orderMonth)} order · ${order.phone}`} onClose={onClose} wide><form onSubmit={submit} className="order-form">
    <div className="modal-form compact">
      <label><span>Status *</span><select name="status" defaultValue={order.status}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span>Delivery date</span><input name="deliveryDate" type="date" defaultValue={order.deliveryDate} /></label>
      <label><span>Callback time</span><input name="nextCallAt" type="datetime-local" defaultValue={order.nextCallAt} /></label>
      <label><span>Contact note</span><input name="contactNote" maxLength={1000} defaultValue={order.contactNote} placeholder="Additional information from the customer" /></label>
    </div>
    <div className="section-label"><strong>Products</strong><span>{items.filter((item) => item.quantity > 0).length} items</span></div>
    <ItemEditor products={products} items={items} onChange={setItems} />
    <FormActions onClose={onClose} label="Save order" />
  </form></ModalShell>;
}

function ItemEditor({ products, items, onChange }: { products: Product[]; items: BasicItem[]; onChange: (items: BasicItem[]) => void }) {
  const used = new Set(items.map((item) => item.productId));
  const nextProduct = products.find((product) => !used.has(product.id));
  function update(index: number, patch: Partial<BasicItem>) { onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)); }
  return <div className="item-editor">
    {items.length ? items.map((item, index) => <div className="item-row" key={`${item.productId}-${index}`}>
      <label><span>Product</span><select value={item.productId} onChange={(event) => update(index, { productId: Number(event.target.value) })}>{products.map((product) => <option key={product.id} value={product.id} disabled={used.has(product.id) && product.id !== item.productId}>{product.productCode} · {product.productName}</option>)}</select></label>
      <label><span>Quantity</span><input type="number" min={0} max={1000000} step={1} value={item.quantity} onChange={(event) => update(index, { quantity: Number(event.target.value) })} /></label>
      <button type="button" className="remove-button" aria-label="Remove product" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>×</button>
    </div>) : <p className="empty-line">No products in this order yet.</p>}
    <button type="button" className="add-line-button" disabled={!nextProduct} onClick={() => nextProduct && onChange([...items, { productId: nextProduct.id, quantity: 1 }])}>＋ Add product</button>
  </div>;
}

function ModalShell({ title, subtitle, onClose, wide, children }: { title: string; subtitle: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal-card ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><div><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button aria-label="Close" onClick={onClose}>×</button></header><div className="modal-body">{children}</div></section></div>;
}

function FormActions({ onClose, label }: { onClose: () => void; label: string }) {
  return <div className="form-actions full"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button">{label}</button></div>;
}

function EmptyState({ icon, title, description, action }: { icon: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{description}</p>{action}</div>;
}
