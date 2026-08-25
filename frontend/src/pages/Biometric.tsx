import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import type { Employee } from "../auth";

interface Device {
  id: number;
  deviceCode: string;
  location: string | null;
}
interface ImportRow {
  id: number;
  deviceUserCode: string;
  punchDatetime: string;
  inOut: string;
  resolvedEmployeeId: number | null;
  status: string;
}
interface PreviewResult {
  batchId: number;
  unmappedColumnCount: number;
  summary: { total: number; ready: number; duplicates: number; unknown: number };
  rows: ImportRow[];
}

export function Biometric() {
  const toast = useToast();
  const confirmDialog = useConfirm();
  const [devices, setDevices] = useState<Device[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [deviceCode, setDeviceCode] = useState("");
  const [newDeviceCode, setNewDeviceCode] = useState("");
  const [newDeviceLocation, setNewDeviceLocation] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Device[]>("/biometric/devices").then(setDevices);
    api.get<Employee[]>("/employees").then(setEmployees);
  }, []);

  async function registerDevice() {
    if (!newDeviceCode) return;
    await api.post("/biometric/devices", { deviceCode: newDeviceCode, location: newDeviceLocation || undefined });
    setNewDeviceCode("");
    setNewDeviceLocation("");
    setDevices(await api.get<Device[]>("/biometric/devices"));
  }

  async function uploadPreview() {
    setError(null);
    if (!deviceCode || !file) {
      setError("Select a device and a file first");
      return;
    }
    const form = new FormData();
    form.append("deviceCode", deviceCode);
    form.append("file", file);
    setBusy(true);
    try {
      const result = await api.postForm<PreviewResult>("/biometric/import/preview", form);
      setPreview(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function mapRow(deviceUserCode: string, employeeId: number) {
    if (!preview) return;
    await api.post(`/biometric/import/${preview.batchId}/map`, { deviceUserCode, employeeId });
    const rows = preview.rows.map((r) => (r.deviceUserCode === deviceUserCode ? { ...r, resolvedEmployeeId: employeeId, status: "ready" } : r));
    setPreview({ ...preview, rows });
    toast.success(`Mapped ${deviceUserCode}.`);
  }

  async function confirmImport() {
    if (!preview) return;
    const stillUnknown = preview.rows.filter((r) => r.status === "unknown_id").length;
    const ok = await confirmDialog({
      title: "Confirm import",
      message: stillUnknown > 0
        ? `${stillUnknown} row(s) are still unmapped and will be skipped. Import the rest?`
        : `This writes attendance records for batch #${preview.batchId}.`,
      confirmLabel: "Import",
    });
    if (!ok) return;
    const result = await api.post<{ attendanceRecordsWritten: number }>(`/biometric/import/${preview.batchId}/confirm`);
    toast.success(`Wrote ${result.attendanceRecordsWritten} attendance record(s).`);
    setPreview(null);
    setFile(null);
  }

  return (
    <div>
      <div className="page-header"><h1>Biometric Import</h1></div>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>Devices</h2>
        <table>
          <thead><tr><th>Code</th><th>Location</th></tr></thead>
          <tbody>
            {devices.map((d) => <tr key={d.id}><td>{d.deviceCode}</td><td>{d.location ?? "—"}</td></tr>)}
          </tbody>
        </table>
        <div className="form-row" style={{ marginTop: 12 }}>
          <div className="field"><label>New device code</label><input value={newDeviceCode} onChange={(e) => setNewDeviceCode(e.target.value)} /></div>
          <div className="field"><label>Location</label><input value={newDeviceLocation} onChange={(e) => setNewDeviceLocation(e.target.value)} /></div>
        </div>
        <button className="btn secondary" onClick={registerDevice}>Register device</button>
      </div>

      <div className="card">
        <h2>Upload export file</h2>
        <p className="muted">Expected columns: a User/Card ID column, a DateTime column, and an In/Out column. Column order doesn't matter — headers are matched by name.</p>
        <div className="form-row">
          <div className="field">
            <label>Device</label>
            <select value={deviceCode} onChange={(e) => setDeviceCode(e.target.value)}>
              <option value="">Select...</option>
              {devices.map((d) => <option key={d.id} value={d.deviceCode}>{d.deviceCode}</option>)}
            </select>
          </div>
          <div className="field">
            <label>File (.xlsx)</label>
            <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <button className="btn" onClick={uploadPreview} disabled={busy}>{busy ? "Uploading..." : "Preview"}</button>
      </div>

      {preview && (() => {
        const grouped = preview.rows.reduce<Record<string, { ready: number; duplicates: number; unknown: number; hasUnknownId: boolean }>>((acc, r) => {
          if (!acc[r.deviceUserCode]) acc[r.deviceUserCode] = { ready: 0, duplicates: 0, unknown: 0, hasUnknownId: false };
          if (r.status === "ready") acc[r.deviceUserCode].ready++;
          else if (r.status === "duplicate") acc[r.deviceUserCode].duplicates++;
          else if (r.status === "unknown_id") {
            acc[r.deviceUserCode].unknown++;
            acc[r.deviceUserCode].hasUnknownId = true;
          }
          return acc;
        }, {});

        return (
          <div className="card">
            <h2>Preview — batch #{preview.batchId}</h2>
            <p>
              Total {preview.summary.total} · Ready {preview.summary.ready} · Duplicates {preview.summary.duplicates} · Unknown{" "}
              {preview.summary.unknown}
            </p>
            <table>
              <thead><tr><th>User code</th><th>Ready</th><th>Duplicates</th><th>Unknown</th><th>Resolve</th></tr></thead>
              <tbody>
                {Object.entries(grouped).map(([userCode, stats]) => (
                  <tr key={userCode}>
                    <td>{userCode}</td>
                    <td>{stats.ready}</td>
                    <td>{stats.duplicates}</td>
                    <td>{stats.unknown}</td>
                    <td>
                      {stats.hasUnknownId && (
                        <select defaultValue="" onChange={(e) => e.target.value && mapRow(userCode, Number(e.target.value))}>
                          <option value="">Assign employee...</option>
                          {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn" style={{ marginTop: 12 }} onClick={confirmImport}>Confirm import</button>
          </div>
        );
      })()}
    </div>
  );
}
