import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { Badge } from "../components/Badge";

interface Device {
  id: number;
  deviceCode: string;
  location: string | null;
}
interface ImportRow {
  id: number;
  deviceUserCode: string;
  deviceEmployeeName: string | null;
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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "2-digit" });
}

export function Biometric() {
  const toast = useToast();
  const confirmDialog = useConfirm();
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceCode, setDeviceCode] = useState("");
  const [newDeviceCode, setNewDeviceCode] = useState("");
  const [newDeviceLocation, setNewDeviceLocation] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expandedUserCode, setExpandedUserCode] = useState<string | null>(null);

  useEffect(() => {
    api.get<Device[]>("/biometric/devices").then(setDevices);
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
            <label>File (.xlsx, .xls)</label>
            <input type="file" accept=".xlsx, .xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <button className="btn" onClick={uploadPreview} disabled={busy}>{busy ? "Uploading..." : "Preview"}</button>
      </div>

      {preview && (() => {
        const grouped = preview.rows.reduce<Record<string, { ready: number; duplicates: number; unknown: number }>>((acc, r) => {
          if (!acc[r.deviceUserCode]) acc[r.deviceUserCode] = { ready: 0, duplicates: 0, unknown: 0 };
          if (r.status === "ready") acc[r.deviceUserCode].ready++;
          else if (r.status === "duplicate") acc[r.deviceUserCode].duplicates++;
          else if (r.status === "unknown_id") acc[r.deviceUserCode].unknown++;
          return acc;
        }, {});

        return (
          <div className="card">
            <h2>Preview — batch #{preview.batchId}</h2>
            <div className="stat-grid" style={{ marginBottom: 16 }}>
              <div className="stat">
                <div className="value">{preview.summary.total}</div>
                <div className="label">Total rows</div>
              </div>
              <div className="stat">
                <div className="value" style={{ color: "var(--success)" }}>{preview.summary.ready}</div>
                <div className="label">Ready</div>
              </div>
              <div className={`stat ${preview.summary.duplicates > 0 ? "warn" : ""}`}>
                <div className="value">{preview.summary.duplicates}</div>
                <div className="label">Duplicates</div>
              </div>
              <div className={`stat ${preview.summary.unknown > 0 ? "critical" : ""}`}>
                <div className="value" style={preview.summary.unknown > 0 ? { color: "var(--critical)" } : undefined}>{preview.summary.unknown}</div>
                <div className="label">Unknown</div>
              </div>
            </div>
            <table>
              <thead><tr><th>User code</th><th>Ready</th><th>Duplicates</th><th>Unknown</th></tr></thead>
              <tbody>
                {Object.entries(grouped).map(([userCode, stats]) => {
                  const isExpanded = expandedUserCode === userCode;
                  const userRows = preview.rows.filter((r) => r.deviceUserCode === userCode);
                  const employeeName = userRows.find((r) => r.deviceEmployeeName)?.deviceEmployeeName;

                  const byDate = userRows.reduce<Record<string, { in?: string; out?: string; status: string }[]>>((acc, r) => {
                    const dateKey = r.punchDatetime.slice(0, 10);
                    if (!acc[dateKey]) acc[dateKey] = [];
                    acc[dateKey].push({ [r.inOut === "in" ? "in" : "out"]: r.punchDatetime, status: r.status } as { in?: string; out?: string; status: string });
                    return acc;
                  }, {});

                  // Merge same-day in/out entries onto one line per punch-pair where possible.
                  const dateRows = Object.entries(byDate)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([dateKey, entries]) => {
                      const inTime = entries.find((e) => e.in)?.in;
                      const outTime = entries.find((e) => e.out)?.out;
                      const status = entries[0]?.status ?? "";
                      return { dateKey, inTime, outTime, status };
                    });

                  return (
                    <>
                      <tr
                        key={userCode}
                        onClick={() => setExpandedUserCode(isExpanded ? null : userCode)}
                        style={{ cursor: "pointer" }}
                      >
                        <td>{isExpanded ? "▾" : "▸"} {userCode}{employeeName ? ` (${employeeName})` : ""}</td>
                        <td style={{ color: stats.ready > 0 ? "var(--success)" : undefined, fontWeight: stats.ready > 0 ? 700 : undefined }}>{stats.ready}</td>
                        <td style={{ color: stats.duplicates > 0 ? "var(--warning)" : undefined, fontWeight: stats.duplicates > 0 ? 700 : undefined }}>{stats.duplicates}</td>
                        <td style={{ color: stats.unknown > 0 ? "var(--critical)" : undefined, fontWeight: stats.unknown > 0 ? 700 : undefined }}>{stats.unknown}</td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${userCode}-detail`}>
                          <td colSpan={4} style={{ background: "var(--card-bg, #f7f7f7)", padding: 0 }}>
                            <table style={{ width: "100%" }}>
                              <thead><tr><th>Date</th><th>In time</th><th>Out time</th><th>Status</th></tr></thead>
                              <tbody>
                                {dateRows.map(({ dateKey, inTime, outTime, status }) => (
                                  <tr key={dateKey}>
                                    <td>{formatDate(dateKey)}</td>
                                    <td>{inTime ? formatTime(inTime) : "—"}</td>
                                    <td>{outTime ? formatTime(outTime) : "—"}</td>
                                    <td><Badge value={status} /></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
            <button className="btn" style={{ marginTop: 12 }} onClick={confirmImport}>Confirm import</button>
          </div>
        );
      })()}
    </div>
  );
}
