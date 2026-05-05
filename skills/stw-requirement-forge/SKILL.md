---
name: stw-requirement-forge
description: Use when a user gives a vague product/app/game idea, says “I want to build X”, asks to brainstorm MVP, clarify requirements, discuss a concept, run 需求炼金炉, or avoid coding until product direction is clear
---

# STW Requirement Forge

Thin trigger only. Forge behavior, agent roles, providers, and schemas are owned by the CLI and `.stw/forge/*` outputs.

## Use

1. Start from the user's raw idea with `stw forge "<idea>"` (or `rtk stw forge ...` if available).
2. Use `stw forge status`, `run`, `inspect`, and `next` as the CLI indicates.
3. Ask the user only the consolidated questions produced under `.stw/forge/`.
4. Accept confirmed scope with `stw forge accept "<answers>"`, then check `stw status`.

Do not create a free-form agent chat or implement before normal STW Phase 1 starts.
