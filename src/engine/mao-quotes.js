const QUOTES = [
  { id: 1, text: '没有调查，就没有发言权。', source: '《反对本本主义》' },
  { id: 2, text: '调查就像“十月怀胎”，解决问题就像“一朝分娩”。调查就是解决问题。', source: '《反对本本主义》' },
  { id: 3, text: '一切结论产生于调查情况的末尾，而不是在它的先头。', source: '《反对本本主义》' },
  { id: 4, text: '你对于那个问题不能解决么？那末，你就去调查那个问题的现状和它的历史吧！', source: '《反对本本主义》' },
  { id: 5, text: '迈开你的两脚，到你的工作范围的各部分各地方去走走，学个孔夫子的“每事问”。', source: '《反对本本主义》' },

  { id: 6, text: '实践是真理的标准。', source: '《实践论》' },
  { id: 7, text: '实践、认识、再实践、再认识，这种形式，循环往复以至无穷。', source: '《实践论》' },
  { id: 8, text: '你要知道梨子的滋味，你就得变革梨子，亲口吃一吃。', source: '《实践论》' },
  { id: 9, text: '理性认识依赖于感性认识，感性认识有待于发展到理性认识。', source: '《实践论》' },
  { id: 10, text: '感觉只解决现象问题，理论才解决本质问题。', source: '《实践论》' },

  { id: 11, text: '事物发展的根本原因，不是在事物的外部而是在事物的内部，在于事物内部的矛盾性。', source: '《矛盾论》' },
  { id: 12, text: '唯物辩证法认为外因是变化的条件，内因是变化的根据。', source: '《矛盾论》' },
  { id: 13, text: '在复杂的事物的发展过程中，有许多的矛盾存在，其中必有一种是主要的矛盾。', source: '《矛盾论》' },
  { id: 14, text: '研究任何过程，如果是存在着两个以上矛盾的复杂过程的话，就要用全力找出它的主要矛盾。', source: '《矛盾论》' },
  { id: 15, text: '不论研究何种矛盾的特性，都不能带主观随意性，必须对它们实行具体的分析。', source: '《矛盾论》' },

  { id: 16, text: '不打无准备之仗，不打无把握之仗。', source: '《目前形势和我们的任务》' },
  { id: 17, text: '集中优势兵力，各个歼灭敌人。', source: '《目前形势和我们的任务》' },
  { id: 18, text: '对于人，伤其十指不如断其一指；对于敌，击溃其十个师不如歼灭其一个师。', source: '《中国革命战争的战略问题》' },
  { id: 19, text: '战略退却的目的是为了保存军力，准备反攻。', source: '《中国革命战争的战略问题》' },
  { id: 20, text: '全局的胜负，决定于每一战斗的胜利。', source: '《中国革命战争的战略问题》' },

  { id: 21, text: '惩前毖后，治病救人。', source: '《整顿党的作风》' },
  { id: 22, text: '实事求是。', source: '《改造我们的学习》' },
  { id: 23, text: '墙上芦苇，头重脚轻根底浅；山间竹笋，嘴尖皮厚腹中空。', source: '《改造我们的学习》' },
  { id: 24, text: '学个孔夫子的“每事问”，任凭什么才力小也能解决问题。', source: '《反对本本主义》' },
  { id: 25, text: '知识的问题是一个科学问题，来不得半点的虚伪和骄傲。', source: '《实践论》' },

  { id: 26, text: '从群众中来，到群众中去。', source: '《关于领导方法的若干问题》' },
  { id: 27, text: '群众是真正的英雄，而我们自己则往往是幼稚可笑的。', source: '《“农村调查”的序言和跋》' },
  { id: 28, text: '在一切工作中，命令主义是错误的，因为它超过群众的觉悟程度，违反了群众的自愿原则。', source: '《论联合政府》' },

  { id: 29, text: '世界上怕就怕“认真”二字。', source: '在莫斯科会见中国留学生时的讲话' },
  { id: 30, text: '你要有知识，你就得参加变革现实的实践。', source: '《实践论》' },
  { id: 31, text: '读书是学习，使用也是学习，而且是更重要的学习。', source: '《中国革命战争的战略问题》' },
  { id: 32, text: '我们不但要提出任务，而且要解决完成任务的方法问题。', source: '《关心群众生活，注意工作方法》' },
  { id: 33, text: '不解决桥或船的问题，过河就是一句空话。', source: '《关心群众生活，注意工作方法》' },
];

const TOTAL = QUOTES.length;

export function pickQuote(recentIds = []) {
  const recentSet = new Set(recentIds.slice(-15));
  const candidates = QUOTES.filter((q) => !recentSet.has(q.id));
  const pool = candidates.length > 0 ? candidates : QUOTES;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}

export function formatQuote(quote) {
  return `\n  ── ${quote.source}`;
}

export { TOTAL as quoteCount };
