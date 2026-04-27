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
      console.log("📭 当前没有活跃的任务。运行 stw start 开始一个新任务。");
      return;
    }

    const { phase, phaseInfo, startedAt, completedPhases } = current;
    console.log(`\n📊 当前进度\n`);
    console.log(`  开始时间: ${new Date(startedAt).toLocaleString()}`);

    if (phase === "complete") {
      console.log(`\n  ✅ 所有阶段已完成！`);
      return;
    }

    console.log(`  当前阶段: ${phase}/${PHASES.length}`);

    // Elapsed time
    const elapsed = Date.now() - new Date(startedAt).getTime();
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const timeStr = hours > 0 ? `${hours}小时${minutes}分钟` : `${minutes}分钟`;
    console.log(`  运行时长: ${timeStr}${hours >= 2 ? " ⚠️ 长会话" : ""}`);

    for (const p of PHASES) {
      const done = completedPhases.includes(p.id);
      const active = p.id === phase;
      const icon = done ? "✅" : active ? "▶️ " : "⏳";
      console.log(`  ${icon} 阶段 ${p.id}: ${p.name}${active ? ` (${p.deliverable})` : ""}`);
    }

    if (current.iterations && current.iterations.length > 0) {
      console.log(`\n  🌊 迭代历史: ${current.iterations.length} 次回滚`);
      const config = getSessionConfig(rootDir);
      if (config.maxIterations > 0 && current.iterations.length >= config.maxIterations) {
        console.log(`  ⚠️  回滚次数已达阈值 (${config.maxIterations})，建议 checkpoint 或重新开始。`);
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
    const phase1 = PHASES[0];

    console.log(`\n🚀 新任务已开始 — 阶段 1：${phase1.name}\n`);

    if (taskDescription) {
      console.log(`   📋 任务描述: ${taskDescription}`);
      console.log(`      请对照此描述检查后续变更是否偏离原始需求。\n`);
    }

    // Load recent summaries as "历史经验"
    const recent = getRecentSummaries(rootDir, 3);
    if (recent.length > 0) {
      console.log("   📚 历史经验（最近总结报告摘要）：");
      for (const r of recent) {
        console.log(`      · ${r.title}`);
        if (r.snippet) console.log(`        ${r.snippet}`);
        if (r.lessons) console.log(`        📖 ${r.lessons}`);
        if (r.cognitiveInsights) console.log(`        🧠 ${r.cognitiveInsights}`);
      }
      console.log("");
    }

    // 加载关联错误（惩前毖后）
    const recentErrors = getRelatedErrors(rootDir, [], 3);
    if (recentErrors.length > 0) {
      console.log("   🏥 历史病历（最近错误记录）：");
      for (const e of recentErrors) {
        console.log(`      · [阶段${e.phase}] ${e.description}`);
        if (e.resolution) console.log(`        处方: ${e.resolution}`);
      }
      console.log("");
    }

    console.log("   请将 .stw/STW-Workspace.md 的全部内容作为系统提示提供给 AI 编程助手。");
    console.log("   AI 应首先完成「调查研究」阶段，填写 .stw/Analysis-Template.md。\n");
    console.log("   完成阶段 1 后，运行 stw next 进入阶段 2。");
  } catch (err) {
    console.error(`\n❌ start 失败: ${err.message}`);
    process.exit(1);
  }
  console.log(injectQuote(rootDir));
};

const phaseGuidance = {
  1: "完成调研后，运行 stw next 推进（将自动进行战前评估，阈值 6/10）。调研不充分不进入下一阶段。",
  2: "已在 STW-Workspace.md 中声明 ATTACK_ZONE，专注封锁清单自动生成。AI 不得修改封锁区域外的任何文件。需求未变化？对照 Analysis-Template.md 确认。",
  3: "运行测试套件验证修改的正确性，确保全部通过。stw next 时将自动检查 git diff 是否越界。需求未变化？对照 Analysis-Template.md 确认。",
  4: "填写 .stw/Summary-Template.md 中的总结报告，记录认知迭代。需求未变化？对照 Analysis-Template.md 确认。推进前确认：测试结果真实、修改覆盖完整、无密钥泄露。",
};

