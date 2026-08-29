import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { api, ApiError } from "../api";
import { Badge } from "../components/Badge";
import { Spinner } from "../components/Spinner";
import { BarRows, ColumnChart } from "../components/Charts";
import { useToast } from "../components/Toast";
import { queuePunch, flushQueuedPunches } from "../offlineQueue";

interface AttendanceRecord {
  id: number;
  date: string;
  punchInAt: string | null;
  punchOutAt: string | null;
  confidence: string;
  status: string;
  flagReason: string | null;
}

interface PerformanceSummary {
  cycleName: string | null;
  goalCoveragePct: number;
  employeesWithGoals: number;
  avgFinalRating: number | null;
  membersWithoutGoals: number[];
  membersWithoutGoalNames?: string[];
}

interface ExecutiveOverview {
  employees: { total: number; active: number; exited: number; byType: Record<string, number> };
  approvals: { pendingLeaveRequests: number; pendingAttendanceExceptions: number; pendingCorrectionRequests: number; pendingExits: number };
  attendanceHealth: { total: number; autoApproved: number; approved: number; pendingManager: number; rejected: number };
  performance: PerformanceSummary;
  payroll: { trend: Array<{ month: number; year: number; status: string; totalNetPay: number; totalGross: number }>; employeesMissingBankDetails: number; employeesMissingPayrollDetails: number };
}

