// Punches queue on the device and sync when the network returns (doc section 2's offline requirement),
// implemented as a plain IndexedDB queue rather than the Background Sync API since that API isn't
// supported in every browser (notably Safari) — a simple online-event flush works everywhere.

const DB_NAME = "hrms-offline";
const STORE = "pending-punches";

interface QueuedPunch {
  id?: number;
  type: "in" | "out";
  latitude?: number;
  longitude?: number;
  queuedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queuePunch(punch: Omit<QueuedPunch, "id" | "queuedAt">): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({ ...punch, queuedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueuedPunches(): Promise<QueuedPunch[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueuedPunch[]);
    req.onerror = () => reject(req.error);
  });
}

async function removeQueuedPunch(id: number): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Attempts to resend every queued punch. Call on mount and on the browser's 'online' event.
export async function flushQueuedPunches(send: (punch: Omit<QueuedPunch, "id" | "queuedAt">) => Promise<void>): Promise<number> {
  const pending = await getQueuedPunches();
  let sent = 0;
  for (const punch of pending) {
    try {
      await send(punch);
      if (punch.id !== undefined) await removeQueuedPunch(punch.id);
      sent++;
    } catch {
      break; // still offline or server rejected — stop and retry later
    }
  }
  return sent;
}
