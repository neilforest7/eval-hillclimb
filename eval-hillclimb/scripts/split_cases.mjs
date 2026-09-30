import fs from "node:fs/promises";
import path from "node:path";
import { splitCases } from "./lib/core.mjs";
import { options, requireOption, readCases, createDirectory, writeJSON, writeJSONL, hash, cli } from "./lib/io.mjs";

const outside = (base, candidate) => {
  const relative = path.relative(base, candidate);
  return path.isAbsolute(relative) || relative === ".." || relative.startsWith(".." + path.sep);
};

await cli(async () => {
  const opts = options(), cases = await readCases(requireOption(opts, "cases"));
  const output = path.resolve(requireOption(opts, "out"));
  const holdout = path.resolve(requireOption(opts, "holdout-dir"));
  if (!outside(output, holdout)) throw new Error("--holdout-dir must be outside --out");
  const seed = opts.seed || "1";
  const result = splitCases(cases, { seed, train: Number(opts.train || 0.6), validation: Number(opts.validation || 0.2) });
  await createDirectory(output);
  await createDirectory(holdout);
  const [realOutput, realHoldout] = await Promise.all([fs.realpath(output), fs.realpath(holdout)]);
  if (!outside(realOutput, realHoldout)) throw new Error("--holdout-dir must be outside --out");
  await writeJSONL(path.join(output, "train.jsonl"), result.train);
  await writeJSONL(path.join(output, "validation.jsonl"), result.validation);
  await writeJSONL(path.join(holdout, "final-test.jsonl"), result["final-test"]);
  const manifest = {
    schema_version: 1, seed: String(seed), dataset_hash: hash([...cases].sort((a, b) => a.id.localeCompare(b.id))),
    counts: Object.fromEntries(Object.entries(result).map(([key, rows]) => [key, { cases: rows.length, groups: new Set(rows.map(r => r.group_id || r.id)).size }])),
    note: "Filesystem separation is not an access-control boundary. Restrict optimizer access to holdout and validation cases using separate permissions or a service."
  };
  await writeJSON(path.join(output, "split-manifest.json"), manifest);
  console.log(JSON.stringify(manifest, null, 2));
});
