import path from "node:path";
import { invariant, compareResults, summarize, decideComparison } from "./lib/core.mjs";
import { options, requireOption, readJSON, readJSONL, writeJSON, cli } from "./lib/io.mjs";

await cli(async () => {
  const opts = options(), baselineDir = requireOption(opts, "baseline"), candidateDir = requireOption(opts, "candidate");
  const a = await readJSON(path.join(baselineDir, "manifest.json")), b = await readJSON(path.join(candidateDir, "manifest.json"));
  const sa = await readJSON(path.join(baselineDir, "summary.json")), sb = await readJSON(path.join(candidateDir, "summary.json"));
  for (const key of ["schema_version", "runner_version", "runner_hash", "dataset_hash", "grader_hash", "repeats", "seed", "split"]) {
    invariant(a[key] === b[key], "Runs differ in " + key + "; re-run under matching conditions");
  }
  invariant(sa.complete && sb.complete, "Cannot compare incomplete runs");
  for (const key of ["timeout_ms", "max_output_bytes", "audit_grader"]) invariant(a.config[key] === b.config[key], "Runs differ in " + key);
  const baseline = await readJSONL(path.join(baselineDir, "results.jsonl"));
  const candidate = await readJSONL(path.join(candidateDir, "results.jsonl"));
  invariant(baseline.length === a.planned_trials && candidate.length === b.planned_trials, "Result count does not match run manifest");
  const goal = opts.goal || "quality";
  const comparisonOptions = { seed: opts.seed || "1", bootstrap: Number(opts.bootstrap || 2000), confidence: Number(opts.confidence || 0.95) };
  const quality = compareResults(baseline, candidate, { ...comparisonOptions, metric: "quality" });
  const objective = goal === "quality" ? quality : compareResults(baseline, candidate, { ...comparisonOptions, metric: goal });
  const before = summarize(baseline), after = summarize(candidate);
  const decision = decideComparison(quality, objective, {
    goal, min_effect: Number(opts["min-effect"] ?? 0.01),
    quality_tolerance: Number(opts["quality-tolerance"] ?? 0),
    max_infra_rate: Number(opts["max-infra-rate"] ?? 0)
  }, before, after);
  const report = { schema_version: 1, goal, baseline: before, candidate: after, quality, objective, ...decision };
  if (opts.out) await writeJSON(opts.out, report);
  console.log(JSON.stringify(report, null, 2));
});
