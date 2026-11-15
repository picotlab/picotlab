// Headless tests for the CORE block. Run: node lab/hookloop/test/core.test.js [file.html|core.js]
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(process.argv[2] || path.join(__dirname, '../index.html'), 'utf8');
const core = src.slice(src.indexOf('// CORE-START'), src.indexOf('// CORE-END'));
const C = new Function(core + '; return { YARN, ST, gaugeOf, parsePrompt, normalizeSpec, specToPrompt, roundPlan, runGA, makeGA, gaStep, planSeed, evaluate, roundsFromCounts, formatRounds, parsePattern, countsFromRounds, designFlat, flatDims, formatFlat, parseFlat, estimate, roundsSummary, swatchGauge, profileBase, fitCorrection, lsScale, maskFromImage, maskFromPolygon, profileFromMask, shapeFromProfile, SHAPES, abbreviationsFor, skillLevel, swatchFor, splitLine, colourSeq, colourAt, colourYardage, parseSeq, fitCheck, fitTable, scarfDrape, walkSteps, phasesFor, lineForStep, parseBody, statedCountOf, produces, EXAMPLES: typeof EXAMPLES !== "undefined" ? EXAMPLES : null };')();
let fail = 0, pass = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL', msg); } };
const spec = t => C.normalizeSpec(C.parsePrompt(t));
// GA runs are seeded (H-35): with no seed, runGA seeds from the plan, so every test below sees the same pattern each run
const hat = (t, gens = 2500, seed) => { const s = spec(t), g = C.gaugeOf(s), P = C.roundPlan(s, g), ga = C.runGA(P, 0.7, gens, seed), c = [...ga.best];
  const sum = C.roundsSummary(c, P.st, g, s), est = C.estimate({ kind: 'rounds', spec: s, g, counts: c, st: P.st }); return { s, g, P, c, sum, est }; };
const flat = t => { const s = spec(t), g = C.gaugeOf(s), d = C.designFlat(s, g), F = C.flatDims(d.cand, s, g), est = C.estimate({ kind: 'flat', spec: s, g, cand: d.cand }); return { s, g, d, F, est }; };

