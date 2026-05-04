#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { detectProject } from "../src/scout/project-detector.js";
import { detectAiTools } from "../src/scout/ai-tool-detector.js";
import { scanMcpConfigs, getBuiltinMcpServers } from "../src/scout/mcp-scanner.js";
import { scanSkills } from "../src/scout/skill-scanner.js";
import { generateReport } from "../src/scout/report-generator.js";
import { resolveConflicts } from "../src/adapters/conflict-resolver.js";
import { selectRules } from "../src/adapters/rule-selector.js";
import { writeStwFiles } from "../src/adapters/file-writer.js";
import { selectAiTools } from "../src/adapters/tool-selector.js";
import { getCurrentPhase, PHASES, startSession, advancePhase, abortSession, rollbackSession, getSessionConfig, readTestResults } from "../src/engine/state-machine.js";
import { generateLockdown, checkDirtyTree } from "../src/engine/lockdown.js";
import { archiveReport, listReports, getRecentSummaries } from "../src/engine/report.js";
import { getStats, generateStatsReport, logTokens } from "../src/engine/stats.js";
import { getRelatedErrors } from "../src/engine/error-registry.js";
import { deepScanMcp } from "../src/scout/mcp-deep-scanner.js";
import { injectQuote } from "../src/engine/quote-injector.js";
import { PHASE_STORIES, ERROR_FRIENDLY, STATUS_EMPTY } from "../src/engine/messages.js";
import { startForge, getForgeStatus, inspectForgeAgent, advanceForge, acceptForge, abortForge, runForgeAgents, AGENTS } from "../src/engine/forge.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));

const command = process.argv[2];

const help = () => {
  console.log(`求是工作流 v${PKG.version} (SeekTruth Workflow)`);
  console.log("");
  console.log("Usage: stw <command>");
  console.log("");
  console.log("Commands:");
  console.log("  init           初始化求是工作流");
  console.log("  init --deep    初始化 + 深度扫描 MCP 工具详情");
  console.log("  start          开始新任务");
  console.log("  status         查看当前阶段和进度");
  console.log("  next           推进到下一阶段");
  console.log("  rollback <原因> 回滚到阶段1（保留已有分析）");
  console.log("  abort          中止当前任务");
  console.log("  report         存档当前总结报告");
  console.log("  repair         修复/重新生成 .stw 文件");
  console.log("  stats          查看统计报告");
  console.log("  forge          需求炼金炉：多 agent 需求讨论状态机");
};

const cmdInit = async (deep) => {
  const rootDir = process.cwd();

  console.log("🔍 侦察中...\n");

  const project = detectProject(rootDir);
  const aiTools = detectAiTools();
  const mcpConfigs = scanMcpConfigs(rootDir);
  const builtinMcp = getBuiltinMcpServers(aiTools);
  const mcpConfigsWithBuiltin = [...mcpConfigs, ...builtinMcp];
  const skills = scanSkills(rootDir);

  const environment = { project, aiTools, mcpConfigs: mcpConfigsWithBuiltin, skills };

  let deepMcpResult = null;
  if (deep) {
    console.log("  深度扫描 MCP 服务器 (tools/list)...\n");
    deepMcpResult = await deepScanMcp(rootDir);
  }

  const report = generateReport(environment);
  console.log(report);

  // Display deep scan results if available
  if (deepMcpResult) {
    console.log(`  ${"=".repeat(40)}`);
    console.log("  📡 MCP 深度扫描\n");
    console.log(`  ${deepMcpResult.summary}\n`);
    for (const s of deepMcpResult.servers) {
      if (s.status === "ok" && s.tools.length > 0) {
        console.log(`  ${s.name} (${s.source}):`);
        for (const t of s.tools) {
          console.log(`    · ${t.name} — ${t.description || "无描述"}`);
        }
        console.log("");
      } else if (s.status === "error") {
        console.log(`  ${s.name} (${s.source}): ❌ ${s.error}\n`);
      }
    }
  }

  // 规则选择（按项目类型）
  const { enabled, disabled } = selectRules(environment);
  if (disabled.length > 0) {
    console.log(`\n📋 已禁用规则（适配 ${environment.project?.type || "Unknown"}）:`);
    for (const d of disabled) {
      console.log(`  · ${d.label} — ${d.reason}`);
    }
  }

  // 冲突解决
  const conflicts = resolveConflicts(skills);
  if (conflicts.warnings.length > 0) {
    console.log("\n⚠️  检测到潜在冲突：");
    for (const w of conflicts.warnings) {
      console.log(`  · ${w.message}`);
      console.log(`    建议: ${w.suggestion}`);
    }
  }

  // 工具选择：让用户选择要集成的 AI 工具
  environment.aiTools = await selectAiTools(environment.aiTools);

  // 生成 .stw/ 文件
  const stwDir = writeStwFiles(rootDir, environment, conflicts);
  console.log(`\n✅ 求是工作流已初始化: ${stwDir}`);
  const bootstrapped = environment.aiTools.map((t) => t.name);
  if (bootstrapped.length > 0) {
    console.log(`   已集成: ${bootstrapped.join(", ")}`);
  }
  console.log(injectQuote(rootDir));
};

