---
name: stw
description: Use when managing SeekTruth Workflow commands in Claude Code conversations or when a /stw command is requested
---

# 求是工作流 (SeekTruth Workflow)

本 Skill 只做 `/stw` 命令代理。

## Rule

- Prefer `rtk stw ...` when `rtk` is available; otherwise use `stw ...`.
- Pass the user subcommand through to the CLI.
- Show CLI output; do not reimplement workflow logic here.
- If CLI blocks progression, report the blocker and required deliverable.
- Do not manually edit `.stw/` unless the active STW phase requires it.

## Examples

- `/stw status` → run status
- `/stw next` → run next
- `/stw report` → run report
