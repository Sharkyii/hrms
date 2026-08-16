import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { api, ApiError } from "../api";
import { Badge } from "../components/Badge";
import { Spinner } from "../components/Spinner";
import { Icon } from "../components/Icon";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { downloadCsv } from "../csv";
import type { Employee } from "../auth";

interface PayrollRun {
  id: number;
  month: number;
  year: number;
  status: string;
}
interface Payslip {
  id: number;
  employeeId: number;
  payrollRunId?: number; // attached client-side by openRun() so PayslipTable knows which run to PUT to
  payableDays: number;
  lopDays: number;
  grossEarnings: number;
  pfEmployee: number;
  esiEmployee: number;
  professionalTax: number;
  tds: number;
  advancesDeduction: number;
  netPay: number;
}

function PdfLink({ payslipId }: { payslipId: number }) {
  return (
    <a className="btn secondary" href={`/api/payroll/payslips/${payslipId}/pdf`} target="_blank" rel="noreferrer">
      <Icon name="download" /> PDF
    </a>
  );
}

export function Payroll() {
  const { can, employee } = useAuth();
  const isAdmin = can("payroll.process");
  const isTeamScoped = can("payroll.edit_team") || can("payroll.view_team");
  const [tab, setTab] = useState<"my" | "team" | "runs" | "structures" | "settings">("my");

  return (
    <div>
      <div className="page-header"><h1>Payroll</h1></div>
      <div className="tabs">
        <button className={tab === "my" ? "active" : ""} onClick={() => setTab("my")}>My Payslips</button>
        {isTeamScoped && <button className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}>Team Payroll</button>}
        {isAdmin && <button className={tab === "runs" ? "active" : ""} onClick={() => setTab("runs")}>Runs</button>}
        {isAdmin && <button className={tab === "structures" ? "active" : ""} onClick={() => setTab("structures")}>Salary Structures</button>}
        {isAdmin && <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>Company & Statutory Settings</button>}
      </div>
      {tab === "my" && <MyPayslips employeeId={employee?.id} />}
      {tab === "team" && isTeamScoped && <TeamPayroll canEdit={can("payroll.edit_team")} />}
      {tab === "runs" && isAdmin && <Runs />}
      {tab === "structures" && isAdmin && <Structures />}
      {tab === "settings" && isAdmin && <Settings />}
    </div>
  );
}

