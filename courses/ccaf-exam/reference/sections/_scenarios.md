# Exam Scenarios (6 total — 4 selected per exam)

> Excerpted from the official Claude Certified Architect — Foundations Certification Exam Guide.

## Scenario 1 — Customer Support Resolution Agent

You are building a customer support resolution agent using the Claude Agent SDK. The agent handles high-ambiguity requests like returns, billing disputes, and account issues. It has access to your backend systems through custom MCP tools (`get_customer`, `lookup_order`, `process_refund`, `escalate_to_human`). Your target is 80%+ first-contact resolution while knowing when to escalate.

**Primary domains:** Agentic Architecture & Orchestration, Tool Design & MCP Integration, Context Management & Reliability.

## Scenario 2 — Code Generation with Claude Code

You are using Claude Code to accelerate software development. Your team uses it for code generation, refactoring, debugging, and documentation. You need to integrate it into your development workflow with custom slash commands, CLAUDE.md configurations, and understand when to use plan mode vs direct execution.

**Primary domains:** Claude Code Configuration & Workflows, Context Management & Reliability.

## Scenario 3 — Multi-Agent Research System

You are building a multi-agent research system using the Claude Agent SDK. A coordinator agent delegates to specialized subagents: one searches the web, one analyzes documents, one synthesizes findings, and one generates reports. The system researches topics and produces comprehensive, cited reports.

**Primary domains:** Agentic Architecture & Orchestration, Tool Design & MCP Integration, Context Management & Reliability.

## Scenario 4 — Developer Productivity with Claude

You are building developer productivity tools using the Claude Agent SDK. The agent helps engineers explore unfamiliar codebases, understand legacy systems, generate boilerplate code, and automate repetitive tasks. It uses the built-in tools (Read, Write, Bash, Grep, Glob) and integrates with MCP servers.

**Primary domains:** Tool Design & MCP Integration, Claude Code Configuration & Workflows, Agentic Architecture & Orchestration.

## Scenario 5 — Claude Code for Continuous Integration

You are integrating Claude Code into your CI/CD pipeline. The system runs automated code reviews, generates test cases, and provides feedback on pull requests. You need to design prompts that provide actionable feedback and minimize false positives.

**Primary domains:** Claude Code Configuration & Workflows, Prompt Engineering & Structured Output.

## Scenario 6 — Structured Data Extraction

You are building a structured data extraction system using Claude. The system extracts information from unstructured documents, validates the output using JSON schemas, and maintains high accuracy. It must handle edge cases gracefully and integrate with downstream systems.

**Primary domains:** Prompt Engineering & Structured Output, Context Management & Reliability.