const cmdStatus = () => {
  const rootDir = process.cwd();
  try {
    const current = getCurrentPhase(rootDir);

    if (!current) {
      console.log(`\n${STATUS_EMPTY}`);
      return;
    }

    const { phase, phaseInfo, startedAt, completedPhases } = current;
    const elapsed = Date.now() - new Date(startedAt).getTime();
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const timeStr = hours > 0 ? `${hours}小时${minutes}分钟` : `${minutes}分钟`;

    if (phase === "complete") {
      console.log(`\n🎉 全部完成！历时约 ${timeStr}。`);
      console.log("  准备好了就开始下一个任务：stw start --desc \"...\"");
      return;
    }

    console.log(`\n📊 进度：阶段 ${phase}/5  ·  已进行 ${timeStr}`);

    for (const p of PHASES) {
      const done = completedPhases.includes(p.id);
      const active = p.id === phase;
      const icon = done ? "✅" : active ? "➤" : "·";
      const extra = active ? ` ← 你在这里` : "";
      console.log(`  ${icon} ${p.id}. ${p.name}${extra}`);
    }

    if (current.iterations && current.iterations.length > 0) {
      console.log(`\n🌊 已回滚 ${current.iterations.length} 次`);
      const config = getSessionConfig(rootDir);
      if (config.maxIterations > 0 && current.iterations.length >= config.maxIterations) {
        console.log(`  ⚠️ 回滚次数已达阈值 (${config.maxIterations})，建议 checkpoint 重新开始。`);
      }
      const lastIterations = current.iterations.slice(-3);
      for (const entry of lastIterations) {
        const d = new Date(entry.timestamp).toLocaleDateString();
        console.log(`     · 从阶段 ${entry.phase} 回滚 — ${entry.reason} (${d})`);
      }
    }

    if (hours >= 2 || (current.iterations && current.iterations.length >= 4)) {
      console.log(`\n  💡 长会话易导致上下文腐化，建议 checkpoint 或重新开始。`);
    }
  } catch (err) {
    console.error(`\n❌ status 失败: ${err.message}`);
    process.exit(1);
  }
  console.log(injectQuote(rootDir));
};

