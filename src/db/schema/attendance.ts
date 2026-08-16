import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { employees, users } from "./core";

export const attendanceMethodValues = [
  "web_punch",
  "mobile_app",
  "biometric",
  "face_device",
  "rfid_kiosk",
  "supervisor_roster",
  "vendor_bulk_entry",
  "gate_register",
  "manager_confirmation",
] as const;

export const confidenceValues = ["high", "medium", "low"] as const;
export const attendanceStatusValues = [
  "auto_approved",
  "pending_manager",
  "pending_hr",
  "approved",
  "rejected",
] as const;

export const attendanceRecords = sqliteTable("attendance_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  date: text("date").notNull(),
  punchInAt: text("punch_in_at"),
  punchOutAt: text("punch_out_at"),
  method: text("method", { enum: attendanceMethodValues }).notNull(),
  confidence: text("confidence", { enum: confidenceValues }).notNull(),
  status: text("status", { enum: attendanceStatusValues }).notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  withinGeofence: integer("within_geofence", { mode: "boolean" }),
  deviceId: text("device_id"),
  sourceBatchId: integer("source_batch_id"),
  flagReason: text("flag_reason"),
  approvedByUserId: integer("approved_by_user_id").references(() => users.id),
  approvedAt: text("approved_at"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
});

export const attendanceCorrectionRequests = sqliteTable("attendance_correction_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  attendanceId: integer("attendance_id").notNull().references(() => attendanceRecords.id),
  requestedByUserId: integer("requested_by_user_id").notNull().references(() => users.id),
  fieldChanged: text("field_changed").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value").notNull(),
  reason: text("reason").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  reviewedByUserId: integer("reviewed_by_user_id").references(() => users.id),
  reviewedAt: text("reviewed_at"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  expiresAt: text("expires_at").notNull(),
});

export const leaveTypes = sqliteTable("leave_types", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  isPaid: integer("is_paid", { mode: "boolean" }).notNull().default(true),
  annualQuota: real("annual_quota").notNull().default(0),
});

export const leaveBalances = sqliteTable("leave_balances", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  leaveTypeId: integer("leave_type_id").notNull().references(() => leaveTypes.id),
  year: integer("year").notNull(),
  allocated: real("allocated").notNull().default(0),
  used: real("used").notNull().default(0),
});

export const leaveRequests = sqliteTable("leave_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  leaveTypeId: integer("leave_type_id").notNull().references(() => leaveTypes.id),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  days: real("days").notNull(),
  reason: text("reason"),
  status: text("status", { enum: ["pending", "approved", "rejected", "cancelled"] }).notNull().default("pending"),
  approvedByUserId: integer("approved_by_user_id").references(() => users.id),
  approvedAt: text("approved_at"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

// Office public IP addresses — a web punch from a matching IP scores High confidence.
export const officeNetworks = sqliteTable("office_networks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  ipAddress: text("ip_address").notNull().unique(),
});

// Geo-fence center for field/site-based mobile punches.
export const workSites = sqliteTable("work_sites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  radiusMeters: real("radius_meters").notNull().default(200),
});

export const employeeSiteAssignments = sqliteTable("employee_site_assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  siteId: integer("site_id").notNull().references(() => workSites.id),
});

export const biometricDevices = sqliteTable("biometric_devices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deviceCode: text("device_code").notNull().unique(),
  location: text("location"),
});

// Saved once per device: maps the device's internal user code to an employee record.
export const biometricDeviceMappings = sqliteTable("biometric_device_mappings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deviceId: integer("device_id").notNull().references(() => biometricDevices.id),
  deviceUserCode: text("device_user_code").notNull(),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
});

export const biometricImportBatches = sqliteTable("biometric_import_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileName: text("file_name").notNull(),
  uploadedByUserId: integer("uploaded_by_user_id").notNull().references(() => users.id),
  uploadedAt: text("uploaded_at").notNull().default(sql`(current_timestamp)`),
  status: text("status", { enum: ["previewed", "imported"] }).notNull().default("previewed"),
  totalRows: integer("total_rows").notNull().default(0),
  importedRows: integer("imported_rows").notNull().default(0),
  skippedDuplicateRows: integer("skipped_duplicate_rows").notNull().default(0),
  unknownIdRows: integer("unknown_id_rows").notNull().default(0),
});

export const biometricImportRows = sqliteTable("biometric_import_rows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  batchId: integer("batch_id").notNull().references(() => biometricImportBatches.id),
  rowHash: text("row_hash").notNull(),
  deviceCode: text("device_code").notNull(),
  deviceUserCode: text("device_user_code").notNull(),
  deviceEmployeeName: text("device_employee_name"),
  punchDatetime: text("punch_datetime").notNull(),
  inOut: text("in_out", { enum: ["in", "out", "unknown"] }).notNull(),
  resolvedEmployeeId: integer("resolved_employee_id").references(() => employees.id),
  status: text("status", { enum: ["ready", "duplicate", "unknown_id", "imported"] }).notNull(),
});
