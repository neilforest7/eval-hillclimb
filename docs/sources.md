# Sources

Primary method:
- Lance Martin, "Automating eval design and hillclimbing with Claude", September 28, 2026.
  https://claude.dev/blog/automating-eval-design-and-hillclimbing/

Packaging and product guidance:
- https://developers.openai.com/codex/skills
- https://help.openai.com/en/articles/20001066-skills-in-chatgpt
- https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt
- https://agentskills.io/specification

The primary article supplies representative sampling, grader calibration, baseline/noise diagnostics, scoped one-patch iteration, overfitting checks, and stall diagnosis.

This project adds separate iterative validation and final-test, group-aware splitting, paired nested bootstrap, provider-neutral command adapters, explicit result compatibility checks, and a portable source package. The added statistical checks support fixed-dataset comparison and do not establish generalization.

No full article text or third-party skill implementation is redistributed.
