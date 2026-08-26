import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { api } from "../api";
import { Badge } from "../components/Badge";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { initials } from "../initials";
import { Icon } from "../components/Icon";
import type { Employee } from "../auth";

interface ExitRequest { id: number; employeeId: number; resignationDate: string; lastWorkingDay: string; status: string }
interface ExitLetter { id: number; docType: string; fileName: string; downloadUrl: string }
interface SettlementResponse { settlement: { id: number }; letters: ExitLetter[] }

export function Exit() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [requests, setRequests] = useState<ExitRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState({ resignationDate: "", lastWorkingDay: "", reason: "" });
  const [settlement, setSettlement] = useState<Record<number, { dues: string; deductions: string }>>({});
  const [letters, setLetters] = useState<Record<number, ExitLetter[]>>({});

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
    const s = settlement[id] ?? { dues: "", deductions: "" };
    const dues = s.dues.trim() === "" ? undefined : Number(s.dues);
    const deductions = s.deductions.trim() === "" ? 0 : Number(s.deductions);
    if ((dues !== undefined && !Number.isFinite(dues)) || !Number.isFinite(deductions)) {
      toast.error("Enter valid settlement amounts.");
      return;
    }
    const ok = await confirm({
      title: "Settle and mark exited",
      message: dues === undefined
        ? `The latest payslip's net pay will be used as dues, less ${deductions.toFixed(2)} in deductions. This marks the employee as exited. This cannot be undone.`
        : `Net settlement will be ${(dues - deductions).toFixed(2)}. This marks the employee as exited. This cannot be undone.`,
      confirmLabel: "Settle",
    });
    if (!ok) return;
    const result = await api.post<SettlementResponse>(`/exit/requests/${id}/settlement`, { ...(dues === undefined ? {} : { dues }), deductions });
    setLetters((current) => ({ ...current, [id]: result.letters }));
    toast.success("Settlement processed and exit letters created.");
    await load();
  }

  async function loadLetters(id: number) {
    try {
      const requestLetters = await api.get<ExitLetter[]>(`/exit/requests/${id}/letters`);
      setLetters((current) => ({ ...current, [id]: requestLetters }));
    } catch {
      toast.error("Unable to load exit letters.");
    }
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
          <div className="list">
            {requests.map((r) => (
              <div className="list-row" key={r.id}>
                {canManage && <div className="avatar-chip">{initials(empName(r.employeeId))}</div>}
                <div className="main">
                  <div className="title">{canManage ? empName(r.employeeId) : `Filed ${r.resignationDate}`}</div>
                  <div className="subtitle">Resigned {r.resignationDate} · Last day {r.lastWorkingDay}</div>
                </div>
                <div className="meta">
                  <Badge value={r.status} />
                  {can("exit.manage") && (
                    <div className="actions">
                      {r.status === "pending" && <button className="btn secondary" onClick={() => startClearance(r.id)}>Start clearance</button>}
                      {r.status === "in_clearance" && (
                        <>
                          <input type="number" min="0" step="0.01" placeholder="Dues (latest payslip)" style={{ width: 145 }} value={settlement[r.id]?.dues ?? ""}
                            onChange={(e) => setSettlement({ ...settlement, [r.id]: { ...(settlement[r.id] ?? { dues: "", deductions: "" }), dues: e.target.value } })} />
                          <input type="number" min="0" step="0.01" placeholder="Deductions" style={{ width: 90 }} value={settlement[r.id]?.deductions ?? ""}
                            onChange={(e) => setSettlement({ ...settlement, [r.id]: { ...(settlement[r.id] ?? { dues: "", deductions: "" }), deductions: e.target.value } })} />
                          <button className="btn" onClick={() => settle(r.id)}>Settle</button>
                        </>
                      )}
                    </div>
                  )}
                  {r.status === "settled" && (
                    <div className="actions">
                      {letters[r.id]?.length ? letters[r.id].map((letter) => (
                        <a className="btn secondary" key={letter.id} href={letter.downloadUrl} target="_blank" rel="noreferrer"><Icon name="download" /> {letter.docType === "relieving_letter" ? "Relieving Letter" : "Experience Certificate"}</a>
                      )) : <button className="btn secondary" onClick={() => loadLetters(r.id)}><Icon name="download" /> Download Letters</button>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
