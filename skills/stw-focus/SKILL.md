---
name: stw-focus
description: Use when STW is in Phase 2, after investigation, to narrow work to one main contradiction, define attack zones, and prevent scope drift
---

# STW Phase 2: Focus

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
rtk stw next
```

If blocked, narrow or correct ATTACK_ZONE. Do not edit code yet.

## Anti-Drift Rules

- One task only.
- No opportunistic refactors.
- No dependency changes unless named in Phase 1 change plan.
