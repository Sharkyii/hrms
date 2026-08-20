import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { api } from "../api";
import { Badge } from "../components/Badge";
import { useToast } from "../components/Toast";
import type { Employee } from "../auth";

interface Cycle { id: number; name: string; startDate: string; endDate: string; status: string }
interface Goal { id: number; employeeId: number; title: string; weightPct: number; target: string | null }
interface TaskRating { rating: number; comments: string | null; ratedAt: string }
interface Task {
  id: number;
  title: string;
  description: string | null;
  assignedByEmployeeId: number;
  assignedByName: string;
  assignedToEmployeeId: number;
  assignedToName: string;
  dueDate: string | null;
  status: "open" | "in_progress" | "done";
  completedAt: string | null;
  rating: TaskRating | null;
}

export function Kra() {
  const { can, employee } = useAuth();
  const toast = useToast();
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [directory, setDirectory] = useState<Array<{ id: number; fullName: string; department: string | null; designation: string | null }>>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cycleForm, setCycleForm] = useState({ name: "", startDate: "", endDate: "" });
  const [goalForm, setGoalForm] = useState({ employeeId: "", cycleId: "", title: "", weightPct: "" });
  const [taskForm, setTaskForm] = useState({ title: "", description: "", assignedToEmployeeId: "", dueDate: "" });
  const [rateDraft, setRateDraft] = useState<Record<number, { rating: string; comments: string }>>({});

  const canManageTeam = can("kra.rate_team") || can("kra.view_all");

  async function load() {
    setCycles(await api.get<Cycle[]>("/kra/cycles"));
    if (employee) setGoals(await api.get<Goal[]>(`/kra/goals?employeeId=${employee.id}`));
    if (canManageTeam) setEmployees(await api.get<Employee[]>("/employees"));
    setDirectory(await api.get("/employees/directory"));
    setTasks(await api.get<Task[]>("/tasks"));
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

  async function createTask() {
    if (!taskForm.title.trim() || !taskForm.assignedToEmployeeId) return;
    await api.post("/tasks", {
      title: taskForm.title.trim(),
      description: taskForm.description.trim() || undefined,
      assignedToEmployeeId: Number(taskForm.assignedToEmployeeId),
      dueDate: taskForm.dueDate || undefined,
    });
    setTaskForm({ title: "", description: "", assignedToEmployeeId: "", dueDate: "" });
    toast.success("Task assigned.");
    await load();
  }

  async function updateTaskStatus(taskId: number, status: "open" | "in_progress" | "done") {
    await api.put(`/tasks/${taskId}/status`, { status });
    toast.success(status === "done" ? "Task marked done." : "Task updated.");
    await load();
  }

  async function submitRating(taskId: number) {
    const draft = rateDraft[taskId];
    if (!draft?.rating) return;
    await api.put(`/tasks/${taskId}/rate`, { rating: Number(draft.rating), comments: draft.comments || undefined });
    setRateDraft({ ...rateDraft, [taskId]: { rating: "", comments: "" } });
    toast.success("Rating saved.");
    await load();
  }

  const myTasksAssignedToMe = tasks.filter((t) => t.assignedToEmployeeId === employee?.id);
  const myRatedTasks = myTasksAssignedToMe.filter((t) => t.rating);
  const myAverageTaskScore = myRatedTasks.length ? myRatedTasks.reduce((s, t) => s + (t.rating?.rating ?? 0), 0) / myRatedTasks.length : null;

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

      {myRatedTasks.length > 0 && (
        <div className="card">
          <h2>My task performance</h2>
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <div className="stat"><div className="value">{myAverageTaskScore?.toFixed(1)}</div><div className="label">Average score</div></div>
            <div className="stat"><div className="value">{myRatedTasks.length}</div><div className="label">Rated tasks</div></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Task</th><th>Assigned by</th><th>Score</th><th>Comments</th></tr></thead>
              <tbody>
                {myRatedTasks.map((t) => (
                  <tr key={t.id}>
                    <td>{t.title}</td>
                    <td>{t.assignedByName}</td>
                    <td><strong>{t.rating?.rating}</strong> / 5</td>
                    <td>{t.rating?.comments ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Tasks</h2>
        <p className="muted">
          Any employee can assign a task to any other employee. Every task is visible to everyone here for coordination.
          Once marked done, the assignee's manager (or HR/founder) rates it, and that rating feeds their scorecard above.
        </p>

        <div className="form-row">
          <div className="field"><label>Title</label><input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} /></div>
          <div className="field">
            <label>Assign to</label>
            <select value={taskForm.assignedToEmployeeId} onChange={(e) => setTaskForm({ ...taskForm, assignedToEmployeeId: e.target.value })}>
              <option value="">Select...</option>
              {directory.filter((e) => e.id !== employee?.id).map((e) => (
                <option key={e.id} value={e.id}>{e.fullName}{e.department ? ` — ${e.department}` : ""}</option>
              ))}
            </select>
          </div>
          <div className="field"><label>Due date</label><input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} /></div>
        </div>
        <div className="field">
          <label>Description</label>
          <input value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} placeholder="Optional details..." />
        </div>
        <button className="btn" onClick={createTask} disabled={!taskForm.title.trim() || !taskForm.assignedToEmployeeId}>Assign task</button>

        {tasks.length === 0 ? (
          <p className="empty" style={{ marginTop: 16 }}>No tasks yet.</p>
        ) : (
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr><th>Title</th><th>Assigned by</th><th>Assigned to</th><th>Due</th><th>Status</th><th>Score</th><th></th></tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const assigneeRecord = employees.find((e) => e.id === t.assignedToEmployeeId);
                  const canRate =
                    t.status === "done" &&
                    !t.rating &&
                    (can("kra.view_all") || (canManageTeam && assigneeRecord?.reportingManagerId === employee?.id));
                  const isMine = t.assignedToEmployeeId === employee?.id;
                  const draft = rateDraft[t.id] ?? { rating: "", comments: "" };
                  const late = t.dueDate && t.status !== "done" && new Date(t.dueDate) < new Date();

                  return (
                    <tr key={t.id}>
                      <td>{t.title}{t.description && <div className="muted" style={{ fontSize: 12 }}>{t.description}</div>}</td>
                      <td>{t.assignedByName}</td>
                      <td>{t.assignedToName}</td>
                      <td>{t.dueDate ?? "—"} {late && <Badge value="late" />}</td>
                      <td><Badge value={t.status} /></td>
                      <td>{t.rating ? `${t.rating.rating} / 5` : "—"}</td>
                      <td>
                        {isMine && t.status === "open" && <button className="btn secondary" onClick={() => updateTaskStatus(t.id, "in_progress")}>Start</button>}
                        {isMine && t.status === "in_progress" && <button className="btn secondary" onClick={() => updateTaskStatus(t.id, "done")}>Mark done</button>}
                        {canRate && (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <select value={draft.rating} onChange={(e) => setRateDraft({ ...rateDraft, [t.id]: { ...draft, rating: e.target.value } })}>
                              <option value="">Rate...</option>
                              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                            <input
                              placeholder="Comment (optional)"
                              style={{ width: 140 }}
                              value={draft.comments}
                              onChange={(e) => setRateDraft({ ...rateDraft, [t.id]: { ...draft, comments: e.target.value } })}
                            />
                            <button className="btn secondary" disabled={!draft.rating} onClick={() => submitRating(t.id)}>Save</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
