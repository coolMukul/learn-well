# Task 4.5 — Design efficient batch processing strategies

> Domain 4: Prompt Engineering & Structured Output. Excerpted from the official guide.

## Knowledge of
- The **Message Batches API**: 50% cost savings, up to 24-hour processing window, **no guaranteed latency SLA**.
- Batch processing is appropriate for **non-blocking, latency-tolerant** workloads (overnight reports, weekly audits, nightly test generation) and **inappropriate** for blocking workflows (pre-merge checks).
- The batch API **does not support multi-turn tool calling** within a single request (cannot execute tools mid-request and return results).
- `custom_id` fields for correlating batch request/response pairs.

## Skills in
- Matching API approach to workflow latency requirements: **synchronous API** for blocking pre-merge checks, **batch API** for overnight/weekly analysis.
- Calculating batch submission frequency based on SLA constraints (e.g., 4-hour windows to guarantee 30-hour SLA with 24-hour batch processing).
- Handling batch failures: resubmitting only failed documents (identified by `custom_id`) with appropriate modifications (e.g., chunking documents that exceeded context limits).
- Using **prompt refinement on a sample set** before batch-processing large volumes to maximize first-pass success rates and reduce iterative resubmission costs.