// 1. adult M beanie, worsted
{
  const h = hat('beanie for a 56 cm head in worsted');
  const C0 = 56 * (1 - h.s.ease);
  console.log('beanie', h.s.stitch, 'counts', h.c.join(' '), '| brim', h.sum.brimC.toFixed(1), 'cm, depth', h.sum.depth.toFixed(1), 'cm,', h.est.m.toFixed(0), 'm,', (h.est.minutes / 60).toFixed(1), 'h');
  ok(h.s.item === 'hat' && h.s.style === 'beanie' && h.s.head === 56 && h.s.yarn === 4, 'beanie spec');
  ok(h.c[0] === 8, 'hdc beanie starts with 8 in the ring');
  ok(Math.abs(h.sum.brimC - C0) < 1.5, `brim ${h.sum.brimC} vs ${C0}`);
  ok(Math.abs(h.sum.depth - h.s.depth) < 1.5, `depth ${h.sum.depth} vs ${h.s.depth}`);
  const rib = h.c.filter((x, i) => h.P.st[i] === 'rib'); ok(rib.length > 0 && rib.every(x => x % 2 === 0), 'ribbing even');
  ok(h.est.m > 90 && h.est.m < 220, `beanie yarn ${h.est.m} m`);
  // crown increases are about 8/round for hdc
  const inc = []; for (let i = 1; i < 6; i++) inc.push(h.c[i] - h.c[i - 1]); ok(inc.every(d => d >= 4 && d <= 10), 'crown increases ' + inc);
  // pattern text round-trip
  const rounds = C.roundsFromCounts(h.c, h.P.st), txt = C.formatRounds(rounds), back = C.parsePattern(txt);
  ok(JSON.stringify(C.countsFromRounds(back.rounds)) === JSON.stringify(h.c), 'pattern round-trip counts');
  ok(back.rounds.map(r => r.st).join() === h.P.st.join(), 'pattern round-trip stitches');
  ok(back.warns.length === 0, 'no warnings: ' + back.warns.join('; '));
  console.log(txt.split('\n').slice(0, 6).join('\n') + '\n…\n' + txt.split('\n').slice(-2).join('\n'));
}
// 2. sc beanie: 6 per round crown
{ const h = hat('adult medium beanie in single crochet, worsted'); ok(h.c[0] === 6 && h.c[1] === 12, 'sc crown 6,12: ' + h.c.slice(0, 4)); ok(Math.abs(h.sum.brimC - 56 * 0.92) < 1.5, 'sc brim ' + h.sum.brimC); }
// 3. dc beanie: 12 per round
{ const h = hat('dc beanie, chunky, 58 cm head'); ok(h.c[0] === 12, 'dc starts 12: ' + h.c.slice(0, 4)); ok(h.s.yarn === 5, 'chunky = bulky'); }
// 4. other hats, sizes
for (const t of ['slouchy beanie for a 58 cm head in worsted, ribbed brim', 'newborn beanie in DK with a pompom', 'beret in sport weight for a 22 inch head', 'toddler bucket hat in DK', 'mens XL beanie, bulky, 6.5 mm hook, folded brim']) {
  const h = hat(t, 2000); const C0 = h.s.head * (1 - h.s.ease);
  console.log(t, '→', h.s.style, h.s.head + 'cm', '| brim', h.sum.brimC.toFixed(1), 'widest', h.sum.widest.toFixed(1), 'depth', h.sum.depth.toFixed(1), '|', h.est.m.toFixed(0), 'm');
  ok(Math.abs(h.sum.brimC - (h.s.style === 'bucket' ? h.sum.brimC : C0)) < 2, t + ' brim');
}
{ const s = spec('newborn beanie in DK with a pompom'); ok(s.head === 35 && s.yarn === 3 && s.pompom, 'newborn'); }
{ const s = spec('beret in sport weight for a 22 inch head'); ok(Math.abs(s.head - 55.9) < 0.2 && s.yarn === 2 && s.style === 'beret', 'beret 22in ' + s.head); }
{ const s = spec('mens XL beanie, bulky, 6.5 mm hook, folded brim'); ok(s.head === 61 && s.hook === 6.5 && s.brim === 'folded', 'mens xl'); }
// 5. scarf
{
  const f = flat('chunky scarf 180 cm long with fringe');
  console.log('scarf', f.d.cand, f.F, f.est.m.toFixed(0) + ' m');
  ok(f.s.item === 'scarf' && f.s.length === 180 && f.s.yarn === 5 && f.s.fringe, 'scarf spec');
  ok(Math.abs(f.F.L - 180) < 4 && Math.abs(f.F.W - 20) < 2, 'scarf size');
  const txt = C.formatFlat(f.d.cand, f.s, f.g), back = C.parseFlat(txt, f.s); ok(back.n === f.d.cand.n && back.rows === f.d.cand.rows, 'scarf text round-trip');
  ok(f.est.m > 150 && f.est.m < 500, 'scarf yarn ' + f.est.m);
}
{ const f = flat('skinny scarf 150 x 12 cm in fingering, hdc ribbed'); ok(f.s.length === 150 && f.s.width === 12 && f.d.cand.st === 'rib' && f.d.cand.n % 2 === 0, 'ribbed skinny scarf ' + JSON.stringify(f.d.cand)); }
// 6. blankets
{
  const f = flat('baby blanket in dc stripes');
  console.log('baby blanket', f.d.cand, f.F, f.est.m.toFixed(0) + ' m', (f.est.minutes / 60).toFixed(1) + ' h');
  ok(f.s.item === 'blanket' && f.s.width === 76 && f.s.length === 91 && f.s.stitch === 'dc' && f.s.stripes === 2, 'baby blanket spec');
  ok(Math.abs(f.F.W - 76) < 2 && Math.abs(f.F.L - 91) < 2.5, 'baby blanket size');
  ok(f.d.cand.rows % 2 === 0, 'stripes complete');
  ok(f.est.m > 650 && f.est.m < 1300, 'baby blanket yarn ' + f.est.m);
}
{ const f = flat('granny square throw blanket in worsted'); console.log('granny throw', f.d.cand, f.F); ok(f.s.width === 127 && Math.abs(f.F.W - 127) < 8 && Math.abs(f.F.L - 152) < 8, 'granny throw'); const b = C.parseFlat(C.formatFlat(f.d.cand, f.s, f.g), f.s); ok(b.R === f.d.cand.R && b.cols === f.d.cand.cols, 'granny round-trip'); }
{ const s = spec('twin size blanket in super bulky, dc'); ok(s.width === 168 && s.length === 229 && s.yarn === 6, 'twin'); }
{ const s = spec('blanket 50 x 60 in'); ok(Math.abs(s.width - 127) < 0.1 && Math.abs(s.length - 152.4) < 0.1, '50x60 in ' + s.width + 'x' + s.length); }
{ const s = spec('infinity cowl in super bulky yarn, hdc'); ok(s.item === 'cowl' && s.style === 'infinity' && s.circ === 140 && s.stitch === 'hdc', 'cowl'); }
{ const s = spec('amigurumi egg, 8 cm tall, in DK'); ok(s.item === 'ami' && s.style === 'egg' && s.height === 8, 'ami'); const g = C.gaugeOf(s), P = C.roundPlan(s, g), ga = C.runGA(P, 0.7, 1500); ok(ga.best[0] === 6, 'ami MR 6'); }
{ const s = spec('beanie, gauge 12 sc and 14 rows = 4 in'); const g = C.gaugeOf(s); ok(Math.abs(g.per10('sc').sts - 11.8) < 0.2 && s.gauge.st === 'sc', 'gauge in inches ' + JSON.stringify(s.gauge)); }
{ const s = spec('beanie with an H/8 hook'); ok(s.hook === 5, 'H/8'); }
// 7. prompt round-trip for varied prompts
const prompts = C.EXAMPLES || [];
const KEYS = ['colors', 'seq', 'layout', 'item', 'style', 'head', 'depth', 'ease', 'length', 'width', 'circ', 'height', 'yarn', 'hook', 'stitch', 'brim', 'rib', 'pompom', 'fringe', 'border', 'stripes', 'gauge'];
for (const t of prompts.concat(['beanie, gauge 13 hdc and 10 rows = 10 cm', 'lovey blanket in sc with a border', 'kids scarf with stripes every 4 rows, sc, 120 cm', 'blanket in 3 colours, colour sequence A4 B2 C2', 'granny square baby blanket, checkerboard, in 2 colours', 'beanie in 3 colours, stripes every 2 rows'])) {
  const a = spec(t), b = spec(C.specToPrompt(a));
  const diff = KEYS.filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  ok(!diff.length, `round-trip "${t}" → "${C.specToPrompt(a)}" differs in ${diff.map(k => k + ':' + JSON.stringify(a[k]) + '≠' + JSON.stringify(b[k]))}`);
}
ok(prompts.length >= 10, 'at least 10 example prompts');

