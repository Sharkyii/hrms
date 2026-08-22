import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { employees, users } from "./core";

export const retailerVisits = sqliteTable("retailer_visits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  shopName: text("shop_name").notNull(),
  area: text("area").notNull(),
  contractedAmount: real("contracted_amount").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  photoR2Key: text("photo_r2_key"),
  status: text("status", { enum: ["pending", "verified", "rejected"] }).notNull().default("pending"),
  verifiedByUserId: integer("verified_by_user_id").references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
});
