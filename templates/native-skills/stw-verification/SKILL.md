---
name: stw-verification
description: Use when STW is in Phase 4, before claiming a fix or feature is complete, after code changes or test results need validation
---

# STW Phase 4: Verification

Goal: prove the result with commands, not confidence.

## Required Actions

1. Run the smallest relevant tests, then broader tests if risk requires.
2. Save pass evidence in `.stw/test-results.json` or use the project-approved STW marker.
3. Check changed files against ATTACK_ZONE and change plan:

```powershell
rtk stw next
```

4. If `stw next` fails, fix only the reported issue.
5. If tests fail, return to investigation before broad edits.

## Evidence Format

Use command, exit code, and short result. Do not paste huge logs.

## Red Flags

- "Looks good" without command output.
- Marker file without real test run.
- Ignoring changed files outside ATTACK_ZONE.
