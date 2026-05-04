---
name: stw-lockdown
description: Use when STW is in Phase 3, when implementation may begin but file changes must stay inside declared ATTACK_ZONE and change plan boundaries
---

# STW Phase 3: Lockdown

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

Goal: implement only inside the declared battlefield.

## Required Actions

1. Generate or verify lockdown:

```powershell
stw next
```

2. If Phase 3 remains active, create/fix `.stw/lockdown.json` using declared ATTACK_ZONE.
3. Edit only files covered by ATTACK_ZONE and Phase 1 change plan.
4. Prefer minimal diffs and existing project style.
5. After implementation, run the smallest relevant test command and record results for Phase 4.

## Stop Conditions

- Need to edit outside ATTACK_ZONE → stop, return to Phase 2/1.
- Need new dependency → stop, update investigation and change plan first.
- Test fails for unknown reason → investigate before changing more files.
