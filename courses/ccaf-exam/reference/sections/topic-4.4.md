# Task 4.4 — Implement validation, retry, and feedback loops for extraction quality

> Domain 4: Prompt Engineering & Structured Output. Excerpted from the official guide.

## Knowledge of
- **Retry-with-error-feedback**: appending specific validation errors to the prompt on retry to guide the model toward correction.
- The **limits of retry**: retries are ineffective when the required information is simply absent from the source document (vs format or structural errors).
- **Feedback loop design**: tracking which code constructs trigger findings (`detected_pattern` field) to enable systematic analysis of dismissal patterns.
- The difference between **semantic validation errors** (values don't sum, wrong field placement) and **schema syntax errors** (eliminated by tool use).

## Skills in
- Implementing follow-up requests that include the **original document, the failed extraction, and specific validation errors** for model self-correction.
- Identifying when retries will be ineffective (e.g., information exists only in an external document not provided) versus when they will succeed (format mismatches, structural output errors).
- Adding `detected_pattern` fields to structured findings to enable analysis of false-positive patterns when developers dismiss findings.
- Designing self-correction validation flows: extracting `calculated_total` alongside `stated_total` to flag discrepancies, adding `conflict_detected` booleans for inconsistent source data.
