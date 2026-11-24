import { writeFileSync } from "node:fs";
import { CORPUS } from "../src/lib/optimize/corpus";
import { convert } from "../src/lib/optimize/tec/engine";
import { approxCounter, exactCounter } from "../src/lib/optimize/tec/tokens";
import type { Level } from "../src/lib/optimize/tec/types";

(async () => {
  const SAFE = ["parse", "noise", "unwrap", "dedupe", "format", "alias"] as const;
  const encs = ["o200k_base", "cl100k_base"] as const, levels: Level[] = ["lossless", "balanced", "aggressive"];
  const out: Record<string, unknown>[] = [], rows: Record<string, unknown>[] = [];
  for (const enc of encs) {
    const counter = await exactCounter(enc);
    console.log(`\n== ${enc} ==`);
    console.log("document".padEnd(34) + "before".padStart(8) + "bal-nofit".padStart(12) + levels.map((l) => l.padStart(12)).join("") + "  details (balanced)");
    const tot: Record<string, number> = { before: 0, safe: 0 }; levels.forEach((l) => (tot[l] = 0));
    for (const d of CORPUS) {
      const row: Record<string, number> = {}; let before = 0, kept = "", detail: Record<string, number> = {};
      const sf = convert({ ...d.input, question: d.question }, { level: "balanced", counter, stages: [...SAFE] }); tot.safe += sf.after;
      out.push({ enc, id: d.id, type: d.type, level: "balanced-nofit", before: sf.before, after: sf.after, kept: sf.critical.kept, total: sf.critical.total, lost: sf.critical.lost.length, excused: sf.critical.excused.length, cut: 0 });
      for (const lv of levels) {
        const r = convert({ ...d.input, question: d.question }, { level: lv, counter });
        before = r.before; row[lv] = r.after; tot[lv] += r.after;
        if (lv === "balanced") detail = { total: r.critical.total, kept: r.critical.kept, excused: r.critical.excused.length, cut: r.critical.cut.length, lost: r.critical.lost.length };
        if (lv === "balanced") kept = `${r.critical.kept}/${r.critical.total}, removed with boilerplate ${r.critical.excused.length}, cut to fit ${r.critical.cut.length}${r.critical.lost.length ? ", LOST " + r.critical.lost.join(",") : ""}`;
        out.push({ enc, id: d.id, type: d.type, level: lv, before: r.before, after: r.after, kept: r.critical.kept, total: r.critical.total, lost: r.critical.lost.length, excused: r.critical.excused.length, cut: r.critical.cut.length });
      }
      tot.before += before;
      rows.push({ enc, id: d.id, type: d.type, label: d.label, before, lossless: row.lossless, safe: sf.after, balanced: row.balanced, aggressive: row.aggressive, question: !!d.question, details: detail });
      console.log(d.id.padEnd(34) + String(before).padStart(8) + `${sf.after} (${Math.round((1 - sf.after / before) * 100)}%)`.padStart(12) + levels.map((l) => `${row[l]} (${Math.round((1 - row[l] / before) * 100)}%)`.padStart(12)).join("") + "  " + kept);
    }
    console.log("TOTAL".padEnd(34) + String(tot.before).padStart(8) + `${tot.safe} (${Math.round((1 - tot.safe / tot.before) * 100)}%)`.padStart(12) + levels.map((l) => `${tot[l]} (${Math.round((1 - tot[l] / tot.before) * 100)}%)`.padStart(12)).join(""));
  }
  // The deterministic counter used by the Java gateway for parity.
  const ap = CORPUS.map((d) => convert({ ...d.input, question: d.question }, { level: "balanced", counter: approxCounter }));
  console.log("\napprox-v1 balanced total:", ap.reduce((a, r) => a + r.before, 0), "->", ap.reduce((a, r) => a + r.after, 0));
  writeFileSync(process.argv[2] ?? "/tmp/benchmark.json", JSON.stringify(out, null, 1));
  if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify({ corpus: "synthetic", documents: CORPUS.length, tokenizers: ["o200k_base", "cl100k_base"], engine: "tec reference, approx-v1 parity", rows }, null, 1) + "\n");
})();
