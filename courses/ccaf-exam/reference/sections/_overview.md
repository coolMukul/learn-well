# Exam Overview

> Excerpted from the official Claude Certified Architect — Foundations Certification Exam Guide.

## What the certification validates

Practitioners can make informed decisions about tradeoffs when implementing real-world solutions with Claude. The exam tests foundational knowledge across:

- Claude Code
- Claude Agent SDK
- Claude API
- Model Context Protocol (MCP)

Questions are grounded in realistic scenarios drawn from actual customer use cases: customer support agents, multi-agent research pipelines, Claude Code in CI/CD, developer productivity tools, and structured extraction from unstructured documents. Candidates must demonstrate not only conceptual knowledge but practical judgment about architecture, configuration, and tradeoffs in production deployments.

## Target candidate

A solution architect who designs and implements production applications with Claude. Hands-on experience with:

- Building agentic applications using the Claude Agent SDK (multi-agent orchestration, subagent delegation, tool integration, lifecycle hooks)
- Configuring and customizing Claude Code for team workflows (CLAUDE.md files, Agent Skills, MCP server integrations, plan mode)
- Designing MCP tool and resource interfaces for backend system integration
- Engineering prompts that produce reliable structured output (JSON schemas, few-shot examples, extraction patterns)
- Managing context windows across long documents, multi-turn conversations, multi-agent handoffs
- Integrating Claude into CI/CD for automated code review, test generation, PR feedback
- Making sound escalation and reliability decisions (error handling, human-in-the-loop, self-evaluation)

Typical: 6+ months of practical experience with Claude APIs, Agent SDK, Claude Code, MCP.

## Scoring

- All multiple choice. One correct + three distractors per question.
- Distractors are options a candidate with incomplete knowledge or experience might choose.
- No penalty for guessing; unanswered questions count as incorrect.
- Pass / fail designation. Scaled score 100–1000. **Minimum passing score: 720.**
- Scaled scoring equates scores across forms with slightly different difficulty.

## Content domains and weightings

| Domain | Weighting |
| --- | --- |
| Domain 1 — Agentic Architecture & Orchestration | 27% |
| Domain 2 — Tool Design & MCP Integration | 18% |
| Domain 3 — Claude Code Configuration & Workflows | 20% |
| Domain 4 — Prompt Engineering & Structured Output | 20% |
| Domain 5 — Context Management & Reliability | 15% |

## Scenario structure

The exam uses scenario-based questions. **4 scenarios are presented per exam, picked at random from a pool of 6.** See [_scenarios.md](_scenarios.md).
