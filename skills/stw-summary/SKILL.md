---
name: stw-summary
description: Use when STW is in Phase 5, after verification passes, to archive lessons, changed files, tests, and reusable project knowledge
---

# STW Phase 5: Summary

## Command Prefix

Choose the STW command prefix once per session:

1. Check whether `rtk` is available.
2. If available, prefer `rtk stw ...` to save tokens.
3. Otherwise use `stw ...`.
4. Do not assume `rtk` exists.

PowerShell check:

```powershell
Get-Command rtk -ErrorAction SilentlyContinue
```

Examples below use `stw ...`; replace with `rtk stw ...` when `rtk` is available.

Goal: convert completed work into reusable memory.

## Required Actions

1. Fill `.stw/Summary-Template.md` with:
   - task outcome
   - changed files
   - tests run
   - lessons learned
   - follow-up risks
2. Run:

```powershell
stw next
stw report
```

3. Only then say the work is complete.

## Keep It Short

Summaries should be factual and reusable. No narrative padding.
