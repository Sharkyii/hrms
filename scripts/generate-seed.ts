import { writeFileSync } from "node:fs";
import { hashPassword } from "../src/lib/crypto.ts";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../src/lib/permissions.ts";

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function main() {
  const lines: string[] = [];

  const roleNames = ["founder", "hr", "manager", "employee"] as const;
  for (const name of roleNames) {
    lines.push(`INSERT INTO roles (name, description) VALUES (${sqlString(name)}, ${sqlString(roleDescription(name))});`);
  }

  for (const key of PERMISSIONS) {
    lines.push(`INSERT INTO permissions (key, description) VALUES (${sqlString(key)}, ${sqlString(key)});`);
  }

  for (const roleName of roleNames) {
    for (const permKey of ROLE_PERMISSIONS[roleName]) {
      lines.push(
        `INSERT INTO role_permissions (role_id, permission_id) SELECT (SELECT id FROM roles WHERE name = ${sqlString(roleName)}), (SELECT id FROM permissions WHERE key = ${sqlString(permKey)});`,
      );
    }
  }

  const leaveTypes: Array<{ name: string; isPaid: boolean; quota: number }> = [
    { name: "Casual Leave", isPaid: true, quota: 12 },
    { name: "Sick Leave", isPaid: true, quota: 8 },
    { name: "Earned Leave", isPaid: true, quota: 15 },
    { name: "Loss of Pay", isPaid: false, quota: 0 },
  ];
  for (const lt of leaveTypes) {
    lines.push(
      `INSERT INTO leave_types (name, is_paid, annual_quota) VALUES (${sqlString(lt.name)}, ${lt.isPaid ? 1 : 0}, ${lt.quota});`,
    );
  }

  // Default statutory rates (India-style PF/ESI, per the doc's deduction list) — HR should confirm/update via Settings.
  lines.push(
    `INSERT INTO statutory_settings (pf_employee_pct, pf_employer_pct, pf_wage_ceiling, esi_employee_pct, esi_employer_pct, esi_wage_ceiling, professional_tax_slabs_json) VALUES (12, 12, 15000, 0.75, 3.25, 21000, '[{"upTo":15000,"amount":0},{"upTo":20000,"amount":150},{"upTo":null,"amount":200}]');`,
  );

  const founderEmail = "snehk.sockscarving@gmail.com";
  const founderPassword = "Founder@12345";
  const { hash, salt } = await hashPassword(founderPassword);
  const today = new Date().toISOString().slice(0, 10);

  lines.push(
    `INSERT INTO employees (employee_code, full_name, email, employee_type, department, designation, date_of_joining, status) VALUES (${sqlString("FOUNDER-001")}, ${sqlString("Founder Admin")}, ${sqlString(founderEmail)}, 'office_laptop', ${sqlString("Founders")}, ${sqlString("Founder")}, ${sqlString(today)}, 'active');`,
  );
  lines.push(
    `INSERT INTO users (employee_id, email, password_hash, password_salt, role_id) SELECT id, ${sqlString(founderEmail)}, ${sqlString(hash)}, ${sqlString(salt)}, (SELECT id FROM roles WHERE name = 'founder') FROM employees WHERE employee_code = ${sqlString("FOUNDER-001")};`,
  );

  const out = lines.join("\n") + "\n";
  writeFileSync(new URL("../seed/seed.sql", import.meta.url), out);
  console.log(`Wrote seed/seed.sql (${lines.length} statements)`);
  console.log(`Founder login: ${founderEmail} / ${founderPassword} (change after first login)`);
}

function roleDescription(name: string): string {
  switch (name) {
    case "founder":
      return "Full access to everything; only role that can change access levels";
    case "hr":
      return "All employee records, attendance, leave, payroll, recruitment, policies";
    case "manager":
      return "Own team only: attendance/leave approval, exceptions, KRA ratings";
    case "employee":
      return "Own profile, attendance, payslip, leave application, queries";
    default:
      return "";
  }
}

main();
