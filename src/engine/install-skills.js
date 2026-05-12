import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SOURCE_DIR = join(__dirname, "..", "..", "templates", "native-skills");
const INSTALL_MARKER = ".installed-by-stw";

/**
 * Install native STW skills to a user-level directory that the target AI tool
 * actually scans. Currently only Claude Code has a skill concept; other tools
 * return `{ ok: true, skipped: true, reason }` explaining why.
 *
 * Options:
 *   tool       — AI tool name ("Claude Code" by default)
 *   targetHome — home directory root (testable override; defaults to os.homedir())
 *   sourceDir  — skill template source dir (testable override; defaults to templates/native-skills)
 *   force      — overwrite existing subdirs even without the .installed-by-stw marker
 *   dryRun     — report actions without writing
 *
 * Return shape: { ok, skipped?, reason?, installed?, skippedDirs?, targetDir?, dryRun? }.
 */
export function installSkills({
  tool = "Claude Code",
  targetHome = homedir(),
  sourceDir = DEFAULT_SOURCE_DIR,
  force = false,
  dryRun = false,
} = {}) {
  if (tool !== "Claude Code") {
    return {
      ok: true,
      skipped: true,
      reason: `${tool} 没有 Skill 机制（Skill 是 Claude Code 专属）。此工具的规则通过 stw init 生成到项目根（如 AGENTS.md / .cursorrules 等）。`,
    };
  }

  if (!existsSync(sourceDir)) {
    return {
      ok: false,
      error: `找不到 skill 模板目录：${sourceDir}`,
    };
  }

  const targetDir = join(targetHome, ".claude", "skills");

  const entries = readdirSync(sourceDir, { withFileTypes: true }).filter((e) =>
    e.isDirectory()
  );

  const installed = [];
  const skippedDirs = [];

  for (const entry of entries) {
    const slug = entry.name;
    const src = join(sourceDir, slug);
    const dest = join(targetDir, slug);

    if (existsSync(dest)) {
      const markerPath = join(dest, INSTALL_MARKER);
      if (!existsSync(markerPath) && !force) {
        skippedDirs.push(slug);
        continue;
      }
    }

    if (dryRun) {
      installed.push(slug);
      continue;
    }

    mkdirSync(dest, { recursive: true });
    copyDirRecursive(src, dest);
    writeFileSync(join(dest, INSTALL_MARKER), stampContent(), "utf-8");
    installed.push(slug);
  }

  if (skippedDirs.length > 0) {
    return {
      ok: false,
      targetDir,
      installed,
      skippedDirs,
      error:
        `以下目录已存在但没有 ${INSTALL_MARKER} 标记，可能是你自己写的 skill：\n` +
        skippedDirs.map((s) => `  · ${join(targetDir, s)}`).join("\n") +
        `\n\n加 --force 强制覆盖，或先备份再删除这些目录。`,
    };
  }

  return {
    ok: true,
    installed,
    targetDir,
    dryRun: dryRun || undefined,
  };
}

function copyDirRecursive(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.name === INSTALL_MARKER) continue;
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(s, d);
    } else if (entry.isFile()) {
      copyFileSync(s, d);
    }
  }
}

function stampContent() {
  return `installed-by: seektruth-workflow\ninstalled-at: ${new Date().toISOString()}\n`;
}

export const INSTALL_SKILLS_MARKER = INSTALL_MARKER;
