---
name: stw-work-methods
description: Use when the user or another skill explicitly references 《党委会的工作方法》 / work methods methodology / 方法论总纲 / the 12-point Party Committee methodology — explicit manual reference only, do not auto-trigger on generic coding tasks
---

# STW Work Methods — 《党委会的工作方法》12 条方法论总纲

> **哲学底座：毛泽东《党委会的工作方法》（1949-03-13 中共七届二中全会讲话）**
>
> 这 12 条是毛选里最实用、最工程化的一篇。本文把 12 条对位 AI 编程纪律，保留原号，不硬凑——
> 2 条（§1 当"班长" / §4 问下级）侧重党内集体领导制度，对 AI agent 不直接对位，如实说明。
>
> **与 Harness Engineering 的对照**：Osmani 的 8 组件清单讲"harness 包含什么"，
> Anthropic 讲 Planner/Generator/Evaluator 三角，本篇讲**按什么思维方法用这些组件**。
> 两者是"工具"与"方法"的关系（参见 `HARNESS_ENGINEERING.md` 与 `毛选方法论.md` §五）。
>
> **范围说明**：`毛选方法论.md` §3.1 草表曾列"一万年太久 → PR 生命周期短"，
> 该句出自《满江红·和郭沫若同志》，不属《党委会的工作方法》12 条，
> 本总纲严格以本篇 12 条为限，不收。

## 使用场景

按名显式调用，不走自动触发——避免与 stw-focus / stw-investigation 等阶段 skill 冲突。典型触发：

- 用户问"党委会的工作方法怎么对位到 STW"
- 其他 skill（如 Planner / Evaluator agent）在决策点引用本总纲
- 制定跨阶段工作节奏（如同时管多任务时如何"弹钢琴"）
- 写方法论文章或对外解释 STW 哲学底座时

## 12 条对位表

### 1. 当"班长"

> *"党委书记要善于当'班长'。"*

**原意**：党委书记是班组长，要团结委员们开好会、完成好任务。

**AI 编程对位**：本条侧重党内集体领导制度，**对 AI agent 不直接对位**——用户不是班长 / 委员的关系。但可借鉴"协调者角色"思路：当用多 agent（Planner + Generator + Evaluator）协作时，主控流程（state-machine）扮演"班长"角色，调度各 agent 按节奏出场。

**对应 STW 模块**：`state-machine` 五阶段编排 / `bin/stw.js` 命令分派。
**Harness 对位**：Orchestration（编排）。

---

### 2. 把问题摆到桌面上来

> *"有了问题就开会，摆到桌面上来讨论，规定它几条，问题就解决了。"*

**AI 编程对位**：所有讨论、决策、约束必须**落盘**，不靠 agent 记忆或会话历史。`Analysis-Template.md` / `STW-Workspace.md` / `roadmap.md` 都是"桌面"。

**对应 STW 模块**：`.stw/Analysis-Template.md` 阶段 1 调查落盘；`.stw/STW-Workspace.md` 任务规格；`.stw/roadmap.md` 跨任务路线。
**Harness 对位**：OpenAI 讲的 "Repo as System of Record"；Osmani 的 CLAUDE.md / AGENTS.md 常驻指令文件。

---

### 3. 互通情报

> *"'互通情报'的意思……党委的同志必须互通情报，互相交换意见。"*

**AI 编程对位**：不同 agent / 不同阶段之间要有**明示交接**，不能靠猜测对方做了什么。阶段交接通过 `.progress.json` + gate 报告显式传递。

**对应 STW 模块**：`planner-report.md` / `reviewer-report.md` 阶段 2/4 的独立 agent 交接文件；`events.jsonl` 事件流让下游 agent 能回溯上游做了什么。
**Harness 对位**：HES v1 的 Work Chunk 交接文档（`docs/chunks/NNN-<slug>.md`）；OpenAI 讲的 Repo as System of Record（仓库即系统记录）。

---

### 4. 不懂得和不了解的东西要问下级