const cmdStart = () => {
  const rootDir = process.cwd();
  try {
    const stwDir = join(rootDir, ".stw");

    if (!existsSync(stwDir)) {
      console.log("❌ 未初始化。请先运行 stw init。");
      return;
    }

    // Start or resume session
    const current = getCurrentPhase(rootDir);
    if (current) {
      console.log("📋 已有进行中的任务。运行 stw status 查看当前进度。");
      return;
    }

    // Parse start args
    const startArgs = process.argv.slice(3);
    const descIdx = startArgs.indexOf("--desc");
    const taskDescription = descIdx !== -1 && startArgs[descIdx + 1]
      ? startArgs[descIdx + 1] : "";

    // Check for dirty working tree
    const forceFlag = startArgs.includes("--force");
    if (!forceFlag) {
      const dirty = checkDirtyTree(rootDir);
      if (dirty.notGit) {
        console.log("   ⚠️  当前目录不是 git 仓库，无法检测文件冲突。\n");
      } else if (dirty.dirty) {
        const shown = Math.min(dirty.files.length, 10);
        console.log(`\n  ⚠️  检测到 ${dirty.files.length} 个未提交的变更：`);
        for (let i = 0; i < shown; i++) {
          console.log(`     ${dirty.files[i]}`);
        }
        if (dirty.files.length > shown) {
          console.log(`     ... 还有 ${dirty.files.length - shown} 个未显示`);
        }
        if (dirty.stwResidue) {
          console.log(`  💡 检测到 .stw 残留文件，可能是上次任务中止未清理。`);
        }
        console.log(`\n  建议先提交或 stash 变更，再开始新任务。`);
        console.log(`  使用 stw start --force 跳过此检查。\n`);
        return;
      }
    }

    startSession(rootDir, taskDescription);

    const story = PHASE_STORIES[1];
    console.log(`
╔══════════════════════════════════════════════╗
║                                              ║
║   🔍  阶段 1：${story.title}                      ║
║                                              ║
║   "${story.quote}"    ║
║   —— ${story.source}                          ║
║                                              ║
╚══════════════════════════════════════════════╝
`);
    console.log(story.intro);
    console.log("");

    if (taskDescription) {
      console.log(`📋 你要做的事：${taskDescription}\n`);
    }

    // 历史经验
    const recent = getRecentSummaries(rootDir, 3);
    if (recent.length > 0) {
      console.log("📚 之前积累的经验：");
      for (const r of recent) {
        console.log(`   · ${r.title}`);
        if (r.lessons) console.log(`     💡 ${r.lessons}`);
      }
      console.log("");
    }

    // 历史病历
    const recentErrors = getRelatedErrors(rootDir, [], 3);
    if (recentErrors.length > 0) {
      console.log("🏥 之前踩过的坑（别重蹈覆辙）：");
      for (const e of recentErrors) {
        console.log(`   · ${e.description}`);
        if (e.resolution) console.log(`     → ${e.resolution}`);
      }
      console.log("");
    }

    console.log("👉 现在该做什么：\n");
    console.log(story.aiAction);
    console.log(`\n👉 ${story.nextStep}`);
  } catch (err) {
    console.error(`\n❌ start 失败: ${err.message}`);
    process.exit(1);
  }
  console.log(injectQuote(rootDir));
};

const phaseGuidance = {
  1: "AI 填写完分析报告后告诉我 /stw next，我会检查调研质量。",
  2: "在 .stw/STW-Workspace.md 末尾加 <!-- ATTACK_ZONE: 你的文件 --> 来划定作战区域，然后 /stw next。",
  3: "告诉 AI 按变更计划改代码、跑测试。全部通过后 /stw next，我会检查越界和变更计划。",
  4: "测试无误后创建 .stw/test-results.json，然后 /stw next。我会列出人工核查清单。",
};

