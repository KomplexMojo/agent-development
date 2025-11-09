#!/usr/bin/env node
/**
 * Aggregates V8 coverage output produced by NODE_V8_COVERAGE when running the
 * AssemblyScript test harness. The script summarises coverage for files under
 * apps/simulation/, emitting both JSON and plain-text summaries in
 * coverage/assembly/.
 *
 * Note: Node.js does not currently surface per-instruction WebAssembly
 * coverage, so the report reflects JS bridge/tests. When WebAssembly coverage
 * becomes available, this script will automatically include it.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      result[key] = next;
      i += 1;
    } else {
      result[key] = "true";
    }
  }
  return result;
}

const projectRoot = process.cwd();
const args = parseArgs(process.argv.slice(2));
const coverageDir = path.resolve(projectRoot, args["coverage-dir"] ?? ".coverage");
const reportDir = path.resolve(projectRoot, args["out-dir"] ?? "coverage/assembly");
const includeFragment = args.include ?? `${path.sep}apps${path.sep}simulation${path.sep}`;
const label = args.label ?? "AssemblyScript";
const warnOnMissingWasm = args["warn-missing-wasm"] !== "false";
const includePosix = includeFragment.replace(/\\/g, "/");
const includeNative =
  includePosix === includeFragment ? includeFragment : includePosix.split("/").join(path.sep);

async function main() {
  let entries;
  try {
    entries = await fs.readdir(coverageDir);
  } catch {
    console.warn("[coverage] No .coverage directory found. Run with NODE_V8_COVERAGE first.");
    return;
  }

  const coverageFiles = entries.filter((file) => file.endsWith(".json"));
  if (coverageFiles.length === 0) {
    console.warn("[coverage] No JSON coverage files found in .coverage.");
    return;
  }

  const byFile = new Map();
  let sawWasmModule = false;

  for (const file of coverageFiles) {
    const raw = await fs.readFile(path.join(coverageDir, file), "utf8");
    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn(`[coverage] Skipping ${file}: ${err.message}`);
      continue;
    }

    const scripts = Array.isArray(parsed?.result) ? parsed.result : [];
    for (const script of scripts) {
      const { url, functions } = script ?? {};
      if (typeof url !== "string" || !url.startsWith("file://")) continue;

      const filename = fileURLToPath(url);
      const matchesInclude =
        filename.includes(includeNative) || (includePosix !== includeNative && filename.includes(includePosix));
      if (!matchesInclude) continue;

      if (filename.endsWith(".wasm")) {
        sawWasmModule = true;
        // WebAssembly entries currently lack executable ranges. Track but skip.
        continue;
      }

      const key = path.relative(projectRoot, filename);
      let entry = byFile.get(key);
      if (!entry) {
        entry = { totalRanges: 0, coveredRanges: 0 };
        byFile.set(key, entry);
      }

      for (const fn of functions ?? []) {
        for (const range of fn?.ranges ?? []) {
          entry.totalRanges += 1;
          if (range?.count > 0) {
            entry.coveredRanges += 1;
          }
        }
      }
    }
  }

  await fs.mkdir(reportDir, { recursive: true });

  const rows = Array.from(byFile.entries())
    .map(([file, stats]) => ({
      file,
      coveredRanges: stats.coveredRanges,
      totalRanges: stats.totalRanges,
      coverage:
        stats.totalRanges > 0 ? Number(((stats.coveredRanges / stats.totalRanges) * 100).toFixed(2)) : 100,
    }))
    .sort((a, b) => a.file.localeCompare(b.file));

  const summary = {
    generatedAt: new Date().toISOString(),
    note:
      "Range coverage is derived from V8 function-range counters. WebAssembly modules will appear once supported by Node.js.",
    files: rows,
  };

  await fs.writeFile(path.join(reportDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");

  const textReportLines = rows.map(
    (row) =>
      `${row.coverage.toFixed(2).padStart(6)}%  ${row.file}  (${row.coveredRanges}/${row.totalRanges} ranges hit)`,
  );
  if (textReportLines.length > 0) {
    await fs.writeFile(path.join(reportDir, "summary.txt"), `${textReportLines.join("\n")}\n`, "utf8");
  }

  console.log(`[coverage] ${label} coverage summary written to ${path.relative(projectRoot, reportDir)}/`);

  if (!sawWasmModule && warnOnMissingWasm) {
    console.warn(
      "[coverage] WebAssembly offsets were not reported by V8. Current Node.js versions omit wasm coverage; the report reflects JS bridge/test files only.",
    );
  }
}

main().catch((error) => {
  console.error("[coverage] Failed to aggregate coverage:", error);
  process.exitCode = 1;
});
