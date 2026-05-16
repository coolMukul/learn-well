# Task 5.3 — Implement error propagation strategies across multi-agent systems

> Domain 5: Context Management & Reliability. Excerpted from the official guide.

## Knowledge of
- **Structured error context** (failure type, attempted query, partial results, alternative approaches) as enabling intelligent coordinator recovery decisions.
- The distinction between **access failures** (timeouts needing retry decisions) and **valid empty results** (successful queries with no matches).
- Why generic error statuses ("search unavailable") **hide valuable context** from the coordinator.
- Why **silently suppressing errors** (returning empty results as success) or **terminating entire workflows** on single failures are both anti-patterns.

## Skills in
- Returning structured error context including failure type, what was attempted, partial results, and potential alternatives to enable coordinator recovery.
- Distinguishing access failures from valid empty results in error reporting so the coordinator can make appropriate decisions.
- Having subagents implement **local recovery** for transient failures and only propagate errors they cannot resolve, including what was attempted and partial results.
- Structuring synthesis output with **coverage annotations** indicating which findings are well-supported versus which topic areas have gaps due to unavailable sources.
