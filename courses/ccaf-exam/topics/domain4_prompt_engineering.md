# Domain 4 — Prompt Engineering & Structured Output

Summary
- Focus: writing explicit prompts, using few-shot examples, enforcing structured output with tool_use and JSON schemas, implementing validation and retry loops, and designing batch processing strategies.
- Key concerns: reducing false positives with explicit criteria, avoiding hallucination by allowing nullable fields, and using schema-driven extraction with retries guided by validation errors.

Key Points
- Prefer explicit criteria and concrete examples over vague instructions to improve precision.
- Few-shot examples (2–4 targeted examples) help the model generalize and reduce inconsistency.
- Use `tool_use` with JSON schemas and `tool_choice` settings (`auto`, `any`, forced) to enforce structured output.
- Design schemas with optional/nullable fields and `other`+detail patterns to avoid fabrication.
- Implement retry-with-error-feedback: include validation errors in the retry prompt to guide corrections.
- Batch processing (Message Batches API) is suitable for latency-tolerant tasks; not for blocking pre-merge checks.

Flashcards
- Q: What ensures syntax-valid structured output from the model?  
  A: Using `tool_use` with strict JSON schemas.
- Q: What `tool_choice` setting forces the model to call a specific tool?  
  A: A forced tool selection object: `{"type":"tool","name":"..."}`.
- Q: How should schemas account for missing fields in source docs?  
  A: Make fields optional/nullable and provide enum values like "unclear" or "other"+detail.
- Q: When is the Message Batches API appropriate?  
  A: For non-blocking, latency-tolerant batch jobs (overnight reports), not for blocking checks.
- Q: What's the value of retry-with-error-feedback?  
  A: It guides the model to correct format/semantic errors by showing specific validation failures.
