#!/usr/bin/env node
/**
 * Fails when two pages resolve to the same URL, which Next.js only reports once someone opens the page ("You cannot have two parallel pages that
 * resolve to the same path"). Route groups such as (auth) and (site) do not change the URL, so (auth)/signup and (site)/signup clash. This
 * usually happens after unzipping a newer copy over an older one: files that were moved or deleted in the new copy are still on disk.
 * Runs before `npm run dev` and `npm run build`.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "src", "app");
const found = new Map();

function walk(dir, segs) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { walk(full, [...segs, e.name]); continue; }
    if (!/^(page|route)\.(tsx|ts|jsx|js|mdx)$/.test(e.name)) continue;
    const url = "/" + segs.filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith("@")).join("/");
    const key = (e.name.startsWith("page") ? "page " : "route ") + url;
    if (!found.has(key)) found.set(key, []);
    found.get(key).push(path.relative(path.join(__dirname, ".."), full));
  }
}
walk(ROOT, []);

const clashes = [...found.entries()].filter(([, files]) => files.length > 1);
if (clashes.length === 0) { console.log(`routes: ${found.size} routes, no two resolve to the same URL`); process.exit(0); }
console.error("\nroutes: two files resolve to the same URL:\n");
for (const [key, files] of clashes) { console.error(`  ${key.split(" ")[1]}`); files.forEach((f) => console.error(`    ${f}`)); }
console.error("\nThese are stale copies left over from earlier unzips (unzipping adds and overwrites files, it never deletes). Delete the stale folders, then start again.\n");
const stale = [...new Set(clashes.flatMap(([, files]) => files.filter((f) => f.includes("(site)")).map((f) => path.dirname(f))))];
if (stale.length) {
  console.error("PowerShell:");
  stale.forEach((d) => console.error(`  Remove-Item -Recurse -Force "${d}"`));
  console.error("\nmacOS or Linux:");
  stale.forEach((d) => console.error(`  rm -rf "${d.replace(/\\/g, "/")}"`));
  console.error("");
}
process.exit(1);
