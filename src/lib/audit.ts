import type { Db } from "../db/client";
import { accessAuditLog, correctionAuditLog } from "../db/schema";

export async function recordAccessChange(
  db: Db,
  params: { actorUserId: number; targetUserId: number; fieldChanged: string; oldValue: string | null; newValue: string; reason?: string },
) {
  await db.insert(accessAuditLog).values({
    actorUserId: params.actorUserId,
    targetUserId: params.targetUserId,
    fieldChanged: params.fieldChanged,
    oldValue: params.oldValue,
    newValue: params.newValue,
    reason: params.reason ?? null,
  }).run();
}

export async function recordCorrection(
  db: Db,
  params: {
    entityType: string;
    entityId: number;
    actorUserId: number;
    fieldChanged: string;
    oldValue: string | null;
    newValue: string;
    reason?: string;
  },
) {
  await db.insert(correctionAuditLog).values({
    entityType: params.entityType,
    entityId: params.entityId,
    actorUserId: params.actorUserId,
    fieldChanged: params.fieldChanged,
    oldValue: params.oldValue,
    newValue: params.newValue,
    reason: params.reason ?? null,
  }).run();
}
