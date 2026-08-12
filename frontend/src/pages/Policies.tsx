import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { api } from "../api";
import { useToast } from "../components/Toast";

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

      {policies.map((p) => (
        <div className="card" key={p.id}>
          <h2>{p.title} <span className="muted">v{p.version}</span></h2>
          {p.category && <p className="muted">{p.category}</p>}
          <p style={{ whiteSpace: "pre-wrap" }}>{p.content}</p>
        </div>
      ))}
    </div>
  );
}
