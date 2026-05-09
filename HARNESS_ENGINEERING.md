# Harness Engineering（驭缰工程）—— AI 编程的系统化治理框架

> 一份面向 AI 编程时代的工程方法论深度调研文档  
> 编写日期：2026-05-09

---

## 一、这是什么

### 1.1 一句话定义

**Harness Engineering（驭缰工程）是一套让 AI Agent 可靠地、大规模地写代码的系统工程方法论。** 它不关注模型本身有多强，而是关注包裹在模型外面的那层"壳"——提示词、工具、上下文策略、钩子、沙箱、子代理、反馈回路、恢复路径——如何协同工作，让一个普通模型也能产生可靠的工程产出。

### 1.2 核心公式

> **Agent = Model + Harness**

一个中等模型配上优秀的 Harness，可以击败一个顶级模型配上糟糕的 Harness。模型的差距在缩小，Harness 的差距在拉大。

### 1.3 起源

2026 年 2 月，OpenAI 发布了一项实验结果：**3 名工程师 + 1,500 个 Codex Agent，5 个月内产出了约 100 万行代码，零行人工编写。** 这 3 名工程师的产出相当于传统 100 人团队。他们不是靠提示词技巧取胜的，而是靠构建了一套完整的约束系统——这就是 Harness Engineering 的由来。

此后，Stripe 的 "Minions" 系统（Agent 每周自动产出上千个可合并 PR）、LangChain 的 TerminalBench 2.0 评测（同一模型经过 Harness Engineering 改造后性能质的飞跃）进一步验证了这一方向。

---

## 二、解决了什么问题

AI 编程助手在长任务中普遍存在以下问题，Harness Engineering 逐一给出工程化解法：

| 痛点 | 表象 | Harness 解法 |
|:---|:---|:---|
| **上下文腐化** | 会话越长，Agent 越"忘事"、越容易跑偏 | Compaction + 全量上下文重置 + 状态快照 |
| **目标漂移** | Agent 做着做着就偏离了原始需求 | AGENTS.md 常驻系统提示 + 范围锁定机制 |
| **越界修改** | 改一个 bug，顺手重构了三个不相关的模块 | AST 结构规则 + 文件边界检查 + 变更计划声明 |
| **模式退化** | Agent 复制项目中已有的坏模式 | 定期垃圾回收 Agent + 质量评分 + 坏模式编码为 lint 规则 |
| **盲目信任** | 人不再看 Agent 写的代码 | 证据链要求（测试/快照/Golden 输出）+ 人工核查清单 |
| **知识流失** | 每次新会话从零开始，上次踩的坑全忘了 | AGENTS.md 自更新 + 错误病例库 + 跨会话记忆 |
| **审查幻觉** | Agent 自我审查时总是给出正面评价 | Planner / Generator / Evaluator 分离模式 |

---

## 三、七大核心原则

### 原则 1：仓库即系统记录（Repo as System of Record）

> 不在仓库里的东西，对 Agent 就不存在。

Slack 里的讨论、Google Docs 里的设计文档、工程师脑子里的默认假设——Agent 都看不到。因此一切决策、规范、计划、经验教训都必须版本化提交到 Git 仓库。

### 原则 2：地图而非手册（Map, Not Encyclopedia）

> AGENTS.md 是 100 行的目录页，不是 1000 页的规则书。

采用**渐进式信息披露**：入口文件只做索引，指向更深层的文档。每个规则都必须追溯到一次真实的失败经历——**不预先设计规则，只在踩坑后编码规则**（The Ratchet Principle）。

### 原则 3：机械化执行（Mechanical Enforcement）

> 文档会腐烂，lint 规则不会。

代码风格、导入边界、架构约束——这些不能靠"文档约定"，必须编码为机器可执行的检查：
- 格式化 + Lint（如 ESLint、ruff）
- 导入边界检查（如 Import Linter、grimp）
- AST 结构规则（如 ast-grep）
- 快照测试 + Golden 输出

**静默成功，失败才说话**：检查通过则 Agent 无感知，失败时才注入错误信息让 Agent 自我纠正。

### 原则 4：Agent 可读性（Agent Readability）

> 优先为 AI 的推理能力优化代码库。

