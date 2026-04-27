import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanSkills } from "../../src/scout/skill-scanner.js";

function freshDir() {
  return join(tmpdir(), "stw-skill-" + Date.now());
}

function makeSkill(dir, relPath, name, desc) {
  const full = join(dir, relPath);
  mkdirSync(full, { recursive: true });
  writeFileSync(join(full, "SKILL.md"), `---\nname: ${name}\ndescription: "${desc}"\n---\n\n# ${name}\n`);
}

describe("Skill Scanner", () => {
  it("scans SKILL.md in subdirectories with frontmatter", () => {
    const dir = freshDir();
    makeSkill(dir, ".claude/skills/my-skill", "my-skill", "A test skill");
    const skills = scanSkills(dir);
    const found = skills.find((s) => s.name === "my-skill");
    assert.ok(found);
    assert.equal(found.description, "A test skill");
  });

  it("finds only user's skills, not test project ones", () => {
    const dir = freshDir();
    const skills = scanSkills(dir);
    const testSkill = skills.find((s) => s.name === "my-skill");
    assert.equal(testSkill, undefined);
  });

  it("deduplicates skills with the same name", () => {
    const dir = freshDir();
    makeSkill(dir, ".claude/skills/skill-a", "dup-skill", "First");
    makeSkill(dir, ".agents/skills/skill-b", "dup-skill", "Second");
    const skills = scanSkills(dir);
    const found = skills.filter((s) => s.name === "dup-skill");
    assert.equal(found.length, 1);
  });

  it("ignores files without YAML frontmatter", () => {
    const dir = freshDir();
    const skillsDir = join(dir, ".claude", "skills", "no-frontmatter");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(join(skillsDir, "README.md"), "# Just a readme\nNo frontmatter here.");
    const skills = scanSkills(dir);
    const found = skills.find((s) => s.name === "no-frontmatter");
    assert.equal(found, undefined);
  });
});
