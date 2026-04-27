<p align="center">
  <img src="https://upload.wikimedia.org/wikipedia/en/2/2c/Mao_Selected_Works.jpg" width="180" alt="毛泽东选集">
</p>

<h1 align="center">求是工作流</h1>
<h3 align="center">SeekTruth Workflow</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/seektruth-workflow"><img src="https://img.shields.io/npm/v/seektruth-workflow?color=c00" alt="npm"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/seektruth-workflow" alt="node"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/seektruth-workflow" alt="license"></a>
  <img src="https://img.shields.io/badge/tests-156%20pass-brightgreen" alt="tests">
</p>

<p align="center"><em>
  将《毛泽东选集》哲学方法论转化为 AI 编程的结构化工作纪律。
</em></p>

---

## 为什么需要这个工具？

AI 编程助手在长任务中普遍面临 **上下文腐化、目标漂移、记忆缺失、越界修改、盲目信任** 等 20 类问题。求是工作流将毛选中的军事指挥、调查研究和辩证思维方法论，落地为 AI 编程的纪律约束体系：

| AI 痛点 | 毛选方法论 | 落地机制 |
|:---|:---|:---|
| AI 不读代码就写代码 | 「没有调查就没有发言权」 | 阶段 1 六步认知分析 |
| AI 不尊重项目风格 | 「从群众中来，到群众中去」 | 项目风格侦察 |
| AI 凭想象断言 | 「反对主观主义」 | 每条结论标注 (file:line) |
| AI 随意加新依赖 | 「反对党八股」 | 变更计划声明 + 依赖检测 |
| AI 修改不该改的文件 | 「集中优势兵力」 | ATTACK_ZONE 越界封锁 |
| AI 判断不可靠 | 「不打无把握之仗」 | 置信度门禁 + 审查员 |
| 用户盲目相信 AI | 「实践是检验真理的唯一标准」 | 人工核查清单 |
| 下次会话忘了上次的坑 | 「惩前毖后，治病救人」 | 错误病例库 + 经验教训跨会话 |
| 长对话质量越来越差 | 「波浪式前进，螺旋式上升」 | 回滚迭代 + 长会话告警 |

## 安装

```bash
npm install -g seektruth-workflow
```

## 五阶段工作流

```
阶段 1  调查研究  ──→  阶段 2  抓住主要矛盾  ──→  阶段 3  集中优势兵力
   │                       │                          │
   │ 敌情分析报告           │ ATTACK_ZONE 声明          │ lockdown.json
   │ 风格侦察 + 六步认知    │ 约束修改位置              │ 变更计划对照
   │                       │                          │
   ▼                       ▼                          ▼
阶段 1→2 战前评估      阶段 2→3 交付物检查        阶段 3→4 纪律检查
 9项置信度检查           专注封锁清单生成           文件越界 + 变更计划
 阈值 6/10                                            + 依赖检测
                                                       │
                                                       ▼
阶段 5  总结与转化  ←──  阶段 4  实践检验
   │                       │
   │ 经验教训 + 认知迭代    │ 测试通过 + 审查报告
   │ 错误病例入库           │ 人工核查 5 项清单
   ▼                       ▼
跨会话记忆传递
```

## 命令参考

| 命令 | 说明 |
|:---|:---|
| `stw init` | 侦察环境 → 规则选择 → 冲突解决 → 生成 `.stw/` |
| `stw init --deep` | 同上 + 深度扫描 MCP 工具 |
| `stw start --desc "..."` | 开始新任务，保存任务描述 |
| `stw start --force` | 跳过 git 脏工作树检查 |
| `stw status` | 当前阶段、进度、运行时长、回滚迭代 |
| `stw next` | 推进阶段（交付物 + 门禁 + 纪律检查） |
| `stw next --scope-check` | 推进前对照原始需求检查 |
| `stw rollback <原因>` | 回退阶段 1，保留分析（波浪式前进） |
| `stw abort` | 中止任务 |
| `stw report` | 存档总结（经验教训跨会话复用） |
| `stw stats` | 统计：会话数 / Token / 错误病例 |
| `stw stats --log-tokens <N>` | 记录 Token 消耗 |
| `stw repair` | 修复/重生成 `.stw` 文件 |

## 快速上手

```bash
cd your-project
stw init                            # 初始化（一次性）
stw start --desc "修复订单超时bug"   # 开始任务

# AI 填写 .stw/Analysis-Template.md
# → 风格侦察 + 六步认知分析 + 变更计划声明
# ⚠️ 每条结论标注出处：(order-service.js:130)

stw next    # → 阶段 2（战前评估 9 项检查）
stw next    # → 阶段 3（ATTACK_ZONE → lockdown.json 自动生成）
# 写代码 + 运行测试
stw next    # → 阶段 4（越界+变更计划+依赖 三重检查）
stw next    # → 阶段 5（人工核查 5 项清单）
stw report  # 归档总结，经验教训自动提取
stw next    # 全部完成
```

中途偏离回退：

```bash
stw rollback 需求变更，重新分析
```

## 核心概念映射

| 概念 | 出处 | 实现 |
|:---|:---|:---|
| 调查研究 | 《反对本本主义》 | 阶段 1 认知分析 |
| 从群众中来 | 《关于领导方法的若干问题》 | 项目风格侦察 |
| 反对主观主义 | 《反对本本主义》 | (file:line) 源码引用 |
| 反对党八股 | 《反对党八股》 | 变更计划 WHAT+WHY |
| 集中优势兵力 | 《中国革命战争的战略问题》 | ATTACK_ZONE + lockdown |
| 实践是真理标准 | 《实践论》 | 测试 + 人工核查 |
| 实事求是 | 《改造我们的学习》 | 环境自动侦察 |
| 不打无把握之仗 | 《目前形势和我们的任务》 | 置信度门禁 |
| 惩前毖后 | 《整顿党的作风》 | 错误病例 + 经验教训 |
| 波浪式前进 | 《中国革命战争的战略问题》 | 回滚 + 迭代 |

## 推荐阅读

<p align="center">
  <a href="https://book.douban.com/subject/1055569/">
    《毛泽东选集》（全五卷）
  </a>
</p>

<p align="center"><em>
  "读书是学习，使用也是学习，而且是更重要的学习。"
</em></p>

---

<p align="center">
  MIT License · v0.2.0 · 156 tests · 49 suites
</p>
