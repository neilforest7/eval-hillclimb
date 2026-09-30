# Iterative improvement protocol

## Freeze a useful objective
Prefer a cheap, reversible surface with an attributable metric: skill description for triggering, a prompt section for a recurring behavior, tool description for tool selection, model/effort for cost.

Record allowed paths/settings and off-limits items. Freeze evaluator, task distribution, minimum effect, quality tolerance, regression gates, budget, and maximum rounds.

For quality use quality gain with cost/latency constraints. For cost or latency use savings with a predeclared quality non-inferiority tolerance. Equal quality can be a valid cost improvement.

## One round
1. Read train transcripts and classify the biggest fixable failure.
2. State one causal hypothesis and the expected benefit.
3. Save the current target snapshot or commit; create one attributable patch.
4. Run both train and evaluator-managed validation under matching settings.
5. Use compare_runs.mjs for a fixed-dataset comparison. Inspect regressions and constraints separately.
6. Record results and keep/revert rationale in a per-round record.
7. Revert rejected patches without discarding unrelated user changes.

Never embed answer keys, case IDs, or copied failure content as special cases in the target. Fix general behavior. Do not broaden the harness just to cover an unrepresentative benchmark corner.

## Decisions
A comparison marked eligible-for-review has passed only the supplied statistical checks on that fixed dataset. It does not authorize a merge or prove production generalization.

Keep a patch only if the validation objective clears the minimum useful effect and uncertainty check and all quality/regression/cost constraints hold. Train-only gains indicate overfitting risk. For savings objectives, check quality rather than requiring quality gains.

The comparison tool uses a paired, nested percentile bootstrap over independent groups and trial pairs. Pair case/trial IDs and preserve grouping. It does not correct repeated candidate selection, evaluator miscalibration, resource confounders, or distribution shift.

More repeats reduce run noise; more representative independent cases improve coverage. A narrow conditional interval is not a substitute for production evidence.

## Stalls and evaluator bugs
After 2–3 stalled rounds, or when plausible changes are smaller than noise, inspect all remaining train failures. Classify actual target errors, ambiguous tasks, grading bugs, harness/runtime failures, and variance. Do not patch during this diagnostic step.

If the evaluator is wrong, fix it as a separate version and re-run baseline and candidate. Never reinterpret an old score under new grading rules.

## Finish
Select using validation. Evaluate the selected candidate and baseline on final-test, with identical settings and no test-driven selection afterward.

Report improvement and its uncertainty, absolute baseline/candidate values, costs, limitations, failed cases by category, and the target patch. If the gain is unsupported, retain baseline. If a candidate is supported only on validation, label it accordingly.

Checkpoints should be inspectable. Continue within the user's existing authorization; ask only when required facts or scope changes block the next action.
