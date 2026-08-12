import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { api } from "../api";
import { useToast } from "../components/Toast";
import type { Employee } from "../auth";

interface Cycle { id: number; name: string; startDate: string; endDate: string; status: string }
interface Goal { id: number; employeeId: number; title: string; weightPct: number; target: string | null }

export function Kra() {
  const { can, employee } = useAuth();
  const toast = useToast();
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [cycleForm, setCycleForm] = useState({ name: "", startDate: "", endDate: "" });
  const [goalForm, setGoalForm] = useState({ employeeId: "", cycleId: "", title: "", weightPct: "" });

  const canManageTeam = can("kra.rate_team") || can("kra.view_all");

  async function load() {
    setCycles(await api.get<Cycle[]>("/kra/cycles"));
    if (employee) setGoals(await api.get<Goal[]>(`/kra/goals?employeeId=${employee.id}`));
    if (canManageTeam) setEmployees(await api.get<Employee[]>("/employees"));
  }
  useEffect(() => {
    load();
  }, [employee?.id]);

  async function createCycle() {
    await api.post("/kra/cycles", cycleForm);
    setCycleForm({ name: "", startDate: "", endDate: "" });
    toast.success("Cycle created.");
    await load();
  }

  async function createGoal() {
    await api.post("/kra/goals", { ...goalForm, employeeId: Number(goalForm.employeeId), cycleId: Number(goalForm.cycleId), weightPct: Number(goalForm.weightPct) });
    setGoalForm({ employeeId: "", cycleId: "", title: "", weightPct: "" });
    toast.success("Goal added.");
    await load();
  }

  async function selfRate(goalId: number, rating: number) {
    await api.put(`/kra/goals/${goalId}/self-rating`, { rating });
    toast.success("Self rating saved.");
  }

  return (
    <div>
      <div className="page-header"><h1>KRA</h1></div>

      {can("kra.view_all") && (
        <div className="card">
          <h2>Cycles</h2>
          <table>
            <thead><tr><th>Name</th><th>Start</th><th>End</th><th>Status</th></tr></thead>
            <tbody>{cycles.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.startDate}</td><td>{c.endDate}</td><td>{c.status}</td></tr>)}</tbody>
          </table>
          <div className="form-row" style={{ marginTop: 12 }}>
            <div className="field"><label>Name</label><input value={cycleForm.name} onChange={(e) => setCycleForm({ ...cycleForm, name: e.target.value })} /></div>
            <div className="field"><label>Start</label><input type="date" value={cycleForm.startDate} onChange={(e) => setCycleForm({ ...cycleForm, startDate: e.target.value })} /></div>
            <div className="field"><label>End</label><input type="date" value={cycleForm.endDate} onChange={(e) => setCycleForm({ ...cycleForm, endDate: e.target.value })} /></div>
          </div>
          <button className="btn secondary" onClick={createCycle}>Create cycle</button>
        </div>
      )}

      {canManageTeam && (
        <div className="card">
          <h2>Set a goal</h2>
          <div className="form-row">
            <div className="field">
              <label>Employee</label>
              <select value={goalForm.employeeId} onChange={(e) => setGoalForm({ ...goalForm, employeeId: e.target.value })}>
                <option value="">Select...</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Cycle</label>
              <select value={goalForm.cycleId} onChange={(e) => setGoalForm({ ...goalForm, cycleId: e.target.value })}>
                <option value="">Select...</option>
                {cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Weight %</label><input type="number" value={goalForm.weightPct} onChange={(e) => setGoalForm({ ...goalForm, weightPct: e.target.value })} /></div>
          </div>
          <div className="field"><label>Title</label><input value={goalForm.title} onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })} /></div>
          <button className="btn" onClick={createGoal}>Add goal</button>
        </div>
      )}

      <div className="card">
        <h2>My goals</h2>
        {goals.length === 0 ? (
          <p className="empty">No goals set for this cycle yet.</p>
        ) : (
          <table>
            <thead><tr><th>Title</th><th>Weight</th><th>Self rating</th></tr></thead>
            <tbody>
              {goals.map((g) => (
                <tr key={g.id}>
                  <td>{g.title}</td>
                  <td>{g.weightPct}%</td>
                  <td>
                    <select defaultValue="" onChange={(e) => e.target.value && selfRate(g.id, Number(e.target.value))}>
                      <option value="">Rate...</option>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
