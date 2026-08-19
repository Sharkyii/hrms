ALTER TABLE `salary_structures` ADD `updated_by_user_id` integer REFERENCES users(id);