// 8. walkthrough step sequencing
{
  const h = hat('beanie for a 56 cm head in worsted', 1500), rounds = C.roundsFromCounts(h.c, h.P.st), D = { kind: 'rounds', spec: h.s, g: h.g, rounds };
  const W = C.walkSteps(D), sts = h.c.reduce((a, b) => a + b, 0), chs = h.P.st.reduce((a, x) => a + C.ST[x === 'rib' ? 'dc' : x].tc, 0), R = h.c.length;
  ok(W.filter(s => s.node > 0).length === sts && W.filter(s => s.op === 'ch').length === chs && W.filter(s => s.op === 'slst').length === R, 'hat steps = stitches + chains + joins');
  ok(W.length === sts + chs + R, `hat step count ${W.length} vs ${sts}+${chs}+${R}`);
  const nodes = W.filter(s => s.node > 0).map(s => s.node); ok(nodes.every((v, i) => v === i + 1), 'stitch steps in build order');
  ok(W.every((s, i) => !i || s.r >= W[i - 1].r), 'rounds in order');
  for (let r = 0; r < R; r++) { const rs = W.filter(s => s.r === r); ok(rs[0].op === 'ch' && rs[rs.length - 1].op === 'slst' && rs.filter(s => s.node > 0).length === h.c[r], 'round ' + (r + 1) + ' shape'); }
  const rib = W.filter(s => s.op === 'fpdc' || s.op === 'bpdc'); ok(rib.length > 0 && rib[0].op === 'fpdc' && rib[1].op === 'bpdc', 'ribbing alternates FP/BP');
  const lines = C.formatRounds(rounds).split('\n'); ok(W.every(s => C.lineForStep(lines, s) >= 0), 'every hat step maps to a pattern line');
  console.log('hat walkthrough', W.length, 'steps;', W[2].label, '|', W.find(s => s.op === 'inc').label);
  const a = C.walkSteps({ kind: 'rounds', spec: spec('amigurumi ball 6 cm tall'), rounds: C.roundsFromCounts([6, 12, 18, 18, 12, 6], Array(6).fill('sc')) });
  ok(a.length === 72 && a.every(s => s.node > 0), 'amigurumi spiral: no chains or joins');
}
{
  const f = flat('chunky scarf 180 cm long'), c = f.d.cand, W = C.walkSteps({ kind: 'flat', spec: f.s, g: f.g, cand: c }), tc = C.ST[c.st].tc;
  ok(W.length === c.n * c.rows + (c.n + tc) + tc * (c.rows - 1), `scarf steps ${W.length}`);
  const r2 = W.filter(s => s.row === 2 && s.made), r3 = W.filter(s => s.row === 3 && s.made);
  ok(r2[0].x > r2[r2.length - 1].x && r3[0].x < r3[r3.length - 1].x, 'turned rows alternate direction');
  ok(W.every((s, i) => !i || s.row >= W[i - 1].row), 'rows in order');
  const lines = C.formatFlat(c, f.s, f.g).split('\n'); ok(W.every(s => C.lineForStep(lines, s) >= 0), 'every scarf step maps to a line');
}
{
  const f = flat('skinny scarf 150 x 12 cm, ribbed'), W = C.walkSteps({ kind: 'flat', spec: f.s, g: f.g, cand: f.d.cand }); ok(W.some(s => s.op === 'fpdc') && W.some(s => s.op === 'bpdc'), 'rib rows use FP/BP');
  const cw = flat('infinity cowl in bulky, hdc'), c = cw.d.cand, Wc = C.walkSteps({ kind: 'flat', spec: cw.s, g: cw.g, cand: c });
  ok(Wc.length === c.n * c.rows + c.n + 2 * c.rows + 1 + c.rows, 'tube steps = sts + ch + joins');
  const gr = flat('granny square throw blanket in worsted'), Wg = C.walkSteps({ kind: 'flat', spec: gr.s, g: gr.g, cand: gr.d.cand }), R = gr.d.cand.R;
  ok(Wg.filter(s => s.op === 'dc').length + Wg.filter(s => s.op === 'ch' && /counts as/.test(s.label)).length / 3 === 6 * R * (R + 1), 'granny square dc count 6R(R+1)');
}
for (const op of [['sc'], ['hdc'], ['dc'], ['fpdc'], ['bpdc'], ['ch'], ['slst'], ['dec', 'sc'], ['dec', 'hdc'], ['dec', 'dc'], ['inc', 'hdc']]) {
  const P = C.phasesFor({ op: op[0], st: op[1] || op[0] }); ok(P.length >= 2 && P[P.length - 1].loops === 1 && P.every(p => p.loops >= 1), 'phases ' + op + ' end with 1 loop: ' + P.map(p => p.loops));
}

