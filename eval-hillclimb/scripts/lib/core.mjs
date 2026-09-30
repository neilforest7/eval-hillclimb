// Pure evaluation logic. No filesystem, subprocess, or provider dependency.
export function invariant(condition, message) {
  if (!condition) throw new Error(message);
}
export function finite(value, name, minimum = 0) {
  invariant(typeof value === "number" && Number.isFinite(value) && value >= minimum, name + " must be a finite number >= " + minimum);
  return value;
}
export function stableJSON(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableJSON).join(",") + "]";
  return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stableJSON(value[key])).join(",") + "}";
}
export function seededRandom(seed = 1) {
  let state = 2166136261;
  for (const c of String(seed)) state = Math.imul(state ^ c.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function validateCases(cases) {
  invariant(Array.isArray(cases) && cases.length > 0, "cases must be a non-empty array");
  const ids = new Set();
  for (const item of cases) {
    invariant(item && typeof item.id === "string" && item.id.trim(), "each case needs a non-empty string id");
    invariant(!ids.has(item.id), "duplicate case id: " + item.id);
    invariant(Object.hasOwn(item, "input"), "case missing input: " + item.id);
    invariant(Object.hasOwn(item, "expected"), "case missing expected: " + item.id);
    invariant(item.group_id === undefined || (typeof item.group_id === "string" && item.group_id.trim()), "group_id must be a non-empty string");
    invariant(item.source === undefined || typeof item.source === "string", "source must be a string");
    stableJSON(item); // Check serializability.
    ids.add(item.id);
  }
  return cases;
}
export function splitCases(cases, { seed = 1, train = 0.6, validation = 0.2 } = {}) {
  validateCases(cases);
  finite(train, "train"); finite(validation, "validation");
  invariant(train > 0 && validation > 0 && train + validation < 1, "train and validation must be > 0 and sum to < 1");
  const groups = new Map();
  for (const item of cases) {
    const key = item.group_id || item.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  invariant(groups.size >= 3, "at least three independent groups are required");
  const keys = [...groups.keys()].sort();
  const random = seededRandom(seed);
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  let nTrain = Math.max(1, Math.round(keys.length * train));
  nTrain = Math.min(nTrain, keys.length - 2);
  const nValidation = Math.max(1, Math.min(Math.round(keys.length * validation), keys.length - nTrain - 1));
  const result = { train: [], validation: [], "final-test": [] };
  keys.forEach((key, i) => {
    const split = i < nTrain ? "train" : i < nTrain + nValidation ? "validation" : "final-test";
    result[split].push(...groups.get(key).sort((a, b) => a.id.localeCompare(b.id)));
  });
  return result;
}
export function getPath(value, path) {
  if (!path) return value;
  return String(path).split(".").reduce((current, key) => current != null && Object.hasOwn(Object(current), key) ? current[key] : undefined, value);
}
export function gradeExact(expected, output, { output_path = "" } = {}) {
  const actual = getPath(output, output_path);
  const passed = actual !== undefined && stableJSON(actual) === stableJSON(expected);
  return { verdict: passed ? "pass" : "fail", score: passed ? 1 : 0, reason: passed ? "Output matches expected value." : "Output does not match expected value." };
}
export function validateGrade(grade) {
  invariant(grade && ["pass", "fail", "unknown"].includes(grade.verdict), "grader verdict must be pass, fail, or unknown");
  finite(grade.score, "grader score");
  invariant(grade.score <= 1, "grader score must be <= 1");
  invariant(grade.verdict !== "unknown" || grade.score === 0, "unknown grades must have score 0");
  invariant(typeof grade.reason === "string" && grade.reason.trim(), "grader must include a reason");
  return grade;
}
export function validateResult(record) {
  invariant(record && typeof record.case_id === "string" && record.case_id, "result requires case_id");
  invariant(Number.isInteger(record.trial) && record.trial >= 1, "trial must be a positive integer");
  invariant(typeof record.group_id === "string" && record.group_id, "result requires group_id");
  invariant(["pass", "fail", "unknown", "infra_error"].includes(record.status), "invalid result status");
  finite(record.score, "score");
  invariant(record.score <= 1, "score must be <= 1");
  invariant(!["unknown", "infra_error"].includes(record.status) || record.score === 0, "unknown and infra_error score must be 0");
  if (record.cost_usd !== null) finite(record.cost_usd, "cost_usd");
  finite(record.latency_ms, "latency_ms");
  return record;
}
function aggregate(records) {
  invariant(Array.isArray(records) && records.length, "results must be non-empty");
  const groups = new Map(), unique = new Set();
  for (const r of records) {
    validateResult(r);
    const key = r.case_id + ":" + r.trial;
    invariant(!unique.has(key), "duplicate result: " + key);
    unique.add(key);
    const group = groups.get(r.case_id) || { group_id: r.group_id, rows: [] };
    invariant(group.group_id === r.group_id, "inconsistent group_id for " + r.case_id);
    group.rows.push(r);
    groups.set(r.case_id, group);
  }
  return groups;
}
export function summarize(records) {
  const cases = aggregate(records);
  const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
  const caseScores = [...cases.values()].map(c => mean(c.rows.map(r => r.score)));
  const costKnown = records.every(r => r.cost_usd !== null);
  return {
    cases: cases.size, groups: new Set(records.map(r => r.group_id)).size, trials: records.length,
    score: mean(caseScores),
    pass_rate: [...cases.values()].reduce((sum, c) => sum + mean(c.rows.map(r => Number(r.status === "pass"))), 0) / cases.size,
    unknown_count: records.filter(r => r.status === "unknown").length,
    infra_error_count: records.filter(r => r.status === "infra_error").length,
    costs_complete: costKnown,
    total_cost_usd: costKnown ? records.reduce((sum, r) => sum + r.cost_usd, 0) : null,
    mean_cost_usd: costKnown ? mean([...cases.values()].map(c => mean(c.rows.map(r => r.cost_usd)))) : null,
    mean_latency_ms: mean([...cases.values()].map(c => mean(c.rows.map(r => r.latency_ms)))),
    scoring: "macro-average over cases; unknown and infrastructure errors count as zero"
  };
}
function percentile(sorted, p) {
  const position = (sorted.length - 1) * p;
  const lo = Math.floor(position), hi = Math.ceil(position);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (position - lo);
}
export function compareResults(baseline, candidate, {
  seed = 1, bootstrap = 2000, confidence = 0.95, metric = "quality"
} = {}) {
  invariant(["quality", "cost", "latency"].includes(metric), "metric must be quality, cost, or latency");
  invariant(Number.isInteger(bootstrap) && bootstrap >= 100, "bootstrap must be an integer >= 100");
  invariant(confidence > 0 && confidence < 1, "confidence must be between 0 and 1");
  const left = aggregate(baseline), right = aggregate(candidate);
  invariant(left.size === right.size, "runs must have the same case set");
  const mean = values => values.reduce((sum, x) => sum + x, 0) / values.length;
  const clusters = new Map();
  for (const id of [...left.keys()].sort()) {
    invariant(right.has(id), "candidate missing case: " + id);
    const a = left.get(id), b = right.get(id);
    invariant(a.group_id === b.group_id, "group mismatch for " + id);
    const trialKeys = rows => rows.map(r => r.trial).sort((x, y) => x - y).join(",");
    invariant(trialKeys(a.rows) === trialKeys(b.rows), "repeat mismatch for " + id);
    const value = row => metric === "quality" ? row.score : metric === "cost" ? row.cost_usd : row.latency_ms;
    if (metric === "cost") invariant([...a.rows, ...b.rows].every(r => r.cost_usd !== null), "cost comparison requires reported costs for every trial");
    const aa = [...a.rows].sort((x, y) => x.trial - y.trial), bb = [...b.rows].sort((x, y) => x.trial - y.trial);
    const trialDeltas = aa.map((row, i) => metric === "quality" ? value(bb[i]) - value(row) : value(row) - value(bb[i]));
    if (!clusters.has(a.group_id)) clusters.set(a.group_id, []);
    clusters.get(a.group_id).push(trialDeltas);
  }
  const groups = [...clusters.values()];
  const deltas = groups.flat().map(trials => mean(trials));
  const improvement = mean(deltas);
  const random = seededRandom(seed), samples = [];
  if (groups.length >= 2) {
    for (let i = 0; i < bootstrap; i++) {
      let sum = 0, n = 0;
      for (let j = 0; j < groups.length; j++) {
        const cluster = groups[Math.floor(random() * groups.length)];
        for (const trials of cluster) {
          let trialSum = 0;
          for (let k = 0; k < trials.length; k++) trialSum += trials[Math.floor(random() * trials.length)];
          sum += trialSum / trials.length; n++;
        }
      }
      samples.push(sum / n);
    }
    samples.sort((a, b) => a - b);
  }
  const alpha = (1 - confidence) / 2;
  return {
    metric, direction: "positive means improvement", cases: left.size, independent_groups: groups.length,
    improvement, confidence, interval: samples.length ? [percentile(samples, alpha), percentile(samples, 1 - alpha)] : null,
    method: "paired nested percentile bootstrap of groups and trials, macro-averaged over cases",
    bootstrap, seed: String(seed),
    caveat: "Describes this fixed dataset; does not correct adaptive selection or establish production generalization."
  };
}
export function decideComparison(quality, objective, {
  goal = "quality", min_effect = 0.01, quality_tolerance = 0, max_infra_rate = 0
} = {}, baseline, candidate) {
  invariant(["quality", "cost", "latency"].includes(goal), "unsupported goal");
  finite(min_effect, "min_effect"); finite(quality_tolerance, "quality_tolerance"); finite(max_infra_rate, "max_infra_rate");
  invariant(max_infra_rate <= 1, "max_infra_rate must be <= 1");
  const fail = reason => ({ decision: "do-not-promote", reason });
  if (candidate.infra_error_count / candidate.trials > max_infra_rate) return fail("Candidate exceeds the infrastructure-error threshold; inspect failures before comparing.");
  if (candidate.unknown_count > 0 || baseline.unknown_count > 0) return fail("Unknown grades require review before promotion.");
  if (baseline.infra_error_count / baseline.trials > max_infra_rate) return fail("Baseline exceeds the infrastructure-error threshold.");
  if (!quality.interval || !objective.interval) return fail("Insufficient independent groups for uncertainty estimation.");
  if (goal !== "quality" && quality.interval[0] < -quality_tolerance) return fail("Quality non-inferiority is not established at the predeclared tolerance.");
  if (objective.improvement < min_effect || objective.interval[0] <= 0) return fail("Measured benefit does not clear the minimum effect and uncertainty checks.");
  return { decision: "eligible-for-review", reason: "The fixed-dataset comparison clears predeclared checks. Apply regression gates and final holdout before promotion." };
}
