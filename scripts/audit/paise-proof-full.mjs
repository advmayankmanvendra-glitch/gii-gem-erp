// The full proof: all 2 lakh amounts (₹1,000.01 to ₹3,000.00 at 18% GST) are saved and
// posted as sales invoices through the app's real billing and posting code, in blocks of
// 5,000 on separate throwaway databases. Every block must have every voucher balanced
// to the paisa and a trial balance difference of exactly 0.00.
// Run from the repo root:  npm run proof:paise   (optionally: -- --out report.json)
import { fork } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { FIRST_MINOR, LAST_MINOR, checkBooks, openProofDatabase, postInvoices } from "./lib/paiseProof.mjs";

const BLOCK = 5000;

async function runBlock(from, to) {
  const proof = await openProofDatabase();
  try {
    const invoices = [];
    for (let minor = from; minor <= to; minor += 1) invoices.push({ items: [{ taxableMinor: minor, rate: 18 }] });
    const posting = postInvoices(proof, invoices);
    const books = checkBooks(proof);
    return { from, to, posted: posting.posted, vouchers: books.vouchers, trialBalance: books.trialBalance, problems: [...posting.problems, ...books.problems].slice(0, 20), problemCount: posting.problems.length + books.problems.length };
  } finally {
    proof.close();
  }
}

if (process.argv[2] === "--block") {
  const result = await runBlock(Number(process.argv[3]), Number(process.argv[4]));
  process.send(result);
  process.exit(0);
}

const outIndex = process.argv.indexOf("--out");
const out = outIndex > 0 ? process.argv[outIndex + 1] : null;
const blocks = [];
for (let from = FIRST_MINOR; from <= LAST_MINOR; from += BLOCK) blocks.push([from, Math.min(from + BLOCK - 1, LAST_MINOR)]);
const started = Date.now();
const results = [];
const parallel = Math.max(1, Math.min(4, os.cpus().length));
let next = 0;
await Promise.all(Array.from({ length: parallel }, async () => {
  while (next < blocks.length) {
    const [from, to] = blocks[next++];
    const result = await new Promise((resolve, reject) => {
      const child = fork(fileURLToPath(import.meta.url), ["--block", String(from), String(to)], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
      let message = null;
      child.on("message", (value) => { message = value; });
      child.on("error", reject);
      child.on("exit", (code) => (message ? resolve(message) : reject(new Error(`block ${from}-${to} exited with code ${code}`))));
    });
    results.push(result);
    console.log(`${(result.from / 100).toFixed(2)} to ${(result.to / 100).toFixed(2)}: ${result.posted} posted, trial balance difference ${result.trialBalance.difference.toFixed(2)}, ${result.problemCount} problem(s)`);
  }
}));
results.sort((a, b) => a.from - b.from);
const summary = {
  ranAt: new Date().toISOString(),
  amounts: LAST_MINOR - FIRST_MINOR + 1,
  posted: results.reduce((sum, row) => sum + row.posted, 0),
  vouchers: results.reduce((sum, row) => sum + row.vouchers, 0),
  trialBalanceDifference: results.reduce((sum, row) => sum + Math.round(row.trialBalance.difference * 100), 0) / 100,
  problems: results.reduce((sum, row) => sum + row.problemCount, 0),
  seconds: Math.round((Date.now() - started) / 1000),
  blocks: results
};
console.log(`\n${summary.posted} of ${summary.amounts} invoices posted, ${summary.vouchers} vouchers, trial balance difference ${summary.trialBalanceDifference.toFixed(2)}, ${summary.problems} problem(s), ${summary.seconds}s`);
if (out) fs.writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
process.exit(summary.problems === 0 && summary.posted === summary.amounts && summary.trialBalanceDifference === 0 ? 0 : 1);
