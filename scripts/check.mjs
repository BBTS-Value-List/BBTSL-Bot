import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const files = await collect(".");
const jsFiles = files.filter((file) => file.endsWith(".js") || file.endsWith(".mjs"));
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

const sourceFiles = files.filter((file) => file.startsWith(`src${path.sep}`) && file.endsWith(".js"));
const source = (await Promise.all(sourceFiles.map((file) => readFile(file, "utf8")))).join("\n");
const forbidden = ["bbtsl-" + "reset", "/api/bot/v1/" + "reset", "commandName: \"" + "reset" + "\""];
for (const needle of forbidden) {
  if (source.includes(needle)) {
    console.error(`Forbidden reset surface found: ${needle}`);
    process.exit(1);
  }
}
console.log(`Checked ${jsFiles.length} JavaScript files.`);

async function collect(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist", "coverage"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await collect(full));
    else out.push(full);
  }
  return out;
}