> *"遇事要先听听下面干部的意见，不要轻易表示赞成或反对。"*

**AI 编程对位**：本条侧重党内领导制度，**对 AI agent 不直接对位**。可借鉴"先听后判"思路：阶段 1 调查完成前禁止做任何结论（对应"一切结论产生于调查情况的末尾"），这是"先问再判"的工程化体现。

**对应 STW 模块**：`confidence-gate` 置信度 <6/10 禁止推进；阶段 1 必须"先问用户、再查外部、最后读代码"的三步走。
**Harness 对位**：不直接对位。

---

### 5. 学会"弹钢琴"

> *"弹钢琴要十个指头都动作，不能有的动有的不动……我们不论做什么工作都要学会弹钢琴。"*

**AI 编程对位**：多任务并行的**节奏控制**——不是同时做 12 件事，而是主次有序、轻重缓急分明。跨任务 roadmap 就是"钢琴谱"。

**对应 STW 模块**：`.stw/roadmap.md` 跨任务路线图；`error-registry.js` 跨会话错误库让多任务不撞同一坑。
**Harness 对位**：没有对应英文术语，这是 STW 的中文原典延伸（见 `毛选方法论.md` §3.2 实践论循环补全）。

---

### 6. 要"抓紧"

> *"所谓'抓紧'……就是说不仅要抓，而且要抓得很紧……凡是没有抓紧的事情是抓不住的。"*

**AI 编程对位**：**主要矛盾抓不住就抓不牢**——阶段 2 必须声明唯一主要矛盾 + 最小 ATTACK_ZONE，不做就是"松劲"。

**对应 STW 模块**：`state-machine` 阶段 2→3 门禁（必须有 ATTACK_ZONE 声明）；`lockdown.js` 越界封锁。
**Harness 对位**：HES v1 的 Gate 门禁纪律（抓住主要矛盾不许绕过）；Anthropic 讲的 Planner 阶段锚定（决策点一经声明不松手，STW 延伸的 commitment 语义）。

---

### 7. 胸中有"数"

> *"情况和问题都要抓住它们的数量方面，有基本的数量的分析。"*

**AI 编程对位**：**量化思维贯穿输入和输出两端**——

- **输入端胸中有数**（调查阶段）：置信度打分（≥6/10）、任务关键词对齐率（≥50%）、源码引用条数（≥2）、表格行强检（≥1 行三列非空）。
- **输出端胸中有数**（观测阶段）：事件流（`events.jsonl`）、token 成本、测试通过率、ATTACK_ZONE 覆盖度。

没有数字就是"心中无数、胡乱推进"。

**对应 STW 模块**：`confidence-gate.js`（输入）；`events.js` + `replay` 命令（输出）；`stats.js` token 追踪。
**Harness 对位**：Osmani 8 组件清单中的 Observability（可观测性）。

---

### 8. "安民告示"

> *"开会以前要把要讨论的问题先通知参加会的人，使他们有所准备。"*

**AI 编程对位**：**变更计划提前声明**——阶段 1 §4.5 必须列出所有将要改动的文件；阶段 3 越界即违规。用户和 agent 都"有所准备"，不出意外修改。

**对应 STW 模块**：`Analysis-Template.md` §4.5 变更计划声明；`lockdown.checkChangePlan` 阶段 3→4 交叉验证；`lockdown.checkDepsChange` 依赖清单警告。
**Harness 对位**：Anthropic 的 sprint contract（合约上列明本轮工作边界）。

---

### 9. "精兵简政"

> *"'精兵简政'……机构庞大，文牍繁多，这是一种官僚主义。"*

**AI 编程对位**：**反对过度工程**——

- 不加用不到的抽象、不加"以防万一"的分支、不预设三层未来需求
- 三行重复胜过过早抽象
- bug 修复不顺路重构；单次操作不写通用 helper
- 不加对内部代码和框架保证的防御式校验，只在系统边界（用户输入、外部 API）校验

