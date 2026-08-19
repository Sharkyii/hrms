import { Hono } from "hono";
import auth from "./routes/auth";
import employees from "./routes/employees";
import roles from "./routes/roles";
import attendance from "./routes/attendance";
import corrections from "./routes/corrections";
import leave from "./routes/leave";
import biometric from "./routes/biometric";
import payroll from "./routes/payroll";
import kra from "./routes/kra";
import assets from "./routes/assets";
import policies from "./routes/policies";
import queries from "./routes/queries";
import exit from "./routes/exit";
import analytics from "./routes/analytics";
import worklog from "./routes/worklog";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/auth", auth);
app.route("/api/employees", employees);
app.route("/api/roles", roles);
app.route("/api/corrections", corrections);
app.route("/api/attendance", attendance);
app.route("/api/leave", leave);
app.route("/api/biometric", biometric);
app.route("/api/payroll", payroll);
app.route("/api/kra", kra);
app.route("/api/assets", assets);
app.route("/api/policies", policies);
app.route("/api/queries", queries);
app.route("/api/exit", exit);
app.route("/api/analytics", analytics);
app.route("/api/worklog", worklog);

export default app;
