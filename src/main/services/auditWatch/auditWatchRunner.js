// Runs Audit Watch for the desktop app without blocking the main process.
//
// Each run starts a worker thread (auditWatchWorker.js) with its own read-only
// connection. The database is in WAL mode, so the worker reads a consistent snapshot
// while the app keeps writing.
//
// Rules:
//   - One run at a time in the whole process. The lock is held until the worker has actually exited, not
//     just until the caller gets an answer: a stopped worker can still be inside one
//     SQLite statement, and a second run (or a restore) must not start beside it.
//   - The worker says "started" once it has loaded its code.
//     Only a worker that never started (for example a packaged build that cannot load
//     the worker file) falls back to running in-process, still read-only; the fallback
//     is logged and the report says which engine ran. A worker that started and then
//     failed, ran out of memory or went past the time limit gives a plain error and is
//     never re-run on the main thread.
//   - The worker's memory is capped (resourceLimits), so a very large run fails on its
//     own instead of taking the app down.

import { Worker } from "node:worker_threads";

export const AUDIT_WATCH_TIME_LIMIT_MS = 120000;
export const AUDIT_WATCH_MEMORY_LIMIT_MB = 1024;

// The lock is shared by every runner in the process, so a second runner (for example a
// scheduled run added later) can never run beside the first, and restore and reset,
// which ask any runner, always see a run that is in progress.
let running = false;

export function createAuditWatchRunner({
  runInProcess,
  workerUrl = new URL("./auditWatchWorker.js", import.meta.url),
  timeLimitMs = AUDIT_WATCH_TIME_LIMIT_MS,
  memoryLimitMb = AUDIT_WATCH_MEMORY_LIMIT_MB,
  useWorker = true,
  log = (message) => console.warn(message)
} = {}) {

  // Returns { result, exited }: result settles with the report or an error; exited
  // settles once the worker thread is gone.
  function startWorker(dbFile, options) {
    let worker;
    try {
      worker = new Worker(workerUrl, { workerData: { dbFile, options }, resourceLimits: { maxOldGenerationSizeMb: memoryLimitMb } });
    } catch (error) {
      return { result: Promise.reject(Object.assign(error, { workerUnavailable: true })), exited: Promise.resolve() };
    }
    const exited = new Promise((resolve) => worker.once("exit", resolve));
    const result = new Promise((resolve, reject) => {
      let started = false;
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };
      const timer = setTimeout(() => {
        worker.terminate();
        finish(reject, new Error(`Audit Watch stopped after ${Math.round(timeLimitMs / 1000)} seconds. Choose a shorter period or one area, then run it again.`));
      }, timeLimitMs);
      worker.on("message", (message) => {
        if (message?.started) { started = true; return; }
        if (message?.ok) finish(resolve, { ...message.report, engine: "worker" });
        else finish(reject, new Error(message?.error || "Audit Watch could not run"));
        // The answer is in; make sure the thread goes, so the lock is always released.
        worker.terminate();
      });
      const failed = (error) => {
        if (!started) return finish(reject, Object.assign(error, { workerUnavailable: true }));
        const outOfMemory = error?.code === "ERR_WORKER_OUT_OF_MEMORY";
        return finish(reject, new Error(outOfMemory
          ? "Audit Watch needed more memory than it is allowed and stopped. Choose a shorter period or one area, then run it again."
          : `Audit Watch stopped unexpectedly: ${error?.message || error}`));
      };
      worker.once("error", failed);
      worker.once("exit", (code) => failed(new Error(`the worker ended (code ${code})`)));
    });
    return { result, exited };
  }

  async function run(dbFile, options) {
    if (running) throw new Error("Audit Watch is already running. Wait for that run to finish, then try again.");
    running = true;
    let exited = Promise.resolve();
    try {
      if (useWorker && dbFile) {
        const started = startWorker(dbFile, options);
        exited = started.exited;
        try {
          const report = await started.result;
          await exited; // the worker ends right after it answers
          return report;
        } catch (error) {
          if (!error?.workerUnavailable) throw error;
          log(`Audit Watch: the worker thread could not start (${error?.message || error}); running in the main process, read-only.`);
        }
      }
      await exited;
      return { ...runInProcess(options), engine: "in-process" };
    } finally {
      // Keep the lock until the worker thread has really gone.
      exited.then(() => { running = false; }, () => { running = false; });
    }
  }

  return { run, isRunning: () => running };
}
