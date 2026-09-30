import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = name => path.join(root, "eval-hillclimb", "scripts", name);
const run = (name, args) => spawnSync(process.execPath, [script(name), ...args], { cwd: root, encoding: "utf8", timeout: 30000 });
const read = async file => JSON.parse(await fs.readFile(file, "utf8"));
const rows = async file => (await fs.readFile(file, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "eval-test-"));
  const adapter = path.join(dir, "adapter.mjs");
  await fs.writeFile(adapter, [
    'import fs from "node:fs";',
    'let data = ""; for await (const c of process.stdin) data += c;',
    'const request = JSON.parse(data);',
    'if (Object.hasOwn(request, "expected") || Object.hasOwn(request, "rubric")) throw new Error("label leakage");',
    'if (fs.existsSync("trial-marker")) throw new Error("trial state leaked");',
    'fs.writeFileSync("trial-marker", "fresh");',
    'const mode = process.argv[2];',
    'if (mode === "timeout") await new Promise(resolve => setTimeout(resolve, 2000));',
    'if (mode === "bad-json") { console.log("not json"); process.exit(0); }',
    'if (mode === "mutate") fs.writeFileSync(process.argv[3], "changed");',
    'const response = { output: mode === "baseline" ? "wrong" : "answer" };',
    'if (mode !== "unknown-cost") response.cost_usd = 0;',
    'console.log(JSON.stringify(response));'
  ].join("\n"));
  const cases = path.join(dir, "cases.jsonl");
  await fs.writeFile(cases, Array.from({ length: 6 }, (_, i) => JSON.stringify({ id: "c" + i, input: "question", expected: "answer" })).join("\n") + "\n");
  const config = async (name, mode, extra = {}, args = []) => {
    const file = path.join(dir, name + ".json");
    await fs.writeFile(file, JSON.stringify({ adapter_command: [process.execPath, adapter, mode, ...args],
      grader: { type: "exact" }, repeats: 2, seed: 42, timeout_ms: 10000, tracked_files: [adapter], ...extra }));
    return file;
  };
  const cleanup = () => fs.rm(dir, { recursive: true, force: true });
  return { dir, adapter, cases, config, cleanup };
}
test("CLI splits grouped cases outside optimizer directory", async () => {
  const f = await fixture();
  try {
    const out = path.join(f.dir, "splits"), holdout = path.join(f.dir, "private");
    const result = run("split_cases.mjs", ["--cases", f.cases, "--out", out, "--holdout-dir", holdout, "--seed", "42"]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok((await rows(path.join(out, "train.jsonl"))).length);
    assert.ok((await rows(path.join(out, "validation.jsonl"))).length);
    assert.ok((await rows(path.join(holdout, "final-test.jsonl"))).length);
    assert.equal((await read(path.join(out, "split-manifest.json"))).schema_version, 1);
  } finally { await f.cleanup(); }
});
test("split rejects a holdout path nested through a symlink before writing cases", async () => {
  const f = await fixture();
  try {
    const real = path.join(f.dir, "real"), alias = path.join(f.dir, "alias");
    await fs.mkdir(real);
    await fs.symlink(real, alias, "dir");
    const out = path.join(real, "splits"), holdout = path.join(alias, "splits", "private");
    const result = run("split_cases.mjs", ["--cases", f.cases, "--out", out, "--holdout-dir", holdout]);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /--holdout-dir must be outside --out/);
    await assert.rejects(fs.access(path.join(out, "private", "final-test.jsonl")));
  } finally { await f.cleanup(); }
});
test("OpenAI adapter returns a refusal as output without making a live request", async () => {
  const f = await fixture();
  try {
    const preload = path.join(f.dir, "mock-fetch.mjs");
    await fs.writeFile(preload, `
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    status: "completed",
    model: "mock-model",
    output: [{ type: "message", content: [{ type: "refusal", refusal: "I cannot help with that." }] }],
    usage: {}
  })
});
`);
    const config = path.join(f.dir, "openai.json"), out = path.join(f.dir, "refusal-run");
    await fs.writeFile(config, JSON.stringify({
      adapter_command: [process.execPath, "--import", preload, path.join(root, "examples/openai/adapter.mjs")],
      grader: { type: "exact" }, repeats: 1
    }));
    const result = spawnSync(process.execPath, [script("run_eval.mjs"), "--cases", f.cases, "--config", config, "--out", out], {
      cwd: root, encoding: "utf8", timeout: 30000,
      env: { ...process.env, OPENAI_MODEL: "mock-model", OPENAI_API_KEY: "fixture-key", PROMPT_FILE: "" }
    });
    assert.equal(result.status, 0, result.stderr);
    const summary = await read(path.join(out, "summary.json"));
    assert.equal(summary.infra_error_count, 0);
    assert.equal(summary.score, 0);
    assert.equal(summary.complete, true);
    assert.ok((await rows(path.join(out, "results.jsonl"))).every(row => row.status === "fail" && row.output === "I cannot help with that."));
  } finally { await f.cleanup(); }
});
test("end-to-end runner keeps trial state fresh, hides labels, and compares matching runs", async () => {
  const f = await fixture();
  try {
    const baseline = path.join(f.dir, "baseline"), candidate = path.join(f.dir, "candidate");
    const a = await f.config("a", "baseline"), b = await f.config("b", "candidate");
    for (const [config, out] of [[a, baseline], [b, candidate]]) {
      const result = run("run_eval.mjs", ["--cases", f.cases, "--config", config, "--out", out, "--split", "validation"]);
      assert.equal(result.status, 0, result.stderr);
    }
    const result = run("compare_runs.mjs", ["--baseline", baseline, "--candidate", candidate, "--min-effect", "0.05"]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.decision, "eligible-for-review");
    assert.equal(report.quality.improvement, 1);
    const manifest = await read(path.join(baseline, "manifest.json"));
    assert.ok(manifest.runner_hash && manifest.artifact_hashes);
    const trace = await read(path.join(baseline, (await rows(path.join(baseline, "results.jsonl")))[0].transcript));
    assert.equal(Object.hasOwn(trace.request, "expected"), false);
  } finally { await f.cleanup(); }
});
test("budget reservation prevents an unaffordable trial; incomplete runs remain incomplete", async () => {
  const f = await fixture();
  try {
    const config = await f.config("budget", "candidate", { budget_usd: 0.5, max_trial_cost_usd: 1 });
    const out = path.join(f.dir, "budget-run");
    const result = run("run_eval.mjs", ["--cases", f.cases, "--config", config, "--out", out]);
    assert.equal(result.status, 2, result.stderr);
    const summary = await read(path.join(out, "summary.json"));
    assert.equal(summary.complete, false);
    assert.equal(summary.trials, 0);
    assert.equal(summary.stop_reason, "budget-reservation-limit");
  } finally { await f.cleanup(); }
});
test("unknown billed cost stops a budgeted run instead of being treated as free", async () => {
  const f = await fixture();
  try {
    const config = await f.config("unknown", "unknown-cost", { budget_usd: 1, max_trial_cost_usd: 0.1 });
    const out = path.join(f.dir, "unknown-run");
    const result = run("run_eval.mjs", ["--cases", f.cases, "--config", config, "--out", out]);
    assert.equal(result.status, 2, result.stderr);
    const summary = await read(path.join(out, "summary.json"));
    assert.equal(summary.trials, 1);
    assert.equal(summary.total_cost_usd, null);
    assert.equal(summary.stop_reason, "unknown-cost");
  } finally { await f.cleanup(); }
});
test("timeout and malformed adapter output are infrastructure errors, never passing grades", async () => {
  const f = await fixture();
  try {
    for (const mode of ["timeout", "bad-json"]) {
      const config = await f.config(mode, mode, { repeats: 1, timeout_ms: mode === "timeout" ? 100 : 10000 });
      const out = path.join(f.dir, mode + "-run");
      const result = run("run_eval.mjs", ["--cases", f.cases, "--config", config, "--out", out]);
      assert.equal(result.status, 2, result.stderr);
      const summary = await read(path.join(out, "summary.json"));
      assert.equal(summary.infra_error_count, 6);
      assert.equal(summary.score, 0);
    }
  } finally { await f.cleanup(); }
});
test("judge disagreement on the same output becomes unknown", async () => {
  const f = await fixture();
  try {
    const counter = path.join(f.dir, "counter");
    const judge = path.join(f.dir, "judge.mjs");
    await fs.writeFile(judge, [
      'import fs from "node:fs";',
      'let input = ""; for await (const c of process.stdin) input += c;',
      'const data = JSON.parse(input); if (!Object.hasOwn(data, "expected")) throw new Error("missing grader label");',
      'const file = process.argv[2]; const n = fs.existsSync(file) ? Number(fs.readFileSync(file, "utf8")) : 0;',
      'fs.writeFileSync(file, String(n + 1));',
      'console.log(JSON.stringify({ verdict: n % 2 ? "fail" : "pass", score: n % 2 ? 0 : 1, reason: "deliberate unstable fixture", cost_usd: 0 }));'
    ].join("\n"));
    const config = await f.config("judge", "candidate", { repeats: 1, audit_grader: true,
      grader: { type: "command", command: [process.execPath, judge, counter], tracked_files: [judge] } });
    const out = path.join(f.dir, "judge-run");
    const result = run("run_eval.mjs", ["--cases", f.cases, "--config", config, "--out", out]);
    assert.equal(result.status, 2, result.stderr);
    assert.equal((await read(path.join(out, "summary.json"))).unknown_count, 6);
    assert.ok((await rows(path.join(out, "results.jsonl"))).every(r => r.grader_disagreement));
  } finally { await f.cleanup(); }
});
test("changing tracked instructions during a run invalidates comparison", async () => {
  const f = await fixture();
  try {
    const target = path.join(f.dir, "prompt.md"); await fs.writeFile(target, "original");
    const config = await f.config("mutate", "mutate", { repeats: 1, tracked_files: [target] }, [target]);
    const out = path.join(f.dir, "mutate-run");
    const result = run("run_eval.mjs", ["--cases", f.cases, "--config", config, "--out", out]);
    assert.equal(result.status, 2, result.stderr);
    const summary = await read(path.join(out, "summary.json"));
    assert.equal(summary.complete, false);
    assert.equal(summary.stop_reason, "tracked-files-changed-during-run");
  } finally { await f.cleanup(); }
});

