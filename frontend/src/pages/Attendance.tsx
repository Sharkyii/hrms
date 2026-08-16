import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { api, ApiError } from "../api";
import { Badge } from "../components/Badge";
import { Spinner } from "../components/Spinner";
import { useToast } from "../components/Toast";

interface AttendanceRecord {
  id: number;
  employeeId: number;
  date: string;
  punchInAt: string | null;
  punchOutAt: string | null;
  method: string;
  confidence: string;
  status: string;
  flagReason: string | null;
}

const CORRECTION_FIELDS = [
  { value: "punchInAt", label: "Punch in time" },
  { value: "punchOutAt", label: "Punch out time" },
];

export function Attendance() {
  const { employee, can } = useAuth();
  const toast = useToast();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [correctingId, setCorrectingId] = useState<number | null>(null);
  const [correctionForm, setCorrectionForm] = useState({ field: "punchInAt", newValue: "", reason: "" });
  const [error, setError] = useState<string | null>(null);

  const seesOthers = can("attendance.view_all") || can("attendance.view_team");

  async function load() {
    setLoading(true);
    const query = new URLSearchParams();
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    const qs = query.toString();
    const rows = await api.get<AttendanceRecord[]>(`/attendance${qs ? `?${qs}` : ""}`);
    setRecords(rows.sort((a, b) => (a.date < b.date ? 1 : -1)));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openCorrection(id: number) {
    setCorrectingId(id);
    setCorrectionForm({ field: "punchInAt", newValue: "", reason: "" });
    setError(null);
  }

  async function submitCorrection() {
    if (!correctingId) return;
    setError(null);
    if (!correctionForm.newValue || !correctionForm.reason) {
      setError("A new value and reason are required");
      return;
    }
    try {
      await api.post("/corrections", {
        attendanceId: correctingId,
        field: correctionForm.field,
        newValue: new Date(correctionForm.newValue).toISOString(),
        reason: correctionForm.reason,
      });
      toast.success("Correction requested — your manager will review it.");
      setCorrectingId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit correction request");
    }
  }

  return (
    <div>
      <div className="page-header"><h1>Attendance</h1></div>

      <div className="card">
        <h2>Filter</h2>
        <div className="form-row">
          <div className="field"><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="field"><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <button className="btn secondary" onClick={load}>Apply</button>
      </div>

      <div className="card">
        <h2>{seesOthers ? "Attendance records" : "My attendance"}</h2>
        {loading ? (
          <Spinner />
        ) : records.length === 0 ? (
          <p className="empty">No attendance records for this range.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {seesOthers && <th>Employee ID</th>}
                  <th>Date</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Method</th>
                  <th>Confidence</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    {seesOthers && <td>{r.employeeId}</td>}
                    <td>{r.date}</td>
                    <td>{r.punchInAt ? new Date(r.punchInAt).toLocaleTimeString() : "—"}</td>
                    <td>{r.punchOutAt ? new Date(r.punchOutAt).toLocaleTimeString() : "—"}</td>
                    <td>{r.method.replace(/_/g, " ")}</td>
                    <td><Badge value={r.confidence} /></td>
                    <td>
                      <Badge value={r.status} />
                      {r.flagReason && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{r.flagReason}</div>}
                    </td>
                    <td>
                      {r.employeeId === employee?.id && (
                        <button className="btn secondary" onClick={() => openCorrection(r.id)}>Request correction</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {correctingId && (
        <div className="dialog-overlay" onClick={() => setCorrectingId(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Request a correction</h2>
            {error && <div className="error-banner">{error}</div>}
            <div className="field">
              <label>Field</label>
              <select value={correctionForm.field} onChange={(e) => setCorrectionForm({ ...correctionForm, field: e.target.value })}>
                {CORRECTION_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Correct time</label>
              <input type="datetime-local" value={correctionForm.newValue} onChange={(e) => setCorrectionForm({ ...correctionForm, newValue: e.target.value })} />
            </div>
            <div className="field">
              <label>Reason</label>
              <textarea rows={3} value={correctionForm.reason} onChange={(e) => setCorrectionForm({ ...correctionForm, reason: e.target.value })} />
            </div>
            <p className="muted" style={{ fontSize: 12 }}>Corrections can only be requested within 7 days of the attendance date.</p>
            <div className="dialog-actions">
              <button className="btn secondary" onClick={() => setCorrectingId(null)}>Cancel</button>
              <button className="btn" onClick={submitCorrection}>Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
