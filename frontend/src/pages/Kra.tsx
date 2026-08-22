import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { api } from "../api";
import { Badge } from "../components/Badge";
import { Icon } from "../components/Icon";
import { useToast } from "../components/Toast";
import { initials } from "../initials";
import type { Employee } from "../auth";

interface Cycle { id: number; name: string; startDate: string; endDate: string; status: string }
interface Goal { id: number; employeeId: number; title: string; weightPct: number; target: string | null }
interface KraScore { score: number | null; weightRatedPct: number; category: string | null }
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
  const [myScore, setMyScore] = useState<KraScore | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [directory, setDirectory] = useState<Array<{ id: number; fullName: string; department: string | null; designation: string | null }>>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cycleForm, setCycleForm] = useState({ name: "", startDate: "", endDate: "" });
  const [goalForm, setGoalForm] = useState({ employeeId: "", cycleId: "", title: "", weightPct: "" });
  const [taskForm, setTaskForm] = useState({ title: "", description: "", assignedToEmployeeId: "", dueDate: "" });
  const [rateDraft, setRateDraft] = useState<Record<number, { rating: string; comments: string }>>({});
  const [teamScores, setTeamScores] = useState<Array<{ employeeId: number; score: number | null; weightRatedPct: number; category: string | null }>>([]);

  const canManageTeam = can("kra.rate_team") || can("kra.view_all");

  async function load() {
    setCycles(await api.get<Cycle[]>("/kra/cycles"));
    if (employee) {
      setGoals(await api.get<Goal[]>(`/kra/goals?employeeId=${employee.id}`));
      setMyScore(await api.get<KraScore>(`/kra/score?employeeId=${employee.id}`));
    }
    if (canManageTeam) {
      setEmployees(await api.get<Employee[]>("/employees"));
      setTeamScores(await api.get("/kra/team-scores"));
    }
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
        <h2>My goals {myScore?.category && <Badge value={myScore.category} />}</h2>
        {myScore?.score !== null && myScore?.score !== undefined && (
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <div className="stat"><div className="value">{myScore.score.toFixed(2)} / 5</div><div className="label">Weighted score</div></div>
            <div className="stat"><div className="value">{myScore.weightRatedPct}%</div><div className="label">Of cycle weight rated</div></div>
          </div>
        )}
        {goals.length === 0 ? (
          <p className="empty">No goals set for this cycle yet.</p>
        ) : (
          <div className="list">
            {goals.map((g) => (
              <div className="list-row" key={g.id}>
                <div className="avatar-chip">{g.weightPct}%</div>
                <div className="main">
                  <div className="title">{g.title}</div>
                  {g.target && <div className="subtitle">{g.target}</div>}
                </div>
                <select
                  defaultValue=""
                  style={{ width: "auto" }}
                  onChange={(e) => e.target.value && selfRate(g.id, Number(e.target.value))}
                >
                  <option value="">Rate...</option>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {canManageTeam && (
        <div className="card">
          <h2>Team KRA Scores</h2>
          {teamScores.length === 0 ? (
            <p className="empty">No team scores available.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Employee</th><th>Weighted Score</th><th>Category</th></tr></thead>
                <tbody>
                  {teamScores.filter(s => s.employeeId !== employee?.id).map((s) => {
                    const emp = employees.find((e) => e.id === s.employeeId);
                    return (
                      <tr key={s.employeeId}>
                        <td>{emp?.fullName ?? `ID ${s.employeeId}`}</td>
                        <td>{s.score !== null ? `${s.score.toFixed(2)} / 5 (${s.weightRatedPct}% rated)` : "—"}</td>
                        <td>{s.category ? <Badge value={s.category} /> : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {myRatedTasks.length > 0 && (
        <div className="card">
          <h2>My task performance</h2>
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <div className="stat"><div className="value">{myAverageTaskScore?.toFixed(1)}</div><div className="label">Average score</div></div>
            <div className="stat"><div className="value">{myRatedTasks.length}</div><div className="label">Rated tasks</div></div>
          </div>
          <div className="list">
            {myRatedTasks.map((t) => (
              <div className="list-row" key={t.id}>
                <div className="avatar-chip">{initials(t.assignedByName)}</div>
                <div className="main">
                  <div className="title">{t.title}</div>
                  <div className="subtitle">Assigned by {t.assignedByName}{t.rating?.comments ? ` — "${t.rating.comments}"` : ""}</div>
                </div>
                <div className="meta">
                  <div className="col">
                    <div className="k">Score</div>
                    <div className="v">{t.rating?.rating} / 5</div>
                  </div>
                </div>
              </div>
            ))}
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
          <div className="kanban" style={{ marginTop: 20 }}>
            {(["open", "in_progress", "done"] as const).map((col) => {
              const colTasks = tasks.filter((t) => t.status === col);
              const colLabel = col === "open" ? "Open" : col === "in_progress" ? "In progress" : "Done";
              return (
                <div className="kanban-col" key={col}>
                  <div className="kanban-col-head">
                    <h3>{colLabel}</h3>
                    <span className="count">{colTasks.length}</span>
                  </div>
                  {colTasks.length === 0 ? (
                    <div className="kanban-empty">Nothing here.</div>
                  ) : (
                    colTasks.map((t) => {
                      const assigneeRecord = employees.find((e) => e.id === t.assignedToEmployeeId);
                      const canRate =
                        t.status === "done" &&
                        !t.rating &&
                        (can("kra.view_all") || (canManageTeam && assigneeRecord?.reportingManagerId === employee?.id));
                      const isMine = t.assignedToEmployeeId === employee?.id;
                      const draft = rateDraft[t.id] ?? { rating: "", comments: "" };
                      const late = t.dueDate && t.status !== "done" && new Date(t.dueDate) < new Date();

                      return (
                        <div className="kanban-card" key={t.id}>
                          <div className="title">{t.title}</div>
                          {t.description && <div className="desc">{t.description}</div>}
                          <div className="people">
                            <span className="avatar-chip">{initials(t.assignedToName)}</span>
                            {t.assignedToName}
                            <span>·</span>
                            <span>from {t.assignedByName}</span>
                          </div>
                          {t.dueDate && (
                            <div className={`due ${late ? "late" : ""}`}>
                              <Icon name="attendance" size={12} />
                              Due {t.dueDate}{late ? " — late" : ""}
                            </div>
                          )}
                          {t.rating && (
                            <div className="footer-row">
                              <Badge value="rated" />
                              <strong>{t.rating.rating} / 5</strong>
                            </div>
                          )}
                          {(isMine && (t.status === "open" || t.status === "in_progress")) && (
                            <div className="footer-row">
                              {t.status === "open" && <button className="btn secondary" onClick={() => updateTaskStatus(t.id, "in_progress")}>Start</button>}
                              {t.status === "in_progress" && <button className="btn" onClick={() => updateTaskStatus(t.id, "done")}>Mark done</button>}
                            </div>
                          )}
                          {canRate && (
                            <div className="rate-row">
                              <select value={draft.rating} onChange={(e) => setRateDraft({ ...rateDraft, [t.id]: { ...draft, rating: e.target.value } })}>
                                <option value="">Rate...</option>
                                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                              </select>
                              <input
                                placeholder="Comment"
                                value={draft.comments}
                                onChange={(e) => setRateDraft({ ...rateDraft, [t.id]: { ...draft, comments: e.target.value } })}
                              />
                              <button className="btn secondary" disabled={!draft.rating} onClick={() => submitRating(t.id)}>Save</button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
