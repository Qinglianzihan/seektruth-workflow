/**
 * .stw/config.json 数据结构定义
 *
 * 用于持久化侦察结果、用户冲突决策和本地化规则配置。
 * 该文件由 stw init 生成，后续可由 stw detect 更新。
 */

export function createDefaultConfig() {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),

    // 环境快照：侦察结果持久化
    environment: {
      project: null,       // { type, buildTool, testFramework }
      aiTools: [],         // [{ name, version, source }]
      mcpServers: [],      // [{ source, servers }]
      skills: [],          // [{ name, description, source }]
    },

    // 规则集：根据环境选择的规则变体
    rules: {
      enabled: ["investigate-first", "contradiction-analysis", "concentrate-force", "practice-test", "summarize"],
      disabled: [],
    },

    // 冲突解决记录
    conflicts: {
      checked: false,
      resolved: [],        // [{ with: "superpowers", resolution: "skip|override|merge" }]
      warnings: [],        // [{ message }]
    },

    // 武器库快照（MCP + Skills 的摘要，用于生成 STW-Workspace.md）
    arsenal: {
      mcpSummary: "",
      skillsSummary: "",
    },
  };
}
