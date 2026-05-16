# Domain 5 — Context Management & Reliability

Summary
- Focus: preserving critical information across long interactions, trimming context, escalation patterns, error propagation, provenance, and session crash recovery.
- Key concerns: avoiding information loss in progressive summaries, structuring persistent "case facts" outside summaries, and returning structured error context for intelligent recovery.

Key Points
- Extract transactional facts (order IDs, amounts, dates) into a persistent `case facts` block included in prompts to preserve critical data.
- Trim verbose tool outputs to relevant fields before adding to conversation history to reduce token waste and position effects.
- Use structured error propagation (failure type, attempted query, partial results) from subagents to enable coordinator recovery.
- For multi-source synthesis preserve claim-source mappings and include publication dates to handle temporal discrepancies.
- Use scratchpad files and state export manifests for crash recovery and session resumption.

Flashcards
- Q: What is the "lost in the middle" effect?  
  A: Models tend to omit findings from middle sections of long inputs while keeping start/end content.
- Q: How can agents preserve provenance across synthesis?  
  A: Require subagents to output claim-source mappings (URL, doc name, excerpt) and preserve them during synthesis.
- Q: What should error propagation include for intelligent recovery?  
  A: Failure type, what was attempted, partial results, and alternative approaches.
- Q: When should you resume a named session vs start fresh with a summary?  
  A: Resume when prior context is still valid; start fresh with a structured summary when prior tool results are stale.
