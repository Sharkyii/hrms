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
import { parseBiometricWorkbook, computeRowHash, BiometricParseError } from "../lib/biometric-import";
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
  let rows, unmappedColumnCount, sourceFormat;
  try {
    ({ rows, unmappedColumnCount, sourceFormat } = await parseBiometricWorkbook(buffer));
  } catch (err) {
    if (err instanceof BiometricParseError) {
      return c.json(
        {
          error: `${err.message} Detected columns: ${err.detectedColumns.length ? err.detectedColumns.join(", ") : "(none — is this a valid .xlsx export?)"}`,
        },
        400,
      );
    }
    return c.json({ error: "Could not read this file as an Excel workbook (.xlsx)." }, 400);
  }

  const mappings = await db.select().from(biometricDeviceMappings).where(eq(biometricDeviceMappings.deviceId, device.id)).all();
  const mapByCode = new Map(mappings.map((m) => [m.deviceUserCode, m.employeeId]));

  // Auto-map fallbacks: an exact employee-code match, then an exact (case-insensitive) name match
  // against the name the device itself reported — vendor exports include both ID and Name.
  const allEmployees = await db.select().from(employees).all();
  const employeeByCode = new Map(allEmployees.map((e) => [e.employeeCode, e.id]));
  const employeeByName = new Map(allEmployees.map((e) => [e.fullName.trim().toLowerCase(), e.id]));

  const batch = await db
    .insert(biometricImportBatches)
    .values({ fileName: file.name, uploadedByUserId: session.sub, totalRows: rows.length })
    .returning()
    .get();

  // Check all hashes at once instead of per-row
  const rowHashes = rows.map((row) => computeRowHash(deviceCode, row));
  const existingHashes = new Set(
    (await db.select({ rowHash: biometricImportRows.rowHash }).from(biometricImportRows).where(inArray(biometricImportRows.rowHash, rowHashes)).all()).map((r) => r.rowHash),
  );

  const insertValues = [];
  let imported = 0;
  let duplicates = 0;
  let unknown = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowHash = rowHashes[i];
    const isDuplicate = existingHashes.has(rowHash);

    let resolvedEmployeeId =
      mapByCode.get(row.deviceUserCode) ??
      employeeByCode.get(row.deviceUserCode) ??
      (row.employeeName ? employeeByName.get(row.employeeName.trim().toLowerCase()) : undefined) ??
      null;
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

    insertValues.push({
      batchId: batch.id,
      rowHash,
      deviceCode,
      deviceUserCode: row.deviceUserCode,
      deviceEmployeeName: row.employeeName ?? null,
      punchDatetime: row.punchDatetime,
      inOut: row.inOut,
      resolvedEmployeeId,
      status,
    });
  }

  // Batch insert all rows at once
  if (insertValues.length > 0) {
    await db.insert(biometricImportRows).values(insertValues).run();
  }

  await db
    .update(biometricImportBatches)
    .set({ importedRows: imported, skippedDuplicateRows: duplicates, unknownIdRows: unknown })
    .where(eq(biometricImportBatches.id, batch.id))
    .run();

  const previewRows = await db.select().from(biometricImportRows).where(eq(biometricImportRows.batchId, batch.id)).all();
  return c.json({
    batchId: batch.id,
    sourceFormat,
    unmappedColumnCount,
    summary: { total: rows.length, ready: imported, duplicates, unknown },
    rows: previewRows,
  });
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
