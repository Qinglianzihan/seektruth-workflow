import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { freshDir, writeFile } from "../test-helper.js";
import { detectProject } from "../../src/scout/project-detector.js";

describe("detectProject", () => {
  describe("Node.js", () => {
    it("detects a basic Node.js project", () => {
      const dir = freshDir();
      writeFile(dir, "package.json", JSON.stringify({ name: "test" }));
      assert.deepEqual(detectProject(dir), {
        type: "Node.js",
        buildTool: undefined,
        testFramework: undefined,
      });
    });

    describe("build tool inference", () => {
      it("infers TypeScript when scripts.tsc is present", () => {
        const dir = freshDir();
        writeFile(
          dir,
          "package.json",
          JSON.stringify({
            name: "ts-project",
            scripts: { tsc: "tsc" },
          }),
        );
        assert.equal(detectProject(dir).buildTool, "TypeScript");
      });

      it("infers Vite when devDependencies.vite is present", () => {
        const dir = freshDir();
        writeFile(
          dir,
          "package.json",
          JSON.stringify({
            name: "vite-project",
            devDependencies: { vite: "^5.0.0" },
          }),
        );
        assert.equal(detectProject(dir).buildTool, "Vite");
      });

      it("infers Webpack when devDependencies.webpack is present", () => {
        const dir = freshDir();
        writeFile(
          dir,
          "package.json",
          JSON.stringify({
            name: "wp-project",
            devDependencies: { webpack: "^5.0.0" },
          }),
        );
        assert.equal(detectProject(dir).buildTool, "Webpack");
      });
    });

    describe("test framework inference", () => {
      it("infers Vitest when devDependencies.vitest is present", () => {
        const dir = freshDir();
        writeFile(
          dir,
          "package.json",
          JSON.stringify({
            name: "vitest-project",
            devDependencies: { vitest: "^1.0.0" },
          }),
        );
        assert.equal(detectProject(dir).testFramework, "Vitest");
      });

      it("infers Jest when devDependencies.jest is present", () => {
        const dir = freshDir();
        writeFile(
          dir,
          "package.json",
          JSON.stringify({
            name: "jest-project",
            devDependencies: { jest: "^29.0.0" },
          }),
        );
        assert.equal(detectProject(dir).testFramework, "Jest");
      });

      it("infers Mocha when devDependencies.mocha is present", () => {
        const dir = freshDir();
        writeFile(
          dir,
          "package.json",
          JSON.stringify({
            name: "mocha-project",
            devDependencies: { mocha: "^10.0.0" },
          }),
        );
        assert.equal(detectProject(dir).testFramework, "Mocha");
      });
    });
  });

  describe("Python", () => {
    it("detects a Python project by requirements.txt", () => {
      const dir = freshDir();
      writeFile(dir, "requirements.txt", "requests\nflask\n");
      assert.deepEqual(detectProject(dir), { type: "Python" });
    });
  });

  describe("Rust", () => {
    it("detects a Rust project by Cargo.toml", () => {
      const dir = freshDir();
      writeFile(dir, "Cargo.toml", '[package]\nname = "test"\n');
      assert.deepEqual(detectProject(dir), { type: "Rust" });
    });
  });

  describe("Unknown", () => {
    it("returns Unknown when no config files are present", () => {
      const dir = freshDir();
      assert.deepEqual(detectProject(dir), { type: "Unknown" });
    });
  });
});
