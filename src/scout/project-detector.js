import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function detectProject(rootDir) {
  if (existsSync(join(rootDir, "package.json"))) {
    const pkg = JSON.parse(
      readFileSync(join(rootDir, "package.json"), "utf-8"),
    );
    return {
      type: "Node.js",
      buildTool: inferBuildTool(pkg),
      testFramework: inferTestFramework(pkg),
    };
  }

  if (existsSync(join(rootDir, "requirements.txt"))) {
    return { type: "Python" };
  }

  if (existsSync(join(rootDir, "Cargo.toml"))) {
    return { type: "Rust" };
  }

  return { type: "Unknown" };
}

function inferBuildTool(pkg) {
  if (pkg.scripts?.tsc) return "TypeScript";
  if (pkg.devDependencies?.vite) return "Vite";
  if (pkg.devDependencies?.webpack) return "Webpack";
  return undefined;
}

function inferTestFramework(pkg) {
  if (pkg.devDependencies?.vitest) return "Vitest";
  if (pkg.devDependencies?.jest) return "Jest";
  if (pkg.devDependencies?.mocha) return "Mocha";
  return undefined;
}