// 9. fit check
{
  const a = C.fitCheck(51.5, 20.5, 56, 'beanie'), b = C.fitCheck(51.5, 20.5, 48, 'beanie'), c = C.fitCheck(51.5, 20.5, 66, 'beanie'), d = C.fitCheck(51.5, 14, 56, 'beanie');
  ok(a.tone === 'good' && b.tone === 'bad' && /loose/.test(b.verdict) && c.tone === 'bad' && /tight/.test(c.verdict), 'beanie fit verdicts ' + [a.verdict, b.verdict, c.verdict]);
  ok(/covers/.test(a.depthNote) && /shallow/.test(d.depthNote), 'depth notes');
  ok(C.fitCheck(55, 17, 56, 'bucket').tone === 'good' && C.fitCheck(50, 17, 56, 'bucket').tone === 'bad', 'bucket hats do not stretch');
  const T = C.fitTable(51.5, 20.5, 'beanie'); ok(T.length === 10 && T.filter(r => r.tone === 'good').length >= 2, 'fit table spans sizes');
  ok(Math.abs(C.scarfDrape(180).draped - 75) < 0.01, 'scarf drape');
}

// 10. colourwork
{
  const a = spec('baby blanket, colour sequence A4 B2 C2'); ok(a.seq === 'A4 B2 C2' && a.colors === 3, 'seq parsed ' + a.seq);
  const q = C.colourSeq(a); ok([0, 3, 4, 5, 6, 7, 8].map(i => C.colourAt(q, i)).join('') === 'AABBCCA', 'colourAt cycles');
  const b = spec('beanie in 3 colours, stripes every 2 rows'); ok(C.colourSeq(b).map(x => x.join('')).join(' ') === 'A2 B2 C2', 'stripes + colours → sequence');
  ok(spec('granny square throw').colors === 3 && spec('granny square throw').layout === 'scrappy', 'granny defaults scrappy 3 colours');
  for (const t of ['baby blanket, colour sequence A4 B2 C2', 'granny square throw blanket in worsted, in 4 colours', 'beanie in 2 colours, stripes every 3 rows']) {
    const s = spec(t), g = C.gaugeOf(s); let D;
    if (s.item === 'hat') { const P = C.roundPlan(s, g), c = [...C.runGA(P, 0.7, 600).best]; D = { kind: 'rounds', spec: s, g, counts: c, st: P.st }; }
    else D = { kind: 'flat', spec: s, g, cand: C.designFlat(s, g).cand };
    const Y = C.colourYardage(D), E = C.estimate(D), tot = Object.values(Y).reduce((x, y) => x + y.m, 0);
    ok(Math.abs(tot - E.m) < 0.5 && Object.keys(Y).length === s.colors, `yardage per colour sums (${t}): ` + Object.entries(Y).map(([k, v]) => k + ' ' + Math.round(v.m)).join(', '));
  }
}

