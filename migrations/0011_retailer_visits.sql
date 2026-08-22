CREATE TABLE `retailer_visits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`shop_name` text NOT NULL,
	`area` text NOT NULL,
	`contracted_amount` real NOT NULL,
	`latitude` real,
	`longitude` real,
	`photo_r2_key` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`verified_by_user_id` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`verified_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `retailer_visits_employee_idx` ON `retailer_visits` (`employee_id`);
