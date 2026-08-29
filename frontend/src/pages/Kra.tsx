import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { api } from "../api";
import { Badge } from "../components/Badge";
import { Icon } from "../components/Icon";
import { ProgressBar } from "../components/Charts";
import { useToast } from "../components/Toast";
import { initials } from "../initials";
import type { Employee } from "../auth";

interface Cycle { id: number; name: string; startDate: string; endDate: string; status: string }
interface Goal { id: number; employeeId: number; title: string; weightPct: number; target: string | null }
interface KraScore { score: number | null; weightRatedPct: number; category: string | null }
type TargetUnit = "count" | "percent" | "currency_band";
interface KpiGoal {
  id: number;
  title: string;
  weightPct: number;
  targetValue: number | null;
  achievedValue: number | null;
  targetUnit: TargetUnit | null;
  bandPct: number | null;
  scorePct: number | null;
}
interface KpiScoreResult { goals: KpiGoal[]; overallScorePct: number | null; weightScoredPct: number }

function unitLabel(unit: TargetUnit | null, bandPct: number | null): string {
  if (unit === "percent") return "%";
  if (unit === "currency_band") return bandPct ? `± ${bandPct}%` : "±%";
  return "";
}
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
  const [kpiScore, setKpiScore] = useState<KpiScoreResult | null>(null);
  const [kpiViewEmployeeId, setKpiViewEmployeeId] = useState<string>("");
  const [achievedDraft, setAchievedDraft] = useState<Record<number, string>>({});
  const [showTargetFields, setShowTargetFields] = useState(false);
  const [targetFields, setTargetFields] = useState({ targetValue: "", targetUnit: "count" as TargetUnit, bandPct: "" });

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

  const kpiViewId = kpiViewEmployeeId ? Number(kpiViewEmployeeId) : employee?.id;
  useEffect(() => {
    if (!kpiViewId) return;
    api.get<KpiScoreResult>(`/kra/kpi-score?employeeId=${kpiViewId}`).then(setKpiScore);
  }, [kpiViewId, cycles.length]);

  async function createCycle() {
    await api.post("/kra/cycles", cycleForm);
    setCycleForm({ name: "", startDate: "", endDate: "" });
    toast.success("Cycle created.");
    await load();
  }

  async function createGoal() {
    await api.post("/kra/goals", {
      ...goalForm,
      employeeId: Number(goalForm.employeeId),
      cycleId: Number(goalForm.cycleId),
      weightPct: Number(goalForm.weightPct),
      targetValue: showTargetFields && targetFields.targetValue ? Number(targetFields.targetValue) : undefined,
      targetUnit: showTargetFields ? targetFields.targetUnit : undefined,
      bandPct: showTargetFields && targetFields.targetUnit === "currency_band" && targetFields.bandPct ? Number(targetFields.bandPct) : undefined,
    });
    const goalEmployeeId = Number(goalForm.employeeId);
    setGoalForm({ employeeId: "", cycleId: "", title: "", weightPct: "" });
    setTargetFields({ targetValue: "", targetUnit: "count", bandPct: "" });
    setShowTargetFields(false);
    toast.success("Goal added.");
    await load();
    if (goalEmployeeId === kpiViewId) setKpiScore(await api.get<KpiScoreResult>(`/kra/kpi-score?employeeId=${kpiViewId}`));
  }

  async function saveAchieved(goalId: number) {
    const value = achievedDraft[goalId];
    if (value === undefined || value === "") return;
    await api.put(`/kra/goals/${goalId}/achieved`, { achievedValue: Number(value) });
    toast.success("Achieved value saved.");
    if (kpiViewId) setKpiScore(await api.get<KpiScoreResult>(`/kra/kpi-score?employeeId=${kpiViewId}`));
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
      <div className="page-header"><h1>Performance</h1></div>

      {can("kra.view_all") && (
        <div className="card">
          <h2>Cycles</h2>
          <table>
            <thead><tr><th>Name</th><th>Start</th><th>End</th><th>Status</th></tr></thead>
            <tbody>{cycles.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.startDate}</td><td>{c.endDate}</td><td><Badge value={c.status} /></td></tr>)}</tbody>
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
          <label className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <input type="checkbox" checked={showTargetFields} onChange={(e) => setShowTargetFields(e.target.checked)} />
            Track as Target / Achieved KPI (auto-computed score, instead of a 1-5 rating)
          </label>
          {showTargetFields && (
            <div className="form-row">
              <div className="field">
                <label>Target type</label>
                <select value={targetFields.targetUnit} onChange={(e) => setTargetFields({ ...targetFields, targetUnit: e.target.value as TargetUnit })}>
                  <option value="count">Count (e.g. collaborations per month)</option>
                  <option value="percent">Percent (e.g. % on time)</option>
                  <option value="currency_band">Budget adherence (± band %)</option>
                </select>
              </div>
              <div className="field">
                <label>{targetFields.targetUnit === "currency_band" ? "Target amount" : "Target value"}</label>
                <input type="number" value={targetFields.targetValue} onChange={(e) => setTargetFields({ ...targetFields, targetValue: e.target.value })} />
              </div>
              {targetFields.targetUnit === "currency_band" && (
                <div className="field"><label>Tolerance band %</label><input type="number" value={targetFields.bandPct} onChange={(e) => setTargetFields({ ...targetFields, bandPct: e.target.value })} placeholder="e.g. 5" /></div>
              )}
            </div>
          )}
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

      <div className="card">
        <h2>KPI Scorecard</h2>
        {canManageTeam && employees.length > 0 && (
          <div className="field" style={{ maxWidth: 280, marginBottom: 12 }}>
            <label>Employee</label>
            <select value={kpiViewEmployeeId} onChange={(e) => setKpiViewEmployeeId(e.target.value)}>
              <option value="">Me ({employee?.fullName})</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </select>
          </div>
        )}
        {!kpiScore || kpiScore.goals.length === 0 ? (
          <p className="empty">No target-based KPIs set for this cycle yet. Add one above with "Track as Target / Achieved KPI" checked.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Sr.</th><th>KPI</th><th>Weight %</th><th>Target</th><th>Achieved</th><th>Score %</th></tr></thead>
                <tbody>
                  {kpiScore.goals.map((g, i) => (
                    <tr key={g.id}>
                      <td>{i + 1}</td>
                      <td>{g.title}</td>
                      <td>{g.weightPct}%</td>
                      <td>{g.targetValue !== null ? `${g.targetValue}${unitLabel(g.targetUnit, g.bandPct)}` : "—"}</td>
                      <td>
                        {canManageTeam ? (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <input
                              type="number"
                              style={{ width: 80 }}
                              placeholder={g.achievedValue !== null ? String(g.achievedValue) : "—"}
                              value={achievedDraft[g.id] ?? ""}
                              onChange={(e) => setAchievedDraft({ ...achievedDraft, [g.id]: e.target.value })}
                            />
                            <button className="btn secondary" style={{ padding: "2px 8px" }} onClick={() => saveAchieved(g.id)}>Save</button>
                          </div>
                        ) : (
                          g.achievedValue !== null ? `${g.achievedValue}${unitLabel(g.targetUnit, null)}` : "—"
                        )}
                      </td>
                      <td>{g.scorePct !== null ? <ProgressBar pct={g.scorePct} /> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="stat-grid" style={{ marginTop: 16 }}>
              <div className="stat"><div className="value">{kpiScore.overallScorePct !== null ? `${kpiScore.overallScorePct.toFixed(1)}%` : "—"}</div><div className="label">Overall score</div></div>
              <div className="stat"><div className="value">{kpiScore.weightScoredPct}%</div><div className="label">Of cycle weight scored</div></div>
            </div>
          </>
        )}
      </div>

      {canManageTeam && (
        <div className="card">
          <h2>Team Performance Scores</h2>
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
                        <td>
                          {s.score !== null ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <strong>{s.score.toFixed(2)} / 5</strong>
                              <ProgressBar pct={s.weightRatedPct} tone="accent" width={56} />
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
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
