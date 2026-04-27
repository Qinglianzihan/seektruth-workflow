<p align="center">
  <img src="./assets/mao-cover.jpg" width="160" alt="毛泽东选集">
</p>

<h1 align="center">求是工作流</h1>
<p align="center"><em>将《毛泽东选集》哲学方法论转化为 AI 编程的结构化工作纪律。</em></p>

<p align="center">
  <a href="https://www.npmjs.com/package/seektruth-workflow"><img src="https://img.shields.io/npm/v/seektruth-workflow?color=c00" alt="npm"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/seektruth-workflow" alt="node"></a>
  <img src="https://img.shields.io/badge/tests-156%20pass-brightgreen" alt="tests">
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/seektruth-workflow" alt="license MIT"></a>
</p>

---

## 快速安装

```bash
npm install -g seektruth-workflow
```

更新到最新版：

```bash
npm update -g seektruth-workflow
```

要求 Node.js ≥ 18。

## 一分钟上手

```bash
cd your-project
stw init                            # 一次性：侦察项目环境，生成 .stw/
stw start --desc "你的任务描述"      # 开始任务 → 进入阶段 1
stw next                            # 按流程推进，AI 完成每阶段交付物后执行
```

每一步 `stw next` 自动检查交付物、置信度、越界修改、变更计划，不通过不推进。

## 在 AI 编程工具中使用

STW 不绑定任何特定 AI 工具。工作流的核心是 **CLI 把关 + AI 执行**：

```
                  ┌──────────────────────────┐
                  │      stw (你来执行)        │
                  │  init / start / next /    │
                  │  rollback / report        │
                  └──────────┬───────────────┘
                             │ 检查交付物 / 门禁
                             ▼
                  ┌──────────────────────────┐
                  │    AI 助手 (Claude/Codex) │
                  │  读取 .stw/STW-Workspace  │
                  │  填写模板 → 写代码 → 测试  │
                  └──────────────────────────┘
```

### Claude Code

在项目根目录初始化后，直接在对话中告诉 Claude：

> 请读取 `.stw/STW-Workspace.md`，严格按照求是工作流规范完成任务。

或者将 `STW-Workspace.md` 内容写入 `CLAUDE.md`，Claude 每次会话自动加载。

### Codex (OpenAI)

将 `.stw/STW-Workspace.md` 内容粘贴到 Codex 的系统提示或项目指令中。

### 典型会话节奏

```bash
stw start --desc "添加用户认证模块"

# → Claude: "按 STW-Workspace.md 规范，完成阶段 1 调查研究"
# → AI 阅读代码，填写 .stw/Analysis-Template.md

stw next    # 置信度门禁检查 → 通过 → 进入阶段 2
stw next    # ATTACK_ZONE 检查 → 通过 → 进入阶段 3

# → Claude: "在 ATTACK_ZONE 范围内实现认证功能"
# → AI 修改代码，运行测试

stw next    # 越界+变更计划+依赖检查 → 通过 → 进入阶段 4
# 创建 .stw/test-results.json {"passed":true,"total":12,"failed":0}

stw next    # 人工核查清单 → 进入阶段 5
# → Claude: "填写总结报告"
stw report  # 归档，经验教训入库
```

关键点：**AI 负责执行，你负责 `stw next` 把关**。门禁不通过，AI 继续改。

---

## 解决了什么问题

AI 编程助手在长任务中普遍出现上下文腐化、目标漂移、越界修改、盲目信任等问题。求是工作流用毛选方法论建立纪律约束：

| 痛点 | 方法论 | 落地 |
|:---|:---|:---|
| AI 不读代码就写 | 「没有调查就没有发言权」 | 阶段 1 六步认知分析 |
| 凭想象断言 | 「反对主观主义」 | 每条结论标注 (file:line) |
| 乱改无关文件 | 「集中优势兵力」 | ATTACK_ZONE 越界封锁 |
| 随意加依赖 | 「反对党八股」 | 变更计划声明 + 依赖检测 |
| 下次忘记上次的坑 | 「惩前毖后，治病救人」 | 经验教训 + 错误病例跨会话 |
| 用户盲目信任 | 「实践是真理的唯一标准」 | 人工核查清单 |

