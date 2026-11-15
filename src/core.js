// CORE-START
// Pure logic: gauge, sizes, prompt parsing, pattern design (rounds GA + flat layout search), pattern text in/out, estimates.
// World units are centimetres. No DOM here; tested headlessly with node (test/core.test.js).
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = v => Math.round(v * 10) / 10;

const YARN = [
  { key: 'lace', name: 'Lace', n: 0, sts: 34, hook: 2.0, m100: 800, t: 0.6 },
  { key: 'fingering', name: 'Fingering', n: 1, sts: 25, hook: 2.75, m100: 400, t: 1.1 },
  { key: 'sport', name: 'Sport', n: 2, sts: 19, hook: 3.75, m100: 300, t: 1.5 },
  { key: 'dk', name: 'DK', n: 3, sts: 16, hook: 4.5, m100: 230, t: 1.9 },
  { key: 'worsted', name: 'Worsted', n: 4, sts: 14, hook: 5.0, m100: 170, t: 2.4 },
  { key: 'bulky', name: 'Bulky', n: 5, sts: 10.5, hook: 6.5, m100: 110, t: 3.4 },
  { key: 'super bulky', name: 'Super bulky', n: 6, sts: 7.5, hook: 9.0, m100: 60, t: 5 },
  { key: 'jumbo', name: 'Jumbo', n: 7, sts: 5, hook: 15, m100: 25, t: 9 },
];
const HOOK_US = { b: 2.25, c: 2.75, d: 3.25, e: 3.5, f: 3.75, g: 4, h: 5, i: 5.5, j: 6, k: 6.5, l: 8, m: 9, n: 10, p: 11.5, q: 15.75, s: 19 };
// heights and widths relative to sc; rho = yarn used per stitch area (calibrated), rate = stitches per minute
const ST = {
  sc: { ab: 'sc', name: 'single crochet', h: 1, w: 1, tc: 1, rho: 9.7, rate: 12, base: 6 },
  hdc: { ab: 'hdc', name: 'half double crochet', h: 1.6, w: 1.05, tc: 2, rho: 8.8, rate: 10, base: 8 },
  dc: { ab: 'dc', name: 'double crochet', h: 2.3, w: 1.1, tc: 3, rho: 8.0, rate: 9, base: 12 },
  rib: { ab: 'rib', name: 'FPdc/BPdc ribbing', h: 2.3, w: 1.0, tc: 2, rho: 9.2, rate: 7, base: 12 },
};
const HAT_SIZES = [['preemie', 'Preemie', 30, 11], ['newborn', 'Newborn', 35, 13], ['baby', 'Baby 3–6 m', 40, 15], ['baby12', 'Baby 6–12 m', 44, 16],
  ['toddler', 'Toddler', 48, 17], ['child', 'Child', 51, 18], ['adultS', 'Teen / adult S', 54, 19.5], ['adultM', 'Adult M', 56, 20.5], ['adultL', 'Adult L', 58, 21.5], ['adultXL', 'Adult XL', 61, 22.5]];
const SCARF_SIZES = [['child', 'Child', 120, 13], ['skinny', 'Skinny', 150, 12], ['adult', 'Adult', 170, 20], ['long', 'Long / super', 200, 28]];
const COWL_SIZES = [['child', 'Child', 50, 18], ['adult', 'Adult', 64, 25], ['infinity', 'Infinity (double loop)', 140, 25]];
const BLANKET_SIZES = [['lovey', 'Lovey', 30, 30], ['stroller', 'Stroller', 76, 76], ['baby', 'Baby', 76, 91], ['crib', 'Crib', 91, 132], ['lap', 'Lapghan', 91, 122],
  ['throw', 'Throw', 127, 152], ['twin', 'Twin', 168, 229], ['full', 'Full', 203, 229], ['queen', 'Queen', 229, 254], ['king', 'King', 274, 254]];
const HAT_STYLES = { beanie: 'Beanie', slouch: 'Slouch', beret: 'Beret', bucket: 'Bucket' };

// amigurumi silhouettes: right-half meridians (r, z), unit size
function fn(f, n = 120) { const a = []; for (let i = 0; i <= n; i++) a.push(f(i / n)); return a; }
function densify(poly, n = 40) { const o = []; for (let i = 0; i < poly.length - 1; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[i + 1]; for (let k = 0; k < n; k++) { const t = k / n; o.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]); } } o.push(poly[poly.length - 1]); return o; }
const SHAPES = {
  sphere: { label: 'Ball', closed: true, pts: fn(t => { const a = Math.PI * t; return [Math.sin(a), 1 - Math.cos(a)]; }) },
  egg: { label: 'Egg', closed: true, pts: fn(t => { const a = Math.PI * t; return [0.78 * Math.sin(a) * (1 + 0.17 * Math.cos(a)), 1.25 * (1 - Math.cos(a))]; }) },
  teardrop: { label: 'Drop', closed: true, pts: fn(t => { const a = Math.PI * t; return [0.95 * Math.sin(a) * Math.pow(Math.cos(a / 2), 1.3), 1.1 * (1 - Math.cos(a))]; }) },
  cone: { label: 'Cone', closed: true, flip: true, pts: densify([[0, 0], [0.85, 2.5], [0, 2.5]]) },
  cylinder: { label: 'Can', closed: true, pts: densify([[0, 0], [0.7, 0], [0.7, 2], [0, 2]]) },
};

// ---------- gauge ----------
function defaultHook(s) { const y = YARN[s.yarn]; return s.item === 'ami' ? Math.round(y.hook * 0.75 * 4) / 4 : y.hook; }
function gaugeOf(s) {
  const y = YARN[s.yarn], cal = s.cal && s.cal.yarn === s.yarn ? s.cal : null;
  const hook = s.hook || (cal && cal.hook) || defaultHook(s);
  let w, h, src = 'yarn', B = null;
  if (s.gauge && s.gauge.sts) {
    const k = ST[s.gauge.st || 'sc'];
    w = 10 / s.gauge.sts / k.w; h = s.gauge.rows ? 10 / s.gauge.rows / k.h : w / 1.14; src = 'typed';
  } else if (cal && (B = profileBase(cal, hook))) { w = B.w; h = B.h; src = 'profile'; }
  else { w = 10 / y.sts * Math.pow(hook / y.hook, 0.8); h = w / 1.14; }
  const C = !s.noCorr && cal && cal.corr ? cal.corr : null;
  const kw = C ? (IN_ROUND(s) ? C.roundW : C.flatW) || 1 : 1, kh = C ? C.h || 1 : 1;
  const dims = st => {
    const G = src === 'profile' && cal.swatches && swatchGauge(cal.swatches[st]);
    if (G) return { w: G.w * B.k * kw, h: G.h * B.k * kh };
    return { w: w * ST[st].w * kw, h: h * ST[st].h * kh };
  };
  return { yarn: y, hook, w: w * kw, h: h * kh, t: y.t / 10, src, kw, kh, profile: cal ? cal.name : '', dims, per10: st => { const d = dims(st); return { sts: 10 / d.w, rows: 10 / d.h }; } };
}

// ---------- calibration: your swatch and your finished pieces ----------
// A swatch: either sts/rows per 10 cm, or raw counts (n sts measured w cm across, m rows measured h cm tall).
function swatchGauge(sw) {
  if (!sw) return null;
  let sts = +sw.sts || 0, rows = +sw.rows || 0;
  if (+sw.n > 0 && +sw.wcm > 0) sts = +sw.n * 10 / +sw.wcm;
  if (+sw.m > 0 && +sw.hcm > 0) rows = +sw.m * 10 / +sw.hcm;
  if (!(sts > 0 && rows > 0)) return null;
  return { sts, rows, w: 10 / sts, h: 10 / rows, aspect: (10 / rows) / (10 / sts) };
}
const IN_ROUND = s => s.item === 'hat' || s.item === 'ami' || s.item === 'cowl';
// sc-equivalent stitch size from a profile's swatches (each converted through the stitch factors), scaled to the hook in use
function profileBase(p, hook) {
  let w = 0, h = 0, n = 0;
  for (const st of ['sc', 'hdc', 'dc']) { const G = swatchGauge(p.swatches && p.swatches[st]); if (G) { w += G.w / ST[st].w; h += G.h / ST[st].h; n++; } }
  if (!n) return null;
  const k = p.hook && hook ? Math.pow(hook / p.hook, 0.8) : 1;
  return { w: w / n * k, h: h / n * k, k };
}
function profileApplies(p, s) { return !!(p && p.yarn === s.yarn && (profileBase(p, p.hook) || p.corr)); }
// least-squares scale factor that maps predictions onto measurements
function lsScale(pairs) { let a = 0, b = 0; for (const [pred, meas] of pairs) { a += pred * meas; b += pred * pred; } return b ? a / b : 1; }
function rmsPct(pairs, k = 1) { if (!pairs.length) return 0; let e = 0; for (const [p, m] of pairs) e += ((p * k - m) / m) ** 2; return Math.sqrt(e / pairs.length) * 100; }
// checks: [{ round: bool, width: {pred, meas}, length: {pred, meas} }], predictions made WITHOUT any correction applied
function fitCorrection(checks) {
  const wR = [], wF = [], L = [];
  for (const c of checks || []) {
    if (c.width && c.width.pred > 0 && c.width.meas > 0) (c.round ? wR : wF).push([c.width.pred, c.width.meas]);
    if (c.length && c.length.pred > 0 && c.length.meas > 0) L.push([c.length.pred, c.length.meas]);
  }
  const roundW = wR.length ? lsScale(wR) : 1, flatW = wF.length ? lsScale(wF) : 1, h = L.length ? lsScale(L) : 1;
  const all = wR.map(p => [p, roundW]).concat(wF.map(p => [p, flatW]), L.map(p => [p, h]));
  const before = rmsPct(all.map(([p]) => p)), after = all.length ? Math.sqrt(all.reduce((s, [[p, m], k]) => s + ((p * k - m) / m) ** 2, 0) / all.length) * 100 : 0;
  return { roundW, flatW, h, n: all.length, before, after };
}

// ---------- prompt → spec ----------
const NOTIN = 'sc|hdc|dc|single|half|double|treble|worsted|aran|dk|sport|fingering|sock|lace|bulky|chunky|super|jumbo|medium|light|cotton|wool|acrylic|merino|alpaca|a|an|the|my|rounds?|rows?|stripes?|granny|one|two|three|\\d+';
const UN = `(cm|mm|inches|inch|in(?![a-z])(?!\\s+(?:${NOTIN})\\b)|"|feet|foot|ft|'|m(?![a-z]))`;
const NM = '(\\d+(?:\\.\\d+)?)';
const UNIT_CM = { cm: 1, mm: 0.1, m: 100, in: 2.54, inch: 2.54, inches: 2.54, '"': 2.54, ft: 30.48, feet: 30.48, foot: 30.48, "'": 30.48 };
const toCm = (v, u, dflt = 1) => v * (UNIT_CM[(u || '').trim()] || dflt);
const STOP = new Set('a an the for in with and of to my me make made please crochet crocheted weight yarn hook size using use some that is it its i want need would like on at by as very new gift x one two three cm long wide tall deep around head pattern using colour color colours colors brim round rounds row rows piece colours colors sequence who has for little big soft cozy cosy warm simple easy basic classic quick'.split(' '));

