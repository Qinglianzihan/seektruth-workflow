#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectProject } from "../src/scout/project-detector.js";
import { detectAiTools } from "../src/scout/ai-tool-detector.js";
import { scanMcpConfigs, getBuiltinMcpServers } from "../src/scout/mcp-scanner.js";
import { scanSkills } from "../src/scout/skill-scanner.js";
import { generateReport } from "../src/scout/report-generator.js";
import { resolveConflicts } from "../src/adapters/conflict-resolver.js";
import { selectRules } from "../src/adapters/rule-selector.js";
import { writeStwFiles } from "../src/adapters/file-writer.js";
import { getCurrentPhase, PHASES, startSession, advancePhase, abortSession, rollbackSession } from "../src/engine/state-machine.js";
import { generateLockdown } from "../src/engine/lockdown.js";
import { archiveReport, listReports, getRecentSummaries } from "../src/engine/report.js";
import { getStats, generateStatsReport, logTokens } from "../src/engine/stats.js";
import { getRelatedErrors } from "../src/engine/error-registry.js";
import { deepScanMcp } from "../src/scout/mcp-deep-scanner.js";

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

  // 生成 .stw/ 文件
  const stwDir = writeStwFiles(rootDir, environment, conflicts);
  console.log(`\n✅ 求是工作流已初始化: ${stwDir}`);
  console.log("   下一步：将 .stw/STW-Workspace.md 内容作为 AI 系统提示。");
};

const cmdStatus = () => {
  try {
    const rootDir = process.cwd();
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

    for (const p of PHASES) {
      const done = completedPhases.includes(p.id);
      const active = p.id === phase;
      const icon = done ? "✅" : active ? "▶️ " : "⏳";
      console.log(`  ${icon} 阶段 ${p.id}: ${p.name}${active ? ` (${p.deliverable})` : ""}`);
    }

    if (current.iterations && current.iterations.length > 0) {
      console.log(`\n  🌊 迭代历史: ${current.iterations.length} 次回滚`);
      const lastIterations = current.iterations.slice(-3);
      for (const entry of lastIterations) {
        const d = new Date(entry.timestamp).toLocaleDateString();
        console.log(`     · 从阶段 ${entry.phase} 回滚 — ${entry.reason} (${d})`);
      }
    }
  } catch (err) {
    console.error(`\n❌ status 失败: ${err.message}`);
    process.exit(1);
  }
};

const cmdStart = () => {
  try {
    const rootDir = process.cwd();
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

    startSession(rootDir);
    const phase1 = PHASES[0];

    console.log(`\n🚀 新任务已开始 — 阶段 1：${phase1.name}\n`);

    // Load recent summaries as "历史经验"
    const recent = getRecentSummaries(rootDir, 3);
    if (recent.length > 0) {
      console.log("   📚 历史经验（最近总结报告摘要）：");
      for (const r of recent) {
        console.log(`      · ${r.title}`);
        if (r.snippet) console.log(`        ${r.snippet}`);
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
};

const phaseGuidance = {
  1: "完成调研后，运行 stw next 推进（将自动进行战前评估，阈值 6/10）。调研不充分不进入下一阶段。",
  2: "已在 STW-Workspace.md 中声明 ATTACK_ZONE，专注封锁清单自动生成。AI 不得修改封锁区域外的任何文件。",
  3: "运行测试套件验证修改的正确性，确保全部通过。然后创建 .stw/test-results.json {\"passed\":true} 作为交付证据。",
  4: "填写 .stw/Summary-Template.md 中的总结报告，记录认知迭代。",
};

const cmdNext = () => {
  try {
    const rootDir = process.cwd();
    const current = getCurrentPhase(rootDir);

    if (!current) {
      console.log("📭 当前没有活跃的任务。运行 stw start 开始。");
      return;
    }

    if (current.phase === "complete") {
      console.log("✅ 所有阶段已完成。运行 stw start 开始新任务。");
      return;
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

    if (guide) {
      console.log(`   👉 ${guide}`);
    }
    console.log(`\n   完成阶段 ${next.id} 后，运行 stw next 继续。`);
  } catch (err) {
    console.error(`\n❌ next 失败: ${err.message}`);
    process.exit(1);
  }
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
};

const cmdReport = () => {
  try {
    const rootDir = process.cwd();
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
};

const cmdRollback = () => {
  try {
    const rootDir = process.cwd();
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
};

const cmdAbort = () => {
  try {
    const rootDir = process.cwd();
    const result = abortSession(rootDir);
    if (!result.ok) {
      console.log(`\n❌ ${result.error}`);
      return;
    }
    console.log("\n🛑 当前任务已中止。运行 stw start 开始新任务。");
  } catch (err) {
    console.error(`\n❌ abort 失败: ${err.message}`);
    process.exit(1);
  }
};

const cmdRepair = () => {
  try {
    const rootDir = process.cwd();
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
