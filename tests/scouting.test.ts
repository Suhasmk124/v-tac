import { test } from "node:test";
import assert from "node:assert/strict";
import { wilson, csvCell } from "../src/lib/scouting";
test("Wilson intervals expose uncertainty for tiny samples and zero/all wins", () => {
  assert.deepEqual(wilson(0, 0), { lower: 0, upper: 1 });
  const one = wilson(1, 1);
  assert.ok(one.lower < 0.21 && one.upper > 0.99);
  assert.equal(wilson(0, 10).lower, 0);
  const many = wilson(50, 100),
    few = wilson(5, 10);
  assert.ok(many.upper - many.lower < few.upper - few.lower);
  assert.ok(Math.abs(many.lower - (1 - many.upper)) < 1e-10);
});
test("CSV export escapes formulas, quotes and line breaks without losing fields", () => {
  assert.equal(csvCell("=SUM(A1:A2)"), `"'=SUM(A1:A2)"`);
  assert.equal(csvCell(" @name"), `"' @name"`);
  assert.equal(csvCell('a"b\nc'), '"a""b\nc"');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell("Fnatic"), '"Fnatic"');
});
