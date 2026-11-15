#!/usr/bin/env node
// Headless Picotlab export: runs the page's own core + hat simulation in node and writes
// the same OBJ text and Blender script the page's "Copy OBJ" / "Copy Blender script" buttons produce.
// Hats use the round sim; scarves, cowls and blankets use the app's own cloth sim (buildCloth): the draped grid
// is written as an OBJ (metres, with UVs) plus a <out>.json sidecar with the props (rod / box / form), the stripes
// sequence and the palette, which render.py reads. Pass --on neck for a scarf round a neck instead of a rod.
//
//   node blender/export.js "beanie for a 56 cm head in worsted" out/beanie   [--html index.html] [--frames 900] [--yarn 3]
//   → out/beanie.obj and out/beanie.py
//
// It reads index.html read-only and slices code by markers, so it follows whatever the page currently does.
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const html = opt('--html') || path.join(__dirname, '../index.html'), frames = +(opt('--frames') || 900), yarn = +(opt('--yarn') || 3);
const scarfOn = opt('--on') || 'rod';
const [prompt = 'beanie for a 56 cm head in worsted', outBase = path.join(__dirname, 'samples/beanie')] = args;

const src = fs.readFileSync(html, 'utf8');
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); if (i < 0 || j < 0) throw new Error(`marker not found in ${html}: ${i < 0 ? a : b}`); return src.slice(i, j); };
const core = cut('// CORE-START', '// CORE-END');
const sim = cut('function collide(', 'function buildCloth(');
const cloth = cut('function buildCloth(', '// ----------');
const oneLine = re => src.match(re)[0];
const misc = [/const palHex = [^\n]*/, /function seqPeriod\([^\n]*/].map(oneLine).join('\n');
const pal = src.match(/pal: (\[[^\]]*\])/)[1];
const exp = cut('function meshData()', 'function copyText(');
const yarns = src.match(/const YARNS = \[[^\n]*\];/)[0];

const H = new Function('patternText', 'yarnIdx', `${core}\n${yarns}\nconst S = { yarn: yarnIdx, sim: null, pal: ${pal}, scarfOn: ${JSON.stringify(scarfOn)}, formNote: '' };\nconst $ = () => ({ value: patternText() });\n${sim}\n${misc}\n${cloth}\n${exp}\n
return { designFlat, formatFlat, buildCloth, colourSeq, flatDims, TAU, parsePrompt, normalizeSpec, gaugeOf, roundPlan, runGA, roundsFromCounts, formatRounds, countsFromRounds, buildRoundSim, stepSim, objText, blenderScript, S };`);

let pat = '';
const C = H(() => pat, yarn);
const spec = C.normalizeSpec(C.parsePrompt(prompt));
fs.mkdirSync(path.dirname(outBase), { recursive: true });

