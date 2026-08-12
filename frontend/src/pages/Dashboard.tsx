import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { api, ApiError } from "../api";
import { Badge } from "../components/Badge";
import { Spinner } from "../components/Spinner";
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

interface Overview {
  employees: { total: number; active: number; exited: number; byType: Record<string, number> };
  pendingLeaveRequests: number;
  pendingAttendanceExceptions: number;
  openJobPostings: number;
  pendingExits: number;
}

export function Dashboard() {
  const { can } = useAuth();
  const toast = useToast();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);

  async function loadAttendance() {
    const rows = await api.get<AttendanceRecord[]>("/attendance");
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
    if (can("analytics.view_all")) api.get<Overview>("/analytics/overview").then(setOverview).catch(() => {});
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

      {overview && (
        <div className="stat-grid" style={{ marginBottom: 20 }}>
          <div className="stat">
            <div className="value">{overview.employees.active}</div>
            <div className="label">Active employees</div>
          </div>
          <div className="stat">
            <div className="value">{overview.pendingAttendanceExceptions}</div>
            <div className="label">Attendance exceptions</div>
          </div>
          <div className="stat">
            <div className="value">{overview.pendingLeaveRequests}</div>
            <div className="label">Pending leave requests</div>
          </div>
          <div className="stat">
            <div className="value">{overview.openJobPostings}</div>
            <div className="label">Open job postings</div>
          </div>
          <div className="stat">
            <div className="value">{overview.pendingExits}</div>
            <div className="label">Exits in progress</div>
          </div>
        </div>
      )}

      <div className="card">
        <h2>My attendance today</h2>
        <p>
          In: <strong>{today?.punchInAt ? new Date(today.punchInAt).toLocaleTimeString() : "—"}</strong> &nbsp; Out:{" "}
          <strong>{today?.punchOutAt ? new Date(today.punchOutAt).toLocaleTimeString() : "—"}</strong>
        </p>
        {today && (
          <p>
            <Badge value={today.confidence} /> <Badge value={today.status} />
            {today.flagReason && <span className="muted"> — {today.flagReason}</span>}
          </p>
        )}
        <button className="btn" disabled={busy} onClick={() => punch("in")}>
          Punch In
        </button>{" "}
        <button className="btn secondary" disabled={busy} onClick={() => punch("out")}>
          Punch Out
        </button>
      </div>

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
