import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import type { Db } from "../db/client";
import {
  employees,
  leaveRequests,
  attendanceRecords,
  attendanceCorrectionRequests,
  payrollRuns,
  payslips,
  employeeBankDetails,
  employeePayrollDetails,
  exitRequests,
  kraCycles,
  kraGoals,
  kraRatings,
} from "../db/schema";
import { requireAuth, requirePermission } from "../middleware/auth";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireAuth);

function monthRange(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  return { from, to };
}

// Shared by both dashboards: goal coverage (the metric that actually determines whether KRAs get
// used) and rating stats, scoped to a given set of employee ids.
async function performanceSummary(db: Db, employeeIds: number[]) {
  const cycles = await db.select().from(kraCycles).all();
  const openCycle = cycles.find((c) => c.status === "open") ?? cycles.at(-1) ?? null;
  if (!openCycle || employeeIds.length === 0) {
    return { cycleName: openCycle?.name ?? null, goalCoveragePct: 0, employeesWithGoals: 0, avgFinalRating: null as number | null, membersWithoutGoals: [] as number[] };
  }

  const goals = await db.select().from(kraGoals).where(eq(kraGoals.cycleId, openCycle.id)).all();
  const relevantGoals = goals.filter((g) => employeeIds.includes(g.employeeId));
  const employeesWithGoalsSet = new Set(relevantGoals.map((g) => g.employeeId));
  const membersWithoutGoals = employeeIds.filter((id) => !employeesWithGoalsSet.has(id));

  const goalIds = relevantGoals.map((g) => g.id);
  const allRatings = goalIds.length > 0 ? await db.select().from(kraRatings).all() : [];
  const relevantRatings = allRatings.filter((r) => goalIds.includes(r.goalId) && r.finalRating !== null);
  const avgFinalRating = relevantRatings.length > 0 ? relevantRatings.reduce((s, r) => s + (r.finalRating ?? 0), 0) / relevantRatings.length : null;

  return {
    cycleName: openCycle.name,
    goalCoveragePct: Math.round((employeesWithGoalsSet.size / employeeIds.length) * 100),
    employeesWithGoals: employeesWithGoalsSet.size,
    avgFinalRating: avgFinalRating !== null ? Math.round(avgFinalRating * 10) / 10 : null,
    membersWithoutGoals,
  };
}

// Founder/HR — org-wide state: headcount, approvals backlog across every module, attendance trust
// (how much is genuinely auto-approved vs held for review), performance/goal-coverage, payroll health.
app.get("/overview", requirePermission("analytics.view_all"), async (c) => {
  const db = getDb(c.env.DB);

  const allEmployees = await db.select().from(employees).all();
  const activeEmployees = allEmployees.filter((e) => e.status === "active");
  const activeIds = activeEmployees.map((e) => e.id);
  const byType: Record<string, number> = {};
  for (const e of activeEmployees) byType[e.employeeType] = (byType[e.employeeType] ?? 0) + 1;

  const pendingLeave = await db.select().from(leaveRequests).where(eq(leaveRequests.status, "pending")).all();
  const allAttendance = await db.select().from(attendanceRecords).all();
  const pendingAttendanceExceptions = allAttendance.filter((r) => r.status === "pending_manager");
  const pendingCorrections = (await db.select().from(attendanceCorrectionRequests).all()).filter((r) => r.status === "pending");
  const runs = await db.select().from(payrollRuns).all();
  const allExits = await db.select().from(exitRequests).all();
  const pendingExits = allExits.filter((r) => r.status !== "settled" && r.status !== "cancelled");

  const now = new Date();
  const { from, to } = monthRange(now.getFullYear(), now.getMonth() + 1);
  const thisMonth = allAttendance.filter((r) => r.date >= from && r.date <= to);
  const attendanceHealth = {
    total: thisMonth.length,
    autoApproved: thisMonth.filter((r) => r.status === "auto_approved").length,
    approved: thisMonth.filter((r) => r.status === "approved").length,
    pendingManager: thisMonth.filter((r) => r.status === "pending_manager").length,
    rejected: thisMonth.filter((r) => r.status === "rejected").length,
  };

  const recentRuns = runs
    .sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year))
    .slice(-6);
  const payrollTrend = [];
  for (const run of recentRuns) {
    const runSlips = await db.select().from(payslips).where(eq(payslips.payrollRunId, run.id)).all();
    payrollTrend.push({
      month: run.month,
      year: run.year,
      status: run.status,
      totalNetPay: Math.round(runSlips.reduce((s, p) => s + p.netPay, 0) * 100) / 100,
      totalGross: Math.round(runSlips.reduce((s, p) => s + p.grossEarnings, 0) * 100) / 100,
    });
  }

  const bankDetails = await db.select().from(employeeBankDetails).all();
  const payrollDetails = await db.select().from(employeePayrollDetails).all();
  const withBank = new Set(bankDetails.map((b) => b.employeeId));
  const withPayrollDetails = new Set(payrollDetails.map((d) => d.employeeId));

  const performance = await performanceSummary(db, activeIds);

  return c.json({
    employees: { total: allEmployees.length, active: activeEmployees.length, exited: allEmployees.length - activeEmployees.length, byType },
    approvals: {
      pendingLeaveRequests: pendingLeave.length,
      pendingAttendanceExceptions: pendingAttendanceExceptions.length,
      pendingCorrectionRequests: pendingCorrections.length,
      pendingExits: pendingExits.length,
    },
    attendanceHealth,
    performance,
    payroll: {
      trend: payrollTrend,
      employeesMissingBankDetails: activeEmployees.filter((e) => !withBank.has(e.id)).length,
      employeesMissingPayrollDetails: activeEmployees.filter((e) => !withPayrollDetails.has(e.id)).length,
    },
    // kept for backwards compatibility with older clients
    pendingLeaveRequests: pendingLeave.length,
    pendingAttendanceExceptions: pendingAttendanceExceptions.length,
    payrollRuns: runs.map((r) => ({ id: r.id, month: r.month, year: r.year, status: r.status })),
    pendingExits: pendingExits.length,
  });
});