选"无聊"的技术栈（API 稳定、训练集覆盖好、社区规范统一）。花哨的新框架、自创的 DSL、非标准的目录结构都会增加 Agent 的认知负担。

### 原则 5：吞吐量改变合并哲学（Throughput Changes Merge Philosophy）

> 纠错成本低，等待成本高。

PR 生命周期要短。可自动修复的故障通过后续重跑解决，不阻塞合并。这是从"人工审查每个改动"到"系统保证每个改动"的转变。

### 原则 6：熵管理 = 垃圾回收（Entropy Management as Garbage Collection）

> Agent 会复现仓库中已有的模式，包括坏模式。

需要定期运行清理 Agent，扫描代码库中的模式退化、更新质量评分、将新的坏模式编码为 lint 规则。Harness 是一个**活的系统**，不是一次性配置。

### 原则 7：人类掌舵，Agent 执行

> 工程师不再是代码实现者，而是系统导演。

人类负责：设计环境、定义意图、构建反馈回路、编码失败模式。Agent 负责：在这个环境里写代码、跑测试、自我纠正。

---

## 四、六道门禁（The Six Gates）

Harness Engineering 规范定义了六道递进门禁，每次代码变更必须依次通过：

| 门禁 | 名称 | 做什么 | 实现手段 |
|:---|:---|:---|:---|
| **Gate A** | 格式化 + Lint | 确定性风格约束 | ESLint / ruff / prettier |
| **Gate B** | 导入边界 | 架构约束——谁可以 import 谁 | Import Linter / grimp |
| **Gate C** | 结构棘轮 | 禁止特定 AST 模式，防止退化 | ast-grep / jscodeshift |
| **Gate D** | 快照测试 | 行为锁定——输出变化必须显式确认 | syrupy / jest snapshots |
| **Gate E** | Golden 输出 | 端到端确定性产物对比 | 预生成的标准输出文件 |
| **Gate F** | 数值等价性 | 数学/ML/仿真重构的容差校验 | 自定义数值比较器 |

**核心理念**：每道门禁都是一次"这只改动安全吗"的自动回答。Gate A 回答"风格对吗"，Gate B 回答"边界对吗"，Gate C 回答"结构对吗"……一层比一层更语义化。

---

## 五、七层技术架构

从工程落地的角度，Harness Engineering 可以分为七层：

### 第 1 层：项目搭建层（Scaffolding）

**做什么**：让新项目（或新模块）在 30 秒内拥有完整的 Harness 骨架。

**包含组件**：
- 约束规范库（命名规范、允许/禁止的 API 列表）
- 上下文模板（项目结构、依赖关系元信息）
- 初始化脚本（自动生成 AGENTS.md、.gitignore、CI 配置）

**落地要点**：每个团队维护一个 `project-template/`，新项目从模板创建，而不是每次从零搭建约束系统。

### 第 2 层：上下文工程层（Context Engineering）

**做什么**：动态管理 Agent 的上下文窗口，让最重要的信息始终在可见范围内。

**包含机制**：
- **分层缓存**：基础层（项目配置，常驻）、会话层（当前任务，中等优先级）、临时层（用户输入，即时）
- **智能截断**：基于语义重要性评分决定保留什么
- **渐进式披露**：Skills 按需加载，不是一次性塞入所有指令

**落地要点**：AGENTS.md 控制在 60 行以内，每个规则必须能追溯到一次具体失败。用 Compaction 自动摘要旧上下文，用文件系统卸载大块输出。

### 第 3 层：约束与防护层（Guardrails）

**做什么**：构建四道安全防线，让 Agent 在边界内工作。

| 防线 | 机制 | 示例 |
|:---|:---|:---|
| 输入验证 | 正则/模式匹配过滤非法请求 | 拒绝包含 `DROP TABLE` 的输入 |
| 输出过滤 | AST 解析检查代码安全 | 检查生成代码是否包含硬编码密钥 |
| 执行监控 | 实时跟踪操作路径 | 记录每次文件读写、命令执行 |
| 熔断机制 | 异常行为触发自动回滚 | 连续 3 次越界修改 → 锁定写权限 |

**落地要点**：用 Hook 在关键生命周期节点（工具调用前、文件编辑后、提交前）注入检查逻辑。

