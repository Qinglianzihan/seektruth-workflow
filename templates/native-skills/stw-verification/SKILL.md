---
name: stw-verification
description: Use when STW is in Phase 4, before claiming a fix or feature is complete, after code changes or test results need validation
---

# STW Phase 4: Verification

Thin trigger only. The current workflow rules live in `.stw/STW-Workspace.md`, project tests, and CLI gates.

## Use

1. Run the smallest relevant verification command, then broader checks only if risk requires.
2. Save concise evidence using the current STW-approved file/marker.
3. Run `stw next` (or `rtk stw next` if available).
4. If blocked or tests fail, fix only the proven issue or return to investigation.

Never claim completion from confidence alone.
