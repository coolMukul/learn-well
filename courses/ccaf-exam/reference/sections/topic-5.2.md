# Task 5.2 — Design effective escalation and ambiguity resolution patterns

> Domain 5: Context Management & Reliability. Excerpted from the official guide.

## Knowledge of
- Appropriate **escalation triggers**: customer requests for a human, **policy exceptions/gaps** (not just complex cases), and inability to make meaningful progress.
- The distinction between **escalating immediately when a customer explicitly demands it** versus offering to resolve when the issue is straightforward.
- Why **sentiment-based escalation** and **self-reported confidence scores** are unreliable proxies for actual case complexity.
- How **multiple customer matches** require clarification (requesting additional identifiers) rather than heuristic selection.

## Skills in
- Adding explicit escalation criteria with **few-shot examples** to the system prompt demonstrating when to escalate versus resolve autonomously.
- **Honoring explicit customer requests** for human agents immediately without first attempting investigation.
- Acknowledging frustration while offering resolution when the issue is within the agent's capability, escalating only if the customer reiterates their preference.
- Escalating when policy is ambiguous or silent on the customer's specific request (e.g., competitor price matching when policy only addresses own-site adjustments).
- Instructing the agent to **ask for additional identifiers** when tool results return multiple matches, rather than selecting based on heuristics.
