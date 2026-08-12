import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { Spinner } from "../components/Spinner";
import type { Employee } from "../auth";

interface Role { id: number; name: string; description: string | null }
interface UserRow { id: number; employeeId: number; email: string; role: string }
interface AuditEntry { id: number; actorUserId: number; targetUserId: number; fieldChanged: string; oldValue: string | null; newValue: string; reason: string | null; changedAt: string }

export function Access() {
  const toast = useToast();
  const confirm = useConfirm();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [provisionForm, setProvisionForm] = useState({ employeeId: "", email: "", password: "", role: "employee" });

  async function load() {
    setEmployees(await api.get<Employee[]>("/employees"));
    setRoles(await api.get<Role[]>("/roles"));
    setUsers(await api.get<UserRow[]>("/roles/users"));
    setAudit(await api.get<AuditEntry[]>("/roles/audit-log"));
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function changeRole(userId: number, role: string) {
    const ok = await confirm({ title: "Change role", message: `This changes what this person can access immediately. Set role to "${role}"?`, confirmLabel: "Change role" });
    if (!ok) return;
    setError(null);
    try {
      await api.put(`/roles/users/${userId}/role`, { role, reason: "Changed via Access page" });
      toast.success("Role updated.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change role");
    }
  }

  async function provision() {
    setError(null);
    try {
      await api.post("/auth/provision", { ...provisionForm, employeeId: Number(provisionForm.employeeId) });
      setProvisionForm({ employeeId: "", email: "", password: "", role: "employee" });
      toast.success("Login created.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to provision login");
    }
  }

  const empName = (id: number) => employees.find((e) => e.id === id)?.fullName ?? id;
  const unprovisioned = employees.filter((e) => !users.some((u) => u.employeeId === e.id));

  if (loading) return <div><div className="page-header"><h1>Access & Roles</h1></div><Spinner /></div>;

  return (
    <div>
      <div className="page-header"><h1>Access & Roles</h1></div>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>Users & roles</h2>
        <p className="muted">Role assignment is one click — permissions come from the role, not the person. Founder-level access can only be changed by a founder.</p>
        {users.length === 0 ? (
          <p className="empty">No logins provisioned yet.</p>
        ) : (
          <table>
            <thead><tr><th>Employee</th><th>Email</th><th>Role</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{empName(u.employeeId)}</td>
                  <td>{u.email}</td>
                  <td>
                    <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}>
                      {roles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Provision a login</h2>
        <div className="form-row">
          <div className="field">
            <label>Employee</label>
            <select value={provisionForm.employeeId} onChange={(e) => setProvisionForm({ ...provisionForm, employeeId: e.target.value })}>
              <option value="">Select...</option>
              {unprovisioned.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </select>
          </div>
          <div className="field"><label>Email</label><input type="email" value={provisionForm.email} onChange={(e) => setProvisionForm({ ...provisionForm, email: e.target.value })} /></div>
          <div className="field"><label>Temporary password</label><input value={provisionForm.password} onChange={(e) => setProvisionForm({ ...provisionForm, password: e.target.value })} /></div>
          <div className="field">
            <label>Role</label>
            <select value={provisionForm.role} onChange={(e) => setProvisionForm({ ...provisionForm, role: e.target.value })}>
              {roles.filter((r) => r.name !== "founder").map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
            </select>
          </div>
        </div>
        <button className="btn" onClick={provision}>Create login</button>
      </div>

      <div className="card">
        <h2>Access audit log</h2>
        {audit.length === 0 ? (
          <p className="empty">No access changes yet.</p>
        ) : (
          <table>
            <thead><tr><th>When</th><th>Field</th><th>Old</th><th>New</th><th>Reason</th></tr></thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.changedAt).toLocaleString()}</td>
                  <td>{a.fieldChanged}</td>
                  <td>{a.oldValue ?? "—"}</td>
                  <td>{a.newValue}</td>
                  <td className="muted">{a.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
