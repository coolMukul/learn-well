# Scenarios — Summaries and Focus Areas

Overview
- The exam presents scenario-based question sets. Understand each scenario's primary domains, goals, constraints, and typical design tradeoffs.

Scenario 1: Customer Support Resolution Agent
- Goal: 80%+ first-contact resolution; tool examples: get_customer, lookup_order, process_refund, escalate_to_human.
- Focus: agentic loop ordering, programmatic enforcement for business rules, escalation criteria, structured handoff summaries.

Scenario 2: Code Generation with Claude Code
- Goal: integrate Claude Code into dev workflows for generation, refactoring, and CI.
- Focus: CLAUDE.md config, slash commands, plan mode vs direct execution, CI flags.

Scenario 3: Multi-Agent Research System
- Goal: coordinate search, document analysis, synthesis, and reporting with subagents.
- Focus: coordinator decomposition, parallel subagents, provenance tracking, iterative refinement.

Scenario 4: Developer Productivity with Claude
- Goal: assist engineers exploring codebases and automating tasks.
- Focus: built-in tools (Read, Write, Bash, Grep, Glob), CLAUDE.md rules, MCP integration.

Scenario 5: Claude Code for Continuous Integration
- Goal: run automated code reviews and test generation in CI.
- Focus: non-interactive Claude Code flags, structured output in CI, avoiding false positives.

Scenario 6: Structured Data Extraction
- Goal: extract validated structured data from unstructured documents using JSON schemas and retries.
- Focus: schema design, validation-retry loops, batching, human review routing.

Flashcards (scenario-level)
- Q: How many scenarios will be presented during the exam?  
  A: 4 scenarios are presented, randomly chosen from the set.
- Q: Which scenario focuses on provenance and claim-source mappings?  
  A: Scenario 3 (Multi-Agent Research) and Scenario 6 (Structured Extraction) both emphasize provenance.
