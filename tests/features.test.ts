import { test } from "node:test";
import assert from "node:assert/strict";
import { embed, cosine } from "../src/lib/features";
const t = {
  spend: [800, 3900],
  damage: [100, 250],
  kills: [{ x: 0.2, y: 0.8, seconds: 35, weapon: "Vandal" }],
  agents: ["Jett", "Omen"],
};
test("embeddings are deterministic finite 128-dimensional unit vectors", () => {
  const a = embed(t);
  assert.equal(a.length, 128);
  assert.ok(a.every(Number.isFinite));
  assert.ok(Math.abs(Math.hypot(...a) - 1) < 1e-10);
  assert.deepEqual(a, embed(t));
  assert.ok(Math.abs(cosine(a, a) - 1) < 1e-10);
});
test("different economies, compositions and locations change similarity", () => {
  const a = embed(t),
    b = embed({
      ...t,
      spend: [9000, 9000],
      agents: ["Cypher", "Raze"],
      kills: [{ x: 1, y: 0, seconds: 120, weapon: "Operator" }],
    });
  assert.ok(cosine(a, b) < 0.95);
});
test("missing coordinates are excluded without treating them as origin kills", () => {
  const a = embed({
    ...t,
    kills: [{ x: null, y: null, seconds: 35, weapon: "Vandal" }],
  });
  assert.equal(
    a.slice(16, 80).reduce((n, x) => n + x, 0),
    0,
  );
});
test("empty telemetry still produces a nonzero feature vector", () => {
  assert.equal(embed({ spend: [], damage: [], kills: [], agents: [] })[0], 1);
  assert.throws(() => cosine([0], [0]));
  assert.throws(() => cosine([NaN], [1]));
});
