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
  payableDays: number;
  lopDays: number;
  grossEarnings: number;
  pfEmployee: number;
  esiEmployee: number;
  professionalTax: number;
  tds: number;
  netPay: number;
}

export function Payroll() {
  const { can, employee } = useAuth();
  const isAdmin = can("payroll.process");
  const [tab, setTab] = useState<"my" | "runs" | "structures" | "settings">("my");

  return (
    <div>
      <div className="page-header"><h1>Payroll</h1></div>
      <div className="tabs">
        <button className={tab === "my" ? "active" : ""} onClick={() => setTab("my")}>My Payslips</button>
        {isAdmin && <button className={tab === "runs" ? "active" : ""} onClick={() => setTab("runs")}>Runs</button>}
        {isAdmin && <button className={tab === "structures" ? "active" : ""} onClick={() => setTab("structures")}>Salary Structures</button>}
        {isAdmin && <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>Statutory Settings</button>}
      </div>
      {tab === "my" && <MyPayslips employeeId={employee?.id} />}
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
            <thead><tr><th>Period</th><th>Payable days</th><th>Gross</th><th>Deductions</th><th>Net pay</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map(({ run, mine }) => {
                const deductions = mine!.pfEmployee + mine!.esiEmployee + mine!.professionalTax + mine!.tds;
                return (
                  <tr key={run.id}>
                    <td>{run.month}/{run.year}</td>
                    <td>{mine!.payableDays}</td>
                    <td>{mine!.grossEarnings.toFixed(2)}</td>
                    <td>{deductions.toFixed(2)}</td>
                    <td><strong>{mine!.netPay.toFixed(2)}</strong></td>
                    <td><Badge value={run.status} /></td>
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
      setPayslips(await api.get<Payslip[]>(`/payroll/runs/${id}/payslips`));
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
      setPayslips(await api.get<Payslip[]>(`/payroll/runs/${selected}/payslips`));
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

          {!busy && payslips.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table>
                <thead><tr><th>Employee</th><th>Payable days</th><th>LOP</th><th>Gross</th><th>Net pay</th></tr></thead>
                <tbody>
                  {payslips.map((p) => (
                    <tr key={p.id}>
                      <td>{empName(p.employeeId)}</td>
                      <td>{p.payableDays}</td>
                      <td>{p.lopDays}</td>
                      <td>{p.grossEarnings.toFixed(2)}</td>
                      <td><strong>{p.netPay.toFixed(2)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

function Structures() {
  const toast = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState({ employeeId: "", basic: "", hra: "", effectiveFrom: "" });
  const [bank, setBank] = useState({ employeeId: "", accountHolderName: "", accountNumber: "", ifsc: "", bankName: "" });

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

  return (
    <div>
      <div className="card">
        <h2>Salary structure</h2>
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

function Settings() {
  const toast = useToast();
  const [settings, setSettings] = useState<StatutorySettings | null>(null);

  useEffect(() => {
    api.get<StatutorySettings | null>("/payroll/statutory-settings").then(setSettings);
  }, []);

  async function save() {
    if (!settings) return;
    await api.put("/payroll/statutory-settings", settings);
    toast.success("Statutory settings updated (takes effect on next preview).");
  }

  if (!settings) return <Spinner />;

  return (
    <div className="card">
      <h2>Statutory settings</h2>
      <p className="muted">Update these as government-mandated rates change. TDS is entered manually per payslip — this system doesn't calculate income-tax withholding.</p>
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
      <button className="btn" onClick={save}>Save settings</button>
    </div>
  );
}