// 11. pattern sheet
{
  const h = hat('beanie for a 56 cm head in worsted', 800), txt = C.formatRounds(C.roundsFromCounts(h.c, h.P.st)), ab = C.abbreviationsFor(txt).map(a => a[0]);
  ok(['hdc', 'inc', 'FPdc', 'BPdc', 'MR', '[n]'].every(k => ab.includes(k)) && !ab.includes('dc2tog') && !ab.includes('sc2tog'), 'hat abbreviations: ' + ab);
  const f = flat('chunky scarf 180 cm'), ft = C.formatFlat(f.d.cand, f.s, f.g), fa = C.abbreviationsFor(ft).map(a => a[0]);
  ok(fa.includes('ch') && fa.includes('dc') && !fa.includes('inc') && !fa.includes('MR'), 'scarf abbreviations: ' + fa);
  const L = C.splitLine('R10–R15 (hdc): hdc around [68]'); ok(L.label === 'R10–R15 (hdc)' && L.body === 'hdc around' && L.count === '68', 'split round line');
  const L2 = C.splitLine('Rows 3–94 (dc): repeat Row 2 [19]'); ok(L2.label === 'Rows 3–94 (dc)' && L2.count === '19', 'split row line');
  ok(/14 sts|13\.\d sts|14\.\d sts/.test(C.swatchFor(h.s, h.g, 'sc')) || /sts and/.test(C.swatchFor(h.s, h.g, 'sc')), 'swatch text');
  ok(C.skillLevel({ kind: 'rounds', st: h.P.st, spec: h.s }) === 'Intermediate', 'ribbed hat is intermediate');
}

// 12. photo → silhouette → pattern
{
  const w = 100, h = 140, px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, ex = (x - 50) / 30, ey = (y - 70) / 40, inside = ex * ex + ey * ey < 1, noise = (x * 7 + y * 13) % 9;
    px[i] = inside ? 200 : 235 + noise; px[i + 1] = inside ? 80 : 232 + noise; px[i + 2] = inside ? 60 : 228 + noise; px[i + 3] = 255; }
  px[(5 * w + 5) * 4] = 0; // a speck of dust: not part of the largest blob
  const m = C.maskFromImage(px, w, h), P = C.profileFromMask(m, w, h);
  ok(P && P.closed && Math.abs(P.heightPx - 79) <= 3 && Math.abs(P.widthPx - 59) <= 4, `egg silhouette ${P && P.heightPx}×${P && P.widthPx}`);
  C.SHAPES.photo = C.shapeFromProfile(P);
  const s = C.normalizeSpec({ item: 'ami', style: 'photo', height: 10, set: { item: true, style: true, height: true } }), g = C.gaugeOf(s), PL = C.roundPlan(s, g), ga = C.runGA(PL, 0.7, 1500), c = [...ga.best];
  const widest = Math.max(...c) * g.w / Math.PI;
  ok(s.style === 'photo' && c[0] === 6 && c[c.length - 1] <= 12 && Math.abs(widest - 10 * 59 / 79) < 1.6, `photo egg fits: widest ${widest.toFixed(1)} cm for 10 cm tall, counts ${c.join(' ')}`);
  const can = C.maskFromPolygon([[20, 10], [80, 10], [80, 130], [20, 130]], w, h), Pc = C.profileFromMask(can, w, h);
  ok(Pc && !Pc.closed && Math.abs(Pc.widthPx - 60) <= 2 && Math.abs(Pc.heightPx - 120) <= 2, 'traced rectangle → open can');
}

// 13. amigurumi come out at the height asked for
for (const t of ['amigurumi egg 8 cm tall in dk', 'amigurumi ball 10 cm tall in dk', 'amigurumi cone 10 cm tall']) {
  const s = spec(t), g = C.gaugeOf(s), P = C.roundPlan(s, g), c = [...C.runGA(P, 0.7, 2500).best], m = C.roundsSummary(c, P.st, g, s);
  ok(Math.abs(m.height - s.height) / s.height < 0.12, `${t}: ${m.height.toFixed(1)} cm tall`);
}

