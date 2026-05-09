---
name: stw-investigation
description: Use when STW is in Phase 1, before code changes, when requirements, relevant symbols, risks, or change scope are not yet evidence-backed
---

# STW Phase 1: Investigation

Thin trigger only. The current workflow rules live in `.stw/STW-Workspace.md`, `.stw/Analysis-Template.md`, and CLI gates.

## Use

1. Read `.stw/STW-Workspace.md` and `.stw/Analysis-Template.md`.
2. Gather only evidence needed for the current task; cite files/lines or command output.
3. Fill the current analysis template, especially scope, risks, and change plan.
4. Run `stw next` (or `rtk stw next` if available) and fix only the gate's reported gaps.

Do not code in Phase 1.
