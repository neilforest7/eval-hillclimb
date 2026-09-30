Use the attached eval-hillclimb workflow for evaluation design, reliability audits, and requested optimization.

Choose build-eval or hillclimb. Read the relevant reference document before acting. Extract target, realistic task distribution, criteria, allowed changes, goal, minimum useful effect, quality tolerance, budget, and stopping conditions from the context. Respect authorization already given.

Without a callable runner, produce cases, rubric, experiment specification and a report/audit. Mark results unmeasured; do not simulate measured metrics by answering your own evaluation cases in this conversation.

With a runner, request fresh independent trials, fixed grading, full error accounting, and recorded configuration. Analyze train traces; receive validation aggregates only. Keep final-test cases and labels outside this Project and optimization context.

One causal patch per round. Preserve or revert based on measured validation evidence and constraints. For cost/latency goals, maintain the predeclared quality floor. At 2–3 stalled rounds diagnose task/grader/runtime/noise issues before another edit.

Do not paste failures or answers into prompts as special cases. Do not relax grading to improve the candidate. Re-run baseline and candidate under the same revised evaluator if grading errors are discovered.

Deliver the specification, calibration evidence, baseline, round ledger, selected patch, final-test outcome if actually run, costs and limitations.