const cmdNext = () => {
  const rootDir = process.cwd();
  try {
    const current = getCurrentPhase(rootDir);

    if (!current) {
      console.log(`\n${STATUS_EMPTY}`);
      return;
    }

    if (current.phase === "complete") {
      console.log("\n🎉 所有阶段都已完成！要不要开始一个新任务？\n\n  stw start --desc \"你的新任务\"");
      return;
    }

    // scope-check flag
    const nextArgs = process.argv.slice(3);
    if (nextArgs.includes("--scope-check")) {
      console.log("\n🔍 跑偏检查——");
      console.log("  打开 Analysis-Template.md，看看你最初写下的任务背景。");
      console.log("  现在做的事情，还在那个范围内吗？");
      if (current.taskDescription) {
        console.log(`  原始任务：${current.taskDescription}`);
      }
      console.log("  没偏？继续。/stw next。偏了？/stw rollback 重新规划。\n");
    }

    const result = advancePhase(rootDir);

    if (!result.ok) {
      // 友好化错误输出
      const err = result.error || "";
      if (err.includes("没有活跃的任务")) {
        console.log(`\n${STATUS_EMPTY}`);
      } else if (err.includes("交付物未完成")) {
        const phase = current.phase;
        const phaseInfo = PHASES.find((p) => p.id === phase);
        console.log(`\n🛑 等一下——\n`);
        console.log(`   阶段 ${phase}（${phaseInfo?.name}）的交付物还没准备好。`);
        console.log(`   需要：${result.required}\n`);
        console.log(`   不知道怎么填？打开 .stw/ 目录看看模板文件，里面有注释指南。`);
        console.log(`   搞定了告诉我：/stw next`);
      } else if (err.includes("战前评估")) {
        console.log(`\n📋 调研还不够扎实——\n${result.required}`);
      } else if (err.includes("越界")) {
        console.log(`\n🚫 越界了——\n${result.error}\n\n${result.required}`);
      } else if (err.includes("变更计划")) {
        console.log(`\n📝 变更计划有问题——\n${result.error}\n\n${result.required}`);
      } else {
        console.log(`\n❌ ${result.error}`);
        if (result.required) console.log(`   ${result.required}`);
      }
      return;
    }

    if (result.done) {
      console.log(`
🎉 全部完成！从调查研究到总结转化，五阶段一气呵成。

   总结经验教训已归档。下次 stw start 会自动加载。
   准备好了就开始下一个任务吧：

     stw start --desc "你的新任务"
`);
      return;
    }

    const next = result.phase;
    const story = PHASE_STORIES[next.id];

    // Phase header
    console.log(`
╔══════════════════════════════════════════════╗
║                                              ║
║   🔍  阶段 ${next.id}：${story.title}                      ║
║                                              ║
║   "${story.quote}"    ║
║   —— ${story.source}                          ║
║                                              ║
╚══════════════════════════════════════════════╝
`);
    console.log(story.intro);
    console.log("");

    if (current.taskDescription) {
      console.log(`📋 你的任务：${current.taskDescription}\n`);
    }

    // Phase-specific extras
    if (next.id === 3) {
      const lockdown = generateLockdown(rootDir);
      const zones = lockdown.attackZones;
      if (zones.length > 0) {
        console.log("🔒 作战区域已锁定：");
        for (const z of zones) console.log(`   · ${z}`);
        console.log("\n   AI 只能改这些文件。动其他的？门都没有。\n");
      } else {
        console.log("⚠️ 还没声明 ATTACK_ZONE。在 STW-Workspace.md 里加上，然后重新 /stw next。\n");
      }
    }

    if (next.id === 5) {
      const testResults = readTestResults(rootDir);
      if (testResults) {
        console.log("🧪 测试战报：");
        if (testResults.total) console.log(`   用例 ${testResults.total} 个，通过 ${testResults.passed ?? "?"} 个`);
        if (testResults.failed) console.log(`   失败 ${testResults.failed} 个`);
        console.log("");
      }
      console.log("🔍 最后一步——人工核查（别偷懒）：");
      console.log("   1. 测试是真的跑过了，不是伪造的？");
      console.log("   2. 改的东西和原始任务对得上？");
      console.log("   3. 变更计划里的文件都改了？");
      console.log("   4. 没把密码、密钥写进代码吧？");
      console.log("   5. Summary-Template.md 填好了吗？\n");
    }

    console.log("👉 现在该做什么：\n");
    console.log(story.aiAction);
    console.log(`\n👉 ${story.nextStep}`);
  } catch (err) {
    console.error(`\n❌ 出错了: ${err.message}`);
    process.exit(1);
  }
  console.log(injectQuote(rootDir));
};

const cmdStats = async () => {
  const rootDir = process.cwd();
  const args = process.argv.slice(3); // everything after "stats"
  const logIdx = args.indexOf("--log-tokens");

  if (logIdx !== -1) {
    const amount = parseInt(args[logIdx + 1], 10);
    if (isNaN(amount) || amount <= 0) {
      console.log("用法: stw stats --log-tokens <数量> [备注]");
      return;
    }
    const note = args.slice(logIdx + 2).join(" ") || "";
    logTokens(rootDir, amount, note);
    console.log(`✅ 已记录 ${amount} tokens${note ? ` (${note})` : ""}`);
    return;
  }

  console.log(await generateStatsReport(rootDir));
  console.log(injectQuote(rootDir));
};

const cmdReport = () => {
  const rootDir = process.cwd();
  try {
    const result = archiveReport(rootDir);
    if (!result.ok) {
      console.log(`\n❌ ${result.error}`);
      return;
    }
    const allReports = listReports(rootDir);
    console.log(`\n📝 总结报告已存档: ${result.name}`);
    console.log(`   存档数量: ${allReports.length}`);
  } catch (err) {
    console.error(`\n❌ report 失败: ${err.message}`);
    process.exit(1);
  }
  console.log(injectQuote(rootDir));
};

