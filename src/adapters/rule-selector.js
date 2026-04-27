const ALL_RULES = [
  { id: "investigate-first",      label: "调查研究先行",   default: true },
  { id: "contradiction-analysis",  label: "矛盾分析驱动",   default: true },
  { id: "concentrate-force",      label: "集中优势兵力",   default: true },
  { id: "practice-test",          label: "实践检验真理",   default: true },
  { id: "summarize",              label: "总结与转化",     default: true },
];

// Rules that don't apply well to certain project types
const TYPE_DISABLED = {
  Unknown: ["concentrate-force"], // unknown project → hard to define ATTACK_ZONE
};

// Additional constraints based on AI tool capabilities
function extraDisables(aiTools) {
  const disables = [];
  for (const tool of aiTools) {
    if (tool.name === "Codex CLI") {
      // Codex doesn't support the same lockdown mechanism
      disables.push("concentrate-force");
    }
  }
  return disables;
}

export function selectRules(environment) {
  const projectType = environment.project?.type || "Unknown";
  const aiTools = environment.aiTools || [];

  const disabledByType = TYPE_DISABLED[projectType] || [];
  const disabledByTool = extraDisables(aiTools);

  const allDisabled = [...new Set([...disabledByType, ...disabledByTool])];

  const enabled = ALL_RULES
    .filter((r) => !allDisabled.includes(r.id))
    .map((r) => r.id);

  const disabled = ALL_RULES
    .filter((r) => allDisabled.includes(r.id))
    .map((r) => ({ id: r.id, label: r.label, reason: reasonText(r.id, projectType, aiTools) }));

  return { enabled, disabled };
}

function reasonText(ruleId, projectType, aiTools) {
  if (ruleId === "concentrate-force" && projectType === "Unknown") {
    return "项目类型未知，无法自动划定作战区域";
  }
  if (ruleId === "concentrate-force" && aiTools.some((t) => t.name === "Codex CLI")) {
    return "Codex CLI 不支持 ATTACK_ZONE 封锁机制";
  }
  return "";
}

export function listAllRules() {
  return ALL_RULES.map((r) => ({ id: r.id, label: r.label }));
}
