---
name: stw-focus
description: Use when STW is in Phase 2, after investigation, to narrow work to one main contradiction, define attack zones, and prevent scope drift
---

# STW Phase 2: Focus

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

Goal: choose one main contradiction and lock scope.

## Required Actions

1. State the single core task in one sentence.
2. Add ATTACK_ZONE declarations to `.stw/STW-Workspace.md` outside code blocks:

```markdown
<!-- ATTACK_ZONE: src/path/* -->
<!-- ATTACK_ZONE: tests/path/* -->
```

3. Ensure zones cover planned files and exclude unrelated areas.
4. Run:

```powershell
stw next
```

If blocked, narrow or correct ATTACK_ZONE. Do not edit code yet.

## Anti-Drift Rules

- One task only.
- No opportunistic refactors.
- No dependency changes unless named in Phase 1 change plan.
