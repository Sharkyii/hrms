import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { Badge } from "../components/Badge";
import { Spinner } from "../components/Spinner";
import { Icon } from "../components/Icon";
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
interface Profile {
  employee: Employee;
  managerName: string | null;
  isSelf: boolean;
  attendance: {
    thisMonthSummary: { presentDays: number; halfDays: number; paidLeaveDays: number; lopDays: number; holidayDays: number; payableDays: number; otHours: number };
    recent: AttendanceRecord[];
  };
  payslips: PayslipSummary[] | null;
  kra: { cycleName: string | null; goals: KraGoal[] };
  leave: { balances: Array<{ leaveType: string; allocated: number; used: number }>; recent: LeaveRequest[] };
  assets: Asset[];
  workLog: WorkLogEntry[];
}

export function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [logTasks, setLogTasks] = useState("");
  const [savingLog, setSavingLog] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    return api
      .get<Profile>(`/employees/${id}/profile`)
      .then(setProfile)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  if (loading) return <div><div className="page-header"><h1>Employee</h1></div><Spinner /></div>;
  if (error) return <div><div className="page-header"><h1>Employee</h1></div><div className="error-banner">{error}</div></div>;
  if (!profile) return null;

  const e = profile.employee;
  const s = profile.attendance.thisMonthSummary;

  return (
    <div>
      <div className="page-header">
        <button className="btn secondary" onClick={() => navigate(-1)}><Icon name="close" /> Back</button>
      </div>

      <div className="card">
        <h2>{e.fullName} <span className="muted">— {e.employeeCode}</span></h2>
        <div className="form-row">
          <div><label>Department</label><div>{e.department ?? "—"}</div></div>
          <div><label>Designation</label><div>{e.designation ?? "—"}</div></div>
          <div><label>Type</label><div>{e.employeeType.replace(/_/g, " ")}</div></div>
          <div><label>Reports to</label><div>{profile.managerName ?? "—"}</div></div>
          <div><label>Joined</label><div>{e.dateOfJoining}</div></div>
          <div><label>Status</label><div><Badge value={e.status} /></div></div>
        </div>
      </div>

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
        <h2>KRA — {profile.kra.cycleName ?? "no open cycle"}</h2>
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