// Manager — same shape of questions as the executive overview, scoped to their own direct reports.
// Gated on attendance.view_team rather than a blanket analytics permission, since every manager
// already has that (and the equivalent team-scoped perms for the other sections).
app.get("/team-overview", requirePermission("attendance.view_team"), async (c) => {
  const session = c.get("session");
  const db = getDb(c.env.DB);

  const team = await db.select().from(employees).where(eq(employees.reportingManagerId, session.employeeId)).all();
  const teamIds = team.map((e) => e.id);
  const activeTeam = team.filter((e) => e.status === "active");
  const activeTeamIds = activeTeam.map((e) => e.id);

  const today = new Date().toISOString().slice(0, 10);
  const allAttendance = teamIds.length > 0 ? await db.select().from(attendanceRecords).all() : [];
  const todayRecords = allAttendance.filter((r) => teamIds.includes(r.employeeId) && r.date === today);
  const presentToday = todayRecords.filter((r) => r.punchInAt).length;

  const pendingLeave = teamIds.length > 0
    ? (await db.select().from(leaveRequests).where(eq(leaveRequests.status, "pending")).all()).filter((r) => teamIds.includes(r.employeeId))
    : [];
  const pendingExceptions = allAttendance.filter((r) => teamIds.includes(r.employeeId) && r.status === "pending_manager");

  const performance = await performanceSummary(db, activeTeamIds);
  const membersWithoutGoalNames = performance.membersWithoutGoals.map((id) => team.find((e) => e.id === id)?.fullName ?? String(id));

  let payroll = null;
  if (session.perms.includes("payroll.view_team")) {
    const runs = await db.select().from(payrollRuns).all();
    const latestRun = runs.sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year)).at(-1);
    if (latestRun) {
      const runSlips = (await db.select().from(payslips).where(eq(payslips.payrollRunId, latestRun.id)).all()).filter((p) => teamIds.includes(p.employeeId));
      payroll = {
        month: latestRun.month,
        year: latestRun.year,
        status: latestRun.status,
        teamNetPayTotal: Math.round(runSlips.reduce((s, p) => s + p.netPay, 0) * 100) / 100,
      };
    }
  }

  return c.json({
    team: { count: team.length, active: activeTeam.length, presentToday },
    approvals: { pendingLeaveRequests: pendingLeave.length, pendingAttendanceExceptions: pendingExceptions.length },
    performance: { ...performance, membersWithoutGoalNames },
    payroll,
  });
});

export default app;
