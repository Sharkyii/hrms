import { Hono } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  biometricDevices,
  biometricDeviceMappings,
  biometricImportBatches,
  biometricImportRows,
  attendanceRecords,
  employees,
} from "../db/schema";
import { parseBiometricWorkbook, computeRowHash } from "../lib/biometric-import";
import { requireAuth, requirePermission } from "../middleware/auth";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireAuth);
app.use("*", requirePermission("biometric.import"));

app.get("/devices", async (c) => {
  const db = getDb(c.env.DB);
  return c.json(await db.select().from(biometricDevices).all());
});

app.post("/devices", async (c) => {
  const body = await c.req.json<{ deviceCode?: string; location?: string }>();
  if (!body.deviceCode) return c.json({ error: "deviceCode is required" }, 400);
  const db = getDb(c.env.DB);
  const created = await db.insert(biometricDevices).values({ deviceCode: body.deviceCode, location: body.location ?? null }).returning().get();
  return c.json(created, 201);
});

// Upload -> auto-map -> validate -> preview (steps from doc section 3). Import happens in a separate
// /confirm call once HR has reviewed the preview and fixed any unknown IDs.
app.post("/import/preview", async (c) => {
  const session = c.get("session");
  const form = await c.req.formData();
  const deviceCode = String(form.get("deviceCode") ?? "");
  const file = form.get("file");
  if (!deviceCode) return c.json({ error: "deviceCode is required" }, 400);
  if (!(file instanceof File)) return c.json({ error: "file is required" }, 400);

  const db = getDb(c.env.DB);
  const device = await db.select().from(biometricDevices).where(eq(biometricDevices.deviceCode, deviceCode)).get();
  if (!device) return c.json({ error: `Unknown device code '${deviceCode}' — register the device first` }, 400);

  const buffer = await file.arrayBuffer();
  const { rows, unmappedColumnCount } = await parseBiometricWorkbook(buffer);
  if (rows.length === 0) {
    return c.json({ error: "No punch rows found — check the file has User ID, Timestamp, and In/Out columns" }, 400);
  }

  const mappings = await db.select().from(biometricDeviceMappings).where(eq(biometricDeviceMappings.deviceId, device.id)).all();
  const mapByCode = new Map(mappings.map((m) => [m.deviceUserCode, m.employeeId]));

  // Auto-map fallback: if a device user code matches an employee code exactly, use it (and it gets saved below).
  const allEmployees = await db.select().from(employees).all();
  const employeeByCode = new Map(allEmployees.map((e) => [e.employeeCode, e.id]));

  const batch = await db
    .insert(biometricImportBatches)
    .values({ fileName: file.name, uploadedByUserId: session.sub, totalRows: rows.length })
    .returning()
    .get();

  let imported = 0;
  let duplicates = 0;
  let unknown = 0;

  for (const row of rows) {
    const rowHash = computeRowHash(deviceCode, row);
    const isDuplicate = await db.select().from(biometricImportRows).where(eq(biometricImportRows.rowHash, rowHash)).get();

    let resolvedEmployeeId = mapByCode.get(row.deviceUserCode) ?? employeeByCode.get(row.deviceUserCode) ?? null;
    let status: "ready" | "duplicate" | "unknown_id";
    if (isDuplicate) {
      status = "duplicate";
      duplicates++;
    } else if (!resolvedEmployeeId) {
      status = "unknown_id";
      unknown++;
    } else {
      status = "ready";
      imported++;
    }

    await db.insert(biometricImportRows).values({
      batchId: batch.id,
      rowHash,
      deviceCode,
      deviceUserCode: row.deviceUserCode,
      punchDatetime: row.punchDatetime,
      inOut: row.inOut,
      resolvedEmployeeId,
      status,
    }).run();
  }

  await db
    .update(biometricImportBatches)
    .set({ importedRows: imported, skippedDuplicateRows: duplicates, unknownIdRows: unknown })
    .where(eq(biometricImportBatches.id, batch.id))
    .run();

  const previewRows = await db.select().from(biometricImportRows).where(eq(biometricImportRows.batchId, batch.id)).all();
  return c.json({ batchId: batch.id, unmappedColumnCount, summary: { total: rows.length, ready: imported, duplicates, unknown }, rows: previewRows });
});