// 14. calibration: swatch gauge and correction fitting
{
  const G = C.swatchGauge({ n: 20, wcm: 13, m: 20, hcm: 15.6 }); ok(Math.abs(G.aspect - 1.2) < 1e-9 && Math.abs(G.sts - 15.385) < 0.01 && Math.abs(G.h - 0.78) < 1e-9, 'raw swatch → gauge, aspect 1.2 recovered');
  const G2 = C.swatchGauge({ sts: 14, rows: 16 }); ok(Math.abs(G2.w - 10 / 14) < 1e-9 && Math.abs(G2.aspect - 14 / 16) < 1e-9, 'per-10 cm swatch');
  ok(C.swatchGauge({ n: 20, wcm: 0 }) === null, 'incomplete swatch ignored');
  // a profile drives the gauge: its dc swatch is used as measured, other stitches derived through the stitch factors
  const prof = { name: 'test', yarn: 4, hook: 5, swatches: { dc: { sts: 12, rows: 6 } } };
  const s = spec('beanie in dc, worsted'); s.cal = prof; const g = C.gaugeOf(s);
  ok(g.src === 'profile' && Math.abs(g.per10('dc').sts - 12) < 1e-9 && Math.abs(g.per10('dc').rows - 6) < 1e-9, 'profile dc swatch used as measured');
  ok(Math.abs(g.dims('sc').w - 10 / 12 / 1.1) < 1e-9, 'sc derived from the dc swatch');
  const s2 = spec('beanie in dc, bulky'); s2.cal = prof; ok(C.gaugeOf(s2).src === 'yarn', 'profile for another yarn weight is not applied');
  const s3 = spec('beanie, worsted, 6 mm hook'); s3.cal = prof; ok(Math.abs(C.gaugeOf(s3).per10('dc').sts - 12 / Math.pow(6 / 5, 0.8)) < 1e-6, 'profile scaled to a different hook');
  // a finished-piece correction: the true fabric runs 6% wider in the round and 5% shorter than predicted
  const truth = { roundW: 1.06, flatW: 0.98, h: 0.95 };
  const checks = [{ round: true, width: { pred: 51.0, meas: 51.0 * 1.06 }, length: { pred: 20.5, meas: 20.5 * 0.95 } }, { round: true, width: { pred: 31.5, meas: 31.5 * 1.06 + 0.2 }, length: { pred: 12.2, meas: 12.2 * 0.95 } }, { round: false, width: { pred: 76, meas: 76 * 0.98 }, length: { pred: 89, meas: 89 * 0.95 - 0.3 } }];
  const F = C.fitCorrection(checks);
  ok(Math.abs(F.roundW - truth.roundW) < 0.01 && Math.abs(F.flatW - truth.flatW) < 0.005 && Math.abs(F.h - truth.h) < 0.01, `correction recovered: ${F.roundW.toFixed(3)} ${F.flatW.toFixed(3)} ${F.h.toFixed(3)}`);
  ok(F.after < F.before / 5 && F.before > 3, `correction cuts the error: ${F.before.toFixed(1)}% → ${F.after.toFixed(1)}%`);
  // applying it moves the same hat's prediction onto the measurement
  const sh = spec('beanie for a 56 cm head in worsted'), P0 = C.roundPlan(sh, C.gaugeOf(sh)), c = [...C.runGA(P0, 0.7, 800).best], m0 = C.roundsSummary(c, P0.st, C.gaugeOf(sh), sh);
  const meas = m0.brimC * 1.06; sh.cal = { name: 'x', yarn: 4, corr: C.fitCorrection([{ round: true, width: { pred: m0.brimC, meas } }]) };
  const m1 = C.roundsSummary(c, P0.st, C.gaugeOf(sh), sh); ok(Math.abs(m1.brimC - meas) < 0.05 && Math.abs(m0.brimC - meas) > 2.5, `same pattern re-predicted: ${m0.brimC.toFixed(1)} → ${m1.brimC.toFixed(1)} cm vs measured ${meas.toFixed(1)}`);
  // and the optimizer, given the correction, re-sizes the pattern back onto the target circumference
  const P1 = C.roundPlan(sh, C.gaugeOf(sh)), c1 = [...C.runGA(P1, 0.7, 1500).best], m2 = C.roundsSummary(c1, P1.st, C.gaugeOf(sh), sh);
  ok(Math.abs(m2.brimC - 56 * 0.92) < 1.5 && c1[c1.length - 1] < c[c.length - 1], `corrected design: last round ${c[c.length - 1]} → ${c1[c1.length - 1]} sts, brim ${m2.brimC.toFixed(1)} cm`);
}

