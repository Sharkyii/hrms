import { useState, type FormEvent, useEffect } from "react";
import { useAuth } from "../auth";
import { api, ApiError } from "../api";
import { useToast } from "../components/Toast";
import { initials } from "../initials";

export function Profile() {
  const { session, employee } = useAuth();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bankDetails, setBankDetails] = useState<{ bankName: string | null; accountHolderName: string; accountNumber: string; ifsc: string } | null>(null);

  useEffect(() => {
    if (employee?.id) {
      api.get(`/employees/${employee.id}/profile`).then((p: any) => {
        setBankDetails(p.bankDetails);
      }).catch(console.error);
    }
  }, [employee?.id]);

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      toast.success("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Profile</h1>
      </div>

      <div className="card">
        <div className="list-row" style={{ border: "none", padding: 0 }}>
          <div className="avatar-chip" style={{ width: 52, height: 52, fontSize: 18 }}>{initials(employee?.fullName)}</div>
          <div className="main">
            <div className="title" style={{ fontSize: 17 }}>{employee?.fullName}</div>
            <div className="subtitle">{employee?.employeeCode} · {employee?.designation ?? "—"}{employee?.department ? ` · ${employee.department}` : ""}</div>
            <div className="subtitle">{employee?.email}</div>
          </div>
          <div className="meta">
            <div className="col">
              <div className="k">Role</div>
              <div className="v" style={{ textTransform: "capitalize" }}>{session?.role}</div>
            </div>
          </div>
        </div>
      </div>

      {bankDetails && (
        <div className="card">
          <h2>Bank details</h2>
          <div className="form-row">
            <div><label>Bank name</label><div>{bankDetails.bankName ?? "—"}</div></div>
            <div><label>Account holder</label><div>{bankDetails.accountHolderName ?? "—"}</div></div>
            <div><label>Account number</label><div>{bankDetails.accountNumber ?? "—"}</div></div>
            <div><label>IFSC</label><div>{bankDetails.ifsc ?? "—"}</div></div>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Change password</h2>
        <form onSubmit={changePassword}>
          {error && <div className="error-banner">{error}</div>}
          <div className="field">
            <label>Current password</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>
          <div className="form-row">
            <div className="field">
              <label>New password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required />
            </div>
            <div className="field">
              <label>Confirm new password</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required />
            </div>
          </div>
          <button className="btn" type="submit" disabled={busy}>{busy ? "Saving..." : "Update password"}</button>
        </form>
      </div>
    </div>
  );
}
