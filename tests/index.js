import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

(async () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const entries = await readdir(__dirname, { withFileTypes: true });

  const testFiles = entries
    .filter((e) => e.isFile() && /\.test\.js$/i.test(e.name) && e.name !== "index.js")
    .map((e) => {
      const absPath = path.join(__dirname, e.name);
      return {
        href: pathToFileURL(absPath).href,
        name: e.name,
        absPath,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const suiteStart = process.hrtime.bigint();
  const results = [];

  for (const file of testFiles) {
    const start = process.hrtime.bigint();
    const source = await readFile(file.absPath, "utf8");
    const assertionMatches = source.match(/\bassert\./g) || [];
    await import(file.href);
    const end = process.hrtime.bigint();
    results.push({
      name: file.name,
      durationMs: Number(end - start) / 1e6,
      assertions: assertionMatches.length,
    });
  }

  const suiteEnd = process.hrtime.bigint();
  const totalMs = Number(suiteEnd - suiteStart) / 1e6;

  // Report per-test telemetry (include duration in milliseconds).
  for (const result of results) {
    console.log(`\n${result.name}`);
    console.log(`  duration: ${result.durationMs.toFixed(2)} ms`);
    console.log(`  assertions (text search): ${result.assertions}`);
  }

  console.log(`\nagent tests: ok (ran ${results.length} file(s)) in ${totalMs.toFixed(2)} ms`);
})().catch((err) => {
  console.error("agent tests: failed", err);
  process.exit(1);
});
