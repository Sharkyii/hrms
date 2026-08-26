import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { employees, users } from "./core";

export const genderValues = ["male", "female", "other"] as const;

// Everything about an employee that isn't payroll/statutory and isn't already on the core
// employees record — personal details, emergency contacts, and their previous-employer history.
export const employeeExtendedDetails = sqliteTable("employee_extended_details", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id).unique(),
  dateOfBirth: text("date_of_birth"),
  gender: text("gender", { enum: genderValues }),
  livingLocation: text("living_location"),
  emergencyContact1Name: text("emergency_contact1_name"),
  emergencyContact1Phone: text("emergency_contact1_phone"),
  emergencyContact1Relation: text("emergency_contact1_relation"),
  emergencyContact2Name: text("emergency_contact2_name"),
  emergencyContact2Phone: text("emergency_contact2_phone"),
  emergencyContact2Relation: text("emergency_contact2_relation"),
  previousCompanyName: text("previous_company_name"),
  previousCompanyRelievingReason: text("previous_company_relieving_reason"),
  previousCompanySalaryMonthly: real("previous_company_salary_monthly"),
  previousCompanySalaryAnnualCtc: real("previous_company_salary_annual_ctc"),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
});

// Current-company and previous-company document types an employee's file can hold.
export const employeeDocumentTypeValues = [
  "photo",
  "aadhar_card",
  "pan_card",
  "education_certificate",
  "bank_passbook",
  "offer_letter",
  "appointment_letter",
  "confirmation_letter",
  "employee_agreement",
  "increment_letter",
  "previous_offer_letter",
  "previous_relieving_letter",
  "previous_increment_letter",
  "previous_salary_slip",
  "relieving_letter",
  "experience_certificate",
] as const;

// Metadata row per uploaded file — the file bytes live in R2, keyed by r2Key.
export const employeeDocuments = sqliteTable("employee_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  docType: text("doc_type", { enum: employeeDocumentTypeValues }).notNull(),
  fileName: text("file_name").notNull(),
  r2Key: text("r2_key").notNull(),
  contentType: text("content_type").notNull(),
  fileSize: integer("file_size").notNull(),
  uploadedByUserId: integer("uploaded_by_user_id").notNull().references(() => users.id),
  uploadedAt: text("uploaded_at").notNull().default(sql`(current_timestamp)`),
});
