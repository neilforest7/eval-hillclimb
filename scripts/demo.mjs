import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "eval-hillclimb-demo-"));
const execute = (script, args) => {
  const result = spawnSync(process.execPath, [path.join(root, "eval-hillclimb/scripts", script), ...args], { cwd: root, encoding: "utf8", timeout: 120000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "demo failed");
  return JSON.parse(result.stdout);
};
try {
  for (const version of ["baseline", "candidate"]) {
    execute("run_eval.mjs", ["--cases", path.join(root, "examples/router/cases.jsonl"),
      "--config", path.join(root, "examples/router", version + ".json"),
      "--out", path.join(dir, version), "--split", "demo"]);
  }
  const result = execute("compare_runs.mjs", ["--baseline", path.join(dir, "baseline"), "--candidate", path.join(dir, "candidate"), "--min-effect", "0.05"]);
  console.log(JSON.stringify(result, null, 2));
  console.log("Offline synthetic fixture only; use representative held-out cases for real optimization.");
} finally { await fs.rm(dir, { recursive: true, force: true }); }
