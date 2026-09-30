# Eval & Hillclimb

A portable skill for building reliable evaluations and iteratively improving prompts, skills, tool descriptions, and AI applications.

[中文说明](README.zh-CN.md)

It packages two workflows: **build-eval** and **hillclimb**. The agent diagnoses and edits; deterministic scripts run trials and compare results. Node.js 22+ is required for scripts. There are no third-party dependencies.

## Quick start

~~~bash
git clone https://github.com/neilforest7/eval-hillclimb.git
cd eval-hillclimb
npm test
npm run demo
~~~

The demo compares two offline routing fixtures on synthetic cases. It costs nothing, needs no API key, and demonstrates plumbing rather than LLM quality or production generalization.

## Install in Codex

Copy the complete skill directory, not just SKILL.md:

~~~bash
mkdir -p ~/.agents/skills
cp -R eval-hillclimb ~/.agents/skills/eval-hillclimb
~~~

For a repository-scoped installation use .agents/skills/eval-hillclimb instead. Invoke explicitly:

~~~text
$eval-hillclimb build-eval for this support agent using our manually reviewed cases.

$eval-hillclimb improve this skill's triggering accuracy.
Change only its description; use a 5 percentage-point minimum effect and at most 6 rounds.
~~~

The supplied Codex metadata disables implicit invocation. The two modes are interpreted by the skill's instructions; they are not native slash commands.

## Use in ChatGPT

Where the account/workspace exposes Skills, create/upload the complete skill package and install it. Reuse the same instructions and resources; installation and updates are managed separately from Codex.

If Skills is unavailable, use a Project with docs/chatgpt-project-instructions.md as project instructions and upload the skill's reference files, experiment specification, and readable training cases.

Designing cases and auditing reports works without an external runtime. Batch live experiments require an available execution environment/provider adapter or a connected runner. Keep final-test answers outside project files and optimizer context.

See [ChatGPT setup](docs/chatgpt.md) and [runtime contracts](eval-hillclimb/references/adapters.md).

## Run your own evaluation

Cases are JSONL: one object per line, with id, input, expected, optional group_id and provenance. Use group_id for related cases so they cannot cross splits.

~~~bash
node eval-hillclimb/scripts/split_cases.mjs \
  --cases examples/router/cases.jsonl \
  --out evals/router \
  --holdout-dir ../router-private-holdout \
  --seed 42

node eval-hillclimb/scripts/run_eval.mjs \
  --cases evals/router/train.jsonl \
  --config examples/router/baseline.json \
  --out runs/train-baseline --split train

node eval-hillclimb/scripts/run_eval.mjs \
  --cases evals/router/train.jsonl \
  --config examples/router/candidate.json \
  --out runs/train-candidate --split train

node eval-hillclimb/scripts/compare_runs.mjs \
  --baseline runs/train-baseline --candidate runs/train-candidate \
  --goal quality --min-effect 0.05 --out train-comparison.json
~~~

Train results support diagnosis, not promotion. Run validation through an evaluator that exposes only aggregates to the optimizer; reserve final-test for the selected version. See [hillclimbing protocol](eval-hillclimb/references/hillclimb.md).

A fresh temporary cwd is state hygiene, not a security sandbox. Filesystem separation alone does not enforce blind testing; use separate access controls or a service where needed.

## What the scripts provide

- Reproducible group-aware train/validation/final-test splits.
- Independent target processes with fresh working directories and no answer keys in the target request.
- Exact JSON grading or a command-based grader, with optional repeated-grading audit.
- Per-trial transcripts, run manifests, tracked-file fingerprints and explicit error counts.
- Estimated-cost reservation, unknown-cost handling and provider-neutral adapters.
- Paired nested bootstrap over groups and trials, quality/cost/latency comparisons, and quality non-inferiority checks.
- Compatibility checks that reject incomplete runs, evaluator changes and mismatched repeat settings.

Confidence intervals describe the fixed dataset under the sampling assumptions. They do not correct adaptive selection, grader errors, infrastructure confounders or distribution shift. An eligible-for-review result is one gate, not an automatic production claim.

The skill guides edits and reversions in Codex. The scripts do not autonomously rewrite arbitrary code or merge changes.

## Live model adapter

examples/openai/adapter.mjs is an optional Responses API adapter. Configure model, API key, absolute PROMPT_FILE, output limit and current prices through the environment. See examples/openai/.env.example and the adapter reference.

Live API calls are never made by tests or the demo. Missing prices remain unknown. Cost estimates are not billing receipts.

## Package files

~~~bash
npm run bundle
~~~

Produces a complete source ZIP and a skill-only ZIP in dist/. The manifest includes only repository source files, not experiment outputs.

## Publish this bundle

From a reviewed, fresh checkout without Git remotes:

~~~bash
node scripts/publish.mjs --install-gh --owner YOUR_GITHUB_LOGIN --name eval-hillclimb
~~~

The publisher runs tests and the offline demo first. If requested, it installs the official GitHub CLI into ~/.local/bin on supported Linux/macOS architectures after checking the release checksum. It reuses existing authentication or starts GitHub's browser login flow, checks classic/OAuth workflow scope, then creates a **public** personal repository and pushes the source. Environment tokens need repo and workflow access; fine-grained tokens need Actions workflow write permission. Existing repositories are not overwritten. Windows users can install gh separately and omit --install-gh.

## Sources and design

Inspired by Lance Martin's [Automating eval design and hillclimbing with Claude](https://claude.dev/blog/automating-eval-design-and-hillclimbing/), published September 28, 2026.

This implementation adds a final holdout separate from iterative validation, explicit experiment artifacts, grouping and nested bootstrap, and a provider-neutral command contract.

- [Codex Agent Skills](https://developers.openai.com/codex/skills)
- [Skills in ChatGPT](https://help.openai.com/en/articles/20001066-skills-in-chatgpt)
- [ChatGPT Projects](https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt)
- [Agent Skills specification](https://agentskills.io/specification)

Original implementation under the [MIT license](LICENSE).
