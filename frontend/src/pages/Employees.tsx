import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth";
import { api, ApiError } from "../api";
import { Badge } from "../components/Badge";
import { Spinner } from "../components/Spinner";
import { Icon } from "../components/Icon";
import { useToast } from "../components/Toast";
import type { Employee } from "../auth";

const EMPLOYEE_TYPES = ["office_laptop", "office_no_laptop", "field", "wfh", "no_smartphone", "contract"];

export function Employees() {
  const { can } = useAuth();
  const toast = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => `${e.employeeCode} ${e.fullName} ${e.email} ${e.department ?? ""}`.toLowerCase().includes(q));
  }, [employees, query]);

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
        <div className="search-box">
          <Icon name="search" />
          <input placeholder="Search by name, code, email, department..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <p className="empty">No employees match.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Department</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id}>
                    <td>{e.employeeCode}</td>
                    <td>{e.fullName}</td>
                    <td>{e.employeeType.replace(/_/g, " ")}</td>
                    <td>{e.department ?? "—"}</td>
                    <td><Badge value={e.status} /></td>
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