---

## 工作流

```mermaid
flowchart TD
    A[阶段1 调查研究] --> |"置信度门禁 (6/10)"| B[阶段2 抓住主要矛盾]
    B --> |"ATTACK_ZONE 声明"| C[阶段3 集中优势兵力]
    C --> |"越界检查 + 变更计划 + 依赖检测"| D[阶段4 实践检验]
    D --> |"测试通过 + 人工核查"| E[阶段5 总结与转化]
    E -.-> |"经验教训入库"| F((跨会话记忆))
    
    A -..-> |"不通过 → 补充调研"| A
    D -..-> |"不通过 → stw rollback"| A
```

| 阶段 | 做什么 | 交付物 | 推进条件 |
|:---|:---|:---|:---|
| **1. 调查研究** | 风格侦察 + 六步认知分析 + 变更计划 | `Analysis-Template.md` | 置信度 ≥ 6/10（9 项检查） |
| **2. 抓住主要矛盾** | 声明 ATTACK_ZONE 作战区域 | `STW-Workspace.md` | 包含有效的 ATTACK_ZONE |
| **3. 集中优势兵力** | 按计划修改代码 | `lockdown.json` | 文件越界 + 变更计划 + 依赖 |
| **4. 实践检验** | 运行测试 + 审查 | `test-results.json` | 测试通过 + 人工核查 5 项 |
| **5. 总结与转化** | 记录认知迭代、经验教训、错误病例 | `Summary-Template.md` | 总结填写完成 |

---

## 命令

```bash
stw init                   # 初始化项目
stw init --deep            # 初始化 + 深度扫描 MCP 工具
stw start --desc "..."     # 开始任务（保存描述，中途可对照检查）
stw start --force          # 跳过 git 脏工作树检查
stw status                 # 进度、运行时长、回滚迭代
stw next                   # 推进阶段（自动门禁检查）
stw next --scope-check     # 推进前对照原始需求
stw rollback <原因>        # 回退阶段 1，保留分析记录
stw abort                  # 中止任务
stw report                 # 归档总结（经验教训跨会话复用）
stw stats                  # Token / 会话 / 错误统计
stw stats --log-tokens <N> # 记录 Token 消耗
stw repair                 # 修复/重生成 .stw 文件
```

---

## 哲学映射

| 概念 | 出处 | 实现 |
|:---|:---|:---|
| 调查研究 | 《反对本本主义》 | 六步认知分析 |
| 从群众中来 | 《关于领导方法的若干问题》 | 项目风格侦察 |
| 反对主观主义 | 《反对本本主义》 | (file:line) 强制引用 |
| 反对党八股 | 《反对党八股》 | 变更计划 WHAT+WHY |
| 集中优势兵力 | 《中国革命战争的战略问题》 | ATTACK_ZONE 封锁 |
| 实践论 | 《实践论》 | 测试 + 人工核查 |
| 不打无把握之仗 | 《目前形势和我们的任务》 | 置信度门禁 |
| 波浪式前进 | 《中国革命战争的战略问题》 | 回滚迭代 |
| 惩前毖后 | 《整顿党的作风》 | 错误病例 + 经验教训 |

---

## 推荐阅读

<p align="center">
  📖 <a href="./assets/毛泽东选集.pdf"><strong>《毛泽东选集》（全五卷）— PDF 下载</strong></a>
</p>

<p align="center"><em>"读书是学习，使用也是学习，而且是更重要的学习。"</em></p>

---

<p align="center">MIT · v0.2.0 · <a href="https://github.com/Qinglianzihan/seektruth-workflow">GitHub</a></p>
