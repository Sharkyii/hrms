ALTER TABLE `kra_goals` ADD `target_value` real;
--> statement-breakpoint
ALTER TABLE `kra_goals` ADD `achieved_value` real;
--> statement-breakpoint
ALTER TABLE `kra_goals` ADD `target_unit` text;
--> statement-breakpoint
ALTER TABLE `kra_goals` ADD `band_pct` real;
--> statement-breakpoint
ALTER TABLE `kra_goals` ADD `score_override` real;
--> statement-breakpoint
CREATE TABLE `kpi_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kpi_template_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`template_id` integer NOT NULL,
	`title` text NOT NULL,
	`weight_pct` real NOT NULL,
	`target_value` real,
	`target_unit` text,
	`band_pct` real,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `kpi_templates`(`id`) ON UPDATE no action ON DELETE no action
);
