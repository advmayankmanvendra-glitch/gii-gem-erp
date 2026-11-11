// Proof, not review: amounts go through the app's real billing and posting code and the
// books must come out exact to the paisa. Runs with every `npm run test:integrity`.
// The full 2 lakh run is `npm run proof:paise`.
// Run from the repo root:  node --test scripts/audit/paise-proof.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AMOUNT_COUNT, FIRST_MINOR, LAST_MINOR, checkBooks, expectedMinor, openProofDatabase, postInvoices } from "./lib/paiseProof.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { invoiceLineAmounts } = await import(pathToFileURL(path.join(REPO, "src/main/domain/invoiceMath.js")).href);
const { paise } = await import(pathToFileURL(path.join(REPO, "src/main/domain/money.js")).href);

test("all 2 lakh invoice amounts work out to the exact paisa at every GST rate", () => {
  const wrong = [];
  for (const rate of [5, 12, 18, 28]) {
    for (let minor = FIRST_MINOR; minor <= LAST_MINOR; minor += 1) {
      const line = invoiceLineAmounts({ quantity: 1, billingRate: minor / 100, gstRate: rate });
      const want = expectedMinor(minor, rate);
      const got = { taxable: paise(line.taxable_value), gst: paise(line.gst_amount), gross: paise(line.gross_value) };
      if (got.taxable !== want.taxable || got.gst !== want.gst || got.gross !== want.gross
        || paise(line.cgst) + paise(line.sgst) !== got.gst || line.gross_value !== got.gross / 100) {
        wrong.push(`${(minor / 100).toFixed(2)}@${rate}%`);
      }
    }
  }
  assert.equal(AMOUNT_COUNT, 200000);
  assert.deepEqual(wrong.slice(0, 10), [], `${wrong.length} amount(s) off by a paisa`);
});

test("a spread of real invoices posts with every voucher balanced and the trial balance at exactly 0.00", async () => {
  const proof = await openProofDatabase();
  try {
    const invoices = [];
    // Every 100th amount across the range, every amount where GST lands exactly on half a
    // paisa in the first block, every amount plain floating point gets wrong, other GST
    // rates, IGST, and invoices with several lines.
    for (let minor = FIRST_MINOR; minor <= LAST_MINOR; minor += 100) invoices.push({ items: [{ taxableMinor: minor, rate: 18 }] });
    for (let minor = FIRST_MINOR; minor < FIRST_MINOR + 20000; minor += 1) {
      if ((minor * 18) % 100 === 50) invoices.push({ items: [{ taxableMinor: minor, rate: 18 }] });
    }
    // Every amount where plain floating-point arithmetic gets the GST wrong by a paisa.
    for (const rate of [5, 18]) {
      for (let minor = FIRST_MINOR; minor <= LAST_MINOR; minor += 1) {
        if (Math.round((minor / 100) * rate / 100 * 100) !== expectedMinor(minor, rate).gst) invoices.push({ items: [{ taxableMinor: minor, rate }] });
      }
    }
    for (const rate of [5, 12, 28]) for (let minor = 100025; minor < 101025; minor += 50) invoices.push({ items: [{ taxableMinor: minor, rate }] });
    for (let minor = 100025; minor < 100525; minor += 50) invoices.push({ items: [{ taxableMinor: minor, rate: 18, gstType: "IGST" }] });
    for (let minor = 100001; minor < 100201; minor += 7) {
      invoices.push({ items: [{ taxableMinor: minor, rate: 18 }, { taxableMinor: minor + 25, rate: 18 }, { taxableMinor: minor + 75, rate: 12 }] });
    }
    const { posted, problems } = postInvoices(proof, invoices);
    assert.deepEqual(problems.slice(0, 10), [], `${problems.length} invoice(s) did not post exactly`);
    assert.equal(posted, invoices.length);
    const books = checkBooks(proof);
    assert.deepEqual(books.problems, []);
    assert.equal(books.trialBalance.difference, 0);
    assert.ok(books.vouchers >= invoices.length);
  } finally {
    proof.close();
  }
});
