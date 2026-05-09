import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, extname, resolve, dirname, relative } from "node:path";
import { builtinModules } from "node:module";

/**
 * Layer dependency rules.
 * Each layer has a list of allowed import sources.
 * - "node:*" matches any node builtin
 * - "@scope/*" matches any npm package (starts with @ or a-z)
 * - Relative paths are resolved and checked against layer rules.
 */
const DEFAULT_LAYERS = {
  "src/scout": {
    label: "侦察层 (scout)",
    allowed: ["node:*", "external"], // node builtins + npm packages
    forbid: ["src/adapters", "src/engine"], // cannot import from upper layers
  },
  "src/adapters": {
    label: "决策层 (adapters)",
    allowed: ["node:*", "external", "src/scout"], // can read scout
    forbid: ["src/engine"], // cannot import engine
  },
  "src/engine": {
    label: "执行层 (engine)",
    allowed: ["node:*", "external", "src/engine"], // only same layer
    forbid: ["src/scout", "src/adapters"],
  },
};

// Layers not subject to import restrictions
const EXEMPT_PREFIXES = ["bin/", "tests/"];

// Regex to match import statements
const IMPORT_RE = /import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /import\s*\(\s*["']([^"']+)["']\s*\)/g;

/**
 * Collect all .js source files under a directory.
 */
function collectJsFiles(rootDir, dir) {
  const results = [];
  const fullDir = join(rootDir, dir);
  if (!existsSync(fullDir)) return results;
  try {
    for (const entry of readdirSync(fullDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        results.push(...collectJsFiles(rootDir, join(dir, entry.name)));
      } else if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".mjs"))) {
        results.push(join(dir, entry.name));
      }
    }
  } catch {
    // skip unreadable dirs
  }
  return results;
}

/**
 * Determine which layer a file belongs to.
 */
function getLayer(filePath) {
  for (const prefix of EXEMPT_PREFIXES) {
    if (filePath.startsWith(prefix)) return null; // exempt
  }
  for (const layer of Object.keys(DEFAULT_LAYERS)) {
    if (filePath.startsWith(layer + "/") || filePath === layer) {
      return layer;
    }
  }
  return null; // unknown layer → exempt
}

/**
 * Check if an import specifier is a node builtin.
 */
function isBuiltin(specifier) {
  if (specifier.startsWith("node:")) return true;
  return builtinModules.includes(specifier);
}

/**
 * Check if an import specifier is an external package (not a relative path).
 */
function isExternal(specifier) {
  return !specifier.startsWith(".") && !specifier.startsWith("/") && !specifier.startsWith("node:");
}

/**
 * Resolve a relative import specifier to an absolute file path, then
 * convert back to a repo-relative path.
 */
function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const fromDir = dirname(fromFile);
  const resolved = resolve(fromDir, specifier);
  // Normalize: add .js extension if not present (Node ESM resolution)
  if (!extname(resolved)) {
    // Try .js and /index.js
    return [resolved + ".js", resolved + "/index.js"];
  }
  return [resolved];
}

/**
 * Check a single resolved import target against the layer rules.
 */
function checkImportTarget(fromFile, toFile, layer, rule) {
  // Determine the layer of the target file
  const toLayer = getLayer(toFile);
  if (toLayer === null) return null; // target is exempt

  // If the target layer is explicitly forbidden, it's a violation
  if (rule.forbid) {
    for (const forbidden of rule.forbid) {
      if (toFile.startsWith(forbidden + "/") || toFile === forbidden) {
        return {
          from: fromFile,
          to: toFile,
          message: `${rule.label} 禁止导入 ${DEFAULT_LAYERS[forbidden]?.label || forbidden}：${toFile}`,
        };
      }
    }
  }

  // If same layer → always allowed
  if (toLayer === layer) return null;

  // If target layer is explicitly allowed → OK
  if (rule.allowed) {
    for (const allowed of rule.allowed) {
      if (allowed === toLayer || (allowed.startsWith("src/") && toFile.startsWith(allowed + "/"))) {
        return null;
      }
    }
  }

  // If we reach here, the import is not allowed
  return {
    from: fromFile,
    to: toFile,
    message: `${rule.label} 不允许导入 ${toFile}（目标层级: ${DEFAULT_LAYERS[toLayer]?.label || toLayer}）`,
  };
}

/**
 * Parse import statements from source code.
 * Returns [{ specifier, type: "static"|"dynamic" }].
 */
function parseImports(content) {
  const imports = [];
  for (const re of [IMPORT_RE, DYNAMIC_IMPORT_RE]) {
    let match;
    while ((match = re.exec(content)) !== null) {
      imports.push({ specifier: match[1], type: re === DYNAMIC_IMPORT_RE ? "dynamic" : "static" });
    }
  }
  return imports;
}

/**
 * Run the import layer check across all source files.
 * Returns { passed, output, violations } compatible with check.js gate format.
 */
export function runImportCheck(rootDir, layers = DEFAULT_LAYERS) {
  const allFiles = [
    ...collectJsFiles(rootDir, "src"),
    ...collectJsFiles(rootDir, "bin"),
    ...collectJsFiles(rootDir, "tests"),
  ];

  const violations = [];

  for (const file of allFiles) {
    const layer = getLayer(file);
    if (layer === null) continue; // exempt (bin/, tests/, unknown)
    const rule = layers[layer];
    if (!rule) continue;

    const fullPath = join(rootDir, file);
    let content;
    try {
      content = readFileSync(fullPath, "utf-8");
    } catch {
      continue;
    }

    const imports = parseImports(content);
    for (const imp of imports) {
      // Skip builtin and external imports
      if (isBuiltin(imp.specifier)) continue;
      if (isExternal(imp.specifier)) continue;

      // Resolve relative imports
      const candidates = resolveImport(file, imp.specifier);
      if (!candidates) {
        // Not a relative import, not builtin, not external — could be a bare specifier
        // like an npm package without scope. Treat as external.
        continue;
      }

      for (const candidate of candidates) {
        // Normalize the candidate path
        const relativePath = relative(rootDir, candidate).replace(/\\/g, "/");
        const violation = checkImportTarget(file, relativePath, layer, rule);
        if (violation) {
          violations.push(violation);
          break; // one violation per import statement
        }
      }
    }
  }

  if (violations.length === 0) {
    return { passed: true, output: "(无导入层级违规)", violations: [] };
  }

  const output = violations
    .slice(0, 20)
    .map((v) => `  ❌ ${v.from}\n     → ${v.message}`)
    .join("\n");

  const suffix = violations.length > 20 ? `\n  ... 还有 ${violations.length - 20} 处违规` : "";

  return {
    passed: false,
    output: `发现 ${violations.length} 处导入层级违规:\n${output}${suffix}`,
    violations,
  };
}

/**
 * Return the list of defined layers and their rules (for diagnostics).
 */
export function getLayerRules() {
  return Object.entries(DEFAULT_LAYERS).map(([path, rule]) => ({
    path,
    label: rule.label,
    allowed: rule.allowed,
    forbid: rule.forbid,
  }));
}
