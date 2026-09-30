---
name: eval-hillclimb
description: Build trustworthy evaluations and iteratively improve prompts, skills, tool descriptions, or AI applications. Use when explicitly asked to build an eval, investigate evaluation reliability, hillclimb quality, or reduce cost or latency while preserving quality.
metadata:
  version: "1.0.0"
---

# Evaluate and hillclimb

Select build-eval or hillclimb from the user's request. If hillclimb lacks a runnable, calibrated eval, start with build-eval.

Read references/build-eval.md for dataset and grader design.
Read references/hillclimb.md before changing the target.
Read references/adapters.md when running scripts or connecting a provider.
Use assets/experiment.json and assets/report-template.md for experiment records.

## Inputs

Extract the target, real-use distribution, success criteria, allowed changes, off-limits files, goal, minimum useful effect, quality tolerance, run budget, and stopping conditions from the conversation and project.

Ask only for missing facts that change correctness, scope, or material cost. Respect authorization and constraints already given. Prepare reviewable examples, grading rules, and measured cost estimates before seeking any approval that is actually required.

Without a runtime, produce the eval specification, cases, rubric, and implementation plan. Mark results unmeasured. Never invent scores, costs, confidence intervals, or execution records.

## build-eval

1. Source representative cases from real traces, issues, hand-written examples, then anchored synthesis. Label provenance and explain why difficult cases are valuable.
2. Define observable outcomes and explicit constraints. Check reference solutions and known incorrect answers.
3. Prefer deterministic grading. For open-ended output, calibrate a fixed independent judge using checkable assertions, evidence, and pass/fail/unknown.
4. Check repeated grading on identical output, plumbing failures, stronger-model/effort diagnostics, achievable headroom, and run-to-run noise.
5. Group related cases before splitting. Keep train readable by the optimizer, validation available only through aggregate results, and final-test outside the optimizer's access.
6. Run a small pilot, measure cost and time, then establish a repeated baseline under the approved or otherwise authorized budget.
7. Save the dataset version, grader version, runtime configuration, per-case results, and transcripts.

## hillclimb

1. Freeze the metric, evaluator, scope, quality gates, budget, and minimum useful improvement. Save baseline and target snapshots.
2. Read train failures and propose one root-cause hypothesis per round. Make a reversible patch within allowed scope.
3. Run train and validation. Record the patch, metrics, uncertainty, costs, and decision. Use scripts for measurements.
4. Quality goal: require useful, measurable validation gains and satisfied constraints. Cost/latency goal: require useful savings and quality non-inferiority at the predeclared tolerance.
5. Revert unsupported changes or credible regressions. Train-only gains are an overfitting warning. Do not copy failed examples or answer keys into instructions.
6. After 2–3 stalled rounds, classify remaining train failures before another patch. Separate genuine target failures from task, grader, infrastructure, and variance problems.
7. Stop at budget/round limits or when possible gains are below measurement noise. Restore the best validated candidate; retain the baseline if no candidate qualifies.
8. Evaluate the selected candidate once on final-test. If final-test informs more tuning, retire it and obtain a fresh holdout.
9. Deliver the patch, experiment ledger, evidence, uncertainties, costs, and final report. Promotion/merge follows the user's existing authorization.

## Execution rules

- Each trial uses a fresh process and temporary working directory. This is state hygiene, not a security sandbox. Use separate permissions, containers, or a service when strict isolation is required.
- The target receives input only; answer keys go to the grader. Keep evaluator and final-test artifacts outside target/optimizer reach.
- Hold evaluator and runtime budgets constant when comparing versions. Track target and grader files. Changes to grading require re-running both baseline and candidate.
- Repeats are not additional independent tasks. Interpret confidence intervals with grouping and adaptive-selection limits.
- Unknown grades and infrastructure errors are reported separately and never silently removed from the denominator.
- A reported cost of null is unknown, not zero. Enforce provider token limits separately from estimated run budgets.
- Do not start paid hillclimbing merely because ordinary editing resembles an eval task. Enter optimization when requested.

## Outputs

A versioned eval specification, cases, runner/grader configuration, measured baseline, per-round patches and ledger, and a final report. Distinguish design-only, measured on a fixed dataset, validated, and final-holdout-tested claims.

Source: https://claude.dev/blog/automating-eval-design-and-hillclimbing/
