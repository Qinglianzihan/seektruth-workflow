/**
 * 检查发现与现有 Skill（如 superpowers）的重叠，生成警告和解决建议。
 */

const KNOWN_CONFLICTS = [
  {
    skillPattern: /superpowers/i,
    description: "Superpowers 也提供了结构化工作流能力",
    suggestion: "STW 提供更严格的五阶段纪律。建议禁用 Superpowers 中的工作流相关 Skill，保留其工具类 Skill。",
  },
  {
    skillPattern: /claude-automation-recommender/i,
    description: "自动化推荐器可能与 STW 的纪律引擎存在指令冲突",
    suggestion: "建议将 STW 作为主要工作流框架，禁用自动化推荐器中的重复规则。",
  },
];

export function resolveConflicts(skills) {
  const resolved = [];
  const warnings = [];

  for (const skill of skills) {
    for (const conflict of KNOWN_CONFLICTS) {
      if (conflict.skillPattern.test(skill.name)) {
        warnings.push({
          message: `检测到 "${skill.name}" — ${conflict.description}`,
          suggestion: conflict.suggestion,
        });
      }
    }
  }

  return {
    checked: true,
    resolved,
    warnings,
  };
}