**对应 STW 模块**：`lockdown.js` ATTACK_ZONE 最小化；阶段 3 变更计划声明强制"每个文件要有改动理由"。
**Harness 对位**：OpenAI 讲的"短 AGENTS.md"；HES v1 讲的"don't add features beyond task"；Anthropic 讲的最小合约。

---

### 10. 团结和自己意见不同的同志

> *"一定要注意团结那些和自己意见不同的同志一道工作。"*

**AI 编程对位**：**不排斥对立意见、不一言堂**——

- Planner / Evaluator 分离：自审必自夸，必须让不同的 agent 独立出书面报告
- 多工具协同：lint / AST / type checker / test runner 都是"意见不同的同志"，统统要听
- 需求炼金炉：`forge` 命令让多 agent 对同一需求分头提案、交锋、综合

**对应 STW 模块**：`templates/规划师.md` + `templates/审查员.md` 独立 agent 分离；`forge.js` 多 agent 需求讨论；`hook.js` PostToolUse lint / ATTACK_ZONE 跨工具协作。
**Harness 对位**：Anthropic 明列的 Planner/Generator/Evaluator 分离；Osmani 的"多工具协同"。

---

### 11. 力戒骄傲

> *"这对领导者来说是一个原则问题，也是保持团结的一个重要条件。"*

**AI 编程对位**：**agent 自审必自夸，必须让不同 agent 交叉检查**——

- 同一个 agent 既写代码又自审，几乎只会给正面评价（Anthropic 一手源原文）
- Planner 不能自己当 Evaluator；阶段 2 的独立规划师和阶段 4 的独立审查员是制度化的"力戒骄傲"
- 置信度自评分 vs gate 实测分数必须独立

**对应 STW 模块**：`templates/规划师.md` 规划独立、`templates/审查员.md` 审查独立；`config.plannerReviewer.enabled` 可关但默认开。
**Harness 对位**：Anthropic 明列的 Evaluator 独立原则；HES v1 的 Gate 六道门禁都是"自审不可信"的工程化。

---

### 12. 划清两种界限

> *"我们必须学会分清这些事物，划清两种界限：第一是革命与反革命……第二是革命中工作的成绩与缺点的界限。"*

**AI 编程对位**：**边界意识**——

- **"革命与反革命"的界限** → ATTACK_ZONE 内 vs 外：只改声明区域，越界即违规
- **"成绩与缺点"的界限** → bug 分级：破坏性 bug（数据错误、安全漏洞）必须彻底封锁；风格 bug（可读性、命名）用 ratchet 渐进改进

**对应 STW 模块**：`lockdown.js checkFileBounds` ATTACK_ZONE 硬边界；`ratchet.js` 规则渐进改进机制。
**Harness 对位**：HES v1 的 Gate 边界；Anthropic 的 sprint 合约边界。

---

## 12 条节奏总结

| 阶段 | 主导方法 | 对位原则 |
| :--- | :--- | :--- |
| 阶段 1 调查 | §7 胸中有数 A | 先数据后结论 |
| 阶段 2 矛盾 | §6 抓紧 + §12 划界 | 抓最要紧一条 |
| 阶段 3 集中 | §8 安民告示 + §9 精兵简政 | 先告示再动手 |
| 阶段 4 检验 | §10 团结不同意见 + §11 力戒骄傲 | 独立审查员 |
| 阶段 5 总结 | §2 摆到桌面 + §3 互通情报 | 落盘可追溯 |
| 跨任务 | §5 弹钢琴 + §7 胸中有数 B | roadmap + events |

---

## 引用规范

本总纲定位为**方法论参考**。其他 skill 或 agent 引用时采用：

- `参见 stw-work-methods §8 安民告示` — 引用具体条目
- `依据 stw-work-methods 12 条节奏总结` — 引用整体
- 不直接搬运条目进其他 skill 正文，避免"一条原文多处抄写"的维护噪音

---

*"我们不但要提出任务，而且要解决完成任务的方法问题。"——《关心群众生活，注意工作方法》*