function parsePrompt(text) {
  const spec = { set: {}, unknown: [] }, set = (k, v) => { spec[k] = v; spec.set[k] = true; };
  const dims = { bare: [] };
  let s = ' ' + String(text || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”″]/g, '"').replace(/(\w)'s\b/g, '$1s')
    .replace(/[×✕]/g, ' x ').replace(/(\d),(\d)/g, '$1.$2').replace(/(\d)(x)(\d)/g, '$1 x $3') + ' ';
  const eat = (re, f) => { s = s.replace(re, (...m) => (f(...m) === false ? m[0] : ' ; ')); };
  const R = (src, fl = 'g') => new RegExp(src, fl);
  eat(R(`(?:gauge\\s*:?\\s*)?${NM}\\s*(sts?|stitches|sc|hdc|dc)\\s*(?:(?:and|x|by|,|&)\\s*${NM}\\s*rows?)?\\s*(?:=|per|in|to|over|for|:)?\\s*${NM}\\s*${UN}`), (m, a, w, b, len, u) => {
    const L = toCm(+len, u); if (!(L > 1)) return false;
    set('gauge', { sts: r1(+a * 10 / L), rows: b ? r1(+b * 10 / L) : 0, st: /hdc/.test(w) ? 'hdc' : /^dc/.test(w) ? 'dc' : 'sc' });
  });
  eat(/\bcolou?r\s+(?:sequence|order|pattern|changes?)\s*:?\s*((?:[a-d]\s*[x×]?\s*\d{1,2}\s*,?\s*)+)/g, (m, q) => { set('seq', seqText(parseSeq(q))); });
  eat(/\b(?:in\s+)?(two|three|four|2|3|4)[- ](?:colou?rs?|colou?red|tones?)\b|\b(two|three)[- ]tone\b/g, (m, a, b) => set('colors', { two: 2, three: 3, four: 4 }[a || b] || +(a || b)));
  eat(/\bscrappy\b/g, () => set('layout', 'scrappy'));
  eat(/\bchecker(?:board|ed)?\b/g, () => set('layout', 'checker'));
  eat(/\b(?:solid|one[- ]colou?r|single[- ]colou?r)\b/g, () => set('colors', 1));
  eat(R(`${NM}\\s*mm\\b(?:\\s*(?:crochet\\s*)?hook)?`), (m, v) => { if (+v < 1.5 || +v > 30) return false; set('hook', +v); });
  eat(/\b(?:size\s+|us\s+)?(m\/n|n\/p|p\/q|[b-lnpqs])(?:\s*[-\/]\s*\d{1,2}(?:\.\d)?)?\s*(?:crochet\s*)?hook\b/g, (m, L) => { const v = HOOK_US[L[0]]; if (!v) return false; set('hook', v); });
  eat(/\b([b-lnpq])\s*[-\/]\s*(\d{1,2}(?:\.\d+)?)\b/g, (m, L) => { set('hook', HOOK_US[L]); });
  eat(/\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:m|mo|mos|months?)\b/g, (m, a, b) => { spec.sizeWord = +b <= 3 ? 'newborn' : +b <= 6 ? 'baby' : +b <= 12 ? 'baby12' : 'toddler'; });
  eat(R(`${NM}\\s*%\\s*(?:negative\\s+)?ease`), (m, v) => set('ease', +v / 100));
  eat(/\b(?:no|zero)\s+ease\b/g, () => set('ease', 0));
  const YW = [[/\bsuper[- ]?(?:bulky|chunky)\b|\broving\b|#\s*6\b|\(6\)|\b6\s*weight\b/g, 6], [/\bjumbo\b|#\s*7\b|\(7\)/g, 7], [/\b(?:bulky|chunky)\b|#\s*5\b|\(5\)|\b5\s*weight\b/g, 5],
    [/\b(?:dk|double[- ]knit|light[- ]?weight|light worsted)\b|#\s*3\b|\(3\)|\b3\s*weight\b/g, 3], [/\b(?:worsted|aran|medium[- ]weight)\b|#\s*4\b|\(4\)|\b4\s*weight\b/g, 4],
    [/\bsport(?:[- ]?weight)?\b|#\s*2\b|\(2\)|\b2\s*weight\b/g, 2], [/\b(?:fingering|sock|super[- ]?fine|baby[- ]weight)\b|#\s*1\b|\(1\)|\b1\s*weight\b/g, 1], [/\b(?:lace|thread|cobweb)\b|#\s*0\b|\(0\)/g, 0]];
  for (const [re, n] of YW) eat(re, () => { if (!spec.set.yarn) set('yarn', n); });
  eat(/\b(lovey|lovie|security|stroller|car[- ]seat|crib|cot|lapghan|lap|throw|twin|full|double(?!\s*crochet)|queen|king)(?:[- ]size[d]?)?\b/g, (m, w) => {
    spec.blanketWord = { lovie: 'lovey', security: 'lovey', 'car seat': 'stroller', 'car-seat': 'stroller', cot: 'crib', lapghan: 'lap', double: 'full' }[w] || w;
  });
  eat(/\b(?:infinity|m[oö]bius)\b(?:\s+(?:scarf|cowl|loop))?/g, () => { set('item', 'cowl'); set('style', 'infinity'); });
  eat(/\b(?:cowls?|neck\s*warmers?|snoods?|loop\s+scarf)\b/g, () => { set('item', 'cowl'); });
  eat(/\bgranny(?:\s+squares?)?\b/g, () => set('style', 'granny'));
  eat(/\bslouch(?:y|ie)?\b(?:\s+(?:beanie|hat|toque))?/g, () => { set('item', 'hat'); set('style', 'slouch'); });
  eat(/\b(?:beret|tam)s?\b/g, () => { set('item', 'hat'); set('style', 'beret'); });
  eat(/\b(?:bucket|sun)\s*hats?\b|\bbucket\b/g, () => { set('item', 'hat'); set('style', 'bucket'); });
  eat(/\b(?:beanies?|toques?|tuques?|watch\s+caps?|skull\s*caps?|stocking\s+caps?|hats?|caps?|bonnets?)\b/g, () => { if (!spec.set.item) set('item', 'hat'); if (!spec.set.style) set('style', 'beanie'); });
  eat(/\b(?:scarf|scarves|wrap)\b/g, () => { if (!spec.set.item) set('item', 'scarf'); });
  eat(/\b(?:blankets?|afghans?|blankie|bedspread|coverlet|quilt)\b/g, () => set('item', 'blanket'));
  eat(/\b(?:amigurumi|ami|plush(?:ie)?|toy|stuffie)\b/g, () => set('item', 'ami'));
  eat(/\b(ball|sphere|egg|teardrop|drop|cone|can|cylinder)\b/g, (m, w) => { set('item', 'ami'); set('style', { ball: 'sphere', drop: 'teardrop', can: 'cylinder' }[w] || w); });
  eat(/\bno\s+(?:brim|band|ribbing)\b/g, () => set('brim', 'none'));
  eat(/\bplain\s+(?:brim|band|edge)\b/g, () => set('brim', 'plain'));
  eat(/\b(?:fold(?:ed)?(?:[- ]?(?:over|up))?|turn[- ]?up|cuff(?:ed)?)\b(?:\s+(?:brim|band|edge))?/g, () => set('brim', 'folded'));
  eat(/\b(?:fp\s*dc|bp\s*dc|fpdc|bpdc|front\s+post|back\s+post|ribb(?:ed|ing)|rib)\b(?:\s+(?:brim|band|edge|cuff))?/g, () => set('rib', true));
  eat(/\bpom[- ]?poms?\b|\bbobble\b/g, () => set('pompom', true));
  eat(/\b(?:fringe[sd]?|tassels?)\b/g, () => set('fringe', true));
  eat(/\b(?:border|edging|edged)\b/g, () => set('border', true));
  eat(/\b(?:(\d+)[- ]rows?\s+)?strip(?:e[sd]?|y)\b(?:\s*(?:every|of)\s*(\d+)\s*(?:rows?|rounds?|rnds?))?/g, (m, a, b) => set('stripes', +(a || b) || true));
  eat(/\b(?:half[- ]double(?:\s+crochet)?|hdc)\b/g, () => { if (!spec.set.stitch) set('stitch', 'hdc'); });
  eat(/\b(?:double\s+crochet|dc)\b/g, () => { if (!spec.set.stitch) set('stitch', 'dc'); });
  eat(/\b(?:single(?:\s+crochet)?|sc)\b/g, () => { if (!spec.set.stitch) set('stitch', 'sc'); });
  eat(/\b(?:adult|womens|women|ladies|mens|men|unisex|size)\s+(xs|s|m|l|xl|xxl|small|medium|large|extra[- ]large)\b/g, (m, L) => { spec.sizeLetter = L; spec.sizeWord = spec.sizeWord || 'adult'; });
  eat(/\b(preemie|premature|newborn|baby|babies|infant|toddler|child|childs|childrens|kids?|teen|teens|youth|adult|womens|women|ladies|mens|men)\b/g, (m, w) => {
    const k = { premature: 'preemie', babies: 'baby', infant: 'baby', childs: 'child', childrens: 'child', kid: 'child', kids: 'child', teens: 'teen', youth: 'teen', womens: 'women', ladies: 'women', mens: 'men' }[w] || w;
    if (!spec.sizeWord || spec.sizeWord === 'adult') spec.sizeWord = k;
  });
  eat(/\b(extra[- ]large|xl|large|medium|small)\b/g, (m, L) => { spec.sizeLetter = spec.sizeLetter || L; });
  eat(R(`${NM}\\s*${UN}?\\s*(?:head|noggin)(?:\\s*(?:circumference|size))?`), (m, v, u) => set('head', r1(toCm(+v, u, +v < 30 ? 2.54 : 1))));
  eat(R(`head\\s*(?:circumference|size)?\\s*(?:of|is|=|:)?\\s*${NM}\\s*${UN}?`), (m, v, u) => set('head', r1(toCm(+v, u, +v < 30 ? 2.54 : 1))));
  eat(R(`${NM}\\s*${UN}?\\s*(?:x|by)\\s*${NM}\\s*${UN}?`), (m, a, u1, b, u2) => { dims.ab = [toCm(+a, u1 || u2), toCm(+b, u2 || u1)]; });
  eat(R(`${NM}\\s*${UN}?\\s*(?:long|in length|length)\\b`), (m, v, u) => { dims.long = toCm(+v, u); });
  eat(R(`${NM}\\s*${UN}?\\s*(?:wide|in width|width|across)\\b`), (m, v, u) => { dims.wide = toCm(+v, u); });
  eat(R(`${NM}\\s*${UN}?\\s*(?:tall|high|deep|depth|height|in height)\\b`), (m, v, u) => { dims.tall = toCm(+v, u); });
  eat(R(`${NM}\\s*${UN}?\\s*(?:around|circumference|circ)\\b`), (m, v, u) => { dims.around = toCm(+v, u); });
  eat(/\b(skinny|long|super)\b/g, (m, w) => { spec.scarfWord = w === 'super' ? 'long' : w; });
  eat(R(`${NM}\\s*${UN}`), (m, v, u) => { dims.bare.push(toCm(+v, u)); });
  eat(/\b(\d{2,3}(?:\.\d+)?)\b/g, (m, v) => { dims.bare.push(+v); });
  spec.dims = dims;
  spec.unknown = [...new Set(s.split(/[^a-z#]+/).filter(w => w.length > 1 && !STOP.has(w)))];
  return spec;
}

// fill defaults and resolve dimensions for the item
function nearest(list, v, idx) { let b = list[0]; for (const e of list) if (Math.abs(e[idx] - v) < Math.abs(b[idx] - v)) b = e; return b; }
function hatDepthFor(head) { // interpolate beanie depth from the size table
  const t = HAT_SIZES; if (head <= t[0][2]) return t[0][3]; if (head >= t[t.length - 1][2]) return t[t.length - 1][3] + (head - t[t.length - 1][2]) * 0.3;
  for (let i = 0; i < t.length - 1; i++) if (head <= t[i + 1][2]) { const u = (head - t[i][2]) / (t[i + 1][2] - t[i][2]); return t[i][3] + u * (t[i + 1][3] - t[i][3]); }
}
const HAT_STYLE_DEF = { beanie: { ease: 0.08, brim: 'ribbed', st: 'hdc', dk: 1 }, slouch: { ease: 0.08, brim: 'ribbed', st: 'hdc', dk: 1.3 }, beret: { ease: 0.06, brim: 'plain', st: 'dc', dk: 0.9 }, bucket: { ease: 0.02, brim: 'none', st: 'sc', dk: 0.85 } };
function normalizeSpec(r) {
  const s = JSON.parse(JSON.stringify(r)); s.set = s.set || {}; const d = s.dims || { bare: [] }; d.bare = d.bare || [];
  if (!s.item) s.item = s.style === 'granny' || s.blanketWord || s.border ? 'blanket' : s.fringe ? 'scarf' : SHAPES[s.style] ? 'ami' : 'hat';
  const pick = (list, key) => list.find(e => e[0] === key);
  if (s.item === 'hat') {
    if (!HAT_STYLES[s.style]) s.style = 'beanie';
    const D = HAT_STYLE_DEF[s.style];
    if (!s.set.head) {
      if (d.around) s.head = r1(d.around); else if (d.bare.some(v => v >= 28 && v <= 70)) s.head = r1(d.bare.find(v => v >= 28 && v <= 70));
      else {
        const L = { s: 'adultS', xs: 'adultS', small: 'adultS', m: 'adultM', medium: 'adultM', l: 'adultL', large: 'adultL', xl: 'adultXL', xxl: 'adultXL', 'extra large': 'adultXL', 'extra-large': 'adultXL' }[s.sizeLetter];
        const W = { women: 'adultM', men: 'adultL', adult: 'adultM', teen: 'adultS', toddler: 'toddler', child: 'child', baby: 'baby', baby12: 'baby12', newborn: 'newborn', preemie: 'preemie' }[s.sizeWord];
        const key = (s.sizeWord === 'adult' || s.sizeWord === 'women' || s.sizeWord === 'men' || !W) && L ? L : (W || 'adultM');
        s.head = (pick(HAT_SIZES, key) || pick(HAT_SIZES, 'adultM'))[2];
      }
    }
    if (!s.set.depth) s.depth = r1(d.tall || hatDepthFor(s.head) * D.dk);
    if (!s.set.ease) s.ease = D.ease;
    if (!s.set.brim) s.brim = s.rib ? 'ribbed' : D.brim;
    if (s.style === 'bucket') s.brim = 'none';
    s.rib = s.brim === 'ribbed';
    if (!s.set.stitch) s.stitch = D.st;
    s.size = nearest(HAT_SIZES, s.head, 2)[0];
  } else if (s.item === 'scarf' || s.item === 'blanket' || s.item === 'cowl') {
    const list = s.item === 'scarf' ? SCARF_SIZES : s.item === 'cowl' ? COWL_SIZES : BLANKET_SIZES;
    let key = s.item === 'scarf' ? ({ child: 'child', toddler: 'child', baby: 'child', skinny: 'skinny', long: 'long' }[s.scarfWord || s.sizeWord] || 'adult')
      : s.item === 'cowl' ? (s.style === 'infinity' ? 'infinity' : ['child', 'toddler', 'baby'].includes(s.sizeWord) ? 'child' : 'adult')
        : (s.blanketWord || (['baby', 'newborn', 'baby12'].includes(s.sizeWord) ? 'baby' : ['child', 'toddler'].includes(s.sizeWord) ? 'crib' : 'baby'));
    const P = pick(list, key) || list[0];
    let A = P[2], B = P[3]; // scarf: length, width · cowl: circ, height · blanket: width, length
    const big = s.item === 'blanket' ? 'L' : 'A';
    if (d.ab) { const lo = Math.min(...d.ab), hi = Math.max(...d.ab); if (s.item === 'blanket') { A = lo; B = hi; } else { A = hi; B = lo; } }
    if (s.item === 'scarf') { if (d.long) A = d.long; if (d.wide) B = d.wide; if (!d.ab && !d.long && d.bare.length) { const v = d.bare.slice().sort((x, y) => y - x); if (v[0] > 60) { A = v[0]; if (v[1]) B = v[1]; } else B = v[0]; } }
    if (s.item === 'cowl') { if (d.around) A = d.around; if (d.tall || d.wide) B = d.tall || d.wide; if (!d.ab && !d.around && d.bare.length) { for (const v of d.bare) if (v > 40) A = v; else B = v; } }
    if (s.item === 'blanket') { if (d.wide) A = d.wide; if (d.long) B = d.long; if (!d.ab && !d.wide && !d.long && d.bare.length) { A = B = d.bare[0]; } }
    void big;
    if (s.item === 'scarf') { if (!s.set.length) s.length = r1(A); if (!s.set.width) s.width = r1(B); }
    if (s.item === 'cowl') { if (!s.set.circ) s.circ = r1(A); if (!s.set.height) s.height = r1(B); if (s.style !== 'infinity') s.style = 'cowl'; }
    if (s.item === 'blanket') { if (!s.set.width) s.width = r1(A); if (!s.set.length) s.length = r1(B); if (s.style !== 'granny') s.style = 'rows'; }
    if (!s.set.stitch) s.stitch = s.item === 'cowl' ? 'hdc' : 'dc';
    if (s.style === 'granny') s.stitch = 'dc';
    const v = s.item === 'scarf' ? s.length : s.item === 'cowl' ? s.circ : s.width;
    s.size = nearest(list, v, 2)[0];
  } else {
    s.item = 'ami'; if (!SHAPES[s.style]) s.style = 'sphere';
    if (!s.set.height) s.height = r1(d.tall || d.bare[0] || 8);
    s.stitch = 'sc';
  }
  if (!s.set.yarn) s.yarn = s.item === 'ami' ? 3 : 4;
  if (s.stripes === true) s.stripes = s.stitch === 'sc' ? 4 : 2;
  s.stripes = +s.stripes || 0;
  if (s.set.seq) { const q = parseSeq(s.seq); s.seq = seqText(q); if (!s.set.colors) s.colors = new Set(q.map(x => x[0])).size; } else s.seq = '';
  if (!s.set.colors) s.colors = s.colors || (s.style === 'granny' ? 3 : s.stripes ? 2 : 1);
  s.colors = clamp(+s.colors || 1, 1, 4);
  if (!s.set.layout) s.layout = s.style === 'granny' ? 'scrappy' : 'same';
  for (const k of ['pompom', 'fringe', 'border', 'rib']) s[k] = !!s[k];
  if (s.item !== 'hat') s.pompom = false;
  if (s.item !== 'scarf') s.fringe = false;
  if (s.item === 'ami') { s.rib = false; s.stripes = 0; s.border = false; s.colors = 1; s.seq = ''; }
  if (s.style === 'granny') s.rib = false;
  s.hook = s.set.hook ? s.hook : null;
  s.gauge = s.set.gauge ? s.gauge : null;
  delete s.dims; delete s.sizeWord; delete s.sizeLetter; delete s.blanketWord; delete s.scarfWord;
  for (const k of ['head', 'depth', 'ease', 'length', 'width', 'circ', 'height']) if (s[k] != null && s.set[k] === undefined) s.set[k] = false;
  return s;
}

// spec → canonical prompt (parsePrompt(specToPrompt(s)) reproduces s)
function specToPrompt(s) {
  const p = [], f = x => String(r1(x));
  if (s.item === 'hat') {
    p.push(s.style === 'slouch' ? 'slouchy beanie' : s.style === 'bucket' ? 'bucket hat' : s.style);
    p.push(`for a ${f(s.head)} cm head`, `${f(s.depth)} cm deep`, `${f(s.ease * 100)}% negative ease`);
  } else if (s.item === 'scarf') p.push(`scarf ${f(s.length)} cm long`, `${f(s.width)} cm wide`);
  else if (s.item === 'cowl') p.push(`${s.style === 'infinity' ? 'infinity cowl' : 'cowl'} ${f(s.circ)} cm around`, `${f(s.height)} cm tall`);
  else if (s.item === 'blanket') p.push(`${s.style === 'granny' ? 'granny square blanket' : 'blanket'} ${f(s.width)} cm wide`, `${f(s.length)} cm long`);
  else p.push(`amigurumi ${s.style} ${f(s.height)} cm tall`);
  p.push(`${YARN[s.yarn].key} weight`);
  if (s.hook) p.push(`${s.hook} mm hook`);
  if (s.gauge) p.push(`gauge ${f(s.gauge.sts)} ${s.gauge.st}${s.gauge.rows ? ` and ${f(s.gauge.rows)} rows` : ''} = 10 cm`);
  if (s.style !== 'granny' && s.item !== 'ami') p.push(ST[s.stitch].name);
  if (s.item === 'hat' && s.style !== 'bucket') p.push(s.brim === 'none' ? 'no brim' : `${s.brim} brim`);
  if (s.item !== 'hat' && s.rib) p.push('ribbed');
  if (s.pompom) p.push('pompom');
  if (s.fringe) p.push('fringe');
  if (s.border) p.push('border');
  if (s.stripes) p.push(`stripes every ${s.stripes} rows`);
  if (s.seq) p.push(`colour sequence ${s.seq}`);
  else if (s.colors > 1 || (s.style === 'granny' && s.colors === 1)) p.push(s.colors > 1 ? `in ${s.colors} colours` : 'solid');
  if (s.style === 'granny' && s.layout !== 'scrappy') p.push(s.layout === 'checker' ? 'checkerboard' : '');
  else if (s.style === 'granny') p.push('scrappy');
  return p.filter(Boolean).join(', ');
}

// ---------- rounds: target from the spec ----------
function hatSegments(s, g) {
  const st = s.stitch, d = g.dims(st), C = s.head * (1 - s.ease), Rc = C / TAU, segs = [];
  const P = (pts, st, part, wt) => segs.push({ pts, st, part, wt });
  const brimSt = s.brim === 'ribbed' ? 'rib' : 'sc';
  const brimH = s.brim === 'ribbed' ? clamp(s.depth * 0.24, 2.4, 6) : s.brim === 'folded' ? clamp(s.depth * 0.4, 4, 10) : s.brim === 'plain' ? clamp(s.depth * 0.12, 2 * g.h, 3) : 0;
  if (s.style === 'beanie' || s.style === 'slouch') {
    const Rs = s.style === 'slouch' ? Rc * 1.2 : Rc, L = s.depth + (s.brim === 'folded' ? brimH / 2 : 0);
    const tr = s.style === 'slouch' ? Math.max(2 * d.h, (Rs - Rc) * 1.3) : 0, body = Math.max(d.h, L - Rs - brimH - tr);
    P([[0, 0], [Rs, 0]], st, 'crown', 1);
    P([[Rs, 0], [Rs, body]], st, 'body', 2);
    if (tr) P([[Rs, body], [Rc, body + tr]], st, 'shaping', 2);
    if (brimH) P([[Rc, body + tr], [Rc, body + tr + brimH]], brimSt, 'brim', 3);
  } else if (s.style === 'beret') {
    const Rb = Math.max(Rc * 1.25, s.head * 0.235), e = Math.max(d.h, 0.12 * Rb), band = brimH || 2.5;
    P([[0, 0], [Rb, 0]], st, 'crown', 1);
    P([[Rb, 0], [Rb, e]], st, 'body', 1);
    P([[Rb, e], [Rc, e + (Rb - Rc) * 0.25]], st, 'shaping', 1.5);
    P([[Rc, e + (Rb - Rc) * 0.25], [Rc, e + (Rb - Rc) * 0.25 + band]], brimSt, 'brim', 3);
  } else { // bucket
    const sides = Math.max(2 * d.h, s.depth - Rc), B = clamp(s.head * 0.11, 3, 8);
    P([[0, 0], [Rc, 0]], st, 'crown', 1);
    P([[Rc, 0], [Rc, sides]], st, 'body', 3);
    P([[Rc, sides], [Rc + B * 0.75, sides + B * 0.66]], st, 'brim', 2);
  }
  return segs;
}
function amiSegments(s) {
  const T = SHAPES[s.style]; let mz = 0; T.pts.forEach(p => (mz = Math.max(mz, p[1])));
  const k = s.height / mz; return [{ pts: T.pts.map(p => [p[0] * k, p[1] * k]), st: 'sc', part: 'body', wt: 1 }];
}
function roundPlan(s, g) {
  const segs = s.item === 'hat' ? hatSegments(s, g) : amiSegments(s), main = s.item === 'hat' ? s.stitch : 'sc', dm = g.dims(main);
  const Rt = [], hs = [], ws = [], st = [], wt = [], part = [];
  for (const sg of segs) {
    const d = g.dims(sg.st), p = sg.pts, cum = [0];
    for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    const L = cum[cum.length - 1], n = Math.max(1, Math.round(L / d.h));
    let j = 0;
    for (let k = 1; k <= n; k++) {
      const sl = L * k / n; while (j < cum.length - 2 && cum[j + 1] < sl) j++;
      const sg2 = cum[j + 1] - cum[j] || 1, u = clamp((sl - cum[j]) / sg2, 0, 1);
      Rt.push(Math.max(0, p[j][0] + (p[j + 1][0] - p[j][0]) * u)); hs.push(d.h); ws.push(sg.st === 'rib' ? dm.w : d.w); st.push(sg.st); wt.push(sg.wt); part.push(sg.part);
    }
  }
  const T = s.item === 'ami' ? SHAPES[s.style] : null;
  const Zt = new Float64Array(Rt.length); { let rp = 0, z = 0; for (let i = 0; i < Rt.length; i++) { const dr = Rt[i] - rp; z += Math.sqrt(Math.max(0, hs[i] * hs[i] - dr * dr)); Zt[i] = z; rp = Rt[i]; } }
  return { Zt: s.item === 'ami' ? Zt : null, Rt: Float64Array.from(Rt), hs, ws, st, wt, part, R: Rt.length, base: ST[main].base, wm: dm.w, main, closed: !!(T && T.closed), flip: !!(T && T.flip), segs };
}

// ---------- rounds: score, repair, genetic search ----------
function evaluate(c, P, lambda, parts) {
  const R = c.length, { Rt, hs, ws, wt, st, wm } = P;
  let err = 0, W = 0, exc = 0, cx = 0, hard = 0, rp = 0, z = 0;
  const Zt = P.Zt;
  for (let i = 0; i < R; i++) {
    const r = c[i] * ws[i] / TAU, d = (r - Rt[i]) / wm; err += wt[i] * d * d; W += wt[i];
    const dr = r - rp, e = (Math.abs(dr) - hs[i]) / wm; if (e > 0) exc += e * e; rp = r;
    if (Zt) { z += Math.sqrt(Math.max(0, hs[i] * hs[i] - dr * dr)); const dz = (z - Zt[i]) / wm; err += wt[i] * 0.35 * dz * dz; }
    if (i > 0) { const p = c[i - 1], n = c[i]; if (n !== p) { cx += 0.35; const k = Math.abs(n - p); if ((n > p ? p : n) % k !== 0) cx += 1; if (n % c[0] !== 0) cx += 0.25; } }
    if (st[i] === 'rib' && c[i] % 2) hard += 2;
  }
  if (c[0] !== P.base) cx += 1.5;
  const close = P.closed && c[R - 1] > 8 ? (c[R - 1] - 8) * 0.08 : 0;
  const score = err / W + 6 * exc / R + lambda * cx / R + close + hard;
  if (parts) return { score, rms: Math.sqrt(err / W), exc, cx, close, hard };
  return score;
}
function repair(a, P) {
  a[0] = P.base; // magic ring: 6 sc, 8 hdc or 12 dc, always
  for (let i = 1; i < a.length; i++) {
    a[i] = clamp(a[i], Math.max(3, Math.ceil(a[i - 1] / 2)), Math.min(900, a[i - 1] * 2));
    if (P.st[i] === 'rib') a[i] = a[i - 1];
  }
  return a;
}
// seeded randomness: the same plan always gives the same pattern (share links, tests). No Math.random in CORE.
function mulberry32(a) { return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hashStr(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
// default seed: from the plan the spec and gauge produced (targets, stitches, shape), so one spec = one seed
function planSeed(P) { return hashStr([P.R, P.base, P.main, P.closed, P.flip, P.st.join(''), Array.from(P.Rt, v => v.toFixed(3)).join(',')].join('|')); }
function mutate(a, rnd) {
  const R = a.length, i = (rnd() * R) | 0, op = (rnd() * 7) | 0;
  switch (op) {
    case 0: a[i] += (rnd() < 0.5 ? -1 : 1) * (1 + ((rnd() * 2) | 0)); break;
    case 1: a[i] += (rnd() < 0.5 ? -1 : 1) * a[0]; break;
    case 2: if (i > 0) a[i] = a[i - 1]; break;
    case 3: if (i < R - 1) a[i] = a[i + 1]; break;
    case 4: { const d = (rnd() < 0.5 ? -1 : 1) * (1 + ((rnd() * 3) | 0)); for (let j = i; j < R; j++) a[j] += d; break; }
    case 5: a[i] = Math.max(a[0], Math.round(a[i] / a[0]) * a[0]); break;
    case 6: if (i > 0 && i < R - 1) a[i] = Math.round((a[i - 1] + a[i + 1]) / 2); break;
  }
}
function directCounts(P) { const a = new Int16Array(P.R); for (let i = 0; i < P.R; i++) a[i] = Math.round(P.Rt[i] * TAU / P.ws[i]); a[0] = P.base; return repair(a, P); }
function makeGA(P, lambda, N = 96, seed) {
  if (seed == null) seed = planSeed(P);
  const rnd = mulberry32(seed >>> 0);
  const ga = { P, lambda, N, R: P.R, pop: [], sc: [], gen: 0, evals: 0, best: null, bestScore: Infinity, stall: 0, hist: [], seed: seed >>> 0, rnd };
  const d = directCounts(P);
  for (let p = 0; p < N; p++) {
    const a = new Int16Array(d);
    if (p > 0) { const m = p < N / 2 ? 1 + (p % 4) : 6 + (p % 10); for (let k = 0; k < m; k++) mutate(a, rnd); }
    repair(a, P); ga.pop.push(a); ga.sc.push(evaluate(a, P, lambda)); ga.evals++;
  }
  let bi = 0; for (let i = 1; i < N; i++) if (ga.sc[i] < ga.sc[bi]) bi = i;
  ga.best = new Int16Array(ga.pop[bi]); ga.bestScore = ga.sc[bi];
  return ga;
}
function gaStep(ga) {
  const { N, R, pop, sc, P } = ga, rnd = ga.rnd || (ga.rnd = mulberry32(ga.seed != null ? ga.seed : planSeed(P)));
  const idx = [...pop.keys()].sort((x, y) => sc[x] - sc[y]);
  const tour = () => { let b = (rnd() * N) | 0; for (let t = 0; t < 2; t++) { const c = (rnd() * N) | 0; if (sc[c] < sc[b]) b = c; } return pop[b]; };
  const np = [], ns = [];
  for (let e = 0; e < 6; e++) { np.push(pop[idx[e]]); ns.push(sc[idx[e]]); }
  while (np.length < N) {
    const ch = new Int16Array(tour());
    if (rnd() < 0.6 && R > 1) { const B = tour(), cut = 1 + ((rnd() * (R - 1)) | 0); for (let i = cut; i < R; i++) ch[i] = B[i]; }
    const m = 1 + ((rnd() * 3) | 0); for (let k = 0; k < m; k++) mutate(ch, rnd);
    repair(ch, P); np.push(ch); ns.push(evaluate(ch, P, ga.lambda)); ga.evals++;
  }
  ga.pop = np; ga.sc = ns; ga.gen++;
  let bi = 0; for (let i = 1; i < N; i++) if (ns[i] < ns[bi]) bi = i;
  if (ns[bi] < ga.bestScore - 1e-9) { ga.bestScore = ns[bi]; ga.best = new Int16Array(np[bi]); ga.stall = 0; return true; }
  ga.stall++; return false;
}
function runGA(P, lambda, gens, seed) { const ga = makeGA(P, lambda, 96, seed); for (let i = 0; i < gens && ga.stall < 1500; i++) gaStep(ga); return ga; }

// ---------- rounds: stitch ops and pattern text ----------
function evenOps(p, n, ri) {
  if (n === p) return Array(p).fill('S');
  const grow = n > p, k = Math.abs(n - p), L = grow ? p : n, X = grow ? 'I' : 'D';
  const ops = Array(L).fill('S'), seg = Math.floor(L / k), shift = ri % 2 ? Math.floor(seg / 2) : 0;
  for (let j = 0; j < k; j++) ops[(Math.floor(j * L / k) + seg - 1 + shift) % L] = X;
  return ops;
}
function roundsFromCounts(c, st) { const r = [{ mr: c[0], st: st[0] }]; for (let i = 1; i < c.length; i++) r.push({ ops: evenOps(c[i - 1], c[i], i), st: st[i] }); return r; }
const consumes = o => (o === 'D' ? 2 : 1), produces = o => (o === 'I' ? 2 : 1);
function countsFromRounds(rounds) { const c = [rounds[0].mr]; for (let i = 1; i < rounds.length; i++) c.push(rounds[i].ops.reduce((s, o) => s + produces(o), 0)); return c; }
function rle(ops, ab) {
  const parts = []; let k = 0;
  while (k < ops.length) { const c = ops[k]; let j = k; while (j < ops.length && ops[j] === c) j++; const n = j - k;
    if (c === 'S') parts.push(n === 1 ? ab : ab + ' ' + n); else { const w = c === 'I' ? 'inc' : 'dec'; parts.push(n === 1 ? w : w + ' x' + n); } k = j; }
  return parts.join(', ');
}
function describe(ops, ab) {
  const L = ops.length;
  if (ab === 'rib' && ops.every(o => o === 'S')) return L % 2 ? `(FPdc, BPdc) x${(L - 1) / 2}, FPdc` : `(FPdc, BPdc) x${L / 2}`;
  if (ab === 'rib') ab = 'FPdc';
  if (ops.every(o => o === 'S')) return ab + ' around';
  if (ops.every(o => o === ops[0])) return (ops[0] === 'I' ? 'inc' : 'dec') + ' x' + L;
  for (let q = 1; q < L; q++) {
    if (L % q) continue;
    let ok = true; for (let i = 0; i < L && ok; i++) if (ops[i] !== ops[(i + q) % L]) ok = false;
    if (!ok) continue;
    const m = L / q; let last = -1; for (let i = 0; i < q; i++) if (ops[i] !== 'S') last = i;
    const o = (last + 1) % q, unit = ops.slice(o, o + q), u = rle(unit, ab);
    const grp = n => n === 1 ? u : (unit.length === 1 ? `${u} x${n}` : `(${u}) x${n}`);
    if (o === 0) return grp(m);
    return [rle(ops.slice(0, o), ab), grp(m - 1), rle(ops.slice(o + (m - 1) * q), ab)].filter(Boolean).join(', ');
  }
  return rle(ops, ab);
}
function formatRounds(rounds) {
  const counts = countsFromRounds(rounds), ab0 = rounds[0].st === 'rib' ? 'dc' : rounds[0].st;
  const lines = [`R1 (${rounds[0].st}): ${rounds[0].mr} ${ab0} in magic ring [${rounds[0].mr}]`];
  let i = 1;
  while (i < rounds.length) {
    const d = describe(rounds[i].ops, rounds[i].st); let j = i;
    const plain = / around$|^\(FPdc, BPdc\)/.test(d);
    while (plain && j + 1 < rounds.length && rounds[j + 1].st === rounds[i].st && describe(rounds[j + 1].ops, rounds[j + 1].st) === d && counts[j + 1] === counts[i]) j++;
    lines.push(`${j > i ? `R${i + 1}–R${j + 1}` : `R${i + 1}`} (${rounds[i].st}): ${d} [${counts[i]}]`);
    i = j + 1;
  }
  return lines.join('\n');
}
// ---------- pattern reader: pasted text → rounds (see ventures/picotlab/proof/core-notes.md) ----------
// Every line ends up as a round, a merged continuation, a note, or an explicit `unread` line: nothing is dropped silently.
// The count printed at the end of a line ([12], (18 stitches), {14}) is a checksum: it picks between readings and flags disagreement.
const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const STW = '(?:stitch(?:es)?|sts?)\\b'; // longest first: `st|stitch` used to leave "itch" behind
const COUNT_RE = /[\[({]\s*=?\s*(\d+)\s*(?:stitch(?:es)?|sts?|sc|hdc|dc)?\s*[\])}](?!\s*(?:x\s*\d|\d|times?\b))/gi;
function statedCountOf(s) {
  let n = null; for (const m of String(s).matchAll(COUNT_RE)) n = +m[1];
  if (n == null) { const m = String(s).match(/[-—–]\s*(\d+)\s*(?:stitch(?:es)?|sts?|sc|hdc|dc)\s*\.?\s*$/i); if (m) n = +m[1]; }
  return n;
}
const ST_TOK = new Set(['sc', 'inc', 'dec']);
const FILLER = new Set(['in', 'the', 'next', 'and', 'then', 'to', 'end', 'ch', 'sl', 'st', 'sts', 'join', 'turn', 'blo', 'flo', 'bl', 'fl', 'only', 'stitch', 'stitches', 'rep', 'repeat', 'from', 'each', 'of', 'rnd', 'round', 'row', 'all', 'times', 'loop', 'loops', 'back', 'front', 'with', 'color', 'colour', 'make', 'working', 'work', 'for', 'this', 'evenly', 'more', 'mc', 'mr', 'ring', 'hook', 'other', 'side', 'chain', 'base', 'continue', 'last', 'first', 'same', 'top', 'rem', 'remaining', 'a', 'at', 'on', 'into', 'as', 'counts', 'count', 'does', 'not', 't', 'x', 'around', 'it', 'unworked', 'leave', 'time', 'once', 'again']);
// one line's instructions → ops (S, I, D, and { fill: [...] } for "repeat around"), plus what was seen
function readOps(body, opts = {}) {
  const info = { unknown: new Set(), ch: null, chCounts: false, chMid: 0, join: false, turn: false, loop: null, unworked: false, fromChain: false, bare: 0, stitches: 0, starNoClause: false, repGuess: false };
  const R = (src, fl = 'g') => new RegExp(src, fl);
  let s = ' ' + String(body).toLowerCase().replace(/[×✕]/g, 'x').replace(/[–—]/g, '-') + ' ';
  s = s.replace(COUNT_RE, ' ').replace(/[\[{]/g, '(').replace(/[\]}]/g, ')')
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g, w => NUMW[w])
    .replace(/(\d)(?=(?:sc|hdc|dc|tr|inc|dec)\b)/g, '$1 ').replace(/\bch(?=\d)/g, 'ch ')
    .replace(/\b(?:inv(?:isible)?\s*dec|(?:sc|hdc|dc|tr)\s*2\s*tog)\b/g, 'dec')
    .replace(/\b(?:(?:fp|bp|bl|fl)\s*)?(?:hdc|dc|tr)\b|\b(?:bl|fl)sc\b/g, 'sc')
    .replace(/\b(?:and\s+)?fasten\s+off\b.*$/, ' ')
    .replace(/\bwith\s+(?:the\s+)?(?:main|accent|contrast(?:ing)?|new|mc|cc)?\s*colou?r(?:\s+[a-z](?![a-z]))?/g, ' ')
    .replace(/\b(?:change|switch)\s+to\s+(?:colou?r\s+)?[a-z0-9]+\b/g, ' ')
    .replace(/\b(?:place\s+(?:a\s+)?)?mark(?:er)?\b[^,;.]*/g, ' ')
    .replace(/\b(?:working\s+)?(?:in\s+|through\s+)?(?:the\s+)?(front|back)\s+loops?(?:\s+only)?(?:\s+for\s+this\s+(?:round|rnd|row)(?:\s+only)?)?|\b(blo|flo)\b/g, (m, a, b) => { info.loop = a || (b === 'blo' ? 'back' : 'front'); return ' '; })
    .replace(/\b(?:in|into)\s+(?:the\s+|a\s+)?(?:magic\s+(?:ring|circle|loop)|adjustable\s+ring|mr|mc|ring)\b|\b(?:mr|magic\s+(?:ring|circle))\b/g, ' ')
    .replace(/\b(?:continue\s+)?(?:working\s+)?(?:on|along|in|into)\s+(?:the\s+)?other\s+side\s+of\s+(?:the\s+)?(?:foundation\s+)?(?:chain|ch)(?:\s+base)?/g, ' ')
    .replace(/\b(?:in\s+(?:the\s+)?)?(?:\d+(?:st|nd|rd|th)|first|second|third|fourth|fifth|last|next)\s+ch(?:ain)?s?\b(\s+from\s+(?:the\s+)?hook)?/g, (m, h) => { if (h) info.fromChain = true; return ' '; })
    .replace(/\b(?:sl(?:ip)?\s*st(?:itch)?|join(?:ed)?)\b(?:\s+(?:in|to|into|with|at)\b[^,;.*]*)?/g, () => { info.join = true; return ' '; })
    .replace(/\bch\s*(\d+)\s*(\(\s*)?((?:that\s+)?counts?\s+as\s+(?:the\s+|a\s+)?(?:first\s+|1st\s+)?(?:st|stitch|sc)?|does\s+not\s+count(?:\s+as\s+(?:a\s+)?(?:st|stitch))?|doesn'?t\s+count[^,;.)]*)?\s*\)?/g, (m, n, p, c) => {
      if (info.ch == null) { info.ch = +n; info.chCounts = !!(c && /^(?:that\s+)?counts?/.test(c)) || (!c && !!opts.chCounts); return info.chCounts ? ' sc ' : ' '; }
      info.chMid++; return ' ';
    })
    .replace(/,\s*t\s*,|\bturn\b/g, () => { info.turn = true; return ' , '; })
    .replace(/\bleave\s+(?:the\s+)?(?:rem(?:aining)?|rest\s+of\s+the)\s+(?:stitch(?:es)?|sts?)\s+unworked\b/g, () => { info.unworked = true; return ' '; })
    .replace(/\bevenly\b|\bmake\b/g, ' ');
  s = s.replace(R(`\\b2\\s*sc\\s+in\\s+(?:each\\s+of\\s+)?(?:the\\s+)?next\\s+(\\d+)(?:\\s+${STW})?`), 'inc $1')
    .replace(R(`\\b2\\s*sc\\s+(?:in|into)\\s+(?:each|every)\\s+(?:rem(?:aining)?\\s+)?${STW}(?:\\s+around)?`), 'inc around')
    .replace(R(`\\b2\\s*sc\\s+(?:in|into)\\s+(?:the\\s+)?(?:next|same|first|this|that|last)\\b(?:\\s+${STW})?`), 'inc')
    .replace(R(`\\b(?:1\\s+)?sc\\s+in\\s+(?:each\\s+of\\s+)?(?:the\\s+)?next\\s+(\\d+)(?:\\s+${STW})?`), 'sc $1')
    .replace(R(`\\b(?:1\\s+)?sc\\s+in\\s+(?:the\\s+)?(?:next|first|last|same)\\b(?:\\s+${STW})?`), 'sc')
    .replace(R(`\\b(?:in\\s+|of\\s+|into\\s+)?(?:the\\s+)?(?:each|every)\\s+(?:rem(?:aining)?\\s+)?${STW}(?:\\s+around)?`), ' around')
    .replace(/\b(?:across|around|to\s+(?:the\s+)?end(?:\s+of\s+(?:the\s+)?(?:rnd|round|row))?)\b/g, ' around ')
    .replace(/\b1\s+(sc|inc|dec)\s+around\b/g, '$1 around')
    .replace(/(\d)\s*x\b/g, '$1 times');
  // implicit repeats: "*…; rep from * around", "*…* repeat around", "rep from * to ** 8 times / 11 more times"
  s = s.replace(/[.;,]?\s*\b(?:and\s+)?rep(?:eat)?\b(?:\s+from)?\s*(?:\*+)?(?:\s*(?:to|until|through|-)\s*\*+)?\s*(?:(around)|(\d+)\s*(more\s+)?times?(\s+more)?)?/g,
    (m, ar, n, m1, m2) => ` § ${ar ? 'A' : n ? +n + (m1 || m2 ? 1 : 0) : '?'} § `);
  const spec = sp => (sp === 'A' || sp === '?' ? 'around' : `x ${sp}`);
  for (let guard = 0; guard < 30 && (s.includes('*') || s.includes('§')); guard++) {
    const p = s.indexOf('*'), q = s.indexOf('§');
    if (q >= 0 && (p < 0 || q < p)) { // a repeat clause with no star: the unit is everything before it
      const e = s.indexOf('§', q + 1), sp = s.slice(q + 1, e).trim(); if (sp === '?') info.repGuess = true;
      s = ' ( ' + s.slice(0, q) + ' ) ' + spec(sp) + ' , ' + s.slice(e + 1); continue;
    }
    let r = p; while (s[r] === '*') r++;
    const q2 = s.indexOf('§', r); let close = s.indexOf('*', r); if (q2 >= 0 && close > q2) close = -1;
    const uEnd = close >= 0 ? close : q2 >= 0 ? q2 : s.length; let after = uEnd; if (close >= 0) while (s[after] === '*') after++;
    const unit = s.slice(r, uEnd);
    if (q2 < 0) { info.starNoClause = !/^\s*\d+\s*times\b/.test(s.slice(after)); s = s.slice(0, p) + ' ( ' + unit + ' ) ' + s.slice(after); continue; }
    const e = s.indexOf('§', q2 + 1), sp = s.slice(q2 + 1, e).trim(); if (sp === '?') info.repGuess = true;
    s = s.slice(0, p) + ' ( ' + unit + ' ) ' + spec(sp) + ' , ' + s.slice(after, q2).replace(/[.;,]/g, ' ') + s.slice(e + 1);
  }
  s = s.replace(/[.;:]/g, ' , ');
  const tok = s.match(/\(|\)|,|x(?=\s*\d)|\d+|[a-z]+/g) || [];
  let i = 0;
  const isNum = t => t != null && /^\d+$/.test(t), code = w => (w === 'sc' ? 'S' : w === 'inc' ? 'I' : 'D');
  const rep = (ops, n) => { const o = []; for (let k = 0; k < n; k++) o.push(...ops); return o; };
  function seq() { const out = []; while (i < tok.length && tok[i] !== ')') { if (tok[i] === ',') { i++; continue; } const it = item(); if (it) out.push(...it); } return out; }
  function item() {
    const t = tok[i]; let ops = null;
    if (t === '(') { i++; ops = seq(); if (tok[i] === ')') i++; if (tok[i] === 'around') { i++; return ops.length ? [{ fill: ops }] : null; } }
    else if (isNum(t) && ST_TOK.has(tok[i + 1])) {
      const n = +t, w = tok[i + 1]; i += 2; info.stitches++;
      if (tok[i] === 'around' && n === 1) { i++; return [{ fill: [code(w)] }]; }
      if (w === 'sc' && n === 2) { info.bare++; if (opts.bareInc) ops = ['I']; } // bare "2 sc": two stitches, or two in one stitch
      if (!ops) ops = Array(n).fill(code(w));
    } else if (ST_TOK.has(t)) {
      i++; info.stitches++;
      if (tok[i] === 'around') { i++; return [{ fill: [code(t)] }]; }
      if (isNum(tok[i]) && tok[i + 1] !== 'times') { ops = Array(+tok[i]).fill(code(t)); i++; } else ops = [code(t)];
    } else { i++; if (!FILLER.has(t) && !isNum(t) && t !== ')') info.unknown.add(t); return null; }
    if (tok[i] === 'x' && isNum(tok[i + 1])) { ops = rep(ops, +tok[i + 1]); i += 2; }
    else if (isNum(tok[i]) && tok[i + 1] === 'times') { ops = rep(ops, +tok[i]); i += 2; }
    return ops;
  }
  const ops = [];
  while (i < tok.length) { ops.push(...seq()); if (tok[i] === ')') i++; }
  return { ops, info };
}
// one round against the round below: expand "around" fills, then fill or trim to the stitches available, with a warning
function readRound(body, prev, opts) {
  const { ops, info } = readOps(body, opts), warn = [], out = [];
  const fixed = ops.filter(o => typeof o === 'string').reduce((x, o) => x + consumes(o), 0);
  let rest = Math.max(0, prev - fixed), flatRep = false, uneven = 0;
  for (const o of ops) {
    if (typeof o === 'string') { out.push(o); continue; }
    const u = o.fill.filter(x => typeof x === 'string'), per = u.reduce((x, y) => x + consumes(y), 0) || 1, n = Math.floor(rest / per);
    for (let k = 0; k < n; k++) out.push(...u); rest -= n * per; if (rest) uneven = rest;
    if (u.length > 1 && u.every(x => x === 'S')) flatRep = true;
  }
  let used = out.reduce((x, o) => x + consumes(o), 0);
  if (info.unknown.size) warn.push(`ignored “${[...info.unknown].join('”, “')}”.`);
  if (info.starNoClause) warn.push('a * repeat with no “repeat” instruction on this line: worked once.');
  if (info.repGuess) warn.push('“repeat” with no count: repeated around.');
  if (uneven && !info.unworked) warn.push(`the repeat does not divide the ${prev} stitches evenly (${uneven} left).`);
  if (used < prev && !info.unworked) { warn.push(`works ${used} of ${prev} stitches; filled the rest.`); while (used < prev) { out.push('S'); used++; } }
  if (used > prev) { warn.push(`needs ${used} stitches but the round below has ${prev}; trimmed.`); while (used > prev && out.length) used -= consumes(out.pop()); }
  if (!out.length) out.push('S');
  return { ops: out, warn, info, flatRep, got: out.reduce((x, o) => x + produces(o), 0) };
}
// parseBody(body, prev[, stated]): the stated count chooses between readings (bare "2 sc" = inc; "ch 3" counts as a stitch)
function parseBody(body, prev, stated) {
  const r = readRound(body, prev, {});
  const alts = [];
  if (r.info.bare) alts.push({ bareInc: true });
  if (r.info.ch != null && !r.info.chCounts) alts.push({ chCounts: true });
  if (alts.length === 2) alts.push({ bareInc: true, chCounts: true });
  if (stated != null && r.got !== stated) { for (const o of alts) { const a = readRound(body, prev, o); if (a.got === stated) { a.reading = o; return a; } } }
  else if (stated == null && r.info.bare && r.flatRep) { const a = readRound(body, prev, { bareInc: true }); a.reading = { bareInc: true }; return a; } // a repeat around that changes nothing: "2 sc" was an increase
  return r;
}
const LBL = /^(?:r(?:nd|ound|ow)?s?\.?\s*)(\d+)(?:\s*[-–—]\s*(?:r(?:nd|ound|ow)?s?\.?\s*)?(\d+))?\s*(?:\((sc|hdc|dc|rib)\))?\s*[:.)]?\s*(.*)$/i;
const NOTE_RE = /^(?:fasten\s+off|weave|stuff|cut\s+(?:the\s+)?yarn|leave\s+a\s+(?:long\s+)?tail|finish|notes?\b|tip\b|insert\s+(?:the\s+)?(?:safety\s+)?eyes)/i;
const STV_RE = /\b(?:sc|hdc|dc|tr|inc|dec|ch|sl\s*st|rep(?:eat)?|join|fpdc|bpdc)\b|\d(?:sc|hdc|dc)\b|\*/i;
function parsePattern(text) {
  const rounds = [], warns = [], lines = [], unread = [], entries = [], pre = [];
  for (const raw of String(text).split(/\n/)) {
    const s = raw.trim(); if (!s) continue;
    const m = s.match(LBL), last = entries[entries.length - 1];
    if (m) { entries.push({ a: +m[1], b: m[2] ? +m[2] : +m[1], st: m[3] ? m[3].toLowerCase() : null, body: m[4], text: s, after: [] }); lines.push({ text: s, status: 'round' }); continue; }
    if (last && !last.after.length && !NOTE_RE.test(s) && STV_RE.test(s) && statedCountOf(last.body) == null) { /* a round with no printed count yet is still open */ last.body += ' ' + s; last.text += '\n' + s; lines.push({ text: s, status: 'merged' }); continue; }
    if (NOTE_RE.test(s) || !STV_RE.test(s)) { lines.push({ text: s, status: 'note' }); continue; }
    const u = { text: s, why: 'not a round line this reader knows' };
    unread.push(u); lines.push({ text: s, status: 'unread' }); (last ? last.after : pre).push(u);
    warns.push(`“${s.slice(0, 60)}”: not read; this line needs a human.`);
  }
  const bodies = {}; let prev = null;
  for (const e of entries) {
    let body = e.body;
    const br = body.match(/^\s*(?:rep(?:eat)?|work)\s+(?:as\s+(?:for\s+)?)?(?:r(?:nd|ound|ow)?s?\.?\s*)(\d+)\b\.?/i);
    if (br && bodies[+br[1]] != null) body = bodies[+br[1]] + ' ' + body.slice(br[0].length); // "Rep R4": that round's instructions again
    const stated = statedCountOf(body);
    const st = e.st || (/fp\s*dc|bp\s*dc/i.test(body) ? 'rib' : /(?:\b|\d)hdc\b/i.test(body) ? 'hdc' : /(?:\b|\d)dc\b/i.test(body) ? 'dc' : /(?:\b|\d)sc\b/i.test(body) ? 'sc' : (rounds.length ? rounds[rounds.length - 1].st : 'sc'));
    for (let r = e.a; r <= Math.max(e.a, e.b); r++) {
      bodies[r] = body; const tag = `R${r}`, w = [];
      let rd;
      if (!rounds.length) { // first round: what it puts into the ring (or the chain), not the first number in the line
        const { ops, info } = readOps(body, {});
        let n = ops.filter(o => typeof o === 'string').reduce((x, o) => x + produces(o), 0);
        rd = { mr: 0, st, from: info.fromChain ? 'chain' : 'ring' };
        if (!n) { n = stated || 6; w.push(`no stitches found; ring of ${n}.`); }
        else if (!/mr|magic|ring|circle|\bmc\b|hook|\bch/i.test(body)) w.push(`treated as a magic ring of ${n}.`);
        rd.mr = clamp(n, 1, 200);
        if (info.ch != null) { rd.ch = info.ch; rd.chCounts = info.chCounts; }
        if (info.join) rd.join = true;
      } else {
        const res = parseBody(body, prev, stated);
        rd = { ops: res.ops, st };
        const I = res.info;
        if (I.ch != null) { rd.ch = I.ch; rd.chCounts = I.chCounts; }
        if (I.join) rd.join = true; if (I.turn) rd.turn = true; if (I.loop) rd.loop = I.loop;
        w.push(...res.warn);
        if (!I.stitches) { rd.unread = { text: e.text, why: 'no stitches this reader knows' }; unread.push(rd.unread); w.push('no stitches this reader knows; this line needs a human.'); }
      }
      const got = rd.mr || rd.ops.reduce((x, o) => x + produces(o), 0);
      if (stated != null && stated !== got) w.push(`stated [${stated}] but the stitches make ${got}.`);
      if (w.length) rd.warn = w;
      w.forEach(x => warns.push(`${tag}: ${x}`));
      rounds.push(rd);
      prev = stated != null ? stated : got; // a wrong line is flagged, and the next line is read against the printed count
    }
    if (e.after.length) rounds[rounds.length - 1].after = e.after;
  }
  if (!rounds.length) rounds.push({ mr: 6, st: 'sc' });
  if (pre.length) rounds[0].before = pre;
  return { rounds, warns, unread, lines };
}

// ---------- flat pieces: layout search ----------
function grannySide(R, g) { return 2 * R * g.dims('dc').h * 0.92 + 0.5 * g.w; }
function flatStitch(s) { return s.rib && s.style !== 'granny' ? 'rib' : s.stitch; }
function flatTarget(s) { return s.item === 'cowl' ? { W: s.circ, L: s.height } : { W: s.width, L: s.length }; }
function flatDims(c, s, g) {
  const b = s.border ? 4 * g.h : 0;
  if (c.type === 'granny') { const side = grannySide(c.R, g); return { side, W: c.cols * side + b, L: c.rowsN * side + b }; }
  const d = g.dims(c.st); return { W: c.n * d.w + b, L: c.rows * d.h + b };
}
function flatCandidates(s, g) {
  const T = flatTarget(s), b = s.border ? 4 * g.h : 0, out = [];
  if (s.item === 'blanket' && s.style === 'granny') {
    for (let R = 3; R <= 16; R++) {
      const side = grannySide(R, g), cw = (T.W - b) / side, cl = (T.L - b) / side;
      for (const cols of new Set([Math.floor(cw), Math.ceil(cw)])) for (const rowsN of new Set([Math.floor(cl), Math.ceil(cl)])) if (cols >= 1 && rowsN >= 1) out.push({ type: 'granny', R, cols, rowsN });
    }
    return out;
  }
  const st = flatStitch(s), d = g.dims(st), n0 = Math.round((T.W - b) / d.w), r0 = Math.round((T.L - b) / d.h);
  for (let n = Math.max(2, n0 - 5); n <= n0 + 5; n++) for (let rows = Math.max(1, r0 - 6); rows <= r0 + 6; rows++) out.push({ type: s.item === 'cowl' ? 'tube' : 'rows', st, n, rows });
  return out;
}
function evalFlat(c, s, g) {
  const T = flatTarget(s), D = flatDims(c, s, g);
  let sc = 100 * (((D.W - T.W) / T.W) ** 2 + ((D.L - T.L) / T.L) ** 2);
  if (c.type === 'granny') { if (D.side < 10) sc += ((10 - D.side) / 10) ** 2 * 5; if (D.side > 25) sc += ((D.side - 25) / 25) ** 2 * 5; sc += 0.0004 * c.cols * c.rowsN; }
  else {
    if (c.st === 'rib' && c.n % 2) sc += 5;
    if (s.stripes) { if (c.rows % s.stripes) sc += 0.5; else if (c.type === 'rows' && c.rows % (2 * s.stripes) !== s.stripes) sc += 0.2; }
  }
  return sc;
}
function designFlat(s, g) {
  const cands = flatCandidates(s, g); let best = null, bs = Infinity;
  for (const c of cands) { const v = evalFlat(c, s, g); if (v < bs) { bs = v; best = c; } }
  return { cand: best, score: bs, tested: cands.length };
}
const ord = n => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
function formatFlat(c, s, g) {
  const L = [];
  if (c.type === 'granny') {
    const D = flatDims(c, s, g), n = c.cols * c.rowsN;
    L.push(`Square (make ${n} = ${c.cols} × ${c.rowsN}), about ${r1(D.side)} cm each:`);
    L.push('Rnd 1: ch 4, join to form a ring; ch 3 (counts as dc), 2 dc in ring, ch 2, (3 dc, ch 2) x3 in ring, join [12 dc]');
    if (c.R >= 2) L.push('Rnd 2: sl st to the corner sp; ch 3, (2 dc, ch 2, 3 dc) in the same sp, ch 1, ((3 dc, ch 2, 3 dc) in next corner sp, ch 1) x3, join [24 dc]');
    if (c.R >= 3) L.push(`Rnds 3–${c.R}: (3 dc, ch 2, 3 dc) in each corner sp, 3 dc in each ch-1 sp along the sides, ch 1 between groups, join [${[3, 4].map(r => 12 * r).join(', ')}, … ${12 * c.R} dc]`);
    L.push('Fasten off and weave in ends. Block the squares to size.');
    L.push(`Join: sc the squares together through the back loops in a grid of ${c.cols} across × ${c.rowsN} down.`);
  } else if (c.type === 'tube') {
    const ab = c.st === 'rib' ? 'dc' : ST[c.st].ab, tc = ST[c.st].tc;
    L.push(`Ch ${c.n}, join with a sl st to the first ch to make a ring${s.style === 'infinity' ? ', giving the chain one half twist first (Möbius / infinity)' : ', careful not to twist'}.`);
    L.push(`Rnd 1 (${c.st === 'rib' ? 'dc' : c.st}): ch ${tc} (does not count as a st), ${ab} in each ch around, join [${c.n}]`);
    if (c.rows > 1) L.push(c.st === 'rib' ? `Rnds 2–${c.rows} (rib): ch 2, (FPdc, BPdc) around, join [${c.n}]` : `Rnds 2–${c.rows} (${c.st}): ch ${tc}, ${ab} in each st around, join [${c.n}]`);
  } else {
    const rb = c.st === 'rib', st = rb ? 'dc' : c.st, ab = ST[st].ab, tc = ST[st].tc;
    L.push(`Ch ${c.n + tc}.`);
    L.push(`Row 1 (${st}): ${ab} in the ${ord(tc + 1)} ch from hook and in each ch across [${c.n}]`);
    if (c.rows >= 2) L.push(rb ? `Row 2 (rib): ch 2, turn, dc in first st, (FPdc, BPdc) x${Math.floor((c.n - 2) / 2)},${c.n % 2 ? ' FPdc,' : ''} dc in last st [${c.n}]` : `Row 2 (${st}): ch ${tc} (does not count as a st), turn, ${ab} in each st across [${c.n}]`);
    if (c.rows >= 3) L.push(`Rows 3–${c.rows} (${rb ? 'rib' : st}): repeat Row 2 [${c.n}]`);
  }
  return L.join('\n');
}
function parseFlat(text, s) {
  const t = String(text), st0 = flatStitch(s);
  if (s.style === 'granny') {
    const m = t.match(/make\s+\d+\s*=\s*(\d+)\s*[x×]\s*(\d+)/i), r = [...t.matchAll(/rnds?\s*(\d+)(?:\s*[-–]\s*(\d+))?/gi)].map(q => +(q[2] || q[1]));
    return { type: 'granny', R: clamp(Math.max(1, ...r), 1, 30), cols: m ? +m[1] : 4, rowsN: m ? +m[2] : 5 };
  }
  // the foundation chain is the first line that starts with "Ch N" / "Chain N", else the Row 1 chain; never a chain in a later row
  const L = t.split(/\n/).map(x => x.trim()).filter(Boolean), r1 = L.find(l => /^(?:rows?|rnds?|rounds?)\s*1\b(?!\s*[-–])/i.test(l)) || '';
  let chN = null;
  for (const l of L) { const m = l.match(/^(?:foundation\s*:?\s*)?ch(?:ain)?\s*(\d+)/i); if (m) { chN = +m[1]; break; } }
  if (chN == null) { const m = r1.match(/\bch(?:ain)?\s*(\d+)/i) || t.match(/\bch(?:ain)?\s*(\d+)/i); if (m) chN = +m[1]; }
  const rows = [...t.matchAll(/\b(?:rows?|rnds?)\s*(\d+)(?:\s*[-–]\s*(\d+))?/gi), ...t.matchAll(/\b(?:for|until\s+you\s+have)\s+(\d+)\s+rows\b/gi)].map(q => +(q[2] || q[1]));
  const tc = ST[st0 === 'rib' ? 'dc' : st0].tc, tube = s.item === 'cowl';
  // stitches from the chain: "dc in the 3rd ch from hook" skips 2 chains (they count as a stitch only when the pattern says so)
  const hk = (r1 || t).match(/(\d+)(?:st|nd|rd|th)\s+ch(?:ain)?\s+from\s+(?:the\s+)?hook/i);
  const fromCh = chN == null ? null : tube ? chN : hk ? chN - (+hk[1] - 1) + (/skipped[^)]*\bcounts?\b/i.test(r1) ? 1 : 0) : chN - tc;
  const printed = r1 ? statedCountOf(r1) : null, warn = [];
  if (printed != null && fromCh != null && printed !== fromCh) warn.push(`Row 1 states ${printed} sts but the chain gives ${fromCh}; using ${printed}.`);
  const n = printed != null ? printed : fromCh != null ? Math.max(2, fromCh) : 20;
  const out = { type: tube ? 'tube' : 'rows', st: st0, n, rows: Math.max(1, ...rows) };
  if (warn.length) out.warn = warn;
  return out;
}

// ---------- estimates ----------
function stitchLen(st, g) { const d = g.dims(st); return ST[st].rho * d.w * d.h / g.w; }
function estimate(D) {
  const g = D.g, s = D.spec, cnt = { sc: 0, hdc: 0, dc: 0, rib: 0 }; let chains = 0, extraCm = 0, extraMin = 0;
  if (D.kind === 'rounds') { D.counts.forEach((c, i) => { cnt[D.st[i]] += c; chains += ST[D.st[i]].tc; }); }
  else {
    const c = D.cand;
    if (c.type === 'granny') { const n = c.cols * c.rowsN, R = c.R; cnt.dc += n * 6 * R * (R + 1); chains += n * (4 + R * (R + 3) * 2); const side = grannySide(R, g); cnt.sc += Math.round(((c.cols - 1) * c.rowsN + (c.rowsN - 1) * c.cols) * side / g.w); extraMin += n * 2; }
    else if (c.st === 'rib') { cnt.dc += c.n; cnt.rib += c.n * (c.rows - 1); chains += c.n + 3 + 2 * c.rows; }
    else { cnt[c.st] += c.n * c.rows; chains += c.n + ST[c.st].tc * (c.rows + 1); }
    if (s.border) { const F = flatDims(c, s, g); cnt.sc += Math.round(2 * 2 * (F.W + F.L) / g.w); }
    if (s.fringe) { const strands = 2 * Math.ceil(c.n / 2) * 2; extraCm += strands * 30; extraMin += strands * 0.3; }
  }
  if (s.pompom) { const D2 = clamp(s.head * 0.12, 4, 10); extraCm += 600 * D2 / (g.yarn.t); extraMin += 15; }
  let cm = chains * 2.4 * g.w + extraCm, min = chains / 30 + extraMin, total = 0;
  for (const k in cnt) { cm += cnt[k] * stitchLen(k, g); min += cnt[k] / ST[k].rate; total += cnt[k]; }
  cm *= 1.1; const m = cm / 100, grams = m / g.yarn.m100 * 100;
  return { cnt, total, chains, m, yd: m / 0.9144, grams, balls: Math.ceil(grams / 100), minutes: min };
}
// one call: spec → finished design (used by the tests and the app's first pass)
function designRounds(s, g, counts) {
  const P = roundPlan(s, g), st = counts && counts.length !== P.R ? null : P.st;
  return { kind: 'rounds', spec: s, g, P, counts, st: st || P.st };
}
function roundsSummary(counts, st, g, s) {
  const dm = g.dims(s.item === 'hat' ? s.stitch : 'sc');
  const ws = st.map(x => x === 'rib' ? dm.w : g.dims(x).w), hs = st.map(x => g.dims(x).h);
  const last = counts.length - 1, brimC = counts[last] * ws[last], widest = Math.max(...counts.map((c, i) => c * ws[i]));
  let rp = 0, z = 0; counts.forEach((c, i) => { const r = c * ws[i] / TAU, dr = r - rp; z += Math.sqrt(Math.max(0, hs[i] * hs[i] - dr * dr)); rp = r; });
  return { brimC, widest, depth: hs.reduce((a, b) => a + b, 0), height: z, rounds: counts.length };
}
// ---------- colourwork ----------
// A sequence like "A4 B2 C2" = 4 rows (or rounds) of A, 2 of B, 2 of C, repeated. Granny squares use it per round.
const LETTERS = 'ABCD';
function parseSeq(t) { const out = []; String(t || '').toUpperCase().replace(/([A-D])\s*[x×]?\s*(\d*)/g, (m, L, n) => { out.push([L, Math.max(1, +n || 1)]); }); return out; }
function seqText(seq) { return seq.map(([L, n]) => L + n).join(' '); }
function colourSeq(s) {
  if (s.seq) { const q = parseSeq(s.seq); if (q.length) return q; }
  const k = s.colors || 1;
  if (k <= 1 && !s.stripes) return [['A', 1]];
  const n = s.style === 'granny' ? 1 : (s.stripes || (s.stitch === 'sc' ? 4 : 2));
  return LETTERS.slice(0, Math.max(2, k)).split('').map(L => [L, n]);
}
function colourAt(seq, i) { let tot = 0; for (const [, n] of seq) tot += n; let k = ((i % tot) + tot) % tot; for (const [L, n] of seq) { if (k < n) return L; k -= n; } return 'A'; }
function grannyColour(seq, layout, round, square, col, row) {
  const letters = [...new Set(seq.map(q => q[0]))], base = colourAt(seq, round);
  if (layout === 'scrappy') return letters[(letters.indexOf(base) + square) % letters.length];
  if (layout === 'checker') return letters[(letters.indexOf(base) + ((col + row) % 2)) % letters.length];
  return base;
}
// metres of yarn per colour, in proportion to the yarn each row or round uses
function colourYardage(D) {
  const s = D.spec, g = D.g, seq = colourSeq(s), w = {}, add = (L, v) => (w[L] = (w[L] || 0) + v);
  if (D.kind === 'rounds') D.counts.forEach((c, r) => add(colourAt(seq, r), c * stitchLen(D.st[r], g) + ST[D.st[r]].tc * 2.4 * g.w));
  else if (D.cand.type === 'granny') {
    const c = D.cand; let sq = 0;
    for (let row = 0; row < c.rowsN; row++) for (let col = 0; col < c.cols; col++, sq++) for (let r = 0; r < c.R; r++) add(grannyColour(seq, s.layout, r, sq, col, row), 12 * (r + 1) * stitchLen('dc', g) + (4 * (r + 1) + 3) * 2.4 * g.w);
    add('A', ((c.cols - 1) * c.rowsN + (c.rowsN - 1) * c.cols) * grannySide(c.R, g) / g.w * stitchLen('sc', g));
  } else {
    const c = D.cand; add('A', (c.n + 3) * 2.4 * g.w);
    for (let r = 0; r < c.rows; r++) add(colourAt(seq, r), c.n * stitchLen(c.st, g) + 3 * 2.4 * g.w);
  }
  if (s.border && D.kind !== 'rounds') { const F = flatDims(D.cand, s, g); add('A', 2 * 2 * (F.W + F.L) / g.w * stitchLen('sc', g)); }
  const E = estimate(D), tot = Object.values(w).reduce((a, b) => a + b, 0) || 1, out = {};
  for (const L of Object.keys(w).sort()) out[L] = { m: E.m * w[L] / tot, grams: E.grams * w[L] / tot };
  return out;
}

// ---------- photo → silhouette → shape ----------
// The piece is assumed round in cross-section (worked in rounds) and photographed side-on, upright.
function maskFromImage(px, w, h) {
  const border = []; for (let x = 0; x < w; x++) border.push(x, x + (h - 1) * w); for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  const med = k => { const v = border.map(i => px[i * 4 + k]).sort((a, b) => a - b); return v[v.length >> 1]; }, bg = [med(0), med(1), med(2)];
  const d = new Float32Array(w * h); let mx = 1;
  for (let i = 0; i < w * h; i++) { d[i] = Math.hypot(px[i * 4] - bg[0], px[i * 4 + 1] - bg[1], px[i * 4 + 2] - bg[2]); if (d[i] > mx) mx = d[i]; }
  const hist = new Float64Array(64); for (let i = 0; i < d.length; i++) hist[Math.min(63, (d[i] / mx * 64) | 0)]++;
  let sum = 0, sumB = 0, wB = 0, best = 0, th = 16; for (let i = 0; i < 64; i++) sum += i * hist[i];
  for (let t = 0; t < 64; t++) { wB += hist[t]; if (!wB) continue; const wF = d.length - wB; if (!wF) break; sumB += t * hist[t]; const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = t; } }
  const cut = Math.max((th + 0.5) / 64 * mx, 18), m = new Uint8Array(w * h); for (let i = 0; i < d.length; i++) m[i] = d[i] > cut ? 1 : 0;
  return largestBlob(m, w, h);
}
function largestBlob(m, w, h) {
  const lab = new Int32Array(w * h), st = []; let bestL = 0, bestN = 0, L = 0;
  for (let i = 0; i < w * h; i++) if (m[i] && !lab[i]) {
    L++; let n = 0; st.push(i); lab[i] = L;
    while (st.length) { const p = st.pop(); n++; const x = p % w, y = (p / w) | 0; for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (q >= 0 && m[q] && !lab[q]) { lab[q] = L; st.push(q); } }
    if (n > bestN) { bestN = n; bestL = L; }
  }
  const out = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) out[i] = lab[i] === bestL && bestL ? 1 : 0;
  return out;
}
function maskFromPolygon(poly, w, h) { // even-odd scanline fill
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const yc = y + 0.5, xs = [];
    for (let i = 0; i < poly.length; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length]; if ((y0 <= yc) !== (y1 <= yc)) xs.push(x0 + (yc - y0) / (y1 - y0) * (x1 - x0)); }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x < Math.min(w, xs[k + 1] - 0.5); x++) m[y * w + x] = 1;
  }
  return m;
}
// half-width per row → a meridian (r, z) in pixels, starting at the narrow end (where the magic ring goes)
function profileFromMask(m, w, h) {
  const rows = [];
  for (let y = 0; y < h; y++) { let l = -1, r = -1; for (let x = 0; x < w; x++) if (m[y * w + x]) { if (l < 0) l = x; r = x; } if (l >= 0) rows.push([y, (r - l + 1) / 2]); }
  if (rows.length < 4) return null;
  const sm = rows.map((q, i) => { let a = 0, n = 0; for (let k = Math.max(0, i - 2); k <= Math.min(rows.length - 1, i + 2); k++) { a += rows[k][1]; n++; } return [q[0], a / n]; });
  const maxR = Math.max(...sm.map(q => q[1])), top = sm[0][1], bot = sm[sm.length - 1][1], fromTop = top <= bot;
  const seq = fromTop ? sm : sm.slice().reverse(), z0 = seq[0][0];
  const pts = [[0, 0]].concat(seq.map(q => [q[1], Math.abs(q[0] - z0) + 1]));
  const rawEnd = (fromTop ? rows[rows.length - 1] : rows[0])[1], closed = rawEnd < 0.35 * maxR;
  if (closed) pts.push([0, pts[pts.length - 1][1] + 1]);
  return { pts, closed, flip: fromTop, heightPx: rows.length, widthPx: maxR * 2, aspect: maxR * 2 / rows.length };
}
function shapeFromProfile(P) { const mz = P.pts[P.pts.length - 1][1]; return { label: 'Photo', closed: P.closed, flip: P.flip, pts: P.pts.map(([r, z]) => [r / mz, z / mz]) }; }

// ---------- pattern sheet helpers ----------
const ABBR = [
  ['ch', 'chain', /\bch\b/], ['sl st', 'slip stitch', /\bsl st\b/], ['sc', 'single crochet', /\bsc\b/], ['hdc', 'half double crochet', /\bhdc\b/],
  ['dc', 'double crochet', /\bdc\b/], ['FPdc', 'front post double crochet: yo, insert the hook from the front around the post of the stitch below, finish as a dc', /\bFPdc\b/],
  ['BPdc', 'back post double crochet: as FPdc, inserting from the back', /\bBPdc\b/], ['inc', 'increase: 2 stitches in the same stitch', /\binc\b/],
  ['dec', 'decrease: work the next 2 stitches together', /\bdec\b/], ['sc2tog', 'single crochet 2 together', /\bsc2tog\b/], ['hdc2tog', 'half double crochet 2 together', /\bhdc2tog\b/],
  ['dc2tog', 'double crochet 2 together', /\bdc2tog\b/], ['MR', 'magic ring: an adjustable loop you work the first round into, then pull closed', /magic ring/i],
  ['st(s)', 'stitch(es)', /\bsts?\b/], ['sp', 'space', /\bsp\b/], ['R / Rnd', 'round', /^(?:R\d|Rnds?\b)/m], ['yo', 'yarn over', /\byo\b|yarn over/i],
  ['( ) xN', 'repeat what is in brackets N times', /\) x\d/], ['[n]', 'stitch count at the end of the row or round', /\[\d+/],
];
function abbreviationsFor(text) { return ABBR.filter(a => a[2].test(text)).map(a => [a[0], a[1]]); }
function skillLevel(D) {
  if (D.kind === 'rounds') return D.st.includes('rib') ? 'Intermediate' : 'Easy';
  if (D.cand.type === 'granny') return 'Easy';
  return D.cand.st === 'rib' ? 'Intermediate' : D.spec.colors > 1 ? 'Easy' : 'Beginner';
}
function swatchFor(s, g, st) {
  const p = g.per10(st), n = Math.round(p.sts * 1.2), rows = Math.round(p.rows * 1.2), tc = ST[st].tc;
  return `Chain ${n + tc} and work ${rows} rows of ${st} (about 12 × 12 cm), turning with ch ${tc}. Block it, then count across the middle 10 cm: you want ${r1(p.sts)} sts and ${r1(p.rows)} rows. More stitches than that: use a hook 0.5 mm bigger. Fewer: go 0.5 mm smaller.`;
}
// a pattern line split into label, instruction and stitch count, for the sheet
function splitLine(l) {
  const m = l.match(/^((?:R\d+(?:–R\d+)?|Rnds? \d+(?:–\d+)?|Rows? \d+(?:–\d+)?)(?: \([a-z]+\))?):\s*(.*)$/i);
  let label = '', body = l, count = '';
  if (m) { label = m[1]; body = m[2]; }
  const c = body.match(/\s*\[([^\]]+)\]\s*$/); if (c) { count = c[1]; body = body.slice(0, c.index); }
  return { label, body, count };
}

// ---------- fit check ----------
// ease = how much smaller the brim is than the head (positive = negative ease, the hat stretches to fit)
function fitCheck(brimC, depth, head, style) {
  const ease = 1 - brimC / head; let verdict, tone;
  if (style !== 'bucket') {
    if (ease < 0) [verdict, tone] = ['loose: will slip down', 'bad'];
    else if (ease < 0.03) [verdict, tone] = ['relaxed, a little loose', 'warn'];
    else if (ease <= 0.12) [verdict, tone] = ['snug: good fit', 'good'];
    else if (ease <= 0.2) [verdict, tone] = ['tight: firm, may ride up', 'warn'];
    else [verdict, tone] = ['too tight', 'bad'];
  } else {
    if (ease < -0.05) [verdict, tone] = ['too big', 'bad'];
    else if (ease < -0.01) [verdict, tone] = ['roomy', 'warn'];
    else if (ease <= 0.04) [verdict, tone] = ['good fit', 'good'];
    else [verdict, tone] = ['too small (does not stretch)', 'bad'];
  }
  const need = hatDepthFor(head) * (HAT_STYLE_DEF[style] ? HAT_STYLE_DEF[style].dk : 1), dd = depth - need;
  const depthNote = style === 'beret' ? '' : dd < -2 ? 'shallow: sits above the ears' : dd > 3 ? 'deep: extra to fold or slouch' : 'covers the ears';
  return { ease, verdict, tone, depthNote };
}
function fitTable(brimC, depth, style) { return HAT_SIZES.map(e => Object.assign({ key: e[0], label: e[1], head: e[2] }, fitCheck(brimC, depth, e[2], style))); }
// a scarf on a neck: what is left to hang after going round the back of the neck (≈ 30 cm) or a full wrap (≈ 70 cm)
function scarfDrape(L) { return { draped: Math.max(0, (L - 30) / 2), wrapped: Math.max(0, (L - 70) / 2) }; }

// ---------- walkthrough: the pattern as an ordered list of hook actions ----------
// One step per stitch made, per chain and per slip-stitch join, in the order you would work them.
const OP_NAME = { sc: 'sc', hdc: 'hdc', dc: 'dc', fpdc: 'FPdc', bpdc: 'BPdc', inc: 'inc', dec: 'dec', ch: 'ch', slst: 'sl st' };
function walkSteps(D) {
  const out = [], s = D.spec;
  const push = o => { o.i = out.length; out.push(o); };
  if (D.kind === 'rounds') {
    const joined = s.item === 'hat', counts = countsFromRounds(D.rounds); let node = 0;
    // a line the reader could not follow becomes its own step, shown as "needs a human", never dropped
    const unreadStep = (u, r) => push({ kind: 'unread', r, op: 'unread', st: 'unread', made: 0, of: 0, node: -1, text: u.text, why: u.why, label: `This line needs a human: “${u.text}”` });
    D.rounds.forEach((rd, r) => {
      const n = counts[r], base = rd.st === 'rib' ? 'dc' : rd.st, tc = rd.ch != null ? rd.ch : ST[base].tc, where = `R${r + 1}`;
      (rd.before || []).forEach(u => unreadStep(u, r)); if (rd.unread) unreadStep(rd.unread, r);
      const first = out.length;
      if (joined || rd.ch != null) for (let k = 1; k <= tc; k++) push({ kind: 'round', r, op: 'ch', st: 'ch', made: 0, of: n, node: -1, label: `${where}: ch ${k} of ${tc} (${rd.chCounts ? 'counts as the first stitch' : 'does not count as a stitch'})` });
      let made = 0;
      const stitch = (op, st, note, extra) => { made++; node++; push(Object.assign({ kind: 'round', r, op, st, made, of: n, node, label: `${where}, stitch ${made} of ${n}: ${note}${made === 1 && rd.chCounts ? ` (the ch ${tc} counts as this stitch)` : ''}` }, extra || {})); };
      if (r === 0) for (let k = 0; k < n; k++) stitch(base, base, `${OP_NAME[base]} into the ${rd.from === 'chain' ? 'chain' : 'magic ring'}`, rd.from === 'chain' ? {} : { into: 'ring' });
      else for (const o of rd.ops) {
        const plain = rd.st === 'rib' ? (made % 2 ? 'bpdc' : 'fpdc') : base;
        if (o === 'S') stitch(plain, plain, OP_NAME[plain]);
        else if (o === 'I') { stitch('inc', base, `inc (1st ${OP_NAME[base]} in this st)`); stitch('inc', base, `inc (2nd ${OP_NAME[base]} in the same st)`, { into: 'same' }); }
        else stitch('dec', base, `dec (${OP_NAME[base]}2tog over the next 2 sts)`);
      }
      if (joined || rd.join) push({ kind: 'round', r, op: 'slst', st: 'slst', made: n, of: n, node: -1, label: `${where}: sl st to the first stitch to join` });
      if (rd.warn && out[first]) out[first].warn = rd.warn;
      (rd.after || []).forEach(u => unreadStep(u, r));
    });
    return out;
  }
  const c = D.cand;
  if (c.type === 'granny') { // one square, worked as written
    const sq = c.cols * c.rowsN, tag = `(square 1 of ${sq})`;
    const ch = (r, k, n, note) => push({ kind: 'granny', r, op: 'ch', st: 'ch', node: -1, label: `Rnd ${r + 1}: ch ${k} of ${n}${note ? ' ' + note : ''} ${tag}` });
    const dc = (r, d, n, note) => push({ kind: 'granny', r, op: 'dc', st: 'dc', made: d, of: n, node: -1, label: `Rnd ${r + 1}, dc ${d} of ${n}${note ? ': ' + note : ''} ${tag}` });
    const sl = (r, note) => push({ kind: 'granny', r, op: 'slst', st: 'slst', node: -1, label: `Rnd ${r + 1}: sl st ${note} ${tag}` });
    for (let r = 0; r < c.R; r++) {
      const n = 12 * (r + 1); let d = 0;
      if (r === 0) { for (let k = 1; k <= 4; k++) ch(0, k, 4); sl(0, 'to form the ring'); }
      else sl(r, 'across to the corner space');
      for (let k = 1; k <= 3; k++) ch(r, k, 3, '(counts as the first dc)'); d++;
      const groups = [];
      if (r === 0) { groups.push(2, 'ch2', 3, 'ch2', 3, 'ch2', 3, 'ch2'); }
      else for (let side = 0; side < 4; side++) { groups.push(side === 0 ? 2 : 3, 'ch2', 3, 'ch1'); for (let gq = 0; gq < r - 1; gq++) groups.push(3, 'ch1'); }
      for (const gq of groups) {
        if (typeof gq === 'number') for (let k = 0; k < gq; k++) dc(r, ++d, n);
        else { const m = +gq[2]; for (let k = 1; k <= m; k++) ch(r, k, m, m === 2 ? '(corner)' : '(between groups)'); }
      }
      sl(r, 'to the top of the ch 3 to join');
    }
    return out;
  }
  const tube = c.type === 'tube', rib = c.st === 'rib', st = rib ? 'dc' : c.st, tc = ST[st].tc, n = c.n;
  const fch = tube ? n : n + tc;
  for (let k = 1; k <= fch; k++) push({ kind: 'row', row: 0, op: 'ch', st: 'ch', x: tube ? k / n : k / fch, node: -1, label: `Foundation: ch ${k} of ${fch}` });
  if (tube) push({ kind: 'row', row: 0, op: 'slst', st: 'slst', x: 1, node: -1, label: 'Foundation: sl st to the first ch to make a ring' });
  const unit = tube ? 'Rnd' : 'Row';
  for (let row = 1; row <= c.rows; row++) {
    if (row > 1 || tube) for (let k = 1; k <= tc; k++) push({ kind: 'row', row, op: 'ch', st: 'ch', x: tube || row % 2 ? 0 : 1, node: -1, label: `${unit} ${row}: ${row > 1 && !tube ? 'turn, ' : ''}ch ${k} of ${tc} (does not count as a stitch)` });
    for (let k = 1; k <= n; k++) {
      let op = st;
      if (rib && row > 1 && k > 1 && k < n) op = (k % 2 === 0) ? 'fpdc' : 'bpdc';
      const x = tube || row % 2 ? (k - 0.5) / n : 1 - (k - 0.5) / n; // turned rows run back the other way
      push({ kind: 'row', row, op, st: op, made: k, of: n, x, node: -1, label: `${unit} ${row}, stitch ${k} of ${n}: ${OP_NAME[op]}${row === 1 && !tube ? ` into the ${ord(k + tc)} ch from the hook` : ''}` });
    }
    if (tube) push({ kind: 'row', row, op: 'slst', st: 'slst', x: 1, node: -1, label: `Rnd ${row}: sl st to the first stitch to join` });
  }
  return out;
}
// the motions of one stitch: a = what the hook does, loops = loops on the hook afterwards
function phasesFor(step) {
  if (step.op === 'unread') return [{ a: 'none', text: 'This line needs a human (or the AI fallback later)', d: 0, loops: 1 }];
  const P = [], at = (a, text, d = 0, set) => P.push({ a, text, d, set });
  const ins = step.into === 'ring' ? 'insertRing' : step.into === 'same' ? 'insertSame' : 'insert';
  const yo = (t = 'Yarn over') => at('yo', t);
  const pull = (t) => at('pull', t, 1);
  const thru = (k, t) => at('through', t || `Yarn over and pull through ${k === 1 ? 'the loop' : k + ' loops'}`, 1 - k);
  const pre = () => at('yoKeep', 'Yarn over before inserting', 1);
  const body = (st, where) => {
    if (st === 'sc') { at(where, where === 'insertRing' ? 'Insert the hook into the ring' : where === 'insertSame' ? 'Insert into the same stitch again' : 'Insert the hook under both loops'); yo(); pull('Pull up a loop (2 loops on hook)'); thru(2); }
    else if (st === 'hdc') { pre(); at(where, 'Insert the hook'); yo(); pull('Pull up a loop (3 loops on hook)'); thru(3); }
    else { pre(); at(where, where === 'insertFront' ? 'Insert the hook around the post from the front' : where === 'insertBack' ? 'Insert the hook around the post from the back' : 'Insert the hook'); yo(); pull('Pull up a loop (3 loops on hook)'); thru(2, 'Yarn over, pull through 2 (2 left)'); thru(2, 'Yarn over, pull through the last 2'); }
  };
  if (step.op === 'ch') { yo(); thru(1, 'Pull through the loop on the hook'); }
  else if (step.op === 'slst') { at('insert', 'Insert the hook'); yo(); at('through', 'Pull through the stitch and the loop on the hook', 0); }
  else if (step.op === 'fpdc') body('dc', 'insertFront');
  else if (step.op === 'bpdc') body('dc', 'insertBack');
  else if (step.op === 'dec') {
    const k = step.st === 'sc' ? 0 : 1;
    if (k) pre(); at('insert', 'Insert into the first stitch'); yo(); pull('Pull up a loop');
    if (step.st === 'dc') thru(2, 'Yarn over, pull through 2');
    if (k) pre(); at('insertNext', 'Insert into the next stitch'); yo(); pull('Pull up a loop');
    if (step.st === 'dc') thru(2, 'Yarn over, pull through 2');
    let L = 1; for (const p of P) L += p.d; thru(L, `Yarn over, pull through all ${L} loops`);
  }
  else body(step.st, ins);
  let L = 1; for (const p of P) { L += p.d; p.loops = L; }
  return P;
}
// which line of the pattern text a step belongs to
function lineForStep(lines, st) {
  const range = (re, n) => lines.findIndex(l => { const m = l.match(re); return m && +m[1] <= n && n <= +(m[2] || m[1]); });
  if (st.kind === 'unread') return lines.findIndex(l => l.trim() === st.text);
  if (st.kind === 'round') return range(/^R(\d+)(?:–R(\d+))?\b/, st.r + 1);
  if (st.kind === 'granny') return range(/^Rnds? (\d+)(?:–(\d+))?\b/, st.r + 1);
  if (st.row === 0) return lines.findIndex(l => /^Ch \d+/.test(l));
  return range(/^(?:Rows?|Rnds?) (\d+)(?:–(\d+))?\b/, st.row);
}
const EXAMPLES = [
  'Slouchy beanie for a 58 cm head in worsted, ribbed brim',
  'Chunky scarf, 180 cm long, with fringe',
  'Baby blanket in dc stripes',
  'Newborn beanie in DK with a pompom',
  'Granny square throw blanket in worsted',
  'Infinity cowl in super bulky yarn, hdc',
  "Men's XL beanie, bulky, 6.5 mm hook, folded brim",
  'Toddler bucket hat in DK',
  'Beret in sport weight for a 22 inch head',
  'Skinny scarf 150 x 12 cm in fingering, ribbed',
  'Twin size blanket in super bulky, dc, with a border',
  'Amigurumi egg, 8 cm tall, in DK',
];
// CORE-END
