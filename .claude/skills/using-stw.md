---
name: using-stw
description: Use when starting any coding task, changing files, debugging, planning implementation, reviewing code, or claiming coding work is complete in a repository that uses SeekTruth Workflow or has a .stw directory
---

# Using STW

先读 `skills/skill-maintenance/SKILL.md`。

## Minimal Flow

1. Run `rtk stw status` if available, otherwise `stw status`.
2. If no active task, start one with `rtk stw start --desc "<user original request>"` or `stw start --desc "<user original request>"`.
3. Use the phase-specific skill only when needed.
4. Let CLI gates decide progression.

## Do Not Hardcode

- no version pins
- no duplicated workflow tables
- no environment-specific assumptions
- no skill-local business logic

## Trigger Map

- Phase 1 → `stw-investigation`
- Phase 2 → `stw-focus`
- Phase 3 → `stw-lockdown`
- Phase 4 → `stw-verification`
- Phase 5 → `stw-summary`

