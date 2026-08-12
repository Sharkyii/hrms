import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge } from "../components/Badge";
import { useToast } from "../components/Toast";

interface JobPosting { id: number; title: string; department: string | null; status: string; openings: number }
interface Candidate { id: number; jobPostingId: number; name: string; email: string; stage: string }

const STAGES = ["applied", "screening", "interview", "offer", "hired", "rejected"];

export function Recruitment() {
  const toast = useToast();
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [postingForm, setPostingForm] = useState({ title: "", department: "", openings: "1" });
  const [candidateForm, setCandidateForm] = useState({ jobPostingId: "", name: "", email: "" });

  async function load() {
    setPostings(await api.get<JobPosting[]>("/recruitment/job-postings"));
    setCandidates(await api.get<Candidate[]>("/recruitment/candidates"));
  }
  useEffect(() => {
    load();
  }, []);

  async function createPosting() {
    await api.post("/recruitment/job-postings", { ...postingForm, openings: Number(postingForm.openings) });
    setPostingForm({ title: "", department: "", openings: "1" });
    toast.success("Job posting created.");
    await load();
  }

  async function createCandidate() {
    await api.post("/recruitment/candidates", { ...candidateForm, jobPostingId: Number(candidateForm.jobPostingId) });
    setCandidateForm({ jobPostingId: "", name: "", email: "" });
    toast.success("Candidate added.");
    await load();
  }

  async function setStage(id: number, stage: string) {
    await api.put(`/recruitment/candidates/${id}/stage`, { stage });
    toast.success("Stage updated.");
    await load();
  }

  const postingTitle = (id: number) => postings.find((p) => p.id === id)?.title ?? id;

  return (
    <div>
      <div className="page-header"><h1>Recruitment</h1></div>

      <div className="card">
        <h2>Job postings</h2>
        {postings.length === 0 ? (
          <p className="empty">No job postings yet.</p>
        ) : (
          <table>
            <thead><tr><th>Title</th><th>Department</th><th>Openings</th><th>Status</th></tr></thead>
            <tbody>{postings.map((p) => <tr key={p.id}><td>{p.title}</td><td>{p.department ?? "—"}</td><td>{p.openings}</td><td><Badge value={p.status} /></td></tr>)}</tbody>
          </table>
        )}
        <div className="form-row" style={{ marginTop: 12 }}>
          <div className="field"><label>Title</label><input value={postingForm.title} onChange={(e) => setPostingForm({ ...postingForm, title: e.target.value })} /></div>
          <div className="field"><label>Department</label><input value={postingForm.department} onChange={(e) => setPostingForm({ ...postingForm, department: e.target.value })} /></div>
          <div className="field"><label>Openings</label><input type="number" value={postingForm.openings} onChange={(e) => setPostingForm({ ...postingForm, openings: e.target.value })} /></div>
        </div>
        <button className="btn secondary" onClick={createPosting}>Create posting</button>
      </div>

      <div className="card">
        <h2>Candidates</h2>
        {candidates.length === 0 ? (
          <p className="empty">No candidates yet.</p>
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Posting</th><th>Stage</th></tr></thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id}>
                  <td>{c.name} <span className="muted">({c.email})</span></td>
                  <td>{postingTitle(c.jobPostingId)}</td>
                  <td>
                    <select value={c.stage} onChange={(e) => setStage(c.id, e.target.value)}>
                      {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="form-row" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Job posting</label>
            <select value={candidateForm.jobPostingId} onChange={(e) => setCandidateForm({ ...candidateForm, jobPostingId: e.target.value })}>
              <option value="">Select...</option>
              {postings.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div className="field"><label>Name</label><input value={candidateForm.name} onChange={(e) => setCandidateForm({ ...candidateForm, name: e.target.value })} /></div>
          <div className="field"><label>Email</label><input value={candidateForm.email} onChange={(e) => setCandidateForm({ ...candidateForm, email: e.target.value })} /></div>
        </div>
        <button className="btn secondary" onClick={createCandidate}>Add candidate</button>
      </div>
    </div>
  );
}
