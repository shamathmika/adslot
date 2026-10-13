// Fails (exit 1) if the ad unit's cost over the clean page exceeds its budget.
//   node bench/gate.js [label]   reads bench/results/<label>.json
import fs from 'node:fs';
import path from 'node:path';

const label = process.argv[2] ?? 'latest';
const r = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'results', `${label}.json`), 'utf8'));

const BUDGET = [
  // [name, measured (median), limit, unit]
  ['Added LCP', r.delta.lcp.median, 150, 'ms'],
  ['Added CLS', r.delta.cls.median, 0.01, ''],
  ['Added CLS (p95)', r.delta.cls.p95, 0.01, ''],
  ['Ad code transferred (gzip)', r.ad.adCodeBytes.median / 1024, 40, 'KB'],
  ['Added TBT', r.delta.tbt.median, 50, 'ms'],
];

const rows = BUDGET.map(([name, v, max, unit]) => ({ name, v: +v.toFixed(3), max, unit, ok: v <= max }));
const lines = [
  `### Ad unit budget (${r.meta.runs} runs, ${r.meta.commit})`, '',
  '| Check | Measured | Budget | |', '|---|---|---|---|',
  ...rows.map(x => `| ${x.name} | ${x.v}${x.unit} | ${x.max}${x.unit} | ${x.ok ? 'pass' : '**FAIL**'} |`),
];
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
if (rows.some(x => !x.ok)) { console.error('\nAd unit is over budget.'); process.exit(1); }
