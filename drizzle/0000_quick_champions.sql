CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`address` text NOT NULL,
	`map_url` text DEFAULT '' NOT NULL,
	`preferred_call_day` integer DEFAULT 25 NOT NULL,
	`preferred_delivery_day` integer DEFAULT 1 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "customers_call_day_check" CHECK("customers"."preferred_call_day" between 1 and 31),
	CONSTRAINT "customers_delivery_day_check" CHECK("customers"."preferred_delivery_day" between 1 and 31)
);
--> statement-breakpoint
CREATE INDEX `idx_customers_active_name` ON `customers` (`is_active`,`name`);--> statement-breakpoint
CREATE TABLE `monthly_order_items` (
	`order_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`product_code_snapshot` integer NOT NULL,
	`product_name_snapshot` text NOT NULL,
	`quantity` integer NOT NULL,
	PRIMARY KEY(`order_id`, `product_id`),
	FOREIGN KEY (`order_id`) REFERENCES `monthly_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "order_quantity_check" CHECK("monthly_order_items"."quantity" between 1 and 1000000)
);
--> statement-breakpoint
CREATE TABLE `monthly_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer NOT NULL,
	`order_month` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`next_call_at` text DEFAULT '' NOT NULL,
	`delivery_date` text DEFAULT '' NOT NULL,
	`contact_note` text DEFAULT '' NOT NULL,
	`confirmed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_orders_customer_month_unique` ON `monthly_orders` (`customer_id`,`order_month`);--> statement-breakpoint
CREATE INDEX `idx_orders_month_status` ON `monthly_orders` (`order_month`,`status`);--> statement-breakpoint
CREATE INDEX `idx_orders_delivery_date` ON `monthly_orders` (`delivery_date`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_code` integer NOT NULL,
	`product_name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "products_code_check" CHECK("products"."product_code" between 1 and 10000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_products_code_unique` ON `products` (`product_code`);--> statement-breakpoint
CREATE INDEX `idx_products_active_name` ON `products` (`is_active`,`product_name`);--> statement-breakpoint
CREATE TABLE `usual_order_items` (
	`customer_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	PRIMARY KEY(`customer_id`, `product_id`),
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "usual_quantity_check" CHECK("usual_order_items"."quantity" between 1 and 1000000)
);
