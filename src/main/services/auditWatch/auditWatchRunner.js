// Runs Audit Watch for the desktop app without blocking the main process.
//
// Each run starts a worker thread (auditWatchWorker.js) with its own read-only
// connection. The database is in WAL mode, so the worker reads a consistent snapshot
// while the app keeps writing. If a worker cannot be started at all (for example a
// packaged build that cannot load the worker file), the run falls back to the same
// code in-process, still on a read-only connection, and the report says which engine
// ran. A run that goes past the time limit is stopped with a plain message, and only
// one run may be in progress at a time.

import { Worker } from "node:worker_threads";

export const AUDIT_WATCH_TIME_LIMIT_MS = 120000;

export function createAuditWatchRunner({ runInProcess, workerUrl = new URL("./auditWatchWorker.js", import.meta.url), timeLimitMs = AUDIT_WATCH_TIME_LIMIT_MS, useWorker = true } = {}) {
  let running = false;

  function inWorker(dbFile, options) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let worker;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };
      const timer = setTimeout(() => {
        worker?.terminate();
        finish(reject, new Error(`Audit Watch stopped after ${Math.round(timeLimitMs / 1000)} seconds. Choose a shorter period or one area, then run it again.`));
      }, timeLimitMs);
      try {
        worker = new Worker(workerUrl, { workerData: { dbFile, options } });
      } catch (error) {
        finish(reject, Object.assign(error, { workerUnavailable: true }));
        return;
      }
      worker.once("message", (message) => {
        if (message?.ok) finish(resolve, { ...message.report, engine: "worker" });
        else finish(reject, new Error(message?.error || "Audit Watch could not run"));
      });
      // An error before any message means the worker itself could not start or load.
      worker.once("error", (error) => finish(reject, Object.assign(error, { workerUnavailable: true })));
      worker.once("exit", (code) => finish(reject, Object.assign(new Error(`Audit Watch worker stopped (code ${code})`), { workerUnavailable: true })));
    });
  }

  async function run(dbFile, options) {
    if (running) throw new Error("Audit Watch is already running. Wait for that run to finish, then try again.");
    running = true;
    try {
      if (useWorker && dbFile) {
        try {
          return await inWorker(dbFile, options);
        } catch (error) {
          if (!error?.workerUnavailable) throw error;
        }
      }
      return { ...runInProcess(options), engine: "in-process" };
    } finally {
      running = false;
    }
  }

  return { run, isRunning: () => running };
}
