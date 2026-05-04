---
name: using-stw
description: Use when starting any coding task, changing files, debugging, planning implementation, reviewing code, or claiming coding work is complete in a repository that uses SeekTruth Workflow or has a .stw directory
---

# Using STW

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

STW is mandatory session control, not optional advice.

## Idea Gate

If the user request is a vague product/app/game idea rather than a concrete implementation task, use `stw-requirement-forge` first. Do not run `stw start --desc` directly for fuzzy ideas. The forge must end with `stw forge accept "<answers>"`, which starts normal STW Phase 1.

Examples: “我想做 AI狼人杀”, “先帮我讨论需求”, “需求炼金炉”, “brainstorm MVP”.

## Start Gate

Before planning, editing, testing, or answering implementation details:

```powershell
stw status
```

If there is no active task:

```powershell
stw start --desc "<user original request>"
stw status
```


## Phase Routing

- Phase 1 调查研究 → use `stw-investigation`
- Phase 2 抓住主要矛盾 → use `stw-focus`
- Phase 3 集中优势兵力 → use `stw-lockdown`
- Phase 4 实践检验 → use `stw-verification`
- Phase 5 总结与转化 → use `stw-summary`

## Hard Rules

- Do not edit production files before Phase 3.
- Do not move phases mentally; run `stw next`.
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

