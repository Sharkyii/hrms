CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`assigned_by_employee_id` integer NOT NULL,
	`assigned_to_employee_id` integer NOT NULL,
	`due_date` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`assigned_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_to_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tasks_assigned_to_idx` ON `tasks` (`assigned_to_employee_id`);
--> statement-breakpoint
CREATE TABLE `task_ratings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`rated_by_user_id` integer NOT NULL,
	`rating` real NOT NULL,
	`comments` text,
	`rated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `task_ratings_task_id_unique` UNIQUE(`task_id`)
);
