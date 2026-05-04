---
name: stw-investigation
description: Use when STW is in Phase 1, before code changes, when requirements, relevant symbols, risks, or change scope are not yet evidence-backed
---

# STW Phase 1: Investigation

Goal: produce evidence before opinions.

## Required Actions

1. Read `.stw/STW-Workspace.md` and `.stw/Analysis-Template.md`.
2. Inspect only relevant docs/code; use semantic code search first when available.
3. Capture complete definitions/signatures for touched symbols.
4. Fill `.stw/Analysis-Template.md` with:
   - user requirement
   - current behavior
   - relevant files/symbols with `(file:line)` citations
   - risks and constraints
   - change plan table
   - files intentionally not touched
5. Run:

```powershell
rtk stw next
```

If blocked, add missing evidence; do not code.

## Minimum Bar

- At least two source citations.
- No claims without a file/line or command output.
- No implementation until Phase 3.
