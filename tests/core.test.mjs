import test from "node:test";
import assert from "node:assert/strict";
import { stableJSON, splitCases, validateCases, gradeExact, validateGrade, summarize, compareResults, decideComparison } from "../eval-hillclimb/scripts/lib/core.mjs";

const makeCases = n => Array.from({ length: n }, (_, i) => ({ id: "c" + i, input: "question " + i, expected: "answer" }));
const row = (id, score, extra = {}) => ({ case_id: id, group_id: id, trial: 1, status: score === 1 ? "pass" : "fail", score, cost_usd: 1, latency_ms: 100, ...extra });

test("exact grader accepts structurally equivalent JSON and rejects wrong outcomes", () => {
  assert.equal(gradeExact({ a: 1, b: 2 }, { b: 2, a: 1 }).verdict, "pass");
  assert.equal(gradeExact("refund", { label: "refund" }, { output_path: "label" }).verdict, "pass");
  assert.equal(gradeExact("refund", { label: "account" }, { output_path: "label" }).verdict, "fail");
  assert.equal(gradeExact("refund", {}).verdict, "fail");
});
test("dataset validation rejects duplicates and missing labels", () => {
  assert.throws(() => validateCases([makeCases(1)[0], makeCases(1)[0]]), /duplicate/);
  assert.throws(() => validateCases([{ id: "x", input: "q" }]), /expected/);
});
test("seeded split is reproducible, complete and does not leak related groups", () => {
  const cases = makeCases(24).map((c, i) => ({ ...c, group_id: "group" + Math.floor(i / 2) }));
  const one = splitCases(cases, { seed: "fixed" });
  assert.deepEqual(one, splitCases([...cases].reverse(), { seed: "fixed" }));
  assert.equal(new Set(Object.values(one).flat().map(c => c.id)).size, cases.length);
  const seen = new Map();
  for (const [split, rows] of Object.entries(one)) for (const c of rows) {
    assert.equal(seen.get(c.group_id) || split, split);
    seen.set(c.group_id, split);
  }
  assert.ok(Object.values(one).every(rows => rows.length > 0));
});
test("split rejects impossible proportions and too few independent groups", () => {
  assert.throws(() => splitCases(makeCases(2)), /three/);
  assert.throws(() => splitCases(makeCases(6), { train: 0.8, validation: 0.3 }), /sum/);
});
test("repeats are averaged per case, not counted as extra independent tasks", () => {
  const rows = [row("a", 1), row("a", 1, { trial: 2 }), row("a", 1, { trial: 3 }), row("b", 0)];
  const summary = summarize(rows);
  assert.equal(summary.cases, 2);
  assert.equal(summary.trials, 4);
  assert.equal(summary.score, 0.5);
});
test("unknown costs stay unknown; unknown and infra grades count as zero", () => {
  const summary = summarize([row("a", 1), row("b", 0, { status: "unknown", cost_usd: null }), row("c", 0, { status: "infra_error" })]);
  assert.equal(summary.costs_complete, false);
  assert.equal(summary.mean_cost_usd, null);
  assert.equal(summary.unknown_count, 1);
  assert.equal(summary.infra_error_count, 1);
  assert.equal(summary.score, 1 / 3);
});
test("comparison rejects missing cases, duplicate trials, and mismatched repeats", () => {
  assert.throws(() => compareResults([row("a", 0)], [row("b", 1)]), /missing/);
  assert.throws(() => summarize([row("a", 1), row("a", 1)]), /duplicate/);
  assert.throws(() => compareResults([row("a", 0)], [row("a", 1), row("a", 1, { trial: 2 })]), /repeat/);
});
test("paired comparison detects a large deterministic improvement reproducibly", () => {
  const a = makeCases(20).map(c => row(c.id, 0)), b = makeCases(20).map(c => row(c.id, 1));
  const result = compareResults(a, b, { seed: 42 });
  assert.equal(result.improvement, 1);
  assert.deepEqual(result.interval, [1, 1]);
  assert.deepEqual(result, compareResults(a, b, { seed: 42 }));
});
test("nested bootstrap reflects repeat variability without inflating group count", () => {
  const a = [], b = [];
  for (let i = 0; i < 4; i++) for (let trial = 1; trial <= 4; trial++) {
    a.push(row("c" + i, 0, { trial }));
    b.push(row("c" + i, trial % 2, { trial }));
  }
  const result = compareResults(a, b, { seed: 42 });
  assert.equal(result.independent_groups, 4);
  assert.equal(result.improvement, 0.5);
  assert.ok(result.interval[0] < 0.5 && result.interval[1] > 0.5);
});
test("one independent group cannot establish a confidence interval", () => {
  const result = compareResults([row("a", 0)], [row("a", 1)]);
  assert.equal(result.interval, null);
});
test("cost gains are positive when cost falls; missing costs block cost comparison", () => {
  const a = [row("a", 1), row("b", 1)], b = [row("a", 1, { cost_usd: 0.5 }), row("b", 1, { cost_usd: 0.5 })];
  assert.equal(compareResults(a, b, { metric: "cost" }).improvement, 0.5);
  assert.throws(() => compareResults(a, [row("a", 1, { cost_usd: null }), b[1]], { metric: "cost" }), /reported costs/);
});
test("cost goal permits quality parity but rejects a credible quality regression", () => {
  const a = [row("a", 1), row("b", 1)], b = [row("a", 1, { cost_usd: 0.5 }), row("b", 1, { cost_usd: 0.5 })];
  const quality = compareResults(a, b), cost = compareResults(a, b, { metric: "cost" });
  assert.equal(decideComparison(quality, cost, { goal: "cost", min_effect: 0.1 }, summarize(a), summarize(b)).decision, "eligible-for-review");
  assert.equal(decideComparison({ ...quality, interval: [-0.2, -0.1] }, cost, { goal: "cost" }, summarize(a), summarize(b)).decision, "do-not-promote");
});
test("noise, unresolved grades and infrastructure problems block promotion", () => {
  const a = [row("a", 0), row("b", 0)], b = [row("a", 1), row("b", 1)], q = compareResults(a, b);
  assert.equal(decideComparison({ ...q, interval: [-0.1, 1] }, { ...q, interval: [-0.1, 1] }, {}, summarize(a), summarize(b)).decision, "do-not-promote");
  assert.equal(decideComparison(q, q, {}, summarize(a), { ...summarize(b), unknown_count: 1 }).decision, "do-not-promote");
  assert.equal(decideComparison(q, q, {}, summarize(a), { ...summarize(b), infra_error_count: 1 }).decision, "do-not-promote");
});
test("invalid judge grades cannot silently pass", () => {
  assert.throws(() => validateGrade({ verdict: "pass", score: 5, reason: "great" }), /<= 1/);
  assert.throws(() => validateGrade({ verdict: "unknown", score: 1, reason: "missing evidence" }), /score 0/);
  assert.throws(() => validateGrade({ verdict: "pass", score: 1, reason: "" }), /reason/);
});
