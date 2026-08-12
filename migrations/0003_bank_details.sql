CREATE TABLE `employee_bank_details` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`account_holder_name` text NOT NULL,
	`account_number` text NOT NULL,
	`ifsc` text NOT NULL,
	`bank_name` text,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employee_bank_details_employee_id_unique` ON `employee_bank_details` (`employee_id`);