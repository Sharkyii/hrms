import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { api } from "../api";
import { Badge } from "../components/Badge";
import { useToast } from "../components/Toast";
import type { Employee } from "../auth";

interface RetailerVisit {
  id: number;
  employeeId: number;
  shopName: string;
  area: string;
  contractedAmount: number;
  latitude: number | null;
  longitude: number | null;
  status: string;
  createdAt: string;
}

interface VisitRecord {
  visit: RetailerVisit;
  employee: Employee;
}

export function RetailerVisits() {
  const { can } = useAuth();
  const toast = useToast();
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  
  const [shopName, setShopName] = useState("");
  const [area, setArea] = useState("");
  const [contractedAmount, setContractedAmount] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);

  const canManage = can("employee.manage");

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<VisitRecord[]>("/marketing/visits");
      setVisits(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function logVisit() {
    if (!shopName || !area || !contractedAmount || !photo) {
      toast.error("Please fill all fields and attach a photo.");
      return;
    }

    setBusy(true);
    try {
      let latitude: number | undefined;
      let longitude: number | undefined;
      
      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 })
          );
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;
        } catch {
          // Proceed without GPS if denied or timeout
        }
      }

      const form = new FormData();
      form.append("shopName", shopName);
      form.append("area", area);
      form.append("contractedAmount", contractedAmount);
      form.append("photo", photo);
      if (latitude) form.append("latitude", latitude.toString());
      if (longitude) form.append("longitude", longitude.toString());

      await api.postForm("/marketing/visits", form);
      toast.success("Retailer visit logged successfully.");
      
      setShopName("");
      setArea("");
      setContractedAmount("");
      setPhoto(null);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Failed to log visit");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(id: number, status: "verified" | "rejected") {
    try {
      await api.put(`/marketing/visits/${id}/status`, { status });
      toast.success(`Visit marked as ${status}.`);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Failed to update status");
    }
  }

  return (
    <div>
      <div className="page-header"><h1>Retailer Visits</h1></div>
      
      <div className="card">
        <h2>Log a new visit</h2>
        <div className="form-row">
          <div className="field">
            <label>Shop Name</label>
            <input value={shopName} onChange={(e) => setShopName(e.target.value)} />
          </div>
          <div className="field">
            <label>Area</label>
            <input value={area} onChange={(e) => setArea(e.target.value)} />
          </div>
          <div className="field">
            <label>Contracted Amount (₹)</label>
            <input type="number" value={contractedAmount} onChange={(e) => setContractedAmount(e.target.value)} />
          </div>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>Photo Proof</label>
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
        </div>
        <button className="btn" style={{ marginTop: 16 }} onClick={logVisit} disabled={busy || !shopName || !area || !contractedAmount || !photo}>
          {busy ? "Logging..." : "Log Visit"}
        </button>
      </div>

      <div className="card">
        <h2>Recent Visits</h2>
        {loading ? (
          <p>Loading...</p>
        ) : visits.length === 0 ? (
          <p className="empty">No visits logged yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee</th>
                  <th>Shop</th>
                  <th>Area</th>
                  <th>Amount</th>
                  <th>Location</th>
                  <th>Photo</th>
                  <th>Status</th>
                  {canManage && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {visits.map((r) => (
                  <tr key={r.visit.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(r.visit.createdAt).toLocaleDateString()}</td>
                    <td>{r.employee.fullName}</td>
                    <td>{r.visit.shopName}</td>
                    <td>{r.visit.area}</td>
                    <td>₹{r.visit.contractedAmount}</td>
                    <td>
                      {r.visit.latitude ? (
                        <a href={`https://maps.google.com/?q=${r.visit.latitude},${r.visit.longitude}`} target="_blank" rel="noreferrer">Map</a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <a href={`/api/marketing/visits/${r.visit.id}/photo`} target="_blank" rel="noreferrer">View</a>
                    </td>
                    <td><Badge value={r.visit.status} /></td>
                    {canManage && (
                      <td>
                        {r.visit.status === "pending" && (
                          <div style={{ display: "flex", gap: 4 }}>
                            <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => updateStatus(r.visit.id, "verified")}>Verify</button>
                            <button className="btn danger" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => updateStatus(r.visit.id, "rejected")}>Reject</button>
                          </div>
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
