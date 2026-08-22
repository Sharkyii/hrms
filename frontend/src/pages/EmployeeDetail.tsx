import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { api, ApiError } from "../api";
import { Badge } from "../components/Badge";
import { Spinner } from "../components/Spinner";
import { Icon } from "../components/Icon";
import { useToast } from "../components/Toast";
import type { Employee } from "../auth";

interface AttendanceRecord {
  id: number;
  date: string;
  punchInAt: string | null;
  punchOutAt: string | null;
  method: string;
  confidence: string;
  status: string;
}
interface PayslipSummary {
  payslipId: number;
  month: number;
  year: number;
  runStatus: string;
  grossEarnings: number;
  netPay: number;
}
interface KraGoal {
  id: number;
  title: string;
  weightPct: number;
  rating: { selfRating: number | null; managerRating: number | null; finalRating: number | null } | null;
}
interface LeaveRequest {
  id: number;
  leaveTypeId: number;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
}
interface DocumentMeta {
  id: number;
  docType: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  uploadedAt: string;
}
const CURRENT_COMPANY_DOCS: Array<{ type: string; label: string }> = [
  { type: "offer_letter", label: "Offer Letter" },
  { type: "appointment_letter", label: "Appointment Letter" },
  { type: "confirmation_letter", label: "Confirmation Letter" },
  { type: "employee_agreement", label: "Employee Agreement" },
  { type: "increment_letter", label: "Increment Letter (if any)" },
];
const PREVIOUS_COMPANY_DOCS: Array<{ type: string; label: string; multiple?: boolean }> = [
  { type: "photo", label: "Passport size photo" },
  { type: "aadhar_card", label: "Aadhar card" },
  { type: "pan_card", label: "PAN card" },
  { type: "education_certificate", label: "Education certificate" },
  { type: "bank_passbook", label: "Bank passbook — first page" },
  { type: "previous_offer_letter", label: "Previous company offer letter" },
  { type: "previous_relieving_letter", label: "Previous company relieving letter" },
  { type: "previous_increment_letter", label: "Increment letter (if any)" },
  { type: "previous_salary_slip", label: "Last 3 months' salary slips", multiple: true },
];
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
interface Asset {
  id: number;
  assetCode: string;
  name: string;
  category: string | null;
}
interface WorkLogEntry {
  id: number;
  date: string;
  tasks: string;
}
interface PayrollDetails {
  panNumber: string | null;
  uanNumber: string | null;
  pfAccountNumber: string | null;
  esiNumber: string | null;
}
interface CtcBreakdown {
  fixedBasic: number;
  fixedHra: number;
  fixedOtherAllowance: number;
  fixedGrossSalary: number;
  esiEmployerPct: number;
  esiEmployeePct: number;
  esiEmployer: number;
  esiEmployee: number;
  pfEmployerPct: number;
  pfEmployeePct: number;
  pfEmployer: number;
  pfEmployee: number;
  professionalTax: number;
  otherDeductions: number;
  totalDeduction: number;
  netPay: number;
}
interface ExtendedDetails {
  dateOfBirth: string | null;
  gender: string | null;
  livingLocation: string | null;
  emergencyContact1Name: string | null;
  emergencyContact1Phone: string | null;
  emergencyContact1Relation: string | null;
  emergencyContact2Name: string | null;
  emergencyContact2Phone: string | null;
  emergencyContact2Relation: string | null;
  previousCompanyName: string | null;
  previousCompanyRelievingReason: string | null;
  previousCompanySalaryMonthly: number | null;
  previousCompanySalaryAnnualCtc: number | null;
}
interface Profile {
  employee: Employee;
  managerName: string | null;
  isSelf: boolean;
  attendance: {
    thisMonthSummary: { presentDays: number; halfDays: number; paidLeaveDays: number; lopDays: number; holidayDays: number; payableDays: number; otHours: number };
    recent: AttendanceRecord[];
  };
  payslips: PayslipSummary[] | null;
  payrollDetails: PayrollDetails | null;
  ctcBreakdown: CtcBreakdown | null;
  extendedDetails: ExtendedDetails | null;
  bankDetails: { bankName: string | null; accountHolderName: string; accountNumber: string; ifsc: string } | null;
  kra: { cycleName: string | null; goals: KraGoal[]; score: number | null; weightRatedPct: number; category: string | null };
  leave: { balances: Array<{ leaveType: string; allocated: number; used: number }>; recent: LeaveRequest[] };
  assets: Asset[];
  workLog: WorkLogEntry[];
}

function calcAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

const EMPLOYEE_CATEGORIES = ["skilled", "semi_skilled", "unskilled"];
const GENDERS = ["male", "female", "other"];

export function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [logTasks, setLogTasks] = useState("");
  const [savingLog, setSavingLog] = useState(false);
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [coreForm, setCoreForm] = useState({ category: "", confirmationDate: "" });
  const [payrollForm, setPayrollForm] = useState({ panNumber: "", uanNumber: "", pfAccountNumber: "", esiNumber: "" });
  const [bankForm, setBankForm] = useState({ bankName: "", accountHolderName: "", accountNumber: "", ifsc: "" });
  const [extForm, setExtForm] = useState({
    dateOfBirth: "", gender: "", livingLocation: "",
    emergencyContact1Name: "", emergencyContact1Phone: "", emergencyContact1Relation: "",
    emergencyContact2Name: "", emergencyContact2Phone: "", emergencyContact2Relation: "",
    previousCompanyName: "", previousCompanyRelievingReason: "",
    previousCompanySalaryMonthly: "", previousCompanySalaryAnnualCtc: "",
  });

  function load() {
    setLoading(true);
    setError(null);
    return api
      .get<Profile>(`/employees/${id}/profile`)
      .then((p) => {
        setProfile(p);
        setCoreForm({ category: p.employee.category ?? "", confirmationDate: p.employee.confirmationDate ?? "" });
        setPayrollForm({
          panNumber: p.payrollDetails?.panNumber ?? "",
          uanNumber: p.payrollDetails?.uanNumber ?? "",
          pfAccountNumber: p.payrollDetails?.pfAccountNumber ?? "",
          esiNumber: p.payrollDetails?.esiNumber ?? "",
        });
        setBankForm({
          bankName: p.bankDetails?.bankName ?? "",
          accountHolderName: p.bankDetails?.accountHolderName ?? "",
          accountNumber: p.bankDetails?.accountNumber ?? "",
          ifsc: p.bankDetails?.ifsc ?? "",
        });
        setExtForm({
          dateOfBirth: p.extendedDetails?.dateOfBirth ?? "",
          gender: p.extendedDetails?.gender ?? "",
          livingLocation: p.extendedDetails?.livingLocation ?? "",
          emergencyContact1Name: p.extendedDetails?.emergencyContact1Name ?? "",
          emergencyContact1Phone: p.extendedDetails?.emergencyContact1Phone ?? "",
          emergencyContact1Relation: p.extendedDetails?.emergencyContact1Relation ?? "",
          emergencyContact2Name: p.extendedDetails?.emergencyContact2Name ?? "",
          emergencyContact2Phone: p.extendedDetails?.emergencyContact2Phone ?? "",
          emergencyContact2Relation: p.extendedDetails?.emergencyContact2Relation ?? "",
          previousCompanyName: p.extendedDetails?.previousCompanyName ?? "",
          previousCompanyRelievingReason: p.extendedDetails?.previousCompanyRelievingReason ?? "",
          previousCompanySalaryMonthly: p.extendedDetails?.previousCompanySalaryMonthly?.toString() ?? "",
          previousCompanySalaryAnnualCtc: p.extendedDetails?.previousCompanySalaryAnnualCtc?.toString() ?? "",
        });
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  function loadDocuments() {
    api.get<DocumentMeta[]>(`/employees/${id}/documents`).then(setDocuments).catch(() => setDocuments([]));
  }

  useEffect(() => {
    load();
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function uploadDoc(docType: string, file: File) {
    setUploadingType(docType);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("docType", docType);
      await api.postForm(`/employees/${id}/documents`, form);
      toast.success("Document uploaded.");
      loadDocuments();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploadingType(null);
    }
  }

  async function deleteDoc(docId: number) {
    await api.del(`/employees/${id}/documents/${docId}`);
    toast.success("Document removed.");
    loadDocuments();
  }

  async function addLogEntry() {
    if (!logTasks.trim()) return;
    setSavingLog(true);
    try {
      await api.post("/worklog", { date: logDate, tasks: logTasks.trim() });
      setLogTasks("");
      await load();
    } finally {
      setSavingLog(false);
    }
  }

  async function saveDetails() {
    setSaving(true);
    try {
      const calls = [
        api.put(`/employees/${id}`, { category: coreForm.category || null, confirmationDate: coreForm.confirmationDate || null }),
        api.put(`/payroll/employee-payroll-details/${id}`, payrollForm),
        api.put(`/employees/${id}/extended-details`, {
          ...extForm,
          previousCompanySalaryMonthly: extForm.previousCompanySalaryMonthly ? Number(extForm.previousCompanySalaryMonthly) : null,
          previousCompanySalaryAnnualCtc: extForm.previousCompanySalaryAnnualCtc ? Number(extForm.previousCompanySalaryAnnualCtc) : null,
        }),
      ];
      // Bank details has required fields on the backend — only send it if the user actually filled them in,
      // otherwise this call 400s and (via Promise.all) aborts saving everything else in this form.
      if (bankForm.accountHolderName.trim() && bankForm.accountNumber.trim() && bankForm.ifsc.trim()) {
        calls.push(api.put(`/payroll/bank-details/${id}`, bankForm));
      }
      await Promise.all(calls);
      toast.success("Details saved.");
      setEditing(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div><div className="page-header"><h1>Employee</h1></div><Spinner /></div>;
  if (error) return <div><div className="page-header"><h1>Employee</h1></div><div className="error-banner">{error}</div></div>;
  if (!profile) return null;

  const e = profile.employee;
  const s = profile.attendance.thisMonthSummary;
  const canUploadDocs = profile.isSelf || can("employee.manage");

  function renderDocSlot(slot: { type: string; label: string; multiple?: boolean }) {
    const files = documents.filter((d) => d.docType === slot.type);
    return (
      <div className="list-row" key={slot.type} style={{ alignItems: "flex-start" }}>
        <div className="main">
          <div className="title">{slot.label}</div>
          {files.length === 0 ? (
            <div className="subtitle">Not uploaded yet.</div>
          ) : (
            <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 4 }}>
              {files.map((f) => (
                <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <a href={`/api/employees/${id}/documents/${f.id}/download`} target="_blank" rel="noreferrer">{f.fileName}</a>
                  <span className="muted">({formatBytes(f.fileSize)})</span>
                  {can("employee.manage") && (
                    <button className="btn danger" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => deleteDoc(f.id)}>Remove</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {canUploadDocs && (files.length === 0 || slot.multiple) && (
          <label className="btn secondary" style={{ cursor: "pointer" }}>
            {uploadingType === slot.type ? "Uploading..." : "Upload"}
            <input
              type="file"
              style={{ display: "none" }}
              disabled={uploadingType !== null}
              onChange={(ev) => {
                const file = ev.target.files?.[0];
                if (file) uploadDoc(slot.type, file);
                ev.target.value = "";
              }}
            />
          </label>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <button className="btn secondary" onClick={() => navigate(-1)}><Icon name="close" /> Back</button>
      </div>

      <div className="card">
        <h2>
          {e.fullName} <span className="muted">— {e.employeeCode}</span>
          {can("employee.manage") && (
            <button className="btn secondary" onClick={() => setEditing(!editing)}>{editing ? "Cancel" : "Edit details"}</button>
          )}
        </h2>
        <div className="form-row">
          <div><label>Department</label><div>{e.department ?? "—"}</div></div>
          <div><label>Designation</label><div>{e.designation ?? "—"}</div></div>
          <div><label>Type</label><div>{e.employeeType.replace(/_/g, " ")}</div></div>
          <div><label>Reports to</label><div>{profile.managerName ?? "—"}</div></div>
          <div><label>Joined</label><div>{e.dateOfJoining}</div></div>
          <div><label>Status</label><div><Badge value={e.status} /></div></div>
        </div>
        <div className="form-row" style={{ marginTop: 4 }}>
          <div className="field">
            <label>Category</label>
            {editing ? (
              <select value={coreForm.category} onChange={(ev) => setCoreForm({ ...coreForm, category: ev.target.value })}>
                <option value="">Not set</option>
                {EMPLOYEE_CATEGORIES.map((cVal) => <option key={cVal} value={cVal}>{cVal.replace(/_/g, " ")}</option>)}
              </select>
            ) : (
              <div>{e.category ? e.category.replace(/_/g, " ") : "—"}</div>
            )}
          </div>
          <div className="field">
            <label>Confirmation date</label>
            {editing ? (
              <input type="date" value={coreForm.confirmationDate} onChange={(ev) => setCoreForm({ ...coreForm, confirmationDate: ev.target.value })} />
            ) : (
              <div>{e.confirmationDate ?? "—"}</div>
            )}
          </div>
          {(editing || profile.payrollDetails) && (
            <>
              <div className="field">
                <label>UAN No.</label>
                {editing ? <input value={payrollForm.uanNumber} onChange={(ev) => setPayrollForm({ ...payrollForm, uanNumber: ev.target.value })} /> : <div>{profile.payrollDetails?.uanNumber ?? "—"}</div>}
              </div>
              <div className="field">
                <label>PF No.</label>
                {editing ? <input value={payrollForm.pfAccountNumber} onChange={(ev) => setPayrollForm({ ...payrollForm, pfAccountNumber: ev.target.value })} /> : <div>{profile.payrollDetails?.pfAccountNumber ?? "—"}</div>}
              </div>
              <div className="field">
                <label>ESIC No.</label>
                {editing ? <input value={payrollForm.esiNumber} onChange={(ev) => setPayrollForm({ ...payrollForm, esiNumber: ev.target.value })} /> : <div>{profile.payrollDetails?.esiNumber ?? "—"}</div>}
              </div>
              <div className="field">
                <label>PAN No.</label>
                {editing ? <input value={payrollForm.panNumber} onChange={(ev) => setPayrollForm({ ...payrollForm, panNumber: ev.target.value })} /> : <div>{profile.payrollDetails?.panNumber ?? "—"}</div>}
              </div>
            </>
          )}
        </div>
        {editing && <button className="btn" onClick={saveDetails} disabled={saving} style={{ marginTop: 12 }}>{saving ? "Saving..." : "Save all details"}</button>}
      </div>

      {(editing || profile.ctcBreakdown) && (
        <div className="card">
          <h2>Salary CTC breakup</h2>
          {!profile.ctcBreakdown ? (
            <p className="empty">No salary structure set yet — add one under Payroll → Salary Structures.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <tbody>
                  <tr><td>Fixed Basic</td><td style={{ textAlign: "right" }}>{profile.ctcBreakdown.fixedBasic.toFixed(2)}</td></tr>
                  <tr><td>Fixed HRA</td><td style={{ textAlign: "right" }}>{profile.ctcBreakdown.fixedHra.toFixed(2)}</td></tr>
                  <tr><td>Fixed Other Allowance</td><td style={{ textAlign: "right" }}>{profile.ctcBreakdown.fixedOtherAllowance.toFixed(2)}</td></tr>
                  <tr><td><strong>Fixed Gross Salary</strong></td><td style={{ textAlign: "right" }}><strong>{profile.ctcBreakdown.fixedGrossSalary.toFixed(2)}</strong></td></tr>
                  <tr><td colSpan={2}><br /><strong>Deductions — Employee</strong></td></tr>
                  <tr><td>ESIC — Employee ({profile.ctcBreakdown.esiEmployeePct}%)</td><td style={{ textAlign: "right" }}>{profile.ctcBreakdown.esiEmployee.toFixed(2)}</td></tr>
                  <tr><td>PF — Employee ({profile.ctcBreakdown.pfEmployeePct}%)</td><td style={{ textAlign: "right" }}>{profile.ctcBreakdown.pfEmployee.toFixed(2)}</td></tr>
                  <tr><td>PT</td><td style={{ textAlign: "right" }}>{profile.ctcBreakdown.professionalTax.toFixed(2)}</td></tr>
                  {profile.ctcBreakdown.otherDeductions > 0 && <tr><td>Other deductions</td><td style={{ textAlign: "right" }}>{profile.ctcBreakdown.otherDeductions.toFixed(2)}</td></tr>}
                  <tr><td><strong>Total Deduction (Employee)</strong></td><td style={{ textAlign: "right" }}><strong>{profile.ctcBreakdown.totalDeduction.toFixed(2)}</strong></td></tr>
                  <tr><td><strong>Net Pay</strong></td><td style={{ textAlign: "right" }}><strong>{profile.ctcBreakdown.netPay.toFixed(2)}</strong></td></tr>
                  <tr><td colSpan={2}><br /><strong>Employer contribution</strong> <span className="muted" style={{ fontWeight: 400 }}>(company cost, not deducted from pay)</span></td></tr>
                  <tr><td>ESIC — Employer ({profile.ctcBreakdown.esiEmployerPct}%)</td><td style={{ textAlign: "right" }}>{profile.ctcBreakdown.esiEmployer.toFixed(2)}</td></tr>
                  <tr><td>PF — Employer ({profile.ctcBreakdown.pfEmployerPct}%)</td><td style={{ textAlign: "right" }}>{profile.ctcBreakdown.pfEmployer.toFixed(2)}</td></tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {(editing || profile.bankDetails) && (
        <div className="card">
          <h2>Bank details</h2>
          <div className="form-row">
            <div className="field">
              <label>Bank name</label>
              {editing ? <input value={bankForm.bankName} onChange={(ev) => setBankForm({ ...bankForm, bankName: ev.target.value })} /> : <div>{profile.bankDetails?.bankName ?? "—"}</div>}
            </div>
            <div className="field">
              <label>Account holder</label>
              {editing ? <input value={bankForm.accountHolderName} onChange={(ev) => setBankForm({ ...bankForm, accountHolderName: ev.target.value })} /> : <div>{profile.bankDetails?.accountHolderName ?? "—"}</div>}
            </div>
            <div className="field">
              <label>Account number</label>
              {editing ? <input value={bankForm.accountNumber} onChange={(ev) => setBankForm({ ...bankForm, accountNumber: ev.target.value })} /> : <div>{profile.bankDetails?.accountNumber ?? "—"}</div>}
            </div>
            <div className="field">
              <label>IFSC</label>
              {editing ? <input value={bankForm.ifsc} onChange={(ev) => setBankForm({ ...bankForm, ifsc: ev.target.value })} /> : <div>{profile.bankDetails?.ifsc ?? "—"}</div>}
            </div>
          </div>
        </div>
      )}

      {(editing || profile.extendedDetails) && (
        <div className="card">
          <h2>Other details</h2>
          <div className="form-row">
            <div><label>Phone</label><div>{e.phone ?? "—"}</div></div>
            <div><label>Email</label><div>{e.email}</div></div>
            <div className="field">
              <label>Date of birth</label>
              {editing ? <input type="date" value={extForm.dateOfBirth} onChange={(ev) => setExtForm({ ...extForm, dateOfBirth: ev.target.value })} /> : <div>{profile.extendedDetails?.dateOfBirth ?? "—"} {profile.extendedDetails?.dateOfBirth && `(age ${calcAge(profile.extendedDetails.dateOfBirth)})`}</div>}
            </div>
            <div className="field">
              <label>Gender</label>
              {editing ? (
                <select value={extForm.gender} onChange={(ev) => setExtForm({ ...extForm, gender: ev.target.value })}>
                  <option value="">Not set</option>
                  {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              ) : <div>{profile.extendedDetails?.gender ?? "—"}</div>}
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label>Living location</label>
              {editing ? <input value={extForm.livingLocation} onChange={(ev) => setExtForm({ ...extForm, livingLocation: ev.target.value })} /> : <div>{profile.extendedDetails?.livingLocation ?? "—"}</div>}
            </div>
          </div>

          <h3 style={{ marginTop: 16 }}>Emergency contact 1</h3>
          <div className="form-row">
            <div className="field"><label>Name</label>{editing ? <input value={extForm.emergencyContact1Name} onChange={(ev) => setExtForm({ ...extForm, emergencyContact1Name: ev.target.value })} /> : <div>{profile.extendedDetails?.emergencyContact1Name ?? "—"}</div>}</div>
            <div className="field"><label>Phone</label>{editing ? <input value={extForm.emergencyContact1Phone} onChange={(ev) => setExtForm({ ...extForm, emergencyContact1Phone: ev.target.value })} /> : <div>{profile.extendedDetails?.emergencyContact1Phone ?? "—"}</div>}</div>
            <div className="field"><label>Relation</label>{editing ? <input value={extForm.emergencyContact1Relation} onChange={(ev) => setExtForm({ ...extForm, emergencyContact1Relation: ev.target.value })} /> : <div>{profile.extendedDetails?.emergencyContact1Relation ?? "—"}</div>}</div>
          </div>

          <h3 style={{ marginTop: 12 }}>Emergency contact 2</h3>
          <div className="form-row">
            <div className="field"><label>Name</label>{editing ? <input value={extForm.emergencyContact2Name} onChange={(ev) => setExtForm({ ...extForm, emergencyContact2Name: ev.target.value })} /> : <div>{profile.extendedDetails?.emergencyContact2Name ?? "—"}</div>}</div>
            <div className="field"><label>Phone</label>{editing ? <input value={extForm.emergencyContact2Phone} onChange={(ev) => setExtForm({ ...extForm, emergencyContact2Phone: ev.target.value })} /> : <div>{profile.extendedDetails?.emergencyContact2Phone ?? "—"}</div>}</div>
            <div className="field"><label>Relation</label>{editing ? <input value={extForm.emergencyContact2Relation} onChange={(ev) => setExtForm({ ...extForm, emergencyContact2Relation: ev.target.value })} /> : <div>{profile.extendedDetails?.emergencyContact2Relation ?? "—"}</div>}</div>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Current company details</h2>
        <p className="muted">Payslips are generated automatically each run — see the Payslips section below.</p>
        <div className="list">
          {CURRENT_COMPANY_DOCS.map(renderDocSlot)}
        </div>
      </div>

      {(canUploadDocs || editing || profile.extendedDetails?.previousCompanyName || documents.some((d) => PREVIOUS_COMPANY_DOCS.some((s) => s.type === d.docType))) && (
        <div className="card">
          <h2>Previous company details</h2>
          <div className="form-row">
            <div className="field"><label>Previous company name</label>{editing ? <input value={extForm.previousCompanyName} onChange={(ev) => setExtForm({ ...extForm, previousCompanyName: ev.target.value })} /> : <div>{profile.extendedDetails?.previousCompanyName ?? "—"}</div>}</div>
            <div className="field"><label>Reason for leaving</label>{editing ? <input value={extForm.previousCompanyRelievingReason} onChange={(ev) => setExtForm({ ...extForm, previousCompanyRelievingReason: ev.target.value })} /> : <div>{profile.extendedDetails?.previousCompanyRelievingReason ?? "—"}</div>}</div>
          </div>
          <div className="form-row">
            <div className="field"><label>Last salary — per month in hand</label>{editing ? <input type="number" value={extForm.previousCompanySalaryMonthly} onChange={(ev) => setExtForm({ ...extForm, previousCompanySalaryMonthly: ev.target.value })} /> : <div>{profile.extendedDetails?.previousCompanySalaryMonthly?.toFixed(2) ?? "—"}</div>}</div>
            <div className="field"><label>Last salary — yearly CTC</label>{editing ? <input type="number" value={extForm.previousCompanySalaryAnnualCtc} onChange={(ev) => setExtForm({ ...extForm, previousCompanySalaryAnnualCtc: ev.target.value })} /> : <div>{profile.extendedDetails?.previousCompanySalaryAnnualCtc?.toFixed(2) ?? "—"}</div>}</div>
          </div>
          <div className="list" style={{ marginTop: 12 }}>
            {PREVIOUS_COMPANY_DOCS.map(renderDocSlot)}
          </div>
        </div>
      )}

      <div className="card">
        <h2>Attendance — this month</h2>
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <div className="stat"><div className="value">{s.presentDays}</div><div className="label">Present days</div></div>
          <div className="stat"><div className="value">{s.halfDays}</div><div className="label">Half days</div></div>
          <div className="stat"><div className="value">{s.paidLeaveDays}</div><div className="label">Paid leave</div></div>
          <div className="stat"><div className="value">{s.lopDays}</div><div className="label">LOP days</div></div>
          <div className="stat"><div className="value">{s.payableDays}</div><div className="label">Payable days</div></div>
        </div>
        {profile.attendance.recent.length === 0 ? (
          <p className="empty">No attendance records yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Method</th><th>Confidence</th><th>Status</th></tr></thead>
              <tbody>
                {profile.attendance.recent.map((r) => (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>{r.punchInAt ? new Date(r.punchInAt).toLocaleTimeString() : "—"}</td>
                    <td>{r.punchOutAt ? new Date(r.punchOutAt).toLocaleTimeString() : "—"}</td>
                    <td>{r.method.replace(/_/g, " ")}</td>
                    <td><Badge value={r.confidence} /></td>
                    <td><Badge value={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Work log</h2>
        {profile.isSelf && (
          <div className="form-row" style={{ marginBottom: 16, alignItems: "flex-end" }}>
            <div className="field">
              <label>Date</label>
              <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>What did you work on?</label>
              <input
                placeholder="e.g. Fixed checkout bug, reviewed vendor invoices..."
                value={logTasks}
                onChange={(e) => setLogTasks(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addLogEntry()}
              />
            </div>
            <button className="btn" onClick={addLogEntry} disabled={savingLog || !logTasks.trim()}>
              {savingLog ? "Saving..." : "Add"}
            </button>
          </div>
        )}
        {profile.workLog.length === 0 ? (
          <p className="empty">No work log entries yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Tasks</th></tr></thead>
              <tbody>
                {profile.workLog.map((w) => (
                  <tr key={w.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{w.date}</td>
                    <td>{w.tasks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Payslips</h2>
        {profile.payslips === null ? (
          <p className="empty">Not visible at your access level.</p>
        ) : profile.payslips.length === 0 ? (
          <p className="empty">No payslips yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Period</th><th>Gross</th><th>Net pay</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {profile.payslips.map((p) => (
                  <tr key={p.payslipId}>
                    <td>{p.month}/{p.year}</td>
                    <td>{p.grossEarnings.toFixed(2)}</td>
                    <td><strong>{p.netPay.toFixed(2)}</strong></td>
                    <td><Badge value={p.runStatus} /></td>
                    <td>
                      <a className="btn secondary" href={`/api/payroll/payslips/${p.payslipId}/pdf`} target="_blank" rel="noreferrer">
                        <Icon name="download" /> PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>
          KRA — {profile.kra.cycleName ?? "no open cycle"}
          {profile.kra.category && <Badge value={profile.kra.category} />}
        </h2>
        {profile.kra.score !== null && (
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <div className="stat"><div className="value">{profile.kra.score.toFixed(2)} / 5</div><div className="label">Weighted score</div></div>
            <div className="stat"><div className="value">{profile.kra.weightRatedPct}%</div><div className="label">Of cycle weight rated</div></div>
          </div>
        )}
        {profile.kra.goals.length === 0 ? (
          <p className="empty">No goals set this cycle.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Goal</th><th>Weight</th><th>Self</th><th>Manager</th><th>Final</th></tr></thead>
              <tbody>
                {profile.kra.goals.map((g) => (
                  <tr key={g.id}>
                    <td>{g.title}</td>
                    <td>{g.weightPct}%</td>
                    <td>{g.rating?.selfRating ?? "—"}</td>
                    <td>{g.rating?.managerRating ?? "—"}</td>
                    <td>{g.rating?.finalRating ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Leave</h2>
        {profile.leave.balances.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: 12 }}>
            <table>
              <thead><tr><th>Leave type</th><th>Allocated</th><th>Used</th><th>Remaining</th></tr></thead>
              <tbody>
                {profile.leave.balances.map((b) => (
                  <tr key={b.leaveType}>
                    <td>{b.leaveType}</td>
                    <td>{b.allocated}</td>
                    <td>{b.used}</td>
                    <td>{b.allocated - b.used}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {profile.leave.recent.length === 0 ? (
          <p className="empty">No leave requests yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>From</th><th>To</th><th>Days</th><th>Status</th></tr></thead>
              <tbody>
                {profile.leave.recent.map((r) => (
                  <tr key={r.id}>
                    <td>{r.startDate}</td>
                    <td>{r.endDate}</td>
                    <td>{r.days}</td>
                    <td><Badge value={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Assets</h2>
        {profile.assets.length === 0 ? (
          <p className="empty">No assets currently assigned.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Code</th><th>Name</th><th>Category</th></tr></thead>
              <tbody>
                {profile.assets.map((a) => (
                  <tr key={a.id}><td>{a.assetCode}</td><td>{a.name}</td><td>{a.category ?? "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
