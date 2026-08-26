import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { api, ApiError } from "../api";
import { Badge } from "../components/Badge";
import { Spinner } from "../components/Spinner";
import { Icon } from "../components/Icon";
import { useToast } from "../components/Toast";
import { initials } from "../initials";
import type { Employee } from "../auth";

const EMPLOYEE_TYPES = ["office_laptop", "office_no_laptop", "field", "wfh", "no_smartphone", "contract"];

export function Employees() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "exited" | "all">("active");
  const [form, setForm] = useState({ employeeCode: "", fullName: "", email: "", employeeType: "office_laptop", dateOfJoining: "" });

  async function load() {
    setEmployees(await api.get<Employee[]>("/employees"));
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function createEmployee() {
    setError(null);
    setSaving(true);
    try {
      await api.post("/employees", form);
      setShowCreate(false);
      setForm({ employeeCode: "", fullName: "", email: "", employeeType: "office_laptop", dateOfJoining: "" });
      toast.success("Employee added.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create employee");
    } finally {
      setSaving(false);
    }
  }

  const activeCount = employees.filter((e) => e.status === "active").length;
  const exitedCount = employees.filter((e) => e.status === "exited").length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees
      .filter((e) => statusFilter === "all" || e.status === statusFilter)
      .filter((e) => !q || `${e.employeeCode} ${e.fullName} ${e.email} ${e.department ?? ""}`.toLowerCase().includes(q));
  }, [employees, query, statusFilter]);

  return (
    <div>
      <div className="page-header">
        <h1>Employees</h1>
        {can("employee.manage") && !showCreate && (
          <div className="actions">
            <button className="btn" onClick={() => setShowCreate(true)}>New employee</button>
          </div>
        )}
      </div>
      {error && <div className="error-banner">{error}</div>}

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat"><div className="value">{employees.length}</div><div className="label">Total employees</div></div>
        <div className="stat"><div className="value">{activeCount}</div><div className="label">Currently working</div></div>
        <div className="stat"><div className="value">{exitedCount}</div><div className="label">Exited</div></div>
      </div>

      {can("employee.manage") && showCreate && (
        <div className="card">
          <h2>Add employee</h2>
          <div className="form-row">
            <div className="field">
              <label>Employee code</label>
              <input value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} />
            </div>
            <div className="field">
              <label>Full name</label>
              <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field">
              <label>Employee type</label>
              <select value={form.employeeType} onChange={(e) => setForm({ ...form, employeeType: e.target.value })}>
                {EMPLOYEE_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Date of joining</label>
              <input type="date" value={form.dateOfJoining} onChange={(e) => setForm({ ...form, dateOfJoining: e.target.value })} />
            </div>
          </div>
          <button className="btn" onClick={createEmployee} disabled={saving}>{saving ? "Saving..." : "Save"}</button>{" "}
          <button className="btn secondary" onClick={() => setShowCreate(false)}>Cancel</button>
        </div>
      )}

      <div className="card">
        <h2>Directory ({filtered.length})</h2>
        <div className="tabs">
          <button className={statusFilter === "active" ? "active" : ""} onClick={() => setStatusFilter("active")}>Currently working ({activeCount})</button>
          <button className={statusFilter === "exited" ? "active" : ""} onClick={() => setStatusFilter("exited")}>Exited ({exitedCount})</button>
          <button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>All ({employees.length})</button>
        </div>
        <div className="search-box">
          <Icon name="search" />
          <input placeholder="Search by name, code, email, department..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <p className="empty">No employees match.</p>
        ) : (
          <div className="list">
            {filtered.map((e) => (
              <div className="list-row clickable" key={e.id} onClick={() => navigate(`/employees/${e.id}`)}>
                <div className="avatar-chip">{initials(e.fullName)}</div>
                <div className="main">
                  <div className="title">{e.fullName} <span className="muted" style={{ fontWeight: 400 }}>— {e.employeeCode}</span></div>
                  <div className="subtitle">{e.designation ? `${e.designation} · ` : ""}{e.department ?? "No department"}</div>
                </div>
                <div className="meta">
                  {e.kraScore !== null && e.kraScore !== undefined && (
                    <div className="col">
                      <div className="k">Performance Score</div>
                      <div className="v">{e.kraScore.toFixed(2)} / 5</div>
                    </div>
                  )}
                  {e.kraCategory && <Badge value={e.kraCategory} />}
                  <div className="col">
                    <div className="k">Type</div>
                    <div className="v">{e.employeeType.replace(/_/g, " ")}</div>
                  </div>
                  <Badge value={e.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
