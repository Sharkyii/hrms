import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { api } from "../api";
import { Badge } from "../components/Badge";
import { useToast } from "../components/Toast";
import { initials } from "../initials";
import type { Employee } from "../auth";

interface Query { id: number; employeeId: number; category: string; subject: string; description: string | null; status: string }

export function Queries() {
  const { can } = useAuth();
  const toast = useToast();
  const [queries, setQueries] = useState<Query[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState({ category: "", subject: "", description: "" });

  const canManage = can("queries.manage");
  const empName = (id: number) => employees.find((e) => e.id === id)?.fullName ?? `#${id}`;

  async function load() {
    setQueries(await api.get<Query[]>("/queries"));
    if (canManage) setEmployees(await api.get<Employee[]>("/employees"));
  }
  useEffect(() => {
    load();
  }, []);

  async function raise() {
    await api.post("/queries", form);
    setForm({ category: "", subject: "", description: "" });
    toast.success("Query submitted.");
    await load();
  }

  async function setStatus(id: number, status: string) {
    await api.put(`/queries/${id}`, { status });
    toast.success("Status updated.");
    await load();
  }

  return (
    <div>
      <div className="page-header"><h1>Queries</h1></div>

      <div className="card">
        <h2>Raise a query</h2>
        <div className="form-row">
          <div className="field"><label>Category</label><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          <div className="field"><label>Subject</label><input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
        </div>
        <div className="field"><label>Description</label><textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <button className="btn" onClick={raise}>Submit</button>
      </div>

      <div className="card">
        <h2>{can("queries.manage") ? "All queries" : "My queries"}</h2>
        {queries.length === 0 ? (
          <p className="empty">No queries yet.</p>
        ) : (
          <div className="list">
            {queries.map((q) => (
              <div className="list-row" key={q.id}>
                {canManage && <div className="avatar-chip">{initials(empName(q.employeeId))}</div>}
                <div className="main">
                  <div className="title">{q.subject}</div>
                  <div className="subtitle">{canManage ? `${empName(q.employeeId)} · ` : ""}{q.category}{q.description ? ` · ${q.description}` : ""}</div>
                </div>
                <div className="meta">
                  {canManage ? (
                    <select value={q.status} style={{ width: "auto" }} onChange={(e) => setStatus(q.id, e.target.value)}>
                      {["open", "in_progress", "resolved", "closed"].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <Badge value={q.status} />
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
