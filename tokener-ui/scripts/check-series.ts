/** Sanity checks for the dashboard series. Run: npx tsx scripts/check-series.ts */
import { series, summary, pruneSweep, thresholdSweep, REDUCTION_BUCKETS } from "../src/lib/optimize/series";
let bad = 0; const ok = (c: boolean, m: string) => { if (!c) { bad++; console.error("FAIL " + m); } };
for (const r of ["24h", "7d", "30d"] as const) {
  const p = series(r), s = summary(p);
  ok(p.length === (r === "24h" ? 24 : r === "7d" ? 7 : 30), r + " length");
  ok(p.every((x) => x.sentM < x.originalM && x.sentM > 0), r + " sent below original");
  ok(s.savedPct > 20 && s.savedPct < 45, `${r} saved ${s.savedPct.toFixed(1)}`);
  ok(s.details > 97 && s.details <= 100 && s.agreement > 96, r + " quality");
  ok(JSON.stringify(series(r)) === JSON.stringify(p), r + " deterministic");
}
const s30 = summary(series("30d"));
ok(Math.abs(s30.usd - 9870) / 9870 < 0.06, `30d USD saved ${s30.usd} near 9870`);
const sw = pruneSweep();
ok(sw[0].saved <= sw[sw.length - 1].saved, "pruning more saves more");
ok(sw[0].kept >= sw[sw.length - 1].kept, "pruning more cannot keep more details");
ok(sw[0].kept === 100 && sw.every((x) => x.kept >= 90), "details start at 100% and stay above 90% down to a 20% budget: " + sw.map((x) => x.kept).join(","));
const th = thresholdSweep(); ok(th[0].saved > th[th.length - 1].saved && th[0].kept > th[th.length - 1].kept, "threshold trade-off direction");
ok(REDUCTION_BUCKETS.reduce((a, b) => a + b.n, 0) === 100, "buckets sum to 100");
console.log(bad ? `${bad} failed` : "series ok"); process.exit(bad ? 1 : 0);
