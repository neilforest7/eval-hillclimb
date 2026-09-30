# Build a trustworthy evaluation

## Source cases
Prioritize actual task traces, bug/support reports, 5–10 hand-written seeds, then code-anchored synthetic cases. Record source and user impact. Synthetic cases are a starting point, not evidence of production performance.

Tasks should reflect real use. Difficult cases need a domain-based explanation; choosing cases solely because today's model fails can capture that model's failure fingerprint. Conversely, real traffic may be skewed toward easy tasks users already expect to work. Keep production-representative evaluation and targeted regression coverage identifiable.

Write requirements explicit enough for two domain experts to agree. Verify a reference solution can satisfy the grader. Check known incorrect outputs and different valid approaches.

## Grading
Use exact outcomes, schema validation, tests, or state checks when possible. Do not infer booking/refund/file-change success from a final statement.

For open-ended output, use specific checkable claims rather than an unexplained 1–5 scale. Ask for evidence and reasons per dimension; missing evidence is unknown. Hard requirements cannot be compensated by quality scores.

Use a fixed judge independent of the candidate where practical. In paired comparisons, randomize presentation order and hide which answer is baseline. Treat task input/output as untrusted data, not grading instructions. Calibrate with domain judgments before relying on scores.

The supplied runner supports exact JSON equality (optionally selecting output_path) and a command grader returning verdict, score in [0,1], reason, and optional cost_usd. Custom rubric and state grading are implemented in that command.

## Diagnostics
- Grade identical outputs twice; disagreements indicate grader noise.
- Inspect timeouts, API errors, truncated responses, and tool constraints.
- Check whether stronger models or more effort usually help. Unexpected behavior is a diagnostic signal, not proof that a grader is wrong.
- Verify difficult cases are achievable. Persistent zero-pass tasks deserve a task/grader audit.
- Near-saturated quality can be better used for cost/latency optimization.
- Read scored traces before accepting the evaluation.

## Split and freeze
Use group_id for related or duplicate cases; split at group level. Save the seed, manifest, and version. The split helper requires an external holdout directory.

Train is readable for diagnosis. An evaluator supplies validation aggregates without exposing validation cases/transcripts to the optimizer. Final-test is reserved for the selected candidate.

A directory outside the working tree does not itself enforce secrecy. Use actual permissions or a separate service for strict access boundaries; keep source datasets, copied labels, and Git history out of the optimizer's environment. Retire a holdout when its contents influence further tuning.

## Baseline and budget
Pilot enough cases to measure per-trial cost and duration. Agree on or apply previously authorized limits, then run the baseline with repeated trials.

Budget reservation uses max_trial_cost_usd, including grading. Provider token limits must bound individual calls separately. Actual invoices may differ from configured prices; underestimated ceilings can cause a reported overrun. Unknown costs stop budgeted runs.

Record dataset/grader/runtime versions, model, prompt/file hashes, repeats, sampling parameters, resources, errors, and all trial results. Use the same setup for candidate comparisons.