interface TeamOverview {
  team: { count: number; active: number; presentToday: number };
  approvals: { pendingLeaveRequests: number; pendingAttendanceExceptions: number };
  performance: PerformanceSummary;
  payroll: { month: number; year: number; status: string; teamNetPayTotal: number } | null;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ExecutiveOverviewSection({ data }: { data: ExecutiveOverview }) {
  const totalApprovals = data.approvals.pendingLeaveRequests + data.approvals.pendingAttendanceExceptions + data.approvals.pendingCorrectionRequests;
  return (
    <>
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat accent">
          <div className="value">{data.employees.active}</div>
          <div className="label">Active employees</div>
        </div>
        <div className={`stat ${totalApprovals > 0 ? "warn" : ""}`}>
          <div className="value">{totalApprovals}</div>
          <div className="label">Pending approvals</div>
        </div>
        <div className="stat">
          <div className="value">{data.performance.goalCoveragePct}%</div>
          <div className="label">Goal coverage</div>
        </div>
        <div className="stat">
          <div className="value">{data.performance.avgFinalRating ?? "—"}</div>
          <div className="label">Avg. performance rating</div>
        </div>
        <div className={`stat ${data.approvals.pendingExits > 0 ? "warn" : ""}`}>
          <div className="value">{data.approvals.pendingExits}</div>
          <div className="label">Exits in progress</div>
        </div>
      </div>

      <div className="attention-band">
        <div className={`attention-item ${data.approvals.pendingAttendanceExceptions > 0 ? "has-count" : ""}`}>
          <div className="count">{data.approvals.pendingAttendanceExceptions}</div>
          <div className="desc">Attendance exceptions awaiting review</div>
        </div>
        <div className={`attention-item ${data.approvals.pendingLeaveRequests > 0 ? "has-count" : ""}`}>
          <div className="count">{data.approvals.pendingLeaveRequests}</div>
          <div className="desc">Leave requests pending</div>
        </div>
        <div className={`attention-item ${data.approvals.pendingCorrectionRequests > 0 ? "has-count" : ""}`}>
          <div className="count">{data.approvals.pendingCorrectionRequests}</div>
          <div className="desc">Correction requests open</div>
        </div>
        <div className={`attention-item ${data.approvals.pendingExits > 0 ? "has-count" : ""}`}>
          <div className="count">{data.approvals.pendingExits}</div>
          <div className="desc">Exits in progress</div>
        </div>
      </div>

      <div className="card">
        <h2>Attendance health — this month</h2>
        <p className="muted" style={{ marginTop: -8, fontSize: 13 }}>How much attendance is genuinely auto-approved vs held for manual review.</p>
        {data.attendanceHealth.total === 0 ? (
          <p className="empty">No attendance recorded yet this month.</p>
        ) : (
          <BarRows
            items={[
              { label: "Auto-approved (high confidence)", value: data.attendanceHealth.autoApproved },
              { label: "Approved after review", value: data.attendanceHealth.approved },
              { label: "Held for manager review", value: data.attendanceHealth.pendingManager },
              { label: "Rejected", value: data.attendanceHealth.rejected },
            ].map((i) => ({ ...i, displayValue: `${i.value} (${Math.round((i.value / data.attendanceHealth.total) * 100)}%)` }))}
          />
        )}
      </div>

      <div className="card">
        <h2>Performance — {data.performance.cycleName ?? "no open cycle"}</h2>
        {data.performance.membersWithoutGoals.length > 0 && (
          <p className="muted" style={{ fontSize: 13 }}>{data.performance.membersWithoutGoals.length} active employee(s) have no goals set this cycle.</p>
        )}
      </div>

      <div className="card">
        <h2>Payroll cost trend</h2>
        {data.payroll.trend.length === 0 ? (
          <p className="empty">No payroll runs yet.</p>
        ) : (
          <ColumnChart
            items={data.payroll.trend.map((t) => ({ label: `${MONTH_ABBR[t.month - 1]} ${String(t.year).slice(2)}`, value: t.totalNetPay }))}
            formatValue={(v) => v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          />
        )}
        {(data.payroll.employeesMissingBankDetails > 0 || data.payroll.employeesMissingPayrollDetails > 0) && (
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            {data.payroll.employeesMissingBankDetails} employee(s) missing bank details · {data.payroll.employeesMissingPayrollDetails} missing payslip identifiers (PAN/UAN etc.)
          </p>
        )}
      </div>
    </>
  );
}

function ManagerOverviewSection({ data }: { data: TeamOverview }) {
  return (
    <>
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat accent">
          <div className="value">{data.team.presentToday}/{data.team.active}</div>
          <div className="label">Present today</div>
        </div>
        <div className={`stat ${data.approvals.pendingAttendanceExceptions > 0 ? "warn" : ""}`}>
          <div className="value">{data.approvals.pendingAttendanceExceptions}</div>
          <div className="label">Attendance exceptions</div>
        </div>
        <div className={`stat ${data.approvals.pendingLeaveRequests > 0 ? "warn" : ""}`}>
          <div className="value">{data.approvals.pendingLeaveRequests}</div>
          <div className="label">Pending leave</div>
        </div>
        <div className="stat">
          <div className="value">{data.performance.goalCoveragePct}%</div>
          <div className="label">Goal coverage</div>
        </div>
        <div className="stat">
          <div className="value">{data.performance.avgFinalRating ?? "—"}</div>
          <div className="label">Avg. team rating</div>
        </div>
      </div>

      {(data.performance.membersWithoutGoalNames?.length ?? 0) > 0 && (
        <div className="card">
          <h2>No goals set this cycle — {data.performance.cycleName}</h2>
          <p>{data.performance.membersWithoutGoalNames!.join(", ")}</p>
        </div>
      )}

      {data.payroll && (
        <div className="card">
          <h2>Team payroll — {MONTH_ABBR[data.payroll.month - 1]} {data.payroll.year} — <Badge value={data.payroll.status} /></h2>
          <p>Team net pay total: <strong>{data.payroll.teamNetPayTotal.toLocaleString("en-IN")}</strong></p>
        </div>
      )}
    </>
  );
}

export function Dashboard() {
  const { can } = useAuth();
  const toast = useToast();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [executiveOverview, setExecutiveOverview] = useState<ExecutiveOverview | null>(null);
  const [teamOverview, setTeamOverview] = useState<TeamOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);

  async function loadAttendance() {
    const rows = await api.get<AttendanceRecord[]>("/attendance?self=true");
    setRecords(rows.sort((a, b) => (a.date < b.date ? 1 : -1)));
    setLoading(false);
  }

  async function sendPunch(p: { type: "in" | "out"; latitude?: number; longitude?: number }) {
    await api.post("/attendance/punch", p);
  }

  async function flush() {
    const sent = await flushQueuedPunches(sendPunch);
    if (sent > 0) {
      toast.success(`Synced ${sent} queued punch(es).`);
      setQueuedCount(0);
      await loadAttendance();
    }
  }

  useEffect(() => {
    loadAttendance();
    if (can("analytics.view_all")) {
      api.get<ExecutiveOverview>("/analytics/overview").then(setExecutiveOverview).catch(() => {});
    } else if (can("attendance.view_team")) {
      api.get<TeamOverview>("/analytics/team-overview").then(setTeamOverview).catch(() => {});
    }
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);

  async function punch(type: "in" | "out") {
    setError(null);
    setBusy(true);
    try {
      let latitude: number | undefined;
      let longitude: number | undefined;
      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 }),
          );
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;
        } catch {
          // location denied/unavailable — punch proceeds as a plain web punch
        }
      }
      try {
        await sendPunch({ type, latitude, longitude });
        await loadAttendance();
        toast.success(type === "in" ? "Punched in." : "Punched out.");
      } catch (err) {
        if (err instanceof ApiError) throw err; // a real server-side rejection — don't queue it
        await queuePunch({ type, latitude, longitude });
        setQueuedCount((n) => n + 1);
        toast.error("No connection — punch queued and will sync automatically when you're back online.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Punch failed");
    } finally {
      setBusy(false);
    }
  }

  const today = records[0];

  return (
    <div>
      <div className="page-header"><h1>Dashboard</h1></div>
      {error && <div className="error-banner">{error}</div>}
      {queuedCount > 0 && <p className="muted">{queuedCount} punch(es) queued offline, waiting to sync.</p>}

      <div className="card">
        <h2>My attendance today</h2>
        <div className="punch-card">
          <div className="punch-times">
            <div>
              <div className="t-label">In</div>
              <div className="t-value">{today?.punchInAt ? new Date(today.punchInAt).toLocaleTimeString() : "—"}</div>
            </div>
            <div>
              <div className="t-label">Out</div>
              <div className="t-value">{today?.punchOutAt ? new Date(today.punchOutAt).toLocaleTimeString() : "—"}</div>
            </div>
            {today && (
              <div>
                <div className="t-label">Status</div>
                <div style={{ marginTop: 2 }}>
                  <Badge value={today.confidence} /> <Badge value={today.status} />
                </div>
              </div>
            )}
          </div>
          <div className="punch-actions">
            <button className="btn" disabled={busy} onClick={() => punch("in")}>
              Punch In
            </button>
            <button className="btn secondary" disabled={busy} onClick={() => punch("out")}>
              Punch Out
            </button>
          </div>
        </div>
        {today?.flagReason && <p className="muted" style={{ fontSize: 13, marginTop: 10, marginBottom: 0 }}>{today.flagReason}</p>}
      </div>

      {executiveOverview && <ExecutiveOverviewSection data={executiveOverview} />}
      {!executiveOverview && teamOverview && <ManagerOverviewSection data={teamOverview} />}

      <div className="card">
        <h2>Recent attendance</h2>
        {loading ? (
          <Spinner />
        ) : records.length === 0 ? (
          <p className="empty">No attendance yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>In</th>
                <th>Out</th>
                <th>Confidence</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {records.slice(0, 10).map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.punchInAt ? new Date(r.punchInAt).toLocaleTimeString() : "—"}</td>
                  <td>{r.punchOutAt ? new Date(r.punchOutAt).toLocaleTimeString() : "—"}</td>
                  <td><Badge value={r.confidence} /></td>
                  <td><Badge value={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
