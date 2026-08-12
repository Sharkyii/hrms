CREATE TABLE `office_networks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`ip_address` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `office_networks_ip_address_unique` ON `office_networks` (`ip_address`);