ALTER TABLE `employees` ADD `category` text;
--> statement-breakpoint
ALTER TABLE `employees` ADD `confirmation_date` text;
--> statement-breakpoint
CREATE TABLE `employee_extended_details` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`date_of_birth` text,
	`gender` text,
	`living_location` text,
	`emergency_contact1_name` text,
	`emergency_contact1_phone` text,
	`emergency_contact1_relation` text,
	`emergency_contact2_name` text,
	`emergency_contact2_phone` text,
	`emergency_contact2_relation` text,
	`previous_company_name` text,
	`previous_company_relieving_reason` text,
	`previous_company_salary_monthly` real,
	`previous_company_salary_annual_ctc` real,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `employee_extended_details_employee_id_unique` UNIQUE(`employee_id`)
);
--> statement-breakpoint
CREATE TABLE `employee_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`doc_type` text NOT NULL,
	`file_name` text NOT NULL,
	`r2_key` text NOT NULL,
	`content_type` text NOT NULL,
	`file_size` integer NOT NULL,
	`uploaded_by_user_id` integer NOT NULL,
	`uploaded_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `employee_documents_employee_idx` ON `employee_documents` (`employee_id`);
