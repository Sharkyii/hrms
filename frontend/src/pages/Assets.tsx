import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { api } from "../api";
import { Badge } from "../components/Badge";
import { useToast } from "../components/Toast";
import type { Employee } from "../auth";

interface Asset { id: number; assetCode: string; name: string; category: string | null; status: string; assignedToName?: string | null }

export function Assets() {
  const { can } = useAuth();
  const toast = useToast();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState({ assetCode: "", name: "", category: "" });

  async function load() {
    setAssets(await api.get<Asset[]>("/assets"));
  }
  useEffect(() => {
    load();
    if (can("assets.manage")) api.get<Employee[]>("/employees").then(setEmployees);
  }, []);

  async function createAsset() {
    await api.post("/assets", form);
    setForm({ assetCode: "", name: "", category: "" });
    toast.success("Asset added.");
    await load();
  }

  async function assign(assetId: number, employeeId: number) {
    await api.post(`/assets/${assetId}/assign`, { employeeId });
    toast.success("Asset assigned.");
    await load();
  }

  async function returnAsset(assetId: number) {
    await api.post(`/assets/${assetId}/return`, {});
    toast.success("Asset marked returned.");
    await load();
  }

  return (
    <div>
      <div className="page-header"><h1>Assets</h1></div>

      {can("assets.manage") && (
        <div className="card">
          <h2>Add asset</h2>
          <div className="form-row">
            <div className="field"><label>Code</label><input value={form.assetCode} onChange={(e) => setForm({ ...form, assetCode: e.target.value })} /></div>
            <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label>Category</label><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          </div>
          <button className="btn" onClick={createAsset}>Add</button>
        </div>
      )}

      <div className="card">
        <h2>{can("assets.manage") ? "All assets" : "My assets"}</h2>
        {assets.length === 0 ? (
          <p className="empty">No assets.</p>
        ) : (
          <div className="list">
            {assets.map((a) => (
              <div className="list-row" key={a.id}>
                <div className="avatar-chip">{a.category ? a.category.slice(0, 2).toUpperCase() : "AS"}</div>
                <div className="main">
                  <div className="title">{a.name} <span className="muted" style={{ fontWeight: 400 }}>— {a.assetCode}</span></div>
                  <div className="subtitle">{a.category ?? "Uncategorized"}{can("assets.manage") ? ` · ${a.assignedToName ?? "Unassigned"}` : ""}</div>
                </div>
                <div className="meta">
                  <Badge value={a.status} />
                  {can("assets.manage") && (
                    <div className="actions">
                      {a.status === "available" ? (
                        <select defaultValue="" style={{ width: "auto" }} onChange={(e) => e.target.value && assign(a.id, Number(e.target.value))}>
                          <option value="">Assign to...</option>
                          {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                        </select>
                      ) : (
                        <button className="btn secondary" onClick={() => returnAsset(a.id)}>Mark returned</button>
                      )}
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