test("state grader can inspect actual trial files before cleanup", async () => {
  const f = await fixture();
  try {
    const judge = path.join(f.dir, "state-judge.mjs");
    await fs.writeFile(judge, [
      'import fs from "node:fs"; import path from "node:path";',
      'let input = ""; for await (const c of process.stdin) input += c;',
      'const data = JSON.parse(input);',
      'const actual = fs.readFileSync(path.join(data.outcome_dir, "trial-marker"), "utf8");',
      'const pass = actual === "fresh";',
      'console.log(JSON.stringify({verdict: pass ? "pass" : "fail", score: Number(pass), reason: "Observed trial-marker=" + actual, cost_usd: 0}));'
    ].join("\n"));
    const config = await f.config("state", "baseline", { repeats: 1,
      grader: { type: "command", command: [process.execPath, judge], tracked_files: [judge] } });
    const out = path.join(f.dir, "state-run");
    const result = run("run_eval.mjs", ["--cases", f.cases, "--config", config, "--out", out]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal((await read(path.join(out, "summary.json"))).score, 1);
  } finally { await f.cleanup(); }
});

test("split rejects holdout directories inside output, including names beginning with two dots", async () => {
  const f = await fixture();
  try {
    for (const name of ["..private", "nested", ""]) {
      const out = path.join(f.dir, "unsafe-" + (name || "same"));
      const result = run("split_cases.mjs", ["--cases", f.cases, "--out", out, "--holdout-dir", path.join(out, name)]);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /--holdout-dir must be outside --out/);
      await assert.rejects(fs.access(out));
    }
  } finally { await f.cleanup(); }
});

