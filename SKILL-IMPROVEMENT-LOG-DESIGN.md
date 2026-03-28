# Skill Improvement Log Design

## Goal

Define the minimum additional logs and artifacts needed to improve Skills in a repeatable way.

The current system already stores:

- input/output messages
- running task history
- structured activity events
- generated artifacts in the experiment workspace

That is enough for manual debugging, but not enough for benchmark-driven Skill improvement.

## Current State

### Already captured

1. Messages
   - Stored in DB and `logs/messages.jsonl`
   - Includes user, assistant, and system messages

2. Process history
   - Stored in DB and `logs/process-history.jsonl`
   - Includes prompt, status, last status, and status history

3. Activity events
   - Stored in `logs/activity-events.jsonl`
   - Includes task, tool, command, file, model, and system events

4. Artifacts
   - Stored under experiment artifacts and workspace files
   - Includes files such as `report.md`, `results/*.json`, `figures/*.png`

5. Export
   - GitHub sync exports `experiment.json`, `conversation.md`, and `artifacts/`

### Current gaps

1. No benchmark run manifest
   - We cannot reliably compare one benchmark run against another.

2. No required artifact check result
   - We know the prompt asked for `report.md` or `results/knowledge_graph.json`, but we do not persist whether they were actually produced.

3. No frozen execution context
   - We do not persist the exact model, skill set, MCP selection, or skill content hash used for a run.

4. No structured evaluation record
   - There is no pass/fail, coverage score, or quality score stored per run.

5. No structured tool I/O trace
   - Activity stores tool names and coarse status lines, but not stable machine-readable request/response summaries.

6. Export is incomplete for improvement work
   - GitHub sync does not currently export activity logs or process logs used for Skill diagnosis.

## Design Principles

1. Keep the first version small
   - Add enough structure for comparison before adding expensive full tracing.

2. Preserve append-only raw logs
   - Existing JSONL logs should remain the source of truth for debugging.

3. Add derived summaries beside raw logs
   - Benchmark manifests and evaluations should be generated as separate files.

4. Separate execution facts from evaluation facts
   - A run manifest should describe what happened.
   - An evaluation result should describe whether it was good enough.

5. Prefer workspace-local files
   - A benchmark run should be inspectable from the experiment directory without needing the database.

## Proposed Additions

### 1. Benchmark run manifest

Add a per-run file:

- `logs/benchmark-runs/<run-id>.json`

Purpose:

- identify a benchmark run uniquely
- freeze the execution context
- allow before/after Skill comparison

Suggested schema:

```json
{
  "runId": "bench-20260329-...",
  "experimentId": "...",
  "taskId": "...",
  "promptSource": "tests/benchmark-prompts.md",
  "promptLabel": "prompt-1-solid-electrolyte",
  "promptText": "...",
  "startedAt": "...",
  "finishedAt": "...",
  "status": "done",
  "model": "gpt-5.4",
  "skill": "scientist",
  "skillHash": "sha256:...",
  "enabledMcpServers": ["ToolUniverse"],
  "githubMcpTools": "all",
  "containerImage": "coreclaw-agent:latest",
  "copilotAuthSource": "settings"
}
```

Notes:

- `skillHash` should be computed from the resolved Skill content copied into the container, not just the Skill name.
- `promptLabel` should be explicit so repeated runs of the same benchmark can be grouped.

### 2. Required artifact check

Add a per-run file:

- `logs/benchmark-runs/<run-id>.artifacts.json`

Purpose:

- persist whether the run produced the files the prompt required
- support simple pass/fail gating

Suggested schema:

```json
{
  "runId": "...",
  "requiredArtifacts": [
    "report.md",
    "results/knowledge_graph.json",
    "docs/hypothesis.json"
  ],
  "checks": [
    {
      "path": "report.md",
      "exists": true,
      "sizeBytes": 18234
    },
    {
      "path": "results/knowledge_graph.json",
      "exists": false,
      "sizeBytes": 0
    }
  ],
  "artifactCoverage": 0.67,
  "allRequiredPresent": false
}
```

MVP rule:

- Only check existence and file size.
- Do not block on semantic content validation in the first version.

### 3. Evaluation result

Add a per-run file:

- `logs/benchmark-runs/<run-id>.evaluation.json`

Purpose:

- store whether the run is usable for Skill improvement
- make benchmark comparisons machine-readable

Suggested schema:

