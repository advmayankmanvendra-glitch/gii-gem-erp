// Test worker: starts, then stays busy in one synchronous step (as a long SQLite
// statement would) for longer than the runner's time limit.
import { parentPort, workerData } from "node:worker_threads";
parentPort.postMessage({ started: true });
const until = Date.now() + (workerData?.options?.busyMs ?? 400);
while (Date.now() < until) { /* busy */ }
parentPort.postMessage({ ok: true, report: { results: [] } });
