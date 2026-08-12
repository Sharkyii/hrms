CREATE TABLE `access_audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_user_id` integer NOT NULL,
	`target_user_id` integer NOT NULL,
	`field_changed` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`reason` text,
	`changed_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `correction_audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`actor_user_id` integer NOT NULL,
	`field_changed` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`reason` text,
	`changed_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_code` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`employee_type` text NOT NULL,
	`department` text,
	`designation` text,
	`reporting_manager_id` integer,
	`date_of_joining` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_employee_code_unique` ON `employees` (`employee_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `employees_email_unique` ON `employees` (`email`);--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`description` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `permissions_key_unique` ON `permissions` (`key`);--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` integer NOT NULL,
	`permission_id` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`role_id` integer NOT NULL,
	`last_login_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_employee_id_unique` ON `users` (`employee_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `attendance_correction_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`attendance_id` integer NOT NULL,
	`requested_by_user_id` integer NOT NULL,
	`field_changed` text NOT NULL,
	`old_value` text,
	`new_value` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by_user_id` integer,
	`reviewed_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`attendance_id`) REFERENCES `attendance_records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `attendance_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`date` text NOT NULL,
	`punch_in_at` text,
	`punch_out_at` text,
	`method` text NOT NULL,
	`confidence` text NOT NULL,
	`status` text NOT NULL,
	`latitude` real,
	`longitude` real,
	`within_geofence` integer,
	`device_id` text,
	`source_batch_id` integer,
	`flag_reason` text,
	`approved_by_user_id` integer,
	`approved_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `biometric_device_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` integer NOT NULL,
	`device_user_code` text NOT NULL,
	`employee_id` integer NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `biometric_devices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `biometric_devices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_code` text NOT NULL,
	`location` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `biometric_devices_device_code_unique` ON `biometric_devices` (`device_code`);--> statement-breakpoint
CREATE TABLE `biometric_import_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_name` text NOT NULL,
	`uploaded_by_user_id` integer NOT NULL,
	`uploaded_at` text DEFAULT (current_timestamp) NOT NULL,
	`status` text DEFAULT 'previewed' NOT NULL,
	`total_rows` integer DEFAULT 0 NOT NULL,
	`imported_rows` integer DEFAULT 0 NOT NULL,
	`skipped_duplicate_rows` integer DEFAULT 0 NOT NULL,
	`unknown_id_rows` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `biometric_import_rows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer NOT NULL,
	`row_hash` text NOT NULL,
	`device_code` text NOT NULL,
	`device_user_code` text NOT NULL,
	`punch_datetime` text NOT NULL,
	`in_out` text NOT NULL,
	`resolved_employee_id` integer,
	`status` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `biometric_import_batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `leave_balances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`leave_type_id` integer NOT NULL,
	`year` integer NOT NULL,
	`allocated` real DEFAULT 0 NOT NULL,
	`used` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `leave_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`leave_type_id` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`days` real NOT NULL,
	`reason` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`approved_by_user_id` integer,
	`approved_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `leave_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`is_paid` integer DEFAULT true NOT NULL,
	`annual_quota` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leave_types_name_unique` ON `leave_types` (`name`);--> statement-breakpoint
