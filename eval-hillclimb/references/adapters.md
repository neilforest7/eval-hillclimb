# Runtime and adapter contract

Requires Node.js 22+. The scripts use only Node built-ins; no npm install is required.

## Target adapter
adapter_command is an argv array. It runs without a shell in a fresh temporary cwd per trial. Use absolute paths or the {node}, {project}, {skill} substitutions. {project} defaults to the directory where the runner is launched; project_dir overrides it.

The process reads one JSON object from stdin:
{"id":"case-1","input":"task text","trial":1,"seed":"stable per-case/trial seed"}

It writes exactly one JSON object to stdout:
{"output":"refund","cost_usd":0.001,"model":"model-name","usage":{"input_tokens":100,"output_tokens":10}}

output is required. cost_usd may be omitted/null when unknown. Debug text goes to stderr. Labels, expected values, and rubric are never passed to the target.

Each adapter is a fresh process with a fresh cwd, but inherits the parent's environment and can access filesystem/network resources allowed to the user. This is not a sandbox. For production-like tool environments, have the adapter create and clean an isolated fixture/container itself.

The request seed is available to adapters; not all provider APIs support seeding. The supplied Responses API adapter does not send an unsupported seed parameter.

## Grader
exact compares JSON structurally; output_path can select a dotted field in output.

command reads {input, output, expected, outcome_dir, rubric, instruction} from stdin and returns:
{"verdict":"pass","score":1,"reason":"Evidence supports each required condition.","cost_usd":0}

Allowed verdicts are pass/fail/unknown. Scores must be [0,1]; unknown must score zero. Use tracked_files inside grader to fingerprint its prompt and source files. External grader/model versions should also be recorded in config.

outcome_dir is the target trial working directory, retained until grading finishes. A deterministic command grader can inspect actual files or run tests there. Return relevant evidence in the grade; the temporary directory is removed afterward. Do not use the target's own success statement as authoritative state.

audit_grader runs the same output through a command grader twice. A changed score/verdict becomes unknown. Judge cost is added to target cost; missing judge costs keep total cost unknown.

## Files and reproducibility
tracked_files records target instructions/source hashes. PROMPT_FILE is tracked automatically. The run becomes incomplete if tracked target/grader files change during execution.

record_env can name non-secret runtime parameters; secret-like names are rejected. Never put API keys in config. Runtime configuration and transcript outputs remain sensitive experiment artifacts; repository ignore rules exclude runs/evals and .env files.

Dataset, grader, runner, repeat count, seed, split label, timeout, output cap, and audit settings must match for comparison. Review other resources/model parameters according to the experiment's declared scope.

## Results and exits
Each run directory contains manifest.json, summary.json, results.jsonl and transcripts/.
Cases are macro-averaged so repeating one case cannot inflate its weight.
Unknown and infrastructure failures contribute zero to the main score and are counted separately.

run_eval exits 0 for a complete run with determinate grades (task failures may still exist), 2 for incomplete/unknown/infrastructure-affected runs, and 1 for invalid setup. Fix or explicitly investigate exit 2; do not drop failed rows to improve scores.

compare_runs returns a report, not a merge command. Cost comparison requires reported cost for every trial. Incomplete or incompatible runs are rejected.

## Live OpenAI example
examples/openai/adapter.mjs uses the Responses API and environment-selected model/instructions. PROMPT_FILE must be absolute because trials use temporary working directories.

Set OPENAI_API_KEY, OPENAI_MODEL and MAX_OUTPUT_TOKENS in the invoking shell. Prices are optional; supply current input/output/cached-input prices per million tokens to obtain estimates. Missing required prices or usage yields null cost. Price estimates are not invoices.

Live calls are not part of tests or the default demo. To bound them, set provider token limits, budget_usd and a conservative max_trial_cost_usd in your own config, including any judge calls.