```json
{
  "runId": "...",
  "result": "fail",
  "reasons": [
    "missing_required_artifacts",
    "task_completed_with_error"
  ],
  "scores": {
    "artifactCoverage": 0.67,
    "activityCoverage": 0.92,
    "finalResponsePresent": 1
  },
  "summary": "report.md was generated, but 2 required result files were missing."
}
```

MVP scoring:

- `artifactCoverage`
- `finalResponsePresent`
- `taskEndedWithoutError`

Later scoring:

- schema validation for JSON outputs
- report section presence checks
- LLM-as-judge or rubric-based content scoring

### 4. Execution context snapshot on task start

Extend the existing task activity/task log with these fields at task start:

- resolved model
- experiment skill name
- skill hash
- enabled MCP server names
- benchmark label if present

This can live in:

- the benchmark run manifest
- and optionally the task start activity event for UI visibility

### 5. Structured tool trace summary

Add a new append-only file:

- `logs/tool-trace.jsonl`

Purpose:

- understand which tool sequences correlate with good or bad benchmark outcomes

Suggested schema per line:

```json
{
  "runId": "...",
  "taskId": "...",
  "timestamp": "...",
  "phase": "start",
  "toolName": "ToolUniverse-find_tools",
  "argumentsSummary": "OpenAlex literature search academic papers",
  "resultSummary": null,
  "status": "running"
}
```

Second event on completion:

```json
{
  "runId": "...",
  "taskId": "...",
  "timestamp": "...",
  "phase": "complete",
  "toolName": "ToolUniverse-find_tools",
  "argumentsSummary": "OpenAlex literature search academic papers",
  "resultSummary": "12 candidate tools returned",
  "status": "success"
}
```

MVP scope:

- store summaries only
- do not dump full raw tool payloads yet

### 6. Export benchmark diagnostics

Extend GitHub sync export to include:

- `logs/activity-events.jsonl`
- `logs/process-history.jsonl`
- `logs/messages.jsonl`
- `logs/benchmark-runs/`
- `logs/tool-trace.jsonl`

This makes offline Skill analysis possible from the sync repo.

## Storage Layout

Recommended layout per experiment:

```text
data/experiments/<experiment-id>/
  logs/
    messages.jsonl
    process-history.jsonl
    activity-events.jsonl
    tool-trace.jsonl
    benchmark-runs/
      <run-id>.json
      <run-id>.artifacts.json
      <run-id>.evaluation.json
  artifacts/
    ...
groups/experiment-<experiment-id>/
  report.md
  results/
  figures/
  docs/
  protocols/
```

## Benchmark Run Lifecycle

### On benchmark task start

1. Resolve benchmark label
2. Resolve model, Skill, MCP settings
3. Compute `runId`
4. Write benchmark run manifest with `status = running`

### During execution

1. Append process history as today
2. Append activity events as today
3. Append structured tool trace summaries

### On task finish

1. Update benchmark run manifest with final status and timestamps
2. Scan required artifacts
3. Write artifact check file
4. Write evaluation result

## Priority Order

### Phase 1

Implement first:

1. benchmark run manifest
2. required artifact check
3. simple evaluation result

This is the minimum needed for repeatable Skill comparison.

### Phase 2

Implement next:

4. structured tool trace summary
5. export benchmark diagnostics in GitHub sync

### Phase 3

Implement later:

6. semantic validators for benchmark outputs
7. LLM/rubric scoring
8. benchmark dashboard UI

## Suggested First Implementation Slice

If only one change is implemented first, it should be:

- write `logs/benchmark-runs/<run-id>.json`
- write `logs/benchmark-runs/<run-id>.artifacts.json`
- mark pass/fail based on required artifact presence

Reason:

- this gives immediate visibility into whether a Skill change improved benchmark completion
- it avoids adding heavy tracing before basic benchmark comparison exists

## Non-Goals

Not part of the first iteration:

- full tool request/response payload archival
- token-level streaming replay
- subjective answer quality scoring
- benchmark orchestration UI

## Open Questions

1. How should benchmark prompts declare required artifacts?
   - Hardcoded parser for `tests/benchmark-prompts.md`
   - or explicit YAML/JSON benchmark manifest file

2. Should `skillHash` be based on:
   - only the selected root Skill
   - or the full synced Skill tree copied into the workspace

3. Should benchmark runs be identified by:
   - experiment ID + task ID
   - or a dedicated benchmark run ID independent of task ID

Recommendation:

- Use a dedicated `runId`
- Parse required artifacts from a future machine-readable benchmark manifest
- Hash the full resolved Skill content used for the run