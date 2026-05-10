---
name: using-stw
description: Use when starting any coding task, changing files, debugging, planning implementation, reviewing code, or claiming coding work is complete in a repository that uses SeekTruth Workflow or has a .stw directory
---

# Using STW

先读 `skills/skill-maintenance/SKILL.md`。

## Minimal Flow（新会话三步协议）

1. **读 roadmap**：若 `.stw/roadmap.md` 存在，先读完——它记录跨任务路线和下一步候选。
2. **查当前任务**：运行 `rtk stw status` 若可用，否则 `stw status`。
   - 有进行中任务 → 按阶段续上
   - 无进行中任务 → 从 roadmap"下一步"拎一条，跟用户确认后 `rtk stw start --desc "..."` 或 `stw start --desc "..."`
3. **走阶段 skill**：按 `.progress.json` 的 phase 调用对应阶段 skill；让 CLI 门禁决定推进。

## 两层连续性

- `.stw/.progress.json` = 单任务进度（五阶段做到第几步）
- `.stw/roadmap.md` = 跨任务进度（总路线做到第几件任务）

新会话要同时读这两层，才能接得上上次的工作。

## Do Not Hardcode

- no version pins
- no duplicated workflow tables
- no environment-specific assumptions
- no skill-local business logic

## Trigger Map

- Phase 1 → `stw-investigation`
- Phase 2 → `stw-focus`
- Phase 3 → `stw-lockdown`
- Phase 4 → `stw-verification`
- Phase 5 → `stw-summary`