const cmdRollback = () => {
  const rootDir = process.cwd();
  try {
    const reason = process.argv.slice(3).join(" ") || "未说明原因";
    const result = rollbackSession(rootDir, reason);
    if (!result.ok) {
      console.log(`\n${result.error}`);
      return;
    }
    console.log(`\n🌊 已回退到阶段 1`);
    console.log(`   原因：${reason}`);
    console.log(`   这是第 ${result.iterations} 次回退。\n`);
    console.log("   毛爷爷说：波浪式前进，螺旋式上升。");
    console.log("   每次回退不是失败，是认知升级。\n");
    console.log("   重新打开 Analysis-Template.md，基于新的理解修改调研报告。");
    console.log("   准备好了就：/stw next");
  } catch (err) {
    console.error(`\n❌ rollback 失败: ${err.message}`);
    process.exit(1);
  }
  console.log(injectQuote(rootDir));
};

const cmdAbort = () => {
  const rootDir = process.cwd();
  try {
    const result = abortSession(rootDir);
    if (!result.ok) {
      console.log(`\n${result.error}`);
      return;
    }
    console.log("\n🛑 任务已中止。这个任务的进度已清空。");
    console.log("  准备好了随时开始新的：stw start --desc \"...\"");
  } catch (err) {
    console.error(`\n❌ abort 失败: ${err.message}`);
    process.exit(1);
  }
  console.log(injectQuote(rootDir));
};


const cmdForge = async () => {
  const rootDir = process.cwd();
  const args = process.argv.slice(3);
  const sub = args[0];

  try {
    if (!sub || !["status", "inspect", "next", "accept", "confirm", "abort", "run"].includes(sub)) {
      const idea = args.join(" ").trim();
      if (!idea) {
        console.log("用法: stw forge \"一句话需求\" | stw forge run | stw forge next | stw forge accept <用户确认> | stw forge status");
        return;
      }
      const result = startForge(rootDir, idea);
      if (!result.ok) {
        console.log(`❌ ${result.error}`);
        return;
      }
      console.log("\n🧪 需求炼金炉已启动");
      console.log(`  原始需求：${result.session.idea}`);
      console.log("  当前阶段：diverge / 专家独立发散");
      console.log("\n  需要派发以下 agent，并把输出写入对应文件：");
      for (const agent of AGENTS) {
        console.log(`  · ${agent.id} (${agent.role}) → .stw/forge/rounds/001-diverge/${agent.id}.md`);
      }
      console.log("\n  查看状态：stw forge status");
      return;
    }

    if (sub === "status") {
      const result = getForgeStatus(rootDir);
      if (!result.ok) {
        console.log(`❌ ${result.error}`);
        return;
      }
      console.log("\n🧪 需求炼金炉状态");
      console.log(`  需求：${result.session.idea}`);
      console.log(`  阶段：${result.session.phase}`);
      console.log(`  状态：${result.session.status}`);
      console.log(`  Agent：${result.agents.completed}/${result.agents.total} completed, ${result.agents.pending} pending`);
      console.log(`  指标：必答问题 ${result.metrics.mustAnswerQuestions}，风险 ${result.metrics.risks}，延后项 ${result.metrics.deferredItems}`);
      return;
    }

    if (sub === "inspect") {
      const id = args[1];
      if (!id) {
        console.log("用法: stw forge inspect <agent>");
        return;
      }
      const result = inspectForgeAgent(rootDir, id);
      if (!result.ok) {
        console.log(`❌ ${result.error}`);
        return;
      }
      const a = result.agent;
      console.log(`\n🤖 ${a.id} (${a.role})`);
      console.log(`  状态：${a.status}`);
      console.log(`  轮次：${a.round}`);
      console.log(`  输出：${a.outputFile}`);
      console.log(`  尝试：${a.attempts}`);
      return;
    }


    if (sub === "run") {
      const onlyIdx = args.indexOf("--only");
      const only = onlyIdx !== -1 && args[onlyIdx + 1]
        ? args[onlyIdx + 1].split(",").map((s) => s.trim()).filter(Boolean)
        : null;
      const force = args.includes("--force");
      const providerIdx = args.indexOf("--provider");
      const provider = providerIdx !== -1 && args[providerIdx + 1] ? args[providerIdx + 1] : undefined;
      const modelIdx = args.indexOf("--model");
      const model = modelIdx !== -1 && args[modelIdx + 1] ? args[modelIdx + 1] : undefined;
      const result = await runForgeAgents(rootDir, { only, force, provider, model });
      if (!result.ok) {
        console.log("❌ forge run 未完全通过");
        if (result.invalid?.length) console.log(`  格式无效：${result.invalid.join(", ")}`);
        if (result.failed?.length) {
          for (const f of result.failed) console.log(`  调用失败：${f.id} — ${f.error}`);
        }
        return;
      }
      console.log(`\n✅ forge run 完成：${result.completed} 个 agent`);
      console.log("  下一步：stw forge next");
      return;
    }
    if (sub === "next") {
      const result = advanceForge(rootDir);
      if (!result.ok) {
        console.log(`❌ ${result.error}`);
        return;
      }
      console.log(`\n✅ 需求炼金炉已推进到：${result.phase}`);
      if (result.required) console.log(`  下一步：请处理 ${result.required}`);
      if (result.phase === "user-confirm") console.log("  用户回答后：stw forge accept \"确认后的方向/范围\"");
      return;
    }

    if (sub === "accept" || sub === "confirm") {
      const answers = args.slice(1).join(" ").trim();
      const result = acceptForge(rootDir, answers);
      if (!result.ok) {
        console.log(`❌ ${result.error}`);
        return;
      }
      console.log("\n✅ 需求已固化，STW 五阶段已启动");
      console.log(`  需求文档：${result.requirementsFile}`);
      console.log("  当前阶段：1 / 调查研究");
      console.log("  下一步：读取 .stw/forge/requirements.md，填写 .stw/Analysis-Template.md，然后 stw next");
      return;
    }

    if (sub === "abort") {
      const reason = args.slice(1).join(" ") || "未说明原因";
      const result = abortForge(rootDir, reason);
      if (!result.ok) {
        console.log(`❌ ${result.error}`);
        return;
      }
      console.log(`\n🛑 需求炼金炉已中止：${reason}`);
    }
  } catch (err) {
    console.error(`\n❌ forge 失败: ${err.message}`);
    process.exit(1);
  }
};

