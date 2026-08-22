import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { api } from "../api";
import { useToast } from "../components/Toast";
import { Badge } from "../components/Badge";

interface Policy { id: number; title: string; content: string; category: string | null; version: number }

export function Policies() {
  const { can } = useAuth();
  const toast = useToast();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [form, setForm] = useState({ title: "", content: "", category: "" });

  async function load() {
    setPolicies(await api.get<Policy[]>("/policies"));
  }
  useEffect(() => {
    load();
  }, []);

  async function create() {
    await api.post("/policies", form);
    setForm({ title: "", content: "", category: "" });
    toast.success("Policy published.");
    await load();
  }

  return (
    <div>
      <div className="page-header"><h1>Policies</h1></div>

      {can("policies.manage") && (
        <div className="card">
          <h2>Publish a policy</h2>
          <div className="field"><label>Title</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="field"><label>Category</label><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          <div className="field"><label>Content</label><textarea rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
          <button className="btn" onClick={create}>Publish</button>
        </div>
      )}

      {policies.length === 0 && <p className="empty">No policies published yet.</p>}

      {Object.entries(
        policies.reduce((acc, p) => {
          const cat = p.category?.trim() || "Uncategorized";
          acc[cat] = acc[cat] || [];
          acc[cat].push(p);
          return acc;
        }, {} as Record<string, Policy[]>)
      ).map(([category, catPolicies]) => (
        <details key={category} className="card" style={{ padding: "0", overflow: "hidden" }} open>
          <summary style={{ padding: "16px", cursor: "pointer", fontWeight: "bold", fontSize: "1.1em", backgroundColor: "rgba(0,0,0,0.02)", listStyle: "none", display: "flex", justifyContent: "space-between" }}>
            {category} <Badge value={`${catPolicies.length} policies`} />
          </summary>
          <div style={{ padding: "16px", borderTop: "1px solid var(--border)" }}>
            {catPolicies.map((p) => (
              <div key={p.id} style={{ marginBottom: "24px" }}>
                <h3 style={{ margin: "0 0 8px 0" }}>{p.title} <span className="muted" style={{ fontWeight: "normal", fontSize: "0.85em" }}>v{p.version}</span></h3>
                <p style={{ whiteSpace: "pre-wrap", margin: 0, color: "var(--text)" }}>{p.content}</p>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
