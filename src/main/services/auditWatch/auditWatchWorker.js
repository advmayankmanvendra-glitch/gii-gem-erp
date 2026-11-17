// Audit Watch worker thread: runs one Audit Watch run on its own read-only connection,
// so a long run never holds up the desktop app's main process (windows, menus and
// every other IPC call keep working). See auditWatchRunner.js.
//
// It says "started" once its code is loaded and the database is open; only a worker
// that never got that far may be replaced by an in-process run.

import { parentPort, workerData } from "node:worker_threads";
import Database from "better-sqlite3";

const { runAuditWatch } = await import("../../database/init.js");
let db;
try {
  db = new Database(workerData.dbFile, { readonly: true, fileMustExist: true });
} catch (error) {
  throw new Error(`could not open the books read-only: ${error?.message || error}`);
}
parentPort.postMessage({ started: true });
try {
  parentPort.postMessage({ ok: true, report: runAuditWatch(db, workerData.options) });
} catch (error) {
  parentPort.postMessage({ ok: false, error: String(error?.message || error) });
} finally {
  db.close();
}
