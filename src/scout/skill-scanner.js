import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const SKILL_DIRS = [".claude/skills", ".agents/skills"];

// Plugin cache skills from superpowers etc.
const PLUGIN_SKILLS = join(homedir(), ".claude", "plugins", "cache");

function parseFrontmatter(content) {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return null;

  const end = lines.indexOf("---", 1);
  if (end === -1) return null;

  const frontmatter = {};
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key) frontmatter[key] = value;
  }
  return frontmatter;
}

function findSkillFiles(dirPath, relativeBase) {
  const results = [];
  if (!existsSync(dirPath)) return results;

  let entries;
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      // Recurse into subdirectories
      results.push(...findSkillFiles(fullPath, join(relativeBase, entry.name)));
    } else if (entry.name.endsWith(".md")) {
      let content;
      try {
        content = readFileSync(fullPath, "utf-8");
      } catch {
        continue;
      }
      const frontmatter = parseFrontmatter(content);
      if (frontmatter?.name) {
        results.push({
          name: frontmatter.name,
          description: frontmatter.description || "",
          source: join(relativeBase, entry.name),
        });
      }
    }
  }

  return results;
}

function scanPluginSkills() {
  const results = [];
  if (!existsSync(PLUGIN_SKILLS)) return results;

  let cacheDirs;
  try {
    cacheDirs = readdirSync(PLUGIN_SKILLS, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    return results;
  }

  for (const vendor of cacheDirs) {
    const skillsDir = join(PLUGIN_SKILLS, vendor.name, "skills");
    results.push(...findSkillFiles(skillsDir, `plugin: ${vendor.name}/skills`));
  }

  return results;
}

export function scanSkills(rootDir) {
  const skills = [];

  // User-level skill dirs (.claude/skills, .agents/skills)
  for (const dir of SKILL_DIRS) {
    const fullPath = join(rootDir, dir);
    skills.push(...findSkillFiles(fullPath, dir));
  }

  // Also scan from home directory root (for globally installed skills, skip if same as project dir)
  const homeRoot = homedir();
  for (const dir of SKILL_DIRS) {
    const projectPath = join(rootDir, dir);
    const homePath = join(homeRoot, dir);
    if (homePath !== projectPath && existsSync(homePath)) {
      skills.push(...findSkillFiles(homePath, `~/${dir}`));
    }
  }

  // Plugin cache skills (superpowers etc.)
  const pluginSkills = scanPluginSkills();
  skills.push(...pluginSkills);

  // Dedup by name
  const seen = new Set();
  return skills.filter((s) => {
    if (seen.has(s.name)) return false;
    seen.add(s.name);
    return true;
  });
}
