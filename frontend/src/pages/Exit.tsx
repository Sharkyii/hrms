import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { api } from "../api";
import { Badge } from "../components/Badge";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import type { Employee } from "../auth";

interface ExitRequest { id: number; employeeId: number; resignationDate: string; lastWorkingDay: string; status: string }

export function Exit() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [requests, setRequests] = useState<ExitRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState({ resignationDate: "", lastWorkingDay: "", reason: "" });
  const [settlement, setSettlement] = useState<Record<number, { dues: string; deductions: string }>>({});

  const canManage = can("exit.manage");
  const empName = (id: number) => employees.find((e) => e.id === id)?.fullName ?? `#${id}`;

  async function load() {
    setRequests(await api.get<ExitRequest[]>("/exit/requests"));
    if (canManage) setEmployees(await api.get<Employee[]>("/employees"));
  }
  useEffect(() => {
    load();
  }, []);

  async function submit() {
    await api.post("/exit/requests", form);
    setForm({ resignationDate: "", lastWorkingDay: "", reason: "" });
    toast.success("Resignation filed.");
    await load();
  }

  async function startClearance(id: number) {
    await api.post(`/exit/requests/${id}/clearances`, { department: "IT" });
    await api.post(`/exit/requests/${id}/clearances`, { department: "Finance" });
    await api.post(`/exit/requests/${id}/clearances`, { department: "HR" });
    toast.success("Clearance started.");
    await load();
  }

  async function settle(id: number) {
    const s = settlement[id] ?? { dues: "0", deductions: "0" };
    const ok = await confirm({
      title: "Settle and mark exited",
      message: `Net settlement will be ${(Number(s.dues) - Number(s.deductions)).toFixed(2)}. This marks the employee as exited. This cannot be undone.`,
      confirmLabel: "Settle",
    });
    if (!ok) return;
    await api.post(`/exit/requests/${id}/settlement`, { dues: Number(s.dues), deductions: Number(s.deductions) });
    toast.success("Settlement processed.");
    await load();
  }

  return (
    <div>
      <div className="page-header"><h1>Exit</h1></div>

      <div className="card">
        <h2>File resignation</h2>
        <div className="form-row">
          <div className="field"><label>Resignation date</label><input type="date" value={form.resignationDate} onChange={(e) => setForm({ ...form, resignationDate: e.target.value })} /></div>
          <div className="field"><label>Last working day</label><input type="date" value={form.lastWorkingDay} onChange={(e) => setForm({ ...form, lastWorkingDay: e.target.value })} /></div>
        </div>
        <div className="field"><label>Reason</label><input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
        <button className="btn" onClick={submit}>Submit</button>
      </div>

      <div className="card">
        <h2>{can("exit.manage") ? "All exit requests" : "My exit requests"}</h2>
        {requests.length === 0 ? (
          <p className="empty">No exit requests.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Employee</th><th>Resignation</th><th>Last day</th><th>Status</th>{can("exit.manage") && <th></th>}</tr></thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td>{canManage ? empName(r.employeeId) : r.employeeId}</td>
                    <td>{r.resignationDate}</td>
                    <td>{r.lastWorkingDay}</td>
                    <td><Badge value={r.status} /></td>
                    {can("exit.manage") && (
                      <td>
                        {r.status === "pending" && <button className="btn secondary" onClick={() => startClearance(r.id)}>Start clearance</button>}
                        {r.status === "in_clearance" && (
                          <span>
                            <input placeholder="Dues" style={{ width: 70, display: "inline-block", marginRight: 4 }}
                              onChange={(e) => setSettlement({ ...settlement, [r.id]: { ...(settlement[r.id] ?? { dues: "0", deductions: "0" }), dues: e.target.value } })} />
                            <input placeholder="Deductions" style={{ width: 80, display: "inline-block", marginRight: 4 }}
                              onChange={(e) => setSettlement({ ...settlement, [r.id]: { ...(settlement[r.id] ?? { dues: "0", deductions: "0" }), deductions: e.target.value } })} />
                            <button className="btn" onClick={() => settle(r.id)}>Settle</button>
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