### 第 4 层：多 Agent 架构层（Multi-Agent Architecture）

**做什么**：规划 Agent 间的协作模式，让多个 Agent 分工而不打架。

**三种经典模式**：

| 模式 | 结构 | 适用场景 |
|:---|:---|:---|
| 主从模式 | Master 派发任务，Worker 执行 | 已知明确需求的实现任务 |
| 流水线模式 | 解析 → 生成 → 验证，各负责一阶段 | 代码生成 + 自动审查 |
| 对等模式 | Agent 通过消息队列自主协商 | 复杂需求的多角度讨论 |

**关键原则**：**Planner / Generator / Evaluator 必须分离**。Agent 在审查自己产出时会系统性地给出正面评价——让不同的 Agent 来生成和评估。

### 第 5 层：评估与反馈层（Evaluation & Feedback）

**做什么**：建立闭环优化系统，让每次失败都成为下次的改进。

**三个核心组件**：
- **质量评估**：定义通过率、复杂度、覆盖率等 10+ 指标
- **反馈收集**：记录人工修改行为作为训练数据，识别高频修改模式
- **自适应调整**：根据评估结果动态调整约束参数

**落地要点**：每个 Work Chunk 必须产出证据（测试结果、快照对比、Golden diff）。没有证据的改动不算完成。

### 第 6 层：长时间任务层（Long-Running Tasks）

**做什么**：解决 Agent 在长会话中的状态漂移和上下文腐化。

**三个关键机制**：
- **状态快照**：定期保存进度到 `.progress.json`，可从中断点恢复
- **全量上下文重置**：销毁旧会话，从一份紧凑的交接文件重建新会话
- **Ralph Loop**：Hook 拦截 Agent 的退出意图，向新上下文窗口重新注入原始提示

**落地要点**：不是拼命压缩上下文让它多活一会儿，而是主动重置上下文，让 Agent 每次都在干净的窗口里工作。

### 第 7 层：诊断工具层（Diagnostic Tools）

**做什么**：当 Agent 出问题时，能快速定位根因。

**四类诊断**：

| 类型 | 作用 |
|:---|:---|
| 日志分析 | 结构化记录每步操作和时间戳 |
| 性能剖析 | 识别哪些环节消耗最多 token/时间 |
| 行为回放 | 可视化展示 Agent 的决策路径 |
| 根因分析 | 通过决策树定位到具体哪个约束/规则失效 |

**落地要点**：诊断不是事后补的，是在设计 Harness 时就嵌入的。每个门禁都应该输出结构化日志。

---

## 六、怎么做——实践路线图

### 6.1 从零开始的三个里程碑

**里程碑 1：写好 AGENTS.md（第 1 周）**
- 控制在 60 行以内
- 每条规则背后有一个真实的踩坑记录
- 包含：项目概述、目录结构地图、技术栈说明、关键约束、测试命令
- 不要写风格指南（那是 lint 工具的事），不要写最佳实践（那是 AST 规则的事）

**里程碑 2：挂上机械化门禁（第 2-3 周）**
- Gate A：配置 linter + formatter，CI 强制通过
- Gate B：配置 Import Linter，定义模块边界
- Gate C：配置 3-5 条 ast-grep 规则，禁止已知的坏模式
- 用 Hook 在每次 Agent 编辑后自动运行，静默成功，失败才出声

**里程碑 3：建立证据链（第 4 周起）**
- Gate D：关键模块加上快照测试
- Gate E：核心流程产出 Golden 输出
- 每个 Work Chunk 必须包含"改了什么 → 怎么验证 → 如何回滚"

### 6.2 不同规模团队的适配

| 团队规模 | 优先级 | 策略 |
|:---|:---|:---|
| 个人 / 2-3 人 | AGENTS.md + Gate A + Gate C | 先让 Agent 不跑偏，再逐步加约束 |
| 中型团队 (5-20 人) | 完整六道门禁 + 评估反馈层 | 建立团队级约束规范库 |
| 大型企业 (50+ 人) | 定制 Harness 平台 + 监控告警 | 将 Harness 作为基础设施运营 |

### 6.3 Ratchet 原则——不预先设计，只在踩坑后编码

