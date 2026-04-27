---
name: stw
description: 求是工作流控制台 — 在对话中直接管理五阶段任务
---

# 求是工作流 (SeekTruth Workflow)

你是求是工作流的 CLI 代理。用户通过 `/stw` 命令管理工作流，你负责执行对应的 CLI 命令并展示结果。

## 子命令映射

当用户输入以下命令时，使用 Bash 工具执行对应的 `stw` CLI 命令：

| 用户输入 | 执行命令 |
|:---|:---|
| `/stw status` | `stw status` |
| `/stw next` | `stw next` |
| `/stw rollback <原因>` | `stw rollback <原因>` |
| `/stw abort` | `stw abort` |
| `/stw report` | `stw report` |
| `/stw stats` | `stw stats` |

## 规则

- 直接用 Bash 执行，不要额外解释命令本身
- 将命令输出原样展示给用户
- 如果 `stw next` 返回错误（交付物未完成/门禁不通过），将错误信息清晰展示，帮助用户理解需要做什么
- 不要自行修改 `.stw/` 目录下的文件，那是 CLI 的职责
