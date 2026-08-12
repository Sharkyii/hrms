import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { api, ApiError } from "../api";
import { Badge } from "../components/Badge";
import { Spinner } from "../components/Spinner";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";

interface LeaveType {
  id: number;
  name: string;
  isPaid: boolean;
}
interface LeaveRequest {
  id: number;
  employeeId: number;
  leaveTypeId: number;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: string;
}

export function Leave() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ leaveTypeId: "", startDate: "", endDate: "", reason: "" });

  async function load() {
    setTypes(await api.get<LeaveType[]>("/leave/types"));
    setRequests(await api.get<LeaveRequest[]>("/leave/requests"));
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function apply() {
    setError(null);
    if (!form.leaveTypeId || !form.startDate || !form.endDate) {
      setError("Leave type, start date, and end date are required");
      return;
    }
    try {
      await api.post("/leave/requests", { ...form, leaveTypeId: Number(form.leaveTypeId) });
      setForm({ leaveTypeId: "", startDate: "", endDate: "", reason: "" });
      toast.success("Leave request submitted.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to apply for leave");
    }
  }

  async function decide(id: number, decision: "approved" | "rejected") {
    if (decision === "rejected") {
      const ok = await confirm({ title: "Reject leave request", message: "The employee will be notified their leave was not approved.", confirmLabel: "Reject" });
      if (!ok) return;
    }
    await api.put(`/leave/requests/${id}/decision`, { decision });
    toast.success(decision === "approved" ? "Leave approved." : "Leave rejected.");
    await load();
  }

  const typeName = (id: number) => types.find((t) => t.id === id)?.name ?? id;

  if (loading) return <div><h1>Leave</h1><Spinner /></div>;

  return (
    <div>
      <div className="page-header"><h1>Leave</h1></div>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>Apply for leave</h2>
        <div className="form-row">
          <div className="field">
            <label>Leave type</label>
            <select value={form.leaveTypeId} onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })}>
              <option value="">Select...</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Start date</label>
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div className="field">
            <label>End date</label>
            <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label>Reason</label>
          <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
        <button className="btn" onClick={apply}>Apply</button>
      </div>

      <div className="card">
        <h2>Requests</h2>
        {requests.length === 0 ? (
          <p className="empty">No leave requests.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Status</th>{can("leave.approve_team") && <th></th>}</tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>{typeName(r.leaveTypeId)}</td>
                  <td>{r.startDate}</td>
                  <td>{r.endDate}</td>
                  <td>{r.days}</td>
                  <td><Badge value={r.status} /></td>
                  {can("leave.approve_team") && (
                    <td>
                      {r.status === "pending" && (
                        <>
                          <button className="btn" onClick={() => decide(r.id, "approved")}>Approve</button>{" "}
                          <button className="btn danger" onClick={() => decide(r.id, "rejected")}>Reject</button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
