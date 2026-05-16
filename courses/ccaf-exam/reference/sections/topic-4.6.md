# Task 4.6 — Design multi-instance and multi-pass review architectures

> Domain 4: Prompt Engineering & Structured Output. Excerpted from the official guide.

## Knowledge of
- **Self-review limitations**: a model retains reasoning context from generation, making it less likely to question its own decisions in the same session.
- **Independent review instances** (without prior reasoning context) are more effective at catching subtle issues than self-review instructions or extended thinking.
- **Multi-pass review**: splitting large reviews into per-file local analysis passes plus cross-file integration passes to avoid attention dilution and contradictory findings.

## Skills in
- Using a **second independent Claude instance** to review generated code without the generator's reasoning context.
- Splitting large multi-file reviews into **focused per-file passes** for local issues plus **separate integration passes** for cross-file data flow analysis.
- Running verification passes where the model self-reports confidence alongside each finding to enable calibrated review routing.
