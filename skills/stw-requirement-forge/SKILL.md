---
name: stw-requirement-forge
description: Use when a user gives a vague product/app/game idea, says “I want to build X”, asks to brainstorm MVP, clarify requirements, discuss a concept, run 需求炼金炉, or avoid coding until product direction is clear
---

# STW Requirement Forge

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

Use the forge before coding when the request is still an idea, not a spec.

## Start

```powershell
stw forge "<user idea>"
stw forge run
stw forge next
# ask the user the questions in .stw/forge/questions.md
stw forge accept "<user confirmed answers/scope>"
stw status
```

## Control Pattern

Do not create a free-form group chat. Use host-controlled independent agents:

1. Start the forge session.
2. Run agents with `stw forge run` or `stw forge run --only architect,qa`.
3. Inspect progress with `stw forge status` and `stw forge inspect <agent>`.
4. Advance only through `stw forge next`.
5. Ask the user only the consolidated questions in `.stw/forge/questions.md`.
6. After the user answers, run `stw forge accept "<answers>"`; this writes `.stw/forge/requirements.md` and starts normal STW Phase 1.

## Model Config

Default `stw forge run` calls the current Codex CLI model via `codex exec`. Claude Code is supported with `--provider claude` via `claude --print`. Use API fallback only when needed:

```powershell
stw forge run --provider codex
stw forge run --provider api
stw forge run --model gpt-5.4
```

API fallback uses an OpenAI-compatible Chat Completions endpoint:

```powershell
$env:STW_LLM_API_KEY="..."
$env:STW_LLM_BASE_URL="https://api.openai.com/v1"
$env:STW_LLM_MODEL="gpt-4o-mini"
```

Fallback env names: `OPENAI_*` or `DEEPSEEK_*`.

## Agent Output Schema

Each diverge output must contain:

```markdown
## 核心判断
## 必须追问用户的问题
## 隐性需求
## 最大风险
## 建议不做
```

Invalid schema means retry once, then discard.

## Rule

The forge output becomes `.stw/forge/questions.md` first. After user confirmation, `forge accept` must create `.stw/forge/requirements.md` and start the normal five-stage STW workflow. Do not implement before `stw status` shows Phase 1 active.

## Natural Language Triggers

Treat these as forge requests: “我想做 AI狼人杀”, “帮我讨论一个产品想法”, “先别开发，帮我把需求聊清楚”, “需求炼金炉”, “brainstorm MVP”, “clarify requirements”.