// HR resolves an unknown device user code to an employee; saved so future files auto-map it.
app.post("/import/:batchId/map", async (c) => {
  const batchId = Number(c.req.param("batchId"));
  const body = await c.req.json<{ deviceUserCode?: string; employeeId?: number }>();
  if (!body.deviceUserCode || !body.employeeId) return c.json({ error: "deviceUserCode and employeeId are required" }, 400);

  const db = getDb(c.env.DB);
  const batchRows = await db.select().from(biometricImportRows).where(eq(biometricImportRows.batchId, batchId)).all();
  const sample = batchRows.find((r) => r.deviceUserCode === body.deviceUserCode);
  if (!sample) return c.json({ error: "No such device user code in this batch" }, 404);

  const device = await db.select().from(biometricDevices).where(eq(biometricDevices.deviceCode, sample.deviceCode)).get();
  if (device) {
    const existingMapping = await db
      .select()
      .from(biometricDeviceMappings)
      .where(and(eq(biometricDeviceMappings.deviceId, device.id), eq(biometricDeviceMappings.deviceUserCode, body.deviceUserCode)))
      .get();
    if (existingMapping) {
      await db.update(biometricDeviceMappings).set({ employeeId: body.employeeId }).where(eq(biometricDeviceMappings.id, existingMapping.id)).run();
    } else {
      await db.insert(biometricDeviceMappings).values({ deviceId: device.id, deviceUserCode: body.deviceUserCode, employeeId: body.employeeId }).run();
    }
  }

  await db
    .update(biometricImportRows)
    .set({ resolvedEmployeeId: body.employeeId, status: "ready" })
    .where(and(eq(biometricImportRows.batchId, batchId), eq(biometricImportRows.deviceUserCode, body.deviceUserCode), eq(biometricImportRows.status, "unknown_id")))
    .run();

  return c.json({ ok: true });
});

// Import: turns 'ready' rows into attendance records (paired in/out per employee per day) and locks the batch.
app.post("/import/:batchId/confirm", async (c) => {
  const batchId = Number(c.req.param("batchId"));
  const db = getDb(c.env.DB);

  const batch = await db.select().from(biometricImportBatches).where(eq(biometricImportBatches.id, batchId)).get();
  if (!batch) return c.json({ error: "Not found" }, 404);
  if (batch.status === "imported") return c.json({ error: "Batch already imported" }, 409);

  const readyRows = await db.select().from(biometricImportRows).where(and(eq(biometricImportRows.batchId, batchId), eq(biometricImportRows.status, "ready"))).all();

  const byEmployeeDate = new Map<string, { employeeId: number; date: string; earliestIn?: string; latestOut?: string }>();
  for (const row of readyRows) {
    if (!row.resolvedEmployeeId) continue;
    const date = row.punchDatetime.slice(0, 10);
    const key = `${row.resolvedEmployeeId}|${date}`;
    const entry = byEmployeeDate.get(key) ?? { employeeId: row.resolvedEmployeeId, date };
    if (row.inOut === "in" && (!entry.earliestIn || row.punchDatetime < entry.earliestIn)) entry.earliestIn = row.punchDatetime;
    if (row.inOut === "out" && (!entry.latestOut || row.punchDatetime > entry.latestOut)) entry.latestOut = row.punchDatetime;
    byEmployeeDate.set(key, entry);
  }

  let recordsWritten = 0;
  for (const entry of byEmployeeDate.values()) {
    const existing = await db
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.employeeId, entry.employeeId), eq(attendanceRecords.date, entry.date)))
      .get();

    if (existing) {
      await db
        .update(attendanceRecords)
        .set({
          punchInAt: entry.earliestIn ?? existing.punchInAt,
          punchOutAt: entry.latestOut ?? existing.punchOutAt,
          method: "biometric",
          confidence: "high",
          status: "auto_approved",
          sourceBatchId: batchId,
          flagReason: null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(attendanceRecords.id, existing.id))
        .run();
    } else {
      await db.insert(attendanceRecords).values({
        employeeId: entry.employeeId,
        date: entry.date,
        punchInAt: entry.earliestIn ?? null,
        punchOutAt: entry.latestOut ?? null,
        method: "biometric",
        confidence: "high",
        status: "auto_approved",
        sourceBatchId: batchId,
      }).run();
    }
    recordsWritten++;
  }

  const rowIds = readyRows.map((r) => r.id);
  if (rowIds.length > 0) {
    await db.update(biometricImportRows).set({ status: "imported" }).where(inArray(biometricImportRows.id, rowIds)).run();
  }
  await db.update(biometricImportBatches).set({ status: "imported" }).where(eq(biometricImportBatches.id, batchId)).run();

  return c.json({ batchId, attendanceRecordsWritten: recordsWritten });
});

app.get("/import/batches", async (c) => {
  const db = getDb(c.env.DB);
  return c.json(await db.select().from(biometricImportBatches).all());
});

export default app;