test("failed first or audit grader leaves cost unknown and stops a budgeted run", async () => {
  const f = await fixture();
  try {
    const judge = path.join(f.dir, "failing-judge.mjs");
    await fs.writeFile(judge, [
      'import fs from "node:fs";',
      'let input = ""; for await (const c of process.stdin) input += c;',
      'JSON.parse(input);',
      'const mode = process.argv[2], counter = process.argv[3];',
      'const n = fs.existsSync(counter) ? Number(fs.readFileSync(counter, "utf8")) : 0;',
      'fs.writeFileSync(counter, String(n + 1));',
      'if (mode === "timeout") await new Promise(resolve => setTimeout(resolve, 2000));',
      'if (mode === "exit" || (mode === "audit-exit" && n === 1)) process.exit(1);',
      'if (mode === "bad-json") { console.log("not json"); process.exit(0); }',
      'if (mode === "invalid-grade") { console.log(JSON.stringify({verdict: "pass", score: 2, cost_usd: 0.01})); process.exit(0); }',
      'console.log(JSON.stringify({verdict: "pass", score: 1, reason: "fixture", cost_usd: 0.01}));'
    ].join("\n"));
    for (const mode of ["timeout", "exit", "bad-json", "invalid-grade", "audit-exit"]) {
      const counter = path.join(f.dir, "count-" + mode);
      const config = await f.config("failed-judge-" + mode, "candidate", {
        budget_usd: 1, max_trial_cost_usd: 0.1, audit_grader: mode === "audit-exit",
        grader: { type: "command", command: [process.execPath, judge, mode, counter],
          tracked_files: [judge], timeout_ms: mode === "timeout" ? 250 : 10000 }
      });
      const out = path.join(f.dir, "failed-judge-run-" + mode);
      const result = run("run_eval.mjs", ["--cases", f.cases, "--config", config, "--out", out]);
      assert.equal(result.status, 2, result.stderr);
      const summary = await read(path.join(out, "summary.json"));
      assert.equal(summary.trials, 1);
      assert.equal(summary.infra_error_count, 1);
      assert.equal(summary.complete, false);
      assert.equal(summary.total_cost_usd, null);
      assert.equal(summary.stop_reason, "unknown-cost");
      assert.equal((await rows(path.join(out, "results.jsonl")))[0].cost_usd, null);
      if (mode !== "timeout") assert.equal(Number(await fs.readFile(counter, "utf8")), mode === "audit-exit" ? 2 : 1);
    }
  } finally { await f.cleanup(); }
});