// 15. pattern reader (H-27): one test per notation, the printed count as a gate, nothing dropped silently
{
  const cnt = r => r.ops.reduce((x, o) => x + C.produces(o), 0), PP = t => C.parsePattern(t), cs = t => C.countsFromRounds(PP(t).rounds);
  // bug: "stitch"/"stitches" used to leave "itch"/"itches" behind
  { const r = C.parseBody('hdc in each stitch around', 12); ok(cnt(r) === 12 && !r.warn.length, 'each stitch: no "itch" token: ' + r.warn); }
  { const r = C.parseBody('sc in next 3 stitches, inc', 4); ok(r.ops.join('') === 'SSSI' && !r.warn.length, 'next 3 stitches: ' + r.ops.join('') + ' ' + r.warn); }
  // bug: round 1 took the first number in the line, clamped 3..20
  ok(PP('Round 1: With Main Color - Ch 1, make 9 hdc in ring, join in first hdc (9)').rounds[0].mr === 9, 'ring 9 after "Ch 1"');
  ok(PP('R1: MR: ch 3, 12 dc, sl st to the top of first dc to join. [12]').rounds[0].mr === 12, 'ring 12 after "ch 3"');
  { const p = PP('Round 1: ch5, Inc in 2nd ch from hook, sc 2, 5sc in the last ch.\nContinue on the other side of the chain base, sc 2, 3sc in the last ch. {14}');
    ok(p.rounds[0].mr === 14 && p.rounds[0].from === 'chain' && !p.warns.length, 'oval start from a chain, wrapped onto 2 lines: ' + p.rounds[0].mr + ' ' + p.warns); }
  ok(PP('Rnd 1: 24 dc in magic ring [24]').rounds[0].mr === 24, 'ring above 20');
  { const p = PP('Rnd 1: ch 3 (counts as dc), 11 dc in ring [12]'); ok(p.rounds[0].mr === 12 && p.rounds[0].chCounts, 'ring: ch 3 counts as a dc'); }
  // bug: parseFlat took a later "ch 1"; bug: dc turning chain hard-coded at 3
  { const f = C.parseFlat('Chain 33.\nRow 1: Dc in 4th ch from hook (skipped 3 chains count as dc) and in each ch across, turn — 31 dc.\nRow 4: dc in next st, skip 1 st, *(dc, ch 1, dc) in next st', { item: 'scarf', stitch: 'dc' }); ok(f.n === 31, 'foundation chain, not a later ch 1: ' + f.n); }
  { const f = C.parseFlat('Row 1: ch 28 st, dc in the 3rd ch from hook and in each ch st across\nRow 2 – 138: ch 2 (does not count as st), t, dc in each st across', { item: 'scarf', stitch: 'dc' }); ok(f.n === 26 && f.rows === 138, '3rd ch from hook = 2 skipped chains: ' + f.n); }
  { const f = C.parseFlat('Ch 24\nRow 1: Dc in the 3rd chain from the hook and across, ch 3 and turn. [21]\nRepeat row 2 for 81 rows', { item: 'scarf', stitch: 'dc' }); ok(f.n === 21 && f.rows === 81 && f.warn && f.warn.length === 1, 'printed Row 1 count wins, with a warning; "for 81 rows": ' + JSON.stringify(f)); }
  // implicit repeats
  { const r = C.parseBody('*sc, 2sc in next st; repeat from * around', 12); ok(cnt(r) === 18 && !r.warn.length, '*…; repeat from * around: ' + cnt(r)); }
  { const r = C.parseBody('*2hdc in first stitch, hdc in next* repeat around, join', 18); ok(cnt(r) === 27 && !r.warn.length, '*…* repeat around: ' + cnt(r) + r.warn); }
  { const r = C.parseBody('*sc, inc**. Rep from * to ** 5 more times.', 12); ok(cnt(r) === 18 && !r.warn.length, 'rep from * to ** 5 more times = 6: ' + cnt(r)); }
  { const r = C.parseBody('Ch 3,*2 dc in the next st, 1 dc in the next st**. Rep from * to ** 8 times. 1 dc in each rem st around.', 24); ok(cnt(r) === 32 && !r.warn.length, 'rep from * to ** 8 times, then the rest: ' + cnt(r) + r.warn); }
  { const r = C.parseBody('*sc in each of next two sts, 2sc in next st; repeat from * around', 18); ok(cnt(r) === 24 && !r.warn.length, 'number words: ' + cnt(r)); }
  // ch inside a round
  { const r = C.parseBody('Ch 1, hdc around, join', 45); ok(cnt(r) === 45 && r.info.ch === 1 && r.info.join && !r.warn.length, 'start-of-round ch 1 and join'); }
  { const r = C.parseBody('Ch 3 (counts as the first dc), 1 FPdc in the next st. *1 dc in the next st, 1 FPdc in the next st**. Rep from * to ** around.', 32); ok(cnt(r) === 32 && r.info.chCounts && !r.warn.length, 'ch 3 counts as the first dc: ' + cnt(r) + r.warn); }
  // glued counts and bare "2 sc"
  { const r = C.parseBody('2hdc in each stitch around', 9); ok(cnt(r) === 18, '2hdc glued'); }
  { const r = C.parseBody('*1 sc, 2 sc; rep * around.', 12); ok(cnt(r) === 18, 'bare "2 sc" in a repeat that would change nothing = inc: ' + cnt(r)); }
  { const r = C.parseBody('[2 sc, inc] 6 times', 18); ok(cnt(r) === 24 && !r.warn.length, '"2 sc" before an inc stays two stitches'); }
  { const a = C.parseBody('2 sc, sc 4', 6), b = C.parseBody('2 sc, sc 4', 6, 7); ok(cnt(a) === 6 && cnt(b) === 7 && b.reading.bareInc, 'the printed count picks "2 sc" = inc'); }
  // sl st / join in a line
  { const r = C.parseBody('sc around, sl st to the first sc to join', 6); ok(cnt(r) === 6 && !r.warn.length && r.info.join, 'sl st to join is not a stitch'); }
  { const r = C.parseBody('sc 5. Leave the remaining stitches unworked. TURN.', 10); ok(cnt(r) === 5 && !r.warn.length && r.info.turn, 'leave unworked: no fill'); }
  // labels, continuation lines, back-references
  ok(cs('Row 1: 6 sc in magic ring\nRow 2: inc around [12]').join() === '6,12', 'Row n labels');
  { const p = PP('R1: MR: ch 3, 12 dc, sl st to the top of first dc to join. [12]\nR2: Ch 3, 2 dc in each st around; sl st to the first dc to join. [24]\nR3: Ch 3,*2 dc in the next st, 1 dc in the next st**. Rep from * to ** 8 times.\n1 dc in each rem st around. Sl st to the first dc to join. [32]\nR4: Ch 3, 1 dc in each st around. Sl st to the first dc to join. [32]\nR5: Rep R4.');
    ok(C.countsFromRounds(p.rounds).join() === '12,24,32,32,32' && !p.warns.length && p.lines.filter(l => l.status === 'merged').length === 1, 'continuation merged, Rep R4: ' + C.countsFromRounds(p.rounds) + ' ' + p.warns); }
  // the gate: a disagreeing count is a warning on the round, and the next line is read against the printed count
  { const p = PP('R1: 6 sc in mr\nR2: inc around [14]\nR3: sc around [14]'); ok(p.rounds[1].warn && /stated \[14\]/.test(p.rounds[1].warn.join()) && C.countsFromRounds(p.rounds)[2] === 14, 'count mismatch flagged, no cascade'); }
  // nothing dropped silently
  { const p = PP('R1: 6 sc in mr\nR2: inc around [12]\nwork the bobble cluster as shown in the chart, ch 3\nR3: work in pattern as set (12)\nFasten off.');
    ok(p.unread.length === 2 && p.lines.find(l => /Fasten/.test(l.text)).status === 'note' && p.warns.some(w => /needs a human/.test(w)), 'unknown lines are unread, not dropped: ' + p.warns);
    const W = C.walkSteps({ kind: 'rounds', spec: spec('beanie'), rounds: p.rounds }), U = W.filter(s => s.op === 'unread');
    ok(U.length === 2 && /needs a human/.test(U[0].label) && C.phasesFor(U[0])[0].loops === 1, 'walkthrough shows the unread lines as steps');
    ok(C.lineForStep(['R1: 6 sc in mr', 'work the bobble cluster as shown in the chart, ch 3'], U[0]) === 1, 'unread step maps to its line'); }
  // walkthrough follows the chains the pattern wrote
  { const p = PP('Round 1: Ch 1, make 9 hdc in ring, join in first hdc (9)\nRound 2: Ch 1, 2hdc in each stitch around (18)'), W = C.walkSteps({ kind: 'rounds', spec: spec('beanie in hdc'), rounds: p.rounds });
    ok(W.filter(s => s.op === 'ch').length === 2 && W.filter(s => s.node > 0).length === 27, 'pasted ch 1 rounds walk with ch 1, not the hdc default ch 2'); }
  ok(C.statedCountOf('Round 6 - 10: Ch 1, hdc around, join (45) - Fasten off after Round 10') === 45 && C.statedCountOf('[Inc, sc] 2 times. {32}') === 32 && C.statedCountOf('(sc, inc) 6 times') === null, 'printed counts anywhere in the line');
  // the spike fixtures, pasted whole: every printed round count recovered (rounds families)
  const FX = (process.env.PICOTLAB_FIXTURES || path.join(__dirname, 'fixtures/patterns'));
  if (fs.existsSync(FX)) for (const f of fs.readdirSync(FX).filter(f => /^(0[1-4]|09|10)-/.test(f))) {
    const lines = fs.readFileSync(path.join(FX, f), 'utf8').split('\n').slice(1).filter(l => l.trim() && !l.startsWith('#')).join('\n');
    const p = PP(lines), got = C.countsFromRounds(p.rounds), bad = [];
    p.rounds.forEach((rd, i) => { if (rd.warn && rd.warn.some(w => /stated/.test(w))) bad.push('R' + (i + 1)); });
    ok(!bad.length, `fixture ${f}: printed counts all match (${got.join(' ')}) ${bad}`);
  }
}

// 16. deterministic GA (H-35): one spec, one pattern
{
  const s = spec('beanie for a 56 cm head in worsted'), g = C.gaugeOf(s), P = C.roundPlan(s, g);
  const a = [...C.runGA(P, 0.7, 1500).best].join(), b = [...C.runGA(C.roundPlan(spec('beanie for a 56 cm head in worsted'), g), 0.7, 1500).best].join();
  ok(a === b, 'same spec, same pattern (default seed from the plan)');
  const ga = C.makeGA(P, 0.7); for (let i = 0; i < 1500 && ga.stall < 1500; i++) C.gaStep(ga);
  ok([...ga.best].join() === a && ga.seed === C.planSeed(P), 'makeGA + gaStep (the app path) = runGA');
  ok([...C.runGA(P, 0.7, 1500, 42).best].join() === [...C.runGA(P, 0.7, 1500, 42).best].join(), 'an explicit seed reproduces');
  const P2 = C.roundPlan(spec('beanie for a 58 cm head in worsted'), g); ok(C.planSeed(P2) !== C.planSeed(P), 'different spec, different seed');
  const code = core.replace(/\/\/[^\n]*/g, ''); ok(!/Math\.random\s*\(/.test(code), 'no Math.random in CORE');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
