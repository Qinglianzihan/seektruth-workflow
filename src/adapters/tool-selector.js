import { createInterface } from "node:readline";

/**
 * Show interactive menu for AI tool selection.
 * Returns filtered aiTools array based on user choice.
 */
export async function selectAiTools(detectedTools) {
  if (detectedTools.length === 0) {
    console.log("  ⚠️ 未检测到 AI 编程工具，将仅生成通用配置。\n");
    return [];
  }

  console.log("\n📋 检测到以下 AI 编程工具：\n");
  for (let i = 0; i < detectedTools.length; i++) {
    const t = detectedTools[i];
    console.log(`  ${i + 1}. ${t.name}${t.source ? ` (${t.source})` : ""}`);
  }

  const label = detectedTools.length > 1
    ? `\n选择要集成的工具（输入编号，多选用空格分隔，直接回车=全部）：`
    : `\n回车确认集成 ${detectedTools[0].name}（输入 n 跳过）：`;

  const choice = await question(label);

  if (choice.trim() === "") {
    // Default: all
    const names = detectedTools.map((t) => t.name).join(" + ");
    console.log(`  ✅ 已选择: ${names}\n`);
    return detectedTools;
  }

  if (choice.trim().toLowerCase() === "n") {
    console.log("  ⏭️ 跳过工具集成。\n");
    return [];
  }

  const indices = choice.trim().split(/\s+/).map(Number);
  const selected = [];
  for (const idx of indices) {
    if (idx >= 1 && idx <= detectedTools.length) {
      selected.push(detectedTools[idx - 1]);
    }
  }

  if (selected.length > 0) {
    const names = selected.map((t) => t.name).join(" + ");
    console.log(`  ✅ 已选择: ${names}\n`);
  } else {
    console.log("  ⚠️ 无效选择，跳过工具集成。\n");
  }

  return selected;
}

function question(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
