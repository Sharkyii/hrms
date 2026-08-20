import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge } from "../components/Badge";
import { Spinner } from "../components/Spinner";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { initials } from "../initials";
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
                <div className="list">
                  {records.map((r) => (
                    <div className="list-row" key={r.id}>
                      <div className="avatar-chip">{initials(empName(r.employeeId))}</div>
                      <div className="main">
                        <div className="title">{empName(r.employeeId)}</div>
                        <div className="subtitle">
                          {r.date} · In {r.punchInAt ? new Date(r.punchInAt).toLocaleTimeString() : "—"} · Out {r.punchOutAt ? new Date(r.punchOutAt).toLocaleTimeString() : "—"}
                          {r.flagReason ? ` · ${r.flagReason}` : ""}
                        </div>
                      </div>
                      <div className="meta">
                        <Badge value={r.confidence} />
                        <div className="actions">
                          <button className="btn" onClick={() => decideAttendance(r.id, "approve")}>Approve</button>
                          <button className="btn danger" onClick={() => decideAttendance(r.id, "reject")}>Reject</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "corrections" && (
            <div className="card">
              {corrections.length === 0 ? (
                <p className="empty">No correction requests pending.</p>
              ) : (
                <div className="list">
                  {corrections.map((r) => (
                    <div className="list-row" key={r.id}>
                      <div className="avatar-chip">{initials(r.employeeName)}</div>
                      <div className="main">
                        <div className="title">{r.employeeName} <span className="muted" style={{ fontWeight: 400 }}>— {r.date}</span></div>
                        <div className="subtitle">
                          {r.fieldChanged}: {r.oldValue ?? "—"} → {r.newValue}
                          {r.reason ? ` · "${r.reason}"` : ""}
                        </div>
                      </div>
                      <div className="actions">
                        <button className="btn" onClick={() => decideCorrection(r.id, "approved")}>Approve</button>
                        <button className="btn danger" onClick={() => decideCorrection(r.id, "rejected")}>Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
