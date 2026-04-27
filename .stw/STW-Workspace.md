# 求是工作流 (SeekTruth Workflow) — Workspace 规范

> 本文档由 `stw init` 自动生成，基于当前环境的侦察结果本地化适配。
> 生成时间：2026/4/27 09:41:03

---

## 一、本地化环境

**检测到的 AI 工具**：Claude Code (config_dir); Codex CLI (config_dir)

**可用 MCP 服务器**：21 个 MCP 服务器可用

**已安装 Skills**：16 个 Skill 可用

**项目类型**：Node.js

---

## 二、核心原则

1. **调查研究先行** — 没有调查就没有发言权。在编写任何代码前，必须先深入调研相关代码、架构和上下文。
2. **矛盾分析驱动** — 任何任务都只有一个主要矛盾，必须抓住它并集中力量解决。
3. **实践-认识-再实践** — 真理的标准是实践。所有产出必须经过测试验证，失败则返回调查阶段。

---

## 三、五阶段强制工作流

这是 AI 在每次任务中必须遵守的**不可违背**的流程：

| 阶段 | 名称 | 核心要求 | 交付物 |
| :--- | :--- | :--- | :--- |
| 1 | **调查研究** | 阅读相关代码，分析项目背景 | `Analysis-Template.md` 填入的调研报告 |
| 2 | **抓住主要矛盾** | 确定唯一核心任务，锁定目标 | 任务聚焦声明 |
| 3 | **集中优势兵力** | 只在核心任务区域修改，封锁其他文件 | 专注封锁清单 |
| 4 | **实践检验** | 强制测试，失败则返回阶段 1 | 测试通过报告 |
| 5 | **总结与转化** | 记录认知迭代，沉淀知识 | `Summary-Template.md` 填入的总结报告 |

---

## 四、独立审查（民主集中制）

在**阶段 4（实践检验）**，建议调用独立的「审查员」子代理对代码进行独立审查：

> 调用方式（Claude Code）：创建一个新会话，将 `审查员.md` 作为系统提示，提供需要审查的代码变更。

审查员将独立检查：
- 修改是否在 `ATTACK_ZONE` 范围内（纪律遵守）
- 代码质量、安全性、可维护性
- 修改是否解决了主要矛盾

审查报告将作为阶段 4 交付物的补充。

---

## 五、能力注册表

### MCP 工具

| 来源 | 服务器 |
| :--- | :--- |
| codex plugin: build-ios-apps | `xcodebuildmcp` |
| codex plugin: cloudflare | `cloudflare-api` |
| plugin: asana (available) | `asana` |
| plugin: context7 (available) | `context7` |
| plugin: discord (available) | `discord` |
| plugin: fakechat (available) | `fakechat` |
| plugin: firebase (available) | `firebase` |
| plugin: github (available) | `github` |
| plugin: gitlab (available) | `gitlab` |
| plugin: greptile (available) | `greptile` |
| plugin: imessage (available) | `imessage` |
| plugin: laravel-boost (available) | `laravel-boost` |
| plugin: linear (available) | `linear` |
| plugin: playwright (available) | `playwright` |
| plugin: serena (available) | `serena` |
| plugin: telegram (available) | `telegram` |
| plugin: terraform (available) | `terraform` |
| Claude Code (内建) | `ace-tool` |
| Claude Code (内建) | `sequential-thinking` |
| Claude Code (内建) | `memory` |
| Claude Code (内建) | `jshook` |

### Skills

| 名称 | 描述 | 来源 |
| :--- | :--- | :--- |
| brainstorming | You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation. | ~\.claude\skills\brainstorming\SKILL.md |
| dispatching-parallel-agents | Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies | ~\.claude\skills\dispatching-parallel-agents\SKILL.md |
| executing-plans | Use when you have a written implementation plan to execute in a separate session with review checkpoints | ~\.claude\skills\executing-plans\SKILL.md |
| finishing-a-development-branch | Use when implementation is complete, all tests pass, and you need to decide how to integrate the work - guides completion of development work by presenting structured options for merge, PR, or cleanup | ~\.claude\skills\finishing-a-development-branch\SKILL.md |
| frontend-skill | Use when the task asks for a visually strong landing page, website, app, prototype, demo, or game UI. This skill enforces restrained composition, image-led hierarchy, cohesive content structure, and tasteful motion while avoiding generic cards, weak branding, and UI clutter. | ~\.claude\skills\frontend-skill\SKILL.md |
| heyan-seedance-producer | Use when the user gives a short-drama project folder or script and wants plain UTF-8 txt asset image prompts, director storyboards, and per-batch realistic live-action Jimeng/Seedance video prompts based on Heyansheng/Yiyi notes. | ~\.claude\skills\heyan-seedance-producer\SKILL.md |
| receiving-code-review | Use when receiving code review feedback, before implementing suggestions, especially if feedback seems unclear or technically questionable - requires technical rigor and verification, not performative agreement or blind implementation | ~\.claude\skills\receiving-code-review\SKILL.md |
| requesting-code-review | Use when completing tasks, implementing major features, or before merging to verify work meets requirements | ~\.claude\skills\requesting-code-review\SKILL.md |
| subagent-driven-development | Use when executing implementation plans with independent tasks in the current session | ~\.claude\skills\subagent-driven-development\SKILL.md |
| systematic-debugging | Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes | ~\.claude\skills\systematic-debugging\SKILL.md |
| test-driven-development | Use when implementing any feature or bugfix, before writing implementation code | ~\.claude\skills\test-driven-development\SKILL.md |
| using-git-worktrees | Use when starting feature work that needs isolation from current workspace or before executing implementation plans - creates isolated git worktrees with smart directory selection and safety verification | ~\.claude\skills\using-git-worktrees\SKILL.md |
| verification-before-completion | Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always | ~\.claude\skills\verification-before-completion\SKILL.md |
| writing-plans | Use when you have a spec or requirements for a multi-step task, before touching code | ~\.claude\skills\writing-plans\SKILL.md |
| writing-skills | Use when creating new skills, editing existing skills, or verifying skills work before deployment | ~\.claude\skills\writing-skills\SKILL.md |
| seedance-video-workflow | Use when running a Seedance or 即梦 video project that needs an asset-first workflow, full-body three-view character references, workspace asset sorting, 4-15 second director-led shot breakdowns, and copy-pastable image or video prompt packs. | ~\.agents\skills\seedance-video-workflow\SKILL.md |

---

## 六、作战区域声明格式

在阶段 3，使用以下格式声明专注区域：

```markdown
<!-- ATTACK_ZONE: src/orders/* -->
<!-- ATTACK_ZONE: tests/orders/* -->
```

所有不在 ATTACK_ZONE 声明内的文件，AI 不得修改。

---

## 七、冲突解决

未检测到冲突。
