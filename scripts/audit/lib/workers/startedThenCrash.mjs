// Test worker: starts, then dies before answering (as a crash mid-run would).
import { parentPort } from "node:worker_threads";
parentPort.postMessage({ started: true });
process.exit(3);