这是 Harness Engineering 最关键的实践法则：

> 1. AGENTS.md 中的每一条规则，都必须链接到一次**真实的、具体的失败经历**
> 2. 新约束只在观察到具体问题后才添加
> 3. 旧约束只在有能力的模型让它们变得多余时才删除
> 4. **这解释了为什么最好的 Harness 不能下载**——它是被你的具体失败史塑造的

### 6.4 Work Chunk（工作块）——最小可验证的变更单元

每一次代码变更必须打包为 Work Chunk：

1. **一件事**：一个 Chunk 只改变一件事
2. **Harness 调整**：如果这次改动暴露了 Harness 的缺口，先加强 Harness
3. **证据产出**：测试、快照、Golden diff——至少一种
4. **所有门禁通过**：Gate A→F 全部绿灯
5. **回滚方案**：写清楚怎么撤销

---

## 七、与求是工作流（STW）的关系

求是工作流本质上是 **Harness Engineering 的一种具体实现**，特别强调哲学方法论层面的纪律约束。两者的映射关系：

| Harness Engineering 概念 | 求是工作流对应 |
|:---|:---|
| AGENTS.md 常驻提示 | CLAUDE.md + `.claude/skills/` Skill 体系 |
| Gate A-C（格式/导入/结构） | 阶段 4 实践检验（测试 + 审查） |
| 约束与防护层 | ATTACK_ZONE 越界封锁 + 变更计划声明 |
| 熔断机制 | stw rollback → 回到阶段 1 重新调查 |
| 多 Agent 分离审查 | 审查员子代理（`审查员.claude.md`） |
| 评估与反馈层 | 信心度门禁（≥6/10）+ 人工核查 5 项清单 |
| 长时间任务层 | 阶段状态机 + 波浪式前进（回退迭代） |
| Ratchet 原则 | 经验教训入库 + 错误病例跨会话复用 |
| Work Chunk 证据要求 | 每条结论标注 (file:line) + 测试通过才推进 |
| 仓库即系统记录 | `.stw/` 一切版本化 + reports 归档 |

**求是工作流可以在以下方向升级以更完整地实现 Harness Engineering**：

1. **六道门禁的机械化**：当前 STW 的门禁主要是文档约定 + CLI 检查，可以引入 ast-grep、Import Linter、快照测试作为可选的 Gate C/D/E 插件
2. **Hook 集成**：利用 Claude Code 的 Hook 机制，在文件编辑后自动运行 lint 和边界检查，实现"静默成功，失败才出声"
3. **Work Chunk 模板**：在 STW-Workspace.md 中增加 Work Chunk 标准格式，要求每个变更附带证据和回滚方案
4. **垃圾回收 Agent**：新增一个周期性运行的清理 Agent，扫描项目中的模式退化
5. **Planner/Evaluator 分离**：将当前的单一审查员扩展为独立的 Planner（阶段 1-2）和 Evaluator（阶段 4）
6. **诊断工具层**：完善 `stw stats` 命令，增加日志分析、行为回放、根因分析能力

---

## 八、关键参考资源

| 资源 | 链接 |
|:---|:---|
| Harness Engineering 规范仓库（HES v1） | [github.com/alchemiststudiosDOTai/harness-engineering](https://github.com/alchemiststudiosDOTai/harness-engineering) |
| Harness Engineering 中文学习指南 | [github.com/deusyu/harness-engineering](https://github.com/deusyu/harness-engineering) |
| Addy Osmani: Agent Harness Engineering | [addyosmani.com/blog/agent-harness-engineering](https://addyosmani.com/blog/agent-harness-engineering) |
| OpenAI 百万行代码实验 | [thepaper.cn](https://m.thepaper.cn/newsdetail_forward_32618365) |
| 阿里云：Harness Engineering 实战指南 | [developer.aliyun.com/article/1724147](https://developer.aliyun.com/article/1724147) |
| 百度：七层架构解析 | [developer.baidu.com/article/detail.html?id=6932169](https://developer.baidu.com/article/detail.html?id=6932169) |

---

> *"Good agent building is an exercise in iteration. You can't do iterations if you don't have a v0.1."*  
> *—— Addy Osmani*
