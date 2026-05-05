---
name: stw-lockdown
description: Use when STW is in Phase 3, when implementation may begin but file changes must stay inside declared ATTACK_ZONE and change plan boundaries
---

# STW Phase 3: Lockdown

Thin trigger only. The current workflow rules live in `.stw/STW-Workspace.md`, `.stw/lockdown.json`, and CLI gates.

## Use

1. Run `stw next` (or `rtk stw next` if available) to generate/verify lockdown.
2. Edit only files allowed by current `ATTACK_ZONE` and the Phase 1 change plan.
3. Keep diffs minimal and follow existing project style.
4. Record the smallest relevant verification command/result for Phase 4.

If work needs files outside scope, stop and return to the proper STW phase.
