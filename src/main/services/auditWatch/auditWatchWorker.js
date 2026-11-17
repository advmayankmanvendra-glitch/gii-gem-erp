// Audit Watch worker thread: runs one Audit Watch run on its own read-only connection,
// so a long run never holds up the desktop app's main process (windows, menus and
// every other IPC call keep working). See auditWatchRunner.js.
//
// It says "started" once its code is loaded; only a worker that never got that far
// (for example a build that cannot load this file) may be replaced by an in-process run.

import { parentPort, workerData } from "node:worker_threads";
import Database from "better-sqlite3";

const { runAuditWatch } = await import("../../database/init.js");
// The code has loaded, so from here on a failure is an answer, not a reason to run
// again in the main process.
parentPort.postMessage({ started: true });
let db;
try {
  db = new Database(workerData.dbFile, { readonly: true, fileMustExist: true });
} catch (error) {
  parentPort.postMessage({ ok: false, error: `Audit Watch could not open the books read-only: ${error?.message || error}` });
  process.exit(0);
}
try {
  parentPort.postMessage({ ok: true, report: runAuditWatch(db, workerData.options) });
} catch (error) {
  parentPort.postMessage({ ok: false, error: String(error?.message || error) });
} finally {
  db.close();
}