CREATE TABLE `arrears` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`origin_payroll_run_id` integer NOT NULL,
	`amount` real NOT NULL,
	`reason` text NOT NULL,
	`applied_payroll_run_id` integer,
	`created_by_user_id` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`origin_payroll_run_id`) REFERENCES `payroll_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`applied_payroll_run_id`) REFERENCES `payroll_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `bank_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payroll_run_id` integer NOT NULL,
	`generated_at` text DEFAULT (current_timestamp) NOT NULL,
	`content` text NOT NULL,
	FOREIGN KEY (`payroll_run_id`) REFERENCES `payroll_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `holidays` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `holidays_date_unique` ON `holidays` (`date`);--> statement-breakpoint
CREATE TABLE `payroll_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` integer NOT NULL,
	`year` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`locked_by_user_id` integer,
	`locked_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`locked_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payslip_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payslip_id` integer NOT NULL,
	`component_name` text NOT NULL,
	`type` text NOT NULL,
	`amount` real NOT NULL,
	FOREIGN KEY (`payslip_id`) REFERENCES `payslips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payslips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payroll_run_id` integer NOT NULL,
	`employee_id` integer NOT NULL,
	`payable_days` real NOT NULL,
	`present_days` real NOT NULL,
	`half_days` real NOT NULL,
	`paid_leave_days` real NOT NULL,
	`lop_days` real NOT NULL,
	`holiday_days` real NOT NULL,
	`ot_hours` real DEFAULT 0 NOT NULL,
	`ot_amount` real DEFAULT 0 NOT NULL,
	`gross_earnings` real NOT NULL,
	`pf_employee` real DEFAULT 0 NOT NULL,
	`pf_employer` real DEFAULT 0 NOT NULL,
	`esi_employee` real DEFAULT 0 NOT NULL,
	`esi_employer` real DEFAULT 0 NOT NULL,
	`professional_tax` real DEFAULT 0 NOT NULL,
	`tds` real DEFAULT 0 NOT NULL,
	`advances_deduction` real DEFAULT 0 NOT NULL,
	`arrears_amount` real DEFAULT 0 NOT NULL,
	`net_pay` real NOT NULL,
	`generated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`payroll_run_id`) REFERENCES `payroll_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `salary_components` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`structure_id` integer NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`amount` real NOT NULL,
	FOREIGN KEY (`structure_id`) REFERENCES `salary_structures`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `salary_structures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`basic` real NOT NULL,
	`hra` real DEFAULT 0 NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `statutory_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pf_employee_pct` real DEFAULT 12 NOT NULL,
	`pf_employer_pct` real DEFAULT 12 NOT NULL,
	`pf_wage_ceiling` real DEFAULT 15000 NOT NULL,
	`esi_employee_pct` real DEFAULT 0.75 NOT NULL,
	`esi_employer_pct` real DEFAULT 3.25 NOT NULL,
	`esi_wage_ceiling` real DEFAULT 21000 NOT NULL,
	`professional_tax_slabs_json` text DEFAULT '[]' NOT NULL,
	`effective_from` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `asset_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer NOT NULL,
	`employee_id` integer NOT NULL,
	`assigned_at` text DEFAULT (current_timestamp) NOT NULL,
	`returned_at` text,
	`condition_notes` text,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_code` text NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`purchase_date` text,
	`status` text DEFAULT 'available' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_asset_code_unique` ON `assets` (`asset_code`);--> statement-breakpoint
CREATE TABLE `employee_queries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`category` text NOT NULL,
	`subject` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'open' NOT NULL,
	`assigned_to_user_id` integer,
	`resolved_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `kra_cycles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kra_goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`cycle_id` integer NOT NULL,
	`title` text NOT NULL,
	`weight_pct` real NOT NULL,
	`target` text,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cycle_id`) REFERENCES `kra_cycles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `kra_ratings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`goal_id` integer NOT NULL,
	`self_rating` real,
	`manager_rating` real,
	`final_rating` real,
	`comments` text,
	`rated_by_user_id` integer,
	`rated_at` text,
	FOREIGN KEY (`goal_id`) REFERENCES `kra_goals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `policies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`category` text,
	`version` integer DEFAULT 1 NOT NULL,
	`published_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `candidates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_posting_id` integer NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`resume_url` text,
	`source` text,
	`stage` text DEFAULT 'applied' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`job_posting_id`) REFERENCES `job_postings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exit_clearances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exit_request_id` integer NOT NULL,
	`department` text NOT NULL,
	`cleared_by_user_id` integer,
	`cleared_at` text,
	`remarks` text,
	FOREIGN KEY (`exit_request_id`) REFERENCES `exit_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cleared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exit_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`resignation_date` text NOT NULL,
	`last_working_day` text NOT NULL,
	`reason` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `full_and_final_settlements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exit_request_id` integer NOT NULL,
	`dues` real DEFAULT 0 NOT NULL,
	`deductions` real DEFAULT 0 NOT NULL,
	`net_settlement` real DEFAULT 0 NOT NULL,
	`processed_at` text,
	FOREIGN KEY (`exit_request_id`) REFERENCES `exit_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `interviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`candidate_id` integer NOT NULL,
	`round` integer DEFAULT 1 NOT NULL,
	`interviewer_user_id` integer,
	`scheduled_at` text,
	`feedback` text,
	`rating` real,
	FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`interviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `job_postings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`department` text,
	`status` text DEFAULT 'open' NOT NULL,
	`openings` integer DEFAULT 1 NOT NULL,
	`description` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
