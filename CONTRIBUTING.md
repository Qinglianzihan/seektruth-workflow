# 贡献指南

感谢你考虑为"求是工作流"（SeekTruth Workflow）做贡献。

## 开发环境

- Node.js >= 18
- npm

```bash
git clone <repo>
cd seektruth-workflow
npm install
npm link    # 使 stw 命令全局可用
```

## 项目结构

```
src/
├── scout/     # 环境侦察模块
├── adapters/  # 本地化适配模块
└── engine/    # 核心引擎（状态机、封锁、报告、统计）
templates/     # 模板文件（STW-Workspace 等）
bin/           # CLI 入口
tests/         # 单元测试
```

## 开发原则

1. **零外部运行时依赖**（MCP SDK 除外）—— 核心逻辑只用 Node.js 内置模块
2. **ESM only** —— 使用 `import`/`export`，不使用 CommonJS
3. **测试覆盖** —— 核心逻辑必须有单元测试
4. **自己吃自己的狗粮** —— 新功能开发必须使用 STW 工作流

## 提交规范

提交信息格式：`<类型>: <简短描述>`

类型：`feat` / `fix` / `test` / `docs` / `chore`

## 测试

```bash
npm test
```

所有测试必须通过才能合并 PR。
