import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { scanSkills } from "../../src/scout/skill-scanner.js";
import { freshDir, writeFile } from "../test-helper.js";

function makeSkill(dir, relPath, name, desc) {
  writeFile(dir, join(relPath, "SKILL.md"), `---\nname: ${name}\ndescription: "${desc}"\n---\n\n# ${name}\n`);
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
    writeFile(dir, ".claude/skills/no-frontmatter/README.md", "# Just a readme\nNo frontmatter here.");
    const skills = scanSkills(dir);
    const found = skills.find((s) => s.name === "no-frontmatter");
    assert.equal(found, undefined);
  });
});
