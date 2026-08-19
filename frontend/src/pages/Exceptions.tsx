import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge } from "../components/Badge";
import { Spinner } from "../components/Spinner";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import type { Employee } from "../auth";

interface AttendanceRecord {
  id: number;
  employeeId: number;
  date: string;
  punchInAt: string | null;
  punchOutAt: string | null;
  confidence: string;
  status: string;
  flagReason: string | null;
}

interface CorrectionRequest {
  id: number;
  attendanceId: number;
  employeeId: number;
  employeeName: string;
  date: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string;
  reason: string;
  status: string;
}

export function Exceptions() {
  const toast = useToast();
  const confirm = useConfirm();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tab, setTab] = useState<"attendance" | "corrections">("attendance");
  const [loading, setLoading] = useState(true);

  async function load() {
    setRecords(await api.get<AttendanceRecord[]>("/attendance/exceptions"));
    setCorrections(await api.get<CorrectionRequest[]>("/corrections"));
    setEmployees(await api.get<Employee[]>("/employees"));
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  const empName = (id: number) => employees.find((e) => e.id === id)?.fullName ?? `#${id}`;

  async function decideAttendance(id: number, decision: "approve" | "reject") {
    if (decision === "reject") {
      const ok = await confirm({ title: "Reject attendance", message: "This marks the record as rejected. The employee will need to raise a correction request.", confirmLabel: "Reject" });
      if (!ok) return;
    }
    await api.put(`/attendance/${id}/${decision}`, decision === "reject" ? { reason: "Rejected via exceptions queue" } : undefined);
    toast.success(decision === "approve" ? "Attendance approved." : "Attendance rejected.");
    await load();
  }

  async function decideCorrection(id: number, decision: "approved" | "rejected") {
    if (decision === "rejected") {
      const ok = await confirm({ title: "Reject correction", message: "The requested change will not be applied.", confirmLabel: "Reject" });
      if (!ok) return;
    }
    await api.put(`/corrections/${id}/review`, { decision });
    toast.success(decision === "approved" ? "Correction approved." : "Correction rejected.");
    await load();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Exceptions</h1>
      </div>
      <div className="tabs">
        <button className={tab === "attendance" ? "active" : ""} onClick={() => setTab("attendance")}>
          Attendance ({records.length})
        </button>
        <button className={tab === "corrections" ? "active" : ""} onClick={() => setTab("corrections")}>
          Correction requests ({corrections.length})
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          {tab === "attendance" && (
            <div className="card">
              {records.length === 0 ? (
                <p className="empty">No attendance exceptions pending.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Employee</th><th>Date</th><th>In</th><th>Out</th><th>Confidence</th><th>Reason</th><th></th></tr>
                    </thead>
                    <tbody>
                      {records.map((r) => (
                        <tr key={r.id}>
                          <td>{empName(r.employeeId)}</td>
                          <td>{r.date}</td>
                          <td>{r.punchInAt ? new Date(r.punchInAt).toLocaleTimeString() : "—"}</td>
                          <td>{r.punchOutAt ? new Date(r.punchOutAt).toLocaleTimeString() : "—"}</td>
                          <td><Badge value={r.confidence} /></td>
                          <td className="muted">{r.flagReason}</td>
                          <td>
                            <button className="btn" onClick={() => decideAttendance(r.id, "approve")}>Approve</button>{" "}
                            <button className="btn danger" onClick={() => decideAttendance(r.id, "reject")}>Reject</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === "corrections" && (
            <div className="card">
              {corrections.length === 0 ? (
                <p className="empty">No correction requests pending.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Employee</th><th>Date</th><th>Field</th><th>Old</th><th>New</th><th>Reason</th><th></th></tr>
                    </thead>
                    <tbody>
                      {corrections.map((r) => (
                        <tr key={r.id}>
                          <td>{r.employeeName}</td>
                          <td>{r.date}</td>
                          <td>{r.fieldChanged}</td>
                          <td>{r.oldValue ?? "—"}</td>
                          <td>{r.newValue}</td>
                          <td className="muted">{r.reason}</td>
                          <td>
                            <button className="btn" onClick={() => decideCorrection(r.id, "approved")}>Approve</button>{" "}
                            <button className="btn danger" onClick={() => decideCorrection(r.id, "rejected")}>Reject</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
