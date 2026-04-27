/**
 * 根据侦察结果选择启用的规则变体。
 */

const ALL_RULES = [
  { id: "investigate-first",     label: "调查研究先行", default: true },
  { id: "contradiction-analysis", label: "矛盾分析驱动", default: true },
  { id: "concentrate-force",     label: "集中优势兵力", default: true },
  { id: "practice-test",         label: "实践检验真理", default: true },
  { id: "summarize",             label: "总结与转化",   default: true },
];

export function selectRules(environment) {
  const enabled = ALL_RULES.filter((r) => r.default).map((r) => r.id);
  const disabled = [];

  // Node.js 项目默认启用所有规则
  // Python 项目同样全部启用
  // Unknown 项目类型保持全部启用

  return { enabled, disabled };
}

export function listAllRules() {
  return ALL_RULES.map((r) => ({ id: r.id, label: r.label }));
}
