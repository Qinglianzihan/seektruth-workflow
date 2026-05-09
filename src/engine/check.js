import { spawnSync } from "node:child_process";
import { CHECK_UNKNOWN_GATE, CHECK_EXEC_FAILED, CHECK_ALL_CLEAR } from "./messages.js";
import { runRatchetCheck } from "./ratchet.js";

/**
 * Gate definitions. Each gate has a label and a run(rootDir) function.
 * Add new gates here — Sprint 2 adds ratchet, Sprint 3 will add import-linter and ast-grep.
 */
const GATES = {
  lint: {
    label: "ESLint",
    run(rootDir) {
      const result = spawnSync("npx", ["eslint", "src/", "bin/", "--format", "stylish"], {
        cwd: rootDir,
        encoding: "utf-8",
        timeout: 30000,
      });
      return {
        passed: result.status === 0,
        output: (result.stdout + result.stderr).trim() || CHECK_ALL_CLEAR,
      };
    },
  },

  ratchet: {
    label: "Ratchet",
    run(rootDir) {
      return runRatchetCheck(rootDir);
    },
  },

  test: {
    label: "Tests",
    run(rootDir) {
      const result = spawnSync("node", ["--test", "tests/**/*.test.js"], {
        cwd: rootDir,
        encoding: "utf-8",
        timeout: 60000,
      });
      return {
        passed: result.status === 0,
        output: (result.stdout + result.stderr).trim(),
      };
    },
  },
};

/**
 * Run one or more gates. Returns { ok, results: { [gate]: { passed, output } } }.
 * If no gates specified, runs all registered gates.
 */
export function runCheck(rootDir, gates = Object.keys(GATES)) {
  const results = {};
  let allPassed = true;

  for (const gate of gates) {
    if (!GATES[gate]) {
      results[gate] = { passed: false, output: CHECK_UNKNOWN_GATE(gate) };
      allPassed = false;
      continue;
    }
    try {
      const gateResult = GATES[gate].run(rootDir);
      results[gate] = gateResult;
      if (!gateResult.passed) allPassed = false;
    } catch (err) {
      results[gate] = { passed: false, output: CHECK_EXEC_FAILED(err.message) };
      allPassed = false;
    }
  }

  return { ok: allPassed, results };
}

/**
 * Return list of available gate ids and labels.
 */
export function listGates() {
  return Object.entries(GATES).map(([id, g]) => ({ id, label: g.label }));
}
