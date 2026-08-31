import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const customers = sqliteTable('customers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  address: text('address').notNull(),
  mapUrl: text('map_url').notNull().default(''),
  preferredCallDay: integer('preferred_call_day').notNull().default(25),
  preferredDeliveryDay: integer('preferred_delivery_day').notNull().default(1),
  notes: text('notes').notNull().default(''),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  check('customers_call_day_check', sql`${table.preferredCallDay} between 1 and 31`),
  check('customers_delivery_day_check', sql`${table.preferredDeliveryDay} between 1 and 31`),
  index('idx_customers_active_name').on(table.isActive, table.name),
]);

export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productCode: integer('product_code').notNull(),
  productName: text('product_name').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_products_code_unique').on(table.productCode),
  check('products_code_check', sql`${table.productCode} between 1 and 10000000`),
  index('idx_products_active_name').on(table.isActive, table.productName),
]);

export const usualOrderItems = sqliteTable('usual_order_items', {
  customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id),
  quantity: integer('quantity').notNull(),
}, (table) => [
  primaryKey({ columns: [table.customerId, table.productId] }),
  check('usual_quantity_check', sql`${table.quantity} between 1 and 1000000`),
]);

export const monthlyOrders = sqliteTable('monthly_orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  customerId: integer('customer_id').notNull().references(() => customers.id),
  orderMonth: text('order_month').notNull(),
  status: text('status').notNull().default('draft'),
  nextCallAt: text('next_call_at').notNull().default(''),
  deliveryDate: text('delivery_date').notNull().default(''),
  contactNote: text('contact_note').notNull().default(''),
  confirmedAt: text('confirmed_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_orders_customer_month_unique').on(table.customerId, table.orderMonth),
  index('idx_orders_month_status').on(table.orderMonth, table.status),
  index('idx_orders_delivery_date').on(table.deliveryDate),
]);

export const monthlyOrderItems = sqliteTable('monthly_order_items', {
  orderId: integer('order_id').notNull().references(() => monthlyOrders.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id),
  productCodeSnapshot: integer('product_code_snapshot').notNull(),
  productNameSnapshot: text('product_name_snapshot').notNull(),
  quantity: integer('quantity').notNull(),
}, (table) => [
  primaryKey({ columns: [table.orderId, table.productId] }),
  check('order_quantity_check', sql`${table.quantity} between 1 and 1000000`),
]);

export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  actorId: text('actor_id').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: integer('entity_id'),
  details: text('details').notNull().default('{}'),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_audit_entity').on(table.entityType, table.entityId)]);
