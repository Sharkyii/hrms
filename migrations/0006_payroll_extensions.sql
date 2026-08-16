CREATE TABLE `company_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`address_line1` text,
	`address_line2` text,
	`pan_number` text,
	`logo_base64` text,
	`signatory_label` text DEFAULT 'Authorized Signatory' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `employee_payroll_details` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`pan_number` text,
	`uan_number` text,
	`pf_account_number` text,
	`esi_number` text,
	`pran_number` text,
	`tax_regime` text,
	`function` text,
	`location` text,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employee_payroll_details_employee_id_unique` ON `employee_payroll_details` (`employee_id`);--> statement-breakpoint
CREATE TABLE `payroll_manual_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payroll_run_id` integer NOT NULL,
	`employee_id` integer NOT NULL,
	`loan` real DEFAULT 0 NOT NULL,
	`tds` real DEFAULT 0 NOT NULL,
	`updated_by_user_id` integer NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`payroll_run_id`) REFERENCES `payroll_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