const cmdRepair = () => {
  const rootDir = process.cwd();
  try {
    const stwDir = join(rootDir, ".stw");
    if (!existsSync(stwDir)) {
      console.log("\n❌ .stw 目录不存在。请先运行 stw init。");
      return;
    }
    // Re-detect environment and regenerate files
    const project = detectProject(rootDir);
    const aiTools = detectAiTools();
    const mcpConfigs = scanMcpConfigs(rootDir);
    const builtinMcp = getBuiltinMcpServers(aiTools);
    const mcpConfigsWithBuiltin = [...mcpConfigs, ...builtinMcp];
    const skills = scanSkills(rootDir);
    const environment = { project, aiTools, mcpConfigs: mcpConfigsWithBuiltin, skills };
    const conflicts = resolveConflicts(skills);
    writeStwFiles(rootDir, environment, conflicts);
    console.log(`\n✅ 已重新生成 .stw 文件。`);
  } catch (err) {
    console.error(`\n❌ repair 失败: ${err.message}`);
    process.exit(1);
  }
  console.log(injectQuote(rootDir));
};

switch (command) {
  case "init":
    cmdInit(process.argv[3] === "--deep").catch((err) => {
      console.error(`\n❌ init 失败: ${err.message}`);
      process.exit(1);
    });
    break;
  case "start":
    cmdStart();
    break;
  case "status":
    cmdStatus();
    break;
  case "next":
    cmdNext();
    break;
  case "report":
    cmdReport();
    break;
  case "rollback":
    cmdRollback();
    break;
  case "abort":
    cmdAbort();
    break;
  case "repair":
    cmdRepair();
    break;
  case "forge":
    cmdForge().catch((err) => {
      console.error(`\n❌ forge 失败: ${err.message}`);
      process.exit(1);
    });
    break;
  case "stats":
    cmdStats().catch((err) => {
      console.error(`\n❌ stats 失败: ${err.message}`);
      process.exit(1);
    });
    break;
  case "--help":
  case "-h":
    help();
    break;
  case "--version":
  case "-V":
    console.log(PKG.version);
    break;
  default:
    if (command) {
      console.log(`Unknown command: ${command}`);
      console.log("");
    }
    help();
    break;
}
