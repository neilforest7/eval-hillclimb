# ChatGPT setup

## Native Skills
Open the Skills surface when available to your account/workspace. Create or upload the full eval-hillclimb directory/package. Use the same SKILL.md, references and assets as Codex; adapt runtime dependencies to tools available in that surface.

Example requests:
- Use eval-hillclimb to create reviewed cases and grading rules for this assistant.
- Use eval-hillclimb to audit these baseline/candidate reports.
- Use eval-hillclimb to reduce cost while preserving this agreed quality threshold.

Installation does not automatically provide an API key, repository checkout, terminal, or external runner. A local Codex installation also does not guarantee installation/sync in ChatGPT.

## Project fallback
Create a Project, add chatgpt-project-instructions.md as project instructions, and upload the relevant workflow references. Keep one experiment protocol and its reports as explicit sources so another chat can resume without relying on remembered conversation.

Upload only material the optimizer may read. Do not place final-test cases, labels, or hidden grader answers in project knowledge. Separate chats inside one shared Project are not an access-control boundary.

## Runtime options
1. Design/audit: work on supplied specifications, cases and measured reports without live execution.
2. Available code environment: run compatible adapters and statistics scripts where the environment supports subprocesses, dependencies, networking and credentials.
3. Connected runner: use a tool/app backed by your service for repeatable live experiments. That service enforces budgets, records versions, and protects validation/final-test data.

For a connected service, a useful minimal interface is:
- create_experiment(spec) -> experiment_id and reviewed protocol
- run_candidate(experiment_id, version, split) -> job_id
- get_results(job_id) -> aggregates and permitted train traces
- finalize(experiment_id, selected_version) -> final holdout report

These are proposed integration contracts, not tools shipped by this repository. A later plugin can package the skill together with a real runner connection.

## Scope
Instructions and templates transfer across products. Execution capabilities and installation mechanisms differ. Keep design-only, measured, validated and final-holdout-tested claims explicit.