const cmdNext = () => {
  const rootDir = process.cwd();
  try {
    const current = getCurrentPhase(rootDir);

    if (!current) {
      console.log("📭 当前没有活跃的任务。运行 stw start 开始。");
      return;
    }

    if (current.phase === "complete") {
      console.log("✅ 所有阶段已完成。运行 stw start 开始新任务。");
      return;
    }

    // scope-check flag
    const nextArgs = process.argv.slice(3);
    if (nextArgs.includes("--scope-check")) {
      console.log("\n  🔍 范围检查:");
      console.log("     请对照 Analysis-Template.md 中的任务背景和变更计划，");
      console.log("     确认当前工作是否仍在原始范围内。");
      if (current.taskDescription) {
        console.log(`     原始任务: ${current.taskDescription}`);
      }
      console.log("     需求未变化？继续推进。有变化？考虑 stw rollback 重新规划。\n");
    }

    const result = advancePhase(rootDir);

    if (!result.ok) {
      console.log(`\n❌ ${result.error}`);
      if (result.required) {
        console.log(`   需要: ${result.required}`);
      }
      return;
    }

    if (result.done) {
      console.log(`\n🎉 所有阶段已完成！`);
      console.log("   运行 stw report 生成总结报告。");
      return;
    }

    const next = result.phase;
    const guide = phaseGuidance[next.id];

    console.log(`\n✅ 阶段 ${next.id - 1} 完成！`);
    console.log(`\n🚀 进入阶段 ${next.id}：${next.name}\n`);

    // Task description reminder
    if (current.taskDescription) {
      console.log(`   📋 原始任务: ${current.taskDescription}`);
      console.log(`   ⚠️ 需求未变化？对照 Analysis-Template.md 确认。\n`);
    }

    // Auto-generate lockdown.json when entering phase 3
    if (next.id === 3) {
      const lockdown = generateLockdown(rootDir);
      const zones = lockdown.attackZones;
      if (zones.length > 0) {
        console.log(`   🔒 专注封锁已生成 (${lockdown.attackZones.length} 个作战区域):`);
        for (const z of zones) {
          console.log(`      · ${z}`);
        }
        console.log(`     封锁文件: .stw/lockdown.json`);
        console.log(`     ⚠️  AI 不得修改 ATTACK_ZONE 声明外的任何文件！`);
        console.log("");
      } else {
        console.log(`   ⚠️  未检测到 ATTACK_ZONE 声明。请确保在 STW-Workspace.md 中声明作战区域。\n`);
      }
    }

    // Human verification when entering phase 5
    if (next.id === 5) {
      const testResults = readTestResults(rootDir);
      if (testResults) {
        console.log("   🧪 测试结果:");
        if (testResults.total !== undefined) {
          console.log(`      用例总数: ${testResults.total}`);
          if (testResults.passed !== undefined) console.log(`      通过: ${testResults.passed}`);
          if (testResults.failed !== undefined) console.log(`      失败: ${testResults.failed}`);
        }
        if (testResults.suite) console.log(`      框架: ${testResults.suite}`);
        console.log("");
      }
      console.log("   🔍 人工核查（实践检验的最终环节）:");
      console.log("      1. 确认测试结果真实有效，而非伪造");
      console.log("      2. 检查修改是否完整覆盖了任务需求");
      console.log("      3. 验证变更计划中的每个文件都已修改");
      console.log("      4. 确认无敏感信息泄露（密钥、密码等）");
      console.log("      5. 对照 .stw/Summary-Template.md 填写总结");
      console.log("");
    }

    if (guide) {
      console.log(`   👉 ${guide}`);
    }
    console.log(`\n   完成阶段 ${next.id} 后，运行 stw next 继续。`);
  } catch (err) {
    console.error(`\n❌ next 失败: ${err.message}`);
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
      console.log(`\n❌ ${result.error}`);
      return;
    }
    console.log(`\n🌊 已回滚到阶段 1 — 波浪式前进，螺旋式上升`);
    console.log(`   回滚原因: ${reason}`);
    console.log(`   累计迭代: ${result.iterations} 次`);
    if (result.history && result.history.length > 0) {
      console.log("   历次回滚:");
      for (const entry of result.history) {
        const d = new Date(entry.timestamp).toLocaleString();
        console.log(`     · 阶段${entry.phase} → ${entry.reason} (${d})`);
      }
    }
    console.log("\n   请重新分析问题，更新 .stw/Analysis-Template.md 后运行 stw next。");
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
      console.log(`\n❌ ${result.error}`);
      return;
    }
    console.log("\n🛑 当前任务已中止。运行 stw start 开始新任务。");
    console.log("  💡 如果工作目录有未提交变更，请先提交或 stash 再开始新任务。");
  } catch (err) {
    console.error(`\n❌ abort 失败: ${err.message}`);
    process.exit(1);
  }
  console.log(injectQuote(rootDir));
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
