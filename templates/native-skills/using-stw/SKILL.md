---
name: using-stw
description: Use when starting any coding task, changing files, debugging, planning implementation, reviewing code, or claiming coding work is complete in a repository that uses SeekTruth Workflow or has a .stw directory
---

# Using STW

STW is mandatory session control, not optional advice.

## Idea Gate

If the user request is a vague product/app/game idea rather than a concrete implementation task, use `stw-requirement-forge` first. Do not run `stw start --desc` directly for fuzzy ideas. The forge must end with `rtk stw forge accept "<answers>"`, which starts normal STW Phase 1.

Examples: “我想做 AI狼人杀”, “先帮我讨论需求”, “需求炼金炉”, “brainstorm MVP”.

## Start Gate

Before planning, editing, testing, or answering implementation details:

```powershell
rtk stw status
```

If there is no active task:

```powershell
rtk stw start --desc "<user original request>"
rtk stw status
```

If `rtk` is unavailable, run `stw ...` directly.

## Phase Routing

- Phase 1 调查研究 → use `stw-investigation`
- Phase 2 抓住主要矛盾 → use `stw-focus`
- Phase 3 集中优势兵力 → use `stw-lockdown`
- Phase 4 实践检验 → use `stw-verification`
- Phase 5 总结与转化 → use `stw-summary`

## Hard Rules

- Do not edit production files before Phase 3.
- Do not move phases mentally; run `rtk stw next`.
- If `stw next` fails, fix the required deliverable only.
- Never claim completion before Phase 4 passes.
- Keep user-facing output brief; let CLI gates provide detail.

## Rationalizations

| Excuse | Reality |
|---|---|
| "Small change" | Still check status first. |
| "I already know the code" | Phase 1 requires evidence. |
| "Tests are unnecessary" | Phase 4 blocks completion. |
| "I'll update STW later" | STW controls the work now. |