if (spec.item === 'hat') {
  const g = C.gaugeOf(spec), P = C.roundPlan(spec, g), ga = C.runGA(P, 0.7, 2500), counts = [...ga.best], rounds = C.roundsFromCounts(counts, P.st);
  pat = `${prompt}\n` + C.formatRounds(rounds);
  const s = C.buildRoundSim({ kind: 'rounds', spec, g, counts, st: P.st, rounds });
  // same settings buildScene() gives a hat: gravity and the head form's two collision ellipsoids
  s.grav = s.hat ? 0.003 : 0;
  if (s.hat) { const c = s.counts, L = c.length; s.pullFrom = s.N - c[L - 1] - (L > 1 ? c[L - 2] : 0); s.pull = 0.1; s.brimY = s.form.y0; s.cols = s.form.cols.filter(c => c.head); }
  C.S.sim = s;
  for (let f = 0; f < frames; f++) C.stepSim(s); // the page steps twice per animation frame up to maxFrames; we run to rest
  fs.writeFileSync(outBase + '.obj', C.objText());
  fs.writeFileSync(outBase + '.py', C.blenderScript());
  console.log(`${spec.style} ${spec.head} cm, ${counts.length} rounds, ${s.N} stitches → ${outBase}.obj, ${outBase}.py`);
} else {
  // scarf / cowl / blanket: the app's cloth grid, stepped to rest exactly as the page does (maxFrames)
  const g = C.gaugeOf(spec), des = C.designFlat(spec, g), cand = des.cand;
  pat = `${prompt}\n` + C.formatFlat(cand, spec, g);
  const s = C.buildCloth({ kind: 'flat', spec, g, cand });
  for (let f = 0; f < s.maxFrames; f++) C.stepSim(s);
  const m = x => Math.round(x * 1e4) / 1e6;                      // cm → m, 0.1 mm resolution
  const B = (x, y, z) => [m(x), m(-z), m(y)];                    // app (x, y up, z) cm → Blender (x, -z, y) m
  const v = [], P = s.pos;
  for (let i = 0; i < s.N; i++) v.push(B(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]));
  let o = `# Picotlab Crochet Lab export. Units: metres, true size.\n${pat.split('\n').map(l => '# ' + l).join('\n')}\no Picotlab\n`;
  o += v.map(p => `v ${p[0]} ${p[1]} ${p[2]}`).join('\n') + '\n';
  for (let i = 0; i < s.N; i++) o += `vt ${s.uv[i * 2]} ${s.uv[i * 2 + 1]}\n`;
  for (let t = 0; t < s.tris.length; t += 3) { const a = s.tris[t] + 1, b = s.tris[t + 1] + 1, c = s.tris[t + 2] + 1; o += `f ${a}/${a} ${b}/${b} ${c}/${c}\n`; }
  fs.writeFileSync(outBase + '.obj', o);
  // props in Blender metres: boxes/cylinders/ellipsoids from sim.visual (cylX = rod, cylY = posts or neck, box = bed, ell = head form)
  const props = s.visual.map(c => {
    if (c.t === 'cylX') return { t: 'cylX', c: B(0, c.y, c.z), r: m(c.r), x0: m(c.x0), x1: m(c.x1) };
    if (c.t === 'cylY') return { t: 'cylZ', c: B(c.x, 0, c.z), r: m(c.r), z0: m(c.y0), z1: m(c.y1) };
    if (c.t === 'box') return { t: 'box', min: B(c.min[0], c.min[1], c.max[2]), max: B(c.max[0], c.max[1], c.min[2]) };
    if (c.t === 'ell') return { t: 'ell', c: B(...c.c), r: [m(c.r[0]), m(c.r[2]), m(c.r[1])] };
  }).filter(Boolean);
  const seq = C.colourSeq(spec), per = seq.reduce((a, q) => a + q[1], 0);
  const xs = [], ys = [], zs = []; for (let i = 0; i < s.N; i++) { xs.push(P[i * 3]); ys.push(P[i * 3 + 1]); zs.push(P[i * 3 + 2]); }
  const ext = a => Math.max(...a) - Math.min(...a);
  const meta = { item: spec.item, style: spec.style, stitch: cand.st || 'granny', type: cand.type, n: cand.n, rows: cand.rows, cand,
    W_cm: s.W, L_cm: s.L, thick_m: m(s.thick), seq, period: per, palette: C.S.pal, stripes: seq.length > 1,
    sim_extent_cm: { x: ext(xs), y: ext(ys), z: ext(zs) }, props, note: C.S.formNote };
  fs.writeFileSync(outBase + '.json', JSON.stringify(meta, null, 1));
  console.log(`${spec.item} ${s.W.toFixed(1)} × ${s.L.toFixed(1)} cm flat, ${cand.type} ${cand.st || ''} ${cand.n || ''}×${cand.rows || ''}; draped extent x ${ext(xs).toFixed(1)} y ${ext(ys).toFixed(1)} z ${ext(zs).toFixed(1)} cm (${C.S.formNote}) → ${outBase}.obj, .json`);
}
