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
        <details key={category} className="card policy-folder">
          <summary className="policy-folder-summary">
            <span>{category}</span>
            <Badge value={`${catPolicies.length}`} />
          </summary>
          <div className="list" style={{ marginTop: 14 }}>
            {catPolicies.map((p) => (
              <details key={p.id} className="policy-item">
                <summary className="list-row clickable policy-item-summary">
                  <div className="main">
                    <div className="title">{p.title}</div>
                  </div>
                  <span className="muted">v{p.version}</span>
                </summary>
                <p className="policy-item-content">{p.content}</p>
              </details>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