function MyPayslips({ employeeId }: { employeeId?: number }) {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [payslips, setPayslips] = useState<Record<number, Payslip[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<PayrollRun[]>("/payroll/runs").then(async (rs) => {
      setRuns(rs);
      for (const r of rs) {
        const slips = await api.get<Payslip[]>(`/payroll/runs/${r.id}/payslips`);
        setPayslips((prev) => ({ ...prev, [r.id]: slips }));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const rows = runs
    .map((r) => ({ run: r, mine: (payslips[r.id] ?? []).find((p) => p.employeeId === employeeId) }))
    .filter((x) => x.mine);

  return (
    <div className="card">
      <h2>
        My payslips
        {rows.length > 0 && (
          <button
            className="btn secondary"
            onClick={() =>
              downloadCsv(
                "my-payslips.csv",
                rows.map(({ run, mine }) => ({
                  period: `${run.month}/${run.year}`,
                  payable_days: mine!.payableDays,
                  gross: mine!.grossEarnings.toFixed(2),
                  net_pay: mine!.netPay.toFixed(2),
                  status: run.status,
                })),
              )
            }
          >
            <Icon name="download" /> Export CSV
          </button>
        )}
      </h2>
      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="empty">No payslips yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Period</th><th>Payable days</th><th>Gross</th><th>Deductions</th><th>Net pay</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map(({ run, mine }) => {
                const deductions = mine!.pfEmployee + mine!.esiEmployee + mine!.professionalTax + mine!.tds + mine!.advancesDeduction;
                return (
                  <tr key={run.id}>
                    <td>{run.month}/{run.year}</td>
                    <td>{mine!.payableDays}</td>
                    <td>{mine!.grossEarnings.toFixed(2)}</td>
                    <td>{deductions.toFixed(2)}</td>
                    <td><strong>{mine!.netPay.toFixed(2)}</strong></td>
                    <td><Badge value={run.status} /></td>
                    <td><PdfLink payslipId={mine!.id} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Shared by the manager's Team Payroll tab and the HR/founder Runs admin tab. When `canEdit` is true,
// Loan and TDS become editable — the "things that change" each pay cycle — everything else here is
// computed and read-only.
function PayslipTable({
  payslips,
  employees,
  canEdit,
  locked,
  onSaved,
}: {
  payslips: Payslip[];
  employees: Employee[];
  canEdit: boolean;
  locked: boolean;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [edits, setEdits] = useState<Record<number, { loan: string; tds: string }>>({});

  const empName = (id: number) => employees.find((e) => e.id === id)?.fullName ?? id;

  async function save(payslip: Payslip) {
    if (!payslip.payrollRunId) return;
    const edit = edits[payslip.employeeId];
    const loan = edit?.loan !== undefined ? Number(edit.loan) : payslip.advancesDeduction;
    const tds = edit?.tds !== undefined ? Number(edit.tds) : payslip.tds;
    try {
      await api.put(`/payroll/runs/${payslip.payrollRunId}/manual-entries/${payslip.employeeId}`, { loan, tds });
      toast.success("Saved — net pay recalculated.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
    }
  }

  if (payslips.length === 0) return <p className="empty">No payslips for this run.</p>;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Employee</th><th>Payable days</th><th>Gross</th><th>Loan</th><th>TDS</th><th>Net pay</th><th></th>{canEdit && !locked && <th></th>}
          </tr>
        </thead>
        <tbody>
          {payslips.map((p) => (
            <tr key={p.id}>
              <td>{empName(p.employeeId)}</td>
              <td>{p.payableDays}</td>
              <td>{p.grossEarnings.toFixed(2)}</td>
              <td>
                {canEdit && !locked ? (
                  <input
                    style={{ width: 90 }}
                    type="number"
                    defaultValue={p.advancesDeduction}
                    onChange={(e) => setEdits({ ...edits, [p.employeeId]: { loan: e.target.value, tds: edits[p.employeeId]?.tds ?? String(p.tds) } })}
                  />
                ) : (
                  p.advancesDeduction.toFixed(2)
                )}
              </td>
              <td>
                {canEdit && !locked ? (
                  <input
                    style={{ width: 90 }}
                    type="number"
                    defaultValue={p.tds}
                    onChange={(e) => setEdits({ ...edits, [p.employeeId]: { tds: e.target.value, loan: edits[p.employeeId]?.loan ?? String(p.advancesDeduction) } })}
                  />
                ) : (
                  p.tds.toFixed(2)
                )}
              </td>
              <td><strong>{p.netPay.toFixed(2)}</strong></td>
              <td><PdfLink payslipId={p.id} /></td>
              {canEdit && !locked && <td><button className="btn secondary" onClick={() => save(p)}>Save</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamPayroll({ canEdit }: { canEdit: boolean }) {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<PayrollRun[]>("/payroll/runs").then(setRuns);
    api.get<Employee[]>("/employees").then(setEmployees);
  }, []);

  async function openRun(id: number) {
    setSelected(id);
    setLoading(true);
    const rows = await api.get<Payslip[]>(`/payroll/runs/${id}/payslips`);
    setPayslips(rows.map((p) => ({ ...p, payrollRunId: id })));
    setLoading(false);
  }

  const currentRun = runs.find((r) => r.id === selected);

  return (
    <div>
      <div className="card">
        <h2>Runs</h2>
        {runs.length === 0 ? (
          <p className="empty">No payroll runs yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Period</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>{r.month}/{r.year}</td>
                    <td><Badge value={r.status} /></td>
                    <td><button className="btn secondary" onClick={() => openRun(r.id)}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {currentRun && (
        <div className="card">
          <h2>My team — {currentRun.month}/{currentRun.year} — <Badge value={currentRun.status} /></h2>
          {loading ? <Spinner /> : (
            <PayslipTable
              payslips={payslips}
              employees={employees}
              canEdit={canEdit}
              locked={currentRun.status === "locked"}
              onSaved={() => openRun(currentRun.id)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Runs() {
  const toast = useToast();
  const confirm = useConfirm();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selected, setSelected] = useState<number | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bankFileContent, setBankFileContent] = useState<string | null>(null);

  async function load() {
    setRuns(await api.get<PayrollRun[]>("/payroll/runs"));
  }
  useEffect(() => {
    load();
    api.get<Employee[]>("/employees").then(setEmployees);
  }, []);

  async function createRun() {
    const run = await api.post<PayrollRun>("/payroll/runs", { month, year });
    await load();
    setSelected(run.id);
    toast.success(`Run ${month}/${year} ready.`);
  }

  async function openRun(id: number) {
    setSelected(id);
    setBankFileContent(null);
    try {
      const rows = await api.get<Payslip[]>(`/payroll/runs/${id}/payslips`);
      setPayslips(rows.map((p) => ({ ...p, payrollRunId: id })));
    } catch {
      setPayslips([]);
    }
  }

  async function previewRun() {
    if (!selected) return;
    setError(null);
    setBusy(true);
    try {
      await api.post(`/payroll/runs/${selected}/preview`, {});
      await load();
      await openRun(selected);
      toast.success("Payroll recomputed.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function lockRun() {
    if (!selected) return;
    const ok = await confirm({
      title: "Lock payroll run",
      message: "Once locked, this month can't be edited — any later correction becomes an arrear on a future run. This cannot be undone.",
      confirmLabel: "Lock run",
    });
    if (!ok) return;
    setError(null);
    setBusy(true);
    try {
      await api.put(`/payroll/runs/${selected}/lock`);
      await load();
      toast.success("Payroll run locked.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lock failed — check attendance exceptions are resolved");
    } finally {
      setBusy(false);
    }
  }

  async function generateBankFile() {
    if (!selected) return;
    const result = await api.post<{ content: string; missingBankDetails: string[] }>(`/payroll/runs/${selected}/bank-file`);
    setBankFileContent(result.content + (result.missingBankDetails.length ? `\n\n# Missing bank details: ${result.missingBankDetails.join(", ")}` : ""));
    toast.success("Bank file generated.");
  }

  const empName = (id: number) => employees.find((e) => e.id === id)?.fullName ?? id;
  const currentRun = runs.find((r) => r.id === selected);

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}
      <div className="card">
        <h2>Create run</h2>
        <div className="form-row">
          <div className="field"><label>Month</label><input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} /></div>
          <div className="field"><label>Year</label><input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></div>
        </div>
        <button className="btn" onClick={createRun}>Create / open run</button>
      </div>

      <div className="card">
        <h2>Runs</h2>
        {runs.length === 0 ? (
          <p className="empty">No payroll runs yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Period</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>{r.month}/{r.year}</td>
                    <td><Badge value={r.status} /></td>
                    <td><button className="btn secondary" onClick={() => openRun(r.id)}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && currentRun && (
        <div className="card">
          <h2>Run {currentRun.month}/{currentRun.year} — <Badge value={currentRun.status} /></h2>
          <button className="btn" disabled={currentRun.status === "locked" || busy} onClick={previewRun}>Preview / recompute</button>{" "}
          <button className="btn" disabled={currentRun.status !== "preview" || busy} onClick={lockRun}>Lock</button>{" "}
          <button className="btn secondary" disabled={currentRun.status !== "locked"} onClick={generateBankFile}>Generate bank file</button>{" "}
          {payslips.length > 0 && (
            <button
              className="btn secondary"
              onClick={() =>
                downloadCsv(
                  `payroll-${currentRun.month}-${currentRun.year}.csv`,
                  payslips.map((p) => ({
                    employee: String(empName(p.employeeId)),
                    payable_days: p.payableDays,
                    lop_days: p.lopDays,
                    gross: p.grossEarnings.toFixed(2),
                    net_pay: p.netPay.toFixed(2),
                  })),
                )
              }
            >
              <Icon name="download" /> Export CSV
            </button>
          )}

          {busy && <Spinner label="Working..." />}

          {!busy && (
            <div style={{ marginTop: 16 }}>
              <PayslipTable
                payslips={payslips}
                employees={employees}
                canEdit={true}
                locked={currentRun.status === "locked"}
                onSaved={() => openRun(currentRun.id)}
              />
            </div>
          )}

          {bankFileContent && (
            <pre style={{ background: "var(--fill-soft)", border: "1px solid var(--border-strong)", padding: 12, marginTop: 12, overflowX: "auto", fontSize: 13 }}>{bankFileContent}</pre>
          )}
        </div>
      )}
    </div>
  );
}

interface PayrollDetails {
  panNumber: string | null;
  uanNumber: string | null;
  pfAccountNumber: string | null;
  esiNumber: string | null;
  pranNumber: string | null;
  taxRegime: string | null;
  function: string | null;
  location: string | null;
}

function Structures() {
  const toast = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState({ employeeId: "", basic: "", hra: "", effectiveFrom: "" });
  const [bank, setBank] = useState({ employeeId: "", accountHolderName: "", accountNumber: "", ifsc: "", bankName: "" });
  const [detailsEmployeeId, setDetailsEmployeeId] = useState("");
  const [details, setDetails] = useState<PayrollDetails>({
    panNumber: "", uanNumber: "", pfAccountNumber: "", esiNumber: "", pranNumber: "", taxRegime: "", function: "", location: "",
  });

  useEffect(() => {
    api.get<Employee[]>("/employees").then(setEmployees);
  }, []);

  async function saveStructure() {
    await api.post("/payroll/salary-structures", {
      employeeId: Number(form.employeeId),
      basic: Number(form.basic),
      hra: Number(form.hra || 0),
      effectiveFrom: form.effectiveFrom,
    });
    toast.success("Salary structure saved.");
  }

  async function saveBank() {
    await api.put(`/payroll/bank-details/${bank.employeeId}`, bank);
    toast.success("Bank details saved.");
  }

  async function loadDetails(employeeId: string) {
    setDetailsEmployeeId(employeeId);
    if (!employeeId) return;
    const row = await api.get<PayrollDetails | null>(`/payroll/employee-payroll-details/${employeeId}`);
    setDetails(row ?? { panNumber: "", uanNumber: "", pfAccountNumber: "", esiNumber: "", pranNumber: "", taxRegime: "", function: "", location: "" });
  }

  async function saveDetails() {
    await api.put(`/payroll/employee-payroll-details/${detailsEmployeeId}`, details);
    toast.success("Payroll details saved.");
  }

  return (
    <div>
      <div className="card">
        <h2>Salary structure</h2>
        <p className="muted">Basic, HRA, and any recurring allowances — set once, applies every run. Loan and TDS are entered per run under Team Payroll / Runs since those change month to month.</p>
        <div className="form-row">
          <div className="field">
            <label>Employee</label>
            <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
              <option value="">Select...</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </select>
          </div>
          <div className="field"><label>Basic</label><input type="number" value={form.basic} onChange={(e) => setForm({ ...form, basic: e.target.value })} /></div>
          <div className="field"><label>HRA</label><input type="number" value={form.hra} onChange={(e) => setForm({ ...form, hra: e.target.value })} /></div>
          <div className="field"><label>Effective from</label><input type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} /></div>
        </div>
        <button className="btn" onClick={saveStructure}>Save structure</button>
      </div>

      <div className="card">
        <h2>Bank details</h2>
        <div className="form-row">
          <div className="field">
            <label>Employee</label>
            <select value={bank.employeeId} onChange={(e) => setBank({ ...bank, employeeId: e.target.value })}>
              <option value="">Select...</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </select>
          </div>
          <div className="field"><label>Account holder</label><input value={bank.accountHolderName} onChange={(e) => setBank({ ...bank, accountHolderName: e.target.value })} /></div>
          <div className="field"><label>Account number</label><input value={bank.accountNumber} onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })} /></div>
          <div className="field"><label>IFSC</label><input value={bank.ifsc} onChange={(e) => setBank({ ...bank, ifsc: e.target.value })} /></div>
        </div>
        <button className="btn" onClick={saveBank}>Save bank details</button>
      </div>

      <div className="card">
        <h2>Payslip identifiers (PAN / UAN / PF / ESI / PRAN)</h2>
        <p className="muted">Appear on the payslip PDF. Set once per employee.</p>
        <div className="field">
          <label>Employee</label>
          <select value={detailsEmployeeId} onChange={(e) => loadDetails(e.target.value)}>
            <option value="">Select...</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
          </select>
        </div>
        {detailsEmployeeId && (
          <>
            <div className="form-row">
              <div className="field"><label>PAN</label><input value={details.panNumber ?? ""} onChange={(e) => setDetails({ ...details, panNumber: e.target.value })} /></div>
              <div className="field"><label>UAN</label><input value={details.uanNumber ?? ""} onChange={(e) => setDetails({ ...details, uanNumber: e.target.value })} /></div>
              <div className="field"><label>Tax regime</label><input value={details.taxRegime ?? ""} onChange={(e) => setDetails({ ...details, taxRegime: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="field"><label>PF account number</label><input value={details.pfAccountNumber ?? ""} onChange={(e) => setDetails({ ...details, pfAccountNumber: e.target.value })} /></div>
              <div className="field"><label>ESI number</label><input value={details.esiNumber ?? ""} onChange={(e) => setDetails({ ...details, esiNumber: e.target.value })} /></div>
              <div className="field"><label>PRAN</label><input value={details.pranNumber ?? ""} onChange={(e) => setDetails({ ...details, pranNumber: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="field"><label>Function</label><input value={details.function ?? ""} onChange={(e) => setDetails({ ...details, function: e.target.value })} /></div>
              <div className="field"><label>Location</label><input value={details.location ?? ""} onChange={(e) => setDetails({ ...details, location: e.target.value })} /></div>
            </div>
            <button className="btn" onClick={saveDetails}>Save details</button>
          </>
        )}
      </div>
    </div>
  );
}

interface StatutorySettings {
  pfEmployeePct: number;
  pfEmployerPct: number;
  pfWageCeiling: number;
  esiEmployeePct: number;
  esiEmployerPct: number;
  esiWageCeiling: number;
  professionalTaxSlabsJson: string;
}

interface CompanySettings {
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  panNumber: string | null;
  logoBase64: string | null;
  signatoryLabel: string;
}

function Settings() {
  const toast = useToast();
  const [settings, setSettings] = useState<StatutorySettings | null>(null);
  const [company, setCompany] = useState<CompanySettings>({ name: "", addressLine1: "", addressLine2: "", panNumber: "", logoBase64: null, signatoryLabel: "Authorized Signatory" });

  useEffect(() => {
    api.get<StatutorySettings | null>("/payroll/statutory-settings").then(setSettings);
    api.get<CompanySettings | null>("/payroll/company-settings").then((c) => c && setCompany(c));
  }, []);

  async function save() {
    if (!settings) return;
    await api.put("/payroll/statutory-settings", settings);
    toast.success("Statutory settings updated (takes effect on next preview).");
  }

  async function saveCompany() {
    if (!company.name) {
      toast.error("Company name is required");
      return;
    }
    await api.put("/payroll/company-settings", company);
    toast.success("Company settings saved — used on the payslip PDF letterhead.");
  }

  function onLogoSelected(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? result;
      setCompany({ ...company, logoBase64: base64 });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <div className="card">
        <h2>Company settings</h2>
        <p className="muted">Used on the payslip PDF letterhead.</p>
        <div className="form-row">
          <div className="field"><label>Company name</label><input value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} /></div>
          <div className="field"><label>PAN</label><input value={company.panNumber ?? ""} onChange={(e) => setCompany({ ...company, panNumber: e.target.value })} /></div>
        </div>
        <div className="form-row">
          <div className="field"><label>Address line 1</label><input value={company.addressLine1 ?? ""} onChange={(e) => setCompany({ ...company, addressLine1: e.target.value })} /></div>
          <div className="field"><label>Address line 2</label><input value={company.addressLine2 ?? ""} onChange={(e) => setCompany({ ...company, addressLine2: e.target.value })} /></div>
        </div>
        <div className="form-row">
          <div className="field"><label>Signatory label</label><input value={company.signatoryLabel} onChange={(e) => setCompany({ ...company, signatoryLabel: e.target.value })} /></div>
          <div className="field"><label>Logo (PNG/JPG)</label><input type="file" accept="image/png,image/jpeg" onChange={(e) => onLogoSelected(e.target.files?.[0] ?? null)} /></div>
        </div>
        <button className="btn" onClick={saveCompany}>Save company settings</button>
      </div>

      {!settings ? <Spinner /> : (
        <div className="card">
          <h2>Statutory settings</h2>
          <p className="muted">Update these as government-mandated rates change. TDS is entered per employee per run under Team Payroll / Runs — this system doesn't calculate income-tax withholding.</p>
          <div className="form-row">
            <div className="field"><label>PF Employee %</label><input type="number" value={settings.pfEmployeePct} onChange={(e) => setSettings({ ...settings, pfEmployeePct: Number(e.target.value) })} /></div>
            <div className="field"><label>PF Employer %</label><input type="number" value={settings.pfEmployerPct} onChange={(e) => setSettings({ ...settings, pfEmployerPct: Number(e.target.value) })} /></div>
            <div className="field"><label>PF Wage Ceiling</label><input type="number" value={settings.pfWageCeiling} onChange={(e) => setSettings({ ...settings, pfWageCeiling: Number(e.target.value) })} /></div>
          </div>
          <div className="form-row">
            <div className="field"><label>ESI Employee %</label><input type="number" value={settings.esiEmployeePct} onChange={(e) => setSettings({ ...settings, esiEmployeePct: Number(e.target.value) })} /></div>
            <div className="field"><label>ESI Employer %</label><input type="number" value={settings.esiEmployerPct} onChange={(e) => setSettings({ ...settings, esiEmployerPct: Number(e.target.value) })} /></div>
            <div className="field"><label>ESI Wage Ceiling</label><input type="number" value={settings.esiWageCeiling} onChange={(e) => setSettings({ ...settings, esiWageCeiling: Number(e.target.value) })} /></div>
          </div>
          <div className="field">
            <label>Professional Tax Slabs (JSON: [&#123;"upTo": number|null, "amount": number&#125;])</label>
            <textarea rows={3} value={settings.professionalTaxSlabsJson} onChange={(e) => setSettings({ ...settings, professionalTaxSlabsJson: e.target.value })} />
          </div>
          <button className="btn" onClick={save}>Save statutory settings</button>
        </div>
      )}
    </div>
  );
}
