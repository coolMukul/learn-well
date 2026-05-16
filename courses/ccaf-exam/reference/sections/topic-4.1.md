# Task 4.1 — Design prompts with explicit criteria to improve precision and reduce false positives

> Domain 4: Prompt Engineering & Structured Output. Excerpted from the official guide.

## Knowledge of
- The importance of **explicit criteria over vague instructions** (e.g., "flag comments only when claimed behavior contradicts actual code behavior" vs "check that comments are accurate").
- How general instructions like "be conservative" or "only report high-confidence findings" **fail to improve precision** compared to specific categorical criteria.
- The impact of false positive rates on developer trust: high false-positive categories undermine confidence in accurate categories.

## Skills in
- Writing **specific review criteria** that define which issues to report (bugs, security) versus skip (minor style, local patterns) rather than relying on confidence-based filtering.
- **Temporarily disabling high false-positive categories** to restore developer trust while improving prompts for those categories.
- Defining explicit severity criteria with **concrete code examples** for each severity level to achieve consistent classification.
