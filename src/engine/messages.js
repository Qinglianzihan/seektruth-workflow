// 自然语言消息 —— 政委风格

export const PHASE_STORIES = {
  1: {
    title: "调查研究",
    quote: "没有调查，就没有发言权。",
    source: "《反对本本主义》",
    intro: "调查不是瞎翻代码，是三步走：先向用户提问澄清需求，再搜索外部最佳实践和前人方案，最后才深入阅读项目代码。毛爷爷说：调查就像十月怀胎，解决问题就像一朝分娩。急着写代码，十有八九要返工。",
    aiAction: "把下面这段话发给 AI：\n\n  请读取 .stw/STW-Workspace.md，严格按照求是工作流规范，\n  完成阶段 1 调查研究。记住三步走：\n  1. 先问用户——需求澄清，把模糊的描述变成明确的目标\n  2. 再查外部——搜最佳实践、前人方案，别重新发明轮子\n  3. 最后读代码——六步分析，每条结论标注 (file:line)\n\n  特别重要的是「透过现象看本质」：用户说\"接入大模型API\"，\n  你要想到并发、信息隔离、规则引擎、边界条件……这些用户没说但至关重要的东西。",
    nextStep: "AI 填写完分析报告后，告诉我：/stw next\n我会检查12项调研质量，过关后才放行。",
  },
  2: {
    title: "抓住主要矛盾",
    quote: "研究任何过程，如果存在两个以上矛盾，就要全力找出主要矛盾。",
    source: "《矛盾论》",
    intro: "一个任务只有一个核心问题。现在你已经了解了全局，下一步是聚焦——用 ATTACK_ZONE 划定作战区域，告诉 AI 哪些文件可以改，哪些碰都不能碰。",
    aiAction: "在 .stw/STW-Workspace.md 末尾添加 ATTACK_ZONE 声明，格式如下：\n\n  <!-- ATTACK_ZONE: src/你的文件 -->\n  <!-- ATTACK_ZONE: tests/你的测试 -->\n\n  这会告诉 AI：只有这些区域是战场，其他地方是雷区。",
    nextStep: "声明好作战区域后：/stw next\n我会自动生成专注封锁清单。",
  },
  3: {
    title: "集中优势兵力",
    quote: "对于人，伤其十指不如断其一指。",
    source: "《中国革命战争的战略问题》",
    intro: "方向明确了，区域锁定了。现在集中全部力量，打完收工。记住变更计划里的承诺——只改声明过的文件，只做声明过的改动。三心二意是兵家大忌。",
    aiAction: "告诉 AI：按变更计划修改代码，只改 ATTACK_ZONE 内的文件。改完后运行测试，确保全部通过。",
    nextStep: "测试全部通过后：/stw next\n我会检查你是否越界、是否改了你没声明的文件。",
  },
  4: {
    title: "实践检验",
    quote: "实践是检验真理的唯一标准。",
    source: "《实践论》",
    intro: "代码改了，测试跑了。但别急着收工——实践是检验真理的唯一标准。这步会有审查员独立审查你的修改，还会提醒你做人工核查。AI 也会犯错，不能盲目信任。",
    aiAction: "创建一个测试结果文件 .stw/test-results.json：\n  {\"total\": N, \"passed\": N, \"failed\": 0}\n  然后找审查员（另一个 AI）独立审查代码修改。",
    nextStep: "审查通过 + 测试无误后：/stw next\n我会列出人工核查清单，请你逐项确认。",
  },
  5: {
    title: "总结与转化",
    quote: "读书是学习，使用也是学习，而且是更重要的学习。",
    source: "《中国革命战争的战略问题》",
    intro: "仗打完了，但经验不能丢。把这次任务中学到的教训写下来——哪一步走了弯路，哪个决策是明智的，下次同样的坑不要再踩。这就是惩前毖后。",
    aiAction: "告诉 AI：填写 .stw/Summary-Template.md，记录战役概述、认知迭代、解决方案和经验教训。",
    nextStep: "总结写完后：/stw report\n经验教训会自动存档，下次任务自动加载。然后 /stw next 庆祝完成。",
  },
};

export const ERROR_FRIENDLY = {
  noSession: "还没有开始任务呢。先运行 stw start --desc \"你要做什么\" 来开启一个任务。",
  noDeliverable: (phase, deliverable) =>
    `阶段 ${phase} 的交付物还没准备好。\n\n需要完成的是：${deliverable}\n\n不知道怎么填？看看 .stw/ 目录下的模板文件，里面有详细的注释指引。填好后告诉我 /stw next。`,
  confidenceGate: (score, threshold, gaps) => {
    const gapList = gaps.map((g) => `  · ${g}`).join("\n");
    return `调研还不够充分。\n\n当前评分：${score}/10（阈值 ${threshold}）\n\n需要补充的章节：\n${gapList}\n\n毛爷爷说：不打无准备之仗，不打无把握之仗。沉下心来把调研做扎实了再来。`;
  },
  fileBounds: (count, total, zones) =>
    `发现 ${count} 个文件被修改，但不在作战区域内（共 ${total} 个变更）。\n\n允许修改的区域只有：${zones.join(", ")}\n\n你是不是改了不该改的东西？回滚那些越界的修改，或者把它们加到 ATTACK_ZONE 声明里。`,
  changePlan: (count) =>
    `${count} 个文件被修改了，但没有在变更计划里声明。\n\n变更计划在 Analysis-Template.md 的「4.5 变更计划声明」章节。把漏掉的文件补上，每行说明改了什么、为什么改。`,
  noChangePlan: "变更计划还是空的。\n\n打开 Analysis-Template.md，找到「4.5 变更计划声明」，列出你打算修改的每个文件。不然我不知道你是真的需要改，还是在随手乱改。",
};

export const STATUS_EMPTY = "当前没有活跃的任务。要不要开始一个？\n\n  stw start --desc \"你的任务描述\"";
