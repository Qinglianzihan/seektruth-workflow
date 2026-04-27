# 求是工作流 (SeekTruth Workflow)

> 将《毛泽东选集》哲学方法论转化为 AI 编程的结构化工作纪律。

**开源 · 轻量 · 跨平台** — 解决 AI 编程中常见的上下文腐化、目标漂移、记忆缺失等问题。

## 核心原则

1. **调查研究先行** — 没有调查就没有发言权。AI 在编写任何代码前，必须先深入调研。
2. **矛盾分析驱动** — 任何任务都只有一个主要矛盾，必须抓住它并集中力量解决。
3. **实践-认识-再实践** — 真理的标准是实践。所有产出必须经过测试验证，失败则返回调查阶段。

## 安装

```bash
npx seektruth-workflow init
```

这会在当前项目中创建 `.stw/` 目录，包含工作流规范、模板和配置文件。

## 五阶段工作流

| 阶段 | 名称 | 交付物 |
| :--- | :--- | :--- |
| 1 | **调查研究** | `.stw/Analysis-Template.md` — 敌情分析报告 |
| 2 | **抓住主要矛盾** | `ATTACK_ZONE` 声明 — 作战区域聚焦 |
| 3 | **集中优势兵力** | `.stw/lockdown.json` — 专注封锁清单 |
| 4 | **实践检验** | 测试通过 — 强制验证 |
| 5 | **总结与转化** | `.stw/Summary-Template.md` — 战役总结报告 |

## 命令参考

| 命令 | 说明 |
| :--- | :--- |
| `stw init` | 初始化工作流（侦察环境 → 生成配置） |
| `stw init --deep` | 初始化 + 深度扫描 MCP 工具详情 |
| `stw start` | 开始新任务（进入阶段 1） |
| `stw status` | 查看当前阶段和进度 |
| `stw next` | 推进到下一阶段（检查交付物） |
| `stw report` | 存档当前总结报告 |
| `stw stats` | 查看统计报告 |
| `stw stats --log-tokens <数量> [备注]` | 记录 Token 消耗 |

## 工作流示例

```bash
# 1. 初始化
cd your-project
npx seektruth-workflow init

# 2. 开始任务
stw start
# → 进入阶段 1：调查研究

# 3. AI 完成调研后
stw next
# → 进入阶段 2：聚焦主要矛盾

# 4. 声明作战区域后
stw next
# → 进入阶段 3：集中兵力（自动生成封锁清单）

# 5. 代码修改 + 测试通过后
stw next
# → 进入阶段 4：实践检验

# 6. 测试验证后（需创建 .stw/test-results.json）
stw next
# → 进入阶段 5：总结

# 7. 填写总结报告后
stw report
stw next
# → 全部完成
```

## 独立审查（民主集中制）

在阶段 4，可调用独立的「审查员」子代理进行代码审查：

```
审查员定义文件: .stw/审查员.md
Claude Code 样本: .stw/审查员.claude.md
```

## 开发状态

当前版本：`0.1.0` — Phase 0-6 核心功能完成，36 个单元测试。

## 贡献

请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

MIT
