# DA Gate Debug Scenario

## Environment

- **opencode version**: 1.17.9
- **Platform**: darwin (macOS)
- **Runtime**: bun
- **Session ID**: ses_107aa8155ffe01ov75Hgmule0V
- **MB3 MCP server**: active (HTTP transport)
- **Task**: TASK-003 (PLAN phase)

## Setup

- Agent `mb3-critic` registered at `~/.config/opencode/agents/mb3-critic.md`
  → symlink to `/Users/vedmalex/work/agent-skills/plugins/opencode/agents/mb3-critic.md`
- Also registered in `~/.config/opencode/opencode.json` or plugin's `opencode.json`
- Agent mode: `subagent`, permissions: read+glob+grep, write/edit/bash=deny

## Steps to Reproduce

1. Ensure a task is in a gated phase (e.g. PLAN)
2. Run `Agent(subagent_type="mb3-critic")` via Task tool
3. Critic returns v2 JSON envelope with `verdict: "REVISE"` or `"PROCEED"`
4. Try `mb3_phase transition(to: "TECH_SPEC")`

## Observed Behavior

- mb3-critic Task invocation succeeds, returns valid v2 envelope
- No `da_review` event is persisted in task events
- `mb3_phase transition` fails with:
  ```
  Error: task TASK-003 cannot transition from PLAN to TECH_SPEC: Devil's Advocate gate is not cleared. No review found.
  ```

## Expected Behavior

- The runtime post-tool hook captures the critic's v2 JSON output
- A `da_review` event (or `da_reviewed` runtime-owned event) is persisted
- `mb3_phase transition` recognizes the gate as cleared when verdict is PROCEED

## Evidence

### Agent file content (/Users/vedmalex/.config/opencode/agents/mb3-critic.md)
```
---
description: "Use this agent as Devil's Advocate..."
mode: subagent
temperature: 0.4
steps: 15
tools:
  read: true
  write: false
  edit: false
  bash: false
  glob: true
  grep: true
permission:
  write: deny
  edit: deny
  bash: deny
---
```

### Task tool invocation
```
task(
  description="DA gate PLAN phase TASK-003",
  prompt="...return ONLY the v2 JSON envelope. No prose, no markdown, no code fences...",
  subagent_type="mb3-critic"
)
```

### Critic output (truncated)
```json
{"schema":"mb3-critic.review/v2","verdict":"REVISE",...}
```

### Event log after invocation
```
No da_review events found for TASK-003
```

### Phase transition result
```
Error: task TASK-003 cannot transition from PLAN to TECH_SPEC: Devil's Advocate gate is not cleared. No review found.
```

## Hypotheses

1. The runtime post-tool hook that captures subagent output may only trigger for specific subagent result shapes (e.g., via MCP, not Task tool)
2. The hook may require the subagent output to go through a specific JSONL channel
3. The hook may be platform-specific and not implemented for opencode (only for claude-code)
4. The `da_reviewed` runtime-owned event may need to be emitted by an MCP tool specifically, not by Task tool completion
5. The process ID 16934 may have launched after agents were added, requiring full restart

## Workaround Attempted

- Emitting `mb3_event(type:"da_review", ...)` — creates advisory review that does NOT clear the gate
