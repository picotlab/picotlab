// ---------- app ----------
const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const YARNS = [['Coral', '#ef7b6c'], ['Marigold', '#eaa83a'], ['Lavender', '#b4a1e2'], ['Denim', '#5b7fc4'], ['Oat', '#e9dfc8'], ['Moss', '#8fae6a']];
const S = { raw: null, spec: null, g: null, kind: null, P: null, ga: null, flat: null, lambda: 0.7, running: false, D: null, sim: null, user: false,
  yarn: 3, skin: true, form: true, tryHead: null, stretch: false, pal: ['#5b7fc4', '#e9dfc8', '#ef7b6c', '#8fae6a'], scarfOn: 'rod', lastRate: 0, rateEvals: 0, rateT: performance.now(), dirty: false, lastShow: 0, fit: true };
const fmtN = n => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));
const inch = cm => { const v = cm / 2.54; return v >= 10 ? Math.round(v) + '″' : (Math.round(v * 4) / 4) + '″'; };
const esc = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// ---------- palette ----------
const palHex = L => S.pal[Math.max(0, LETTERS.indexOf(L))];
const usedLetters = s => [...new Set(colourSeq(s).map(q => q[0]))].concat(s.style === 'granny' ? [] : []).sort();
function seqPeriod(s) { return colourSeq(s).reduce((a, q) => a + q[1], 0); }

// ---------- spec fields ----------
const ITEMS = [['hat', 'Hat'], ['scarf', 'Scarf'], ['cowl', 'Cowl'], ['blanket', 'Blanket'], ['ami', 'Amigurumi']];
function sizeList(s) { return s.item === 'hat' ? HAT_SIZES : s.item === 'scarf' ? SCARF_SIZES : s.item === 'cowl' ? COWL_SIZES : s.item === 'blanket' ? BLANKET_SIZES : null; }
function styleList(s) {
  if (s.item === 'hat') return Object.entries(HAT_STYLES);
  if (s.item === 'blanket') return [['rows', 'Worked in rows'], ['granny', 'Granny squares']];
  if (s.item === 'cowl') return [['cowl', 'Cowl'], ['infinity', 'Infinity / Möbius']];
  if (s.item === 'ami') return Object.entries(SHAPES).map(([k, v]) => [k, v.label]);
  return null;
}
function renderFields() {
  const s = S.spec, f = $('fields'), g = S.g, set = S.raw.set || {};
  $('specSec').style.display = s.style === 'pasted' ? 'none' : ''; // a pasted pattern has its own yarn/hook pickers by the paste box
  if (s.style === 'pasted') { f.innerHTML = ''; return; }
  const cls = k => set[k] ? ' class="from"' : '';
  const sel = (k, label, opts, val, wide) => `<label${wide ? ' class="wide"' : ''}><span${cls(k)}>${label}</span><select data-k="${k}">${opts.map(([v, t]) => `<option value="${v}"${String(v) === String(val) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  const num = (k, label, val, step = 0.5, ph = '') => `<label><span${cls(k)}>${label}</span><input type="number" data-k="${k}" step="${step}" min="0" value="${val == null ? '' : val}" placeholder="${ph}"></label>`;
  const chk = (k, label, val) => `<label class="chk"><input type="checkbox" data-k="${k}"${val ? ' checked' : ''}><span${cls(k)}>${label}</span></label>`;
  let h = sel('item', 'Item', ITEMS, s.item);
  const sl = styleList(s); h += sl ? sel('style', 'Style', sl, s.style) : '<label></label>';
  const sz = sizeList(s);
  if (sz) h += sel('size', 'Size', sz.map(e => [e[0], `${e[1]} · ${e[2]}${s.item === 'hat' ? ' cm head' : ' × ' + e[3] + ' cm'}`]).concat([['custom', 'Custom']]), isPreset(s) ? s.size : 'custom', true);
  if (s.item === 'hat') h += num('head', 'Head (cm)', s.head) + num('depth', 'Depth (cm)', s.depth) + num('ease', 'Negative ease (%)', r1(s.ease * 100), 1);
  if (s.item === 'scarf') h += num('length', 'Length (cm)', s.length) + num('width', 'Width (cm)', s.width);
  if (s.item === 'cowl') h += num('circ', 'Around (cm)', s.circ) + num('height', 'Height (cm)', s.height);
  if (s.item === 'blanket') h += num('width', 'Width (cm)', s.width) + num('length', 'Length (cm)', s.length);
  if (s.item === 'ami') h += num('height', 'Height (cm)', s.height);
  if (s.item !== 'hat' && s.item !== 'ami') h += '<label></label>';
  h += sel('yarn', 'Yarn weight', YARN.map(y => [y.n, `${y.n} ${y.name}`]), s.yarn) + num('hook', 'Hook (mm)', s.hook, 0.25, String(defaultHook(s)));
  const gs = s.gauge && s.gauge.st || (s.item === 'ami' ? 'sc' : s.stitch), p = g.per10(gs);
  h += num('gsts', `Gauge: ${gs} / 10 cm`, s.gauge ? s.gauge.sts : '', 0.5, r1(p.sts)) + num('grows', `Rows / 10 cm`, s.gauge ? s.gauge.rows || '' : '', 0.5, r1(p.rows));
  if (s.item !== 'ami' && s.style !== 'granny') h += sel('stitch', 'Stitch', [['sc', 'sc · single'], ['hdc', 'hdc · half double'], ['dc', 'dc · double']], s.stitch);
  if (s.item === 'hat' && s.style !== 'bucket') h += sel('brim', 'Brim', [['ribbed', 'Ribbed (FPdc/BPdc)'], ['folded', 'Folded cuff (sc)'], ['plain', 'Plain sc band'], ['none', 'None']], s.brim);
  if (s.item !== 'ami') h += sel('stripes', 'Stripes', [[0, 'None'], [1, 'Every row'], [2, 'Every 2 rows'], [3, 'Every 3 rows'], [4, 'Every 4 rows'], [6, 'Every 6 rows']], s.stripes);
  if (s.item !== 'ami') {
    h += sel('colors', 'Colours', [[1, '1 colour'], [2, '2 colours'], [3, '3 colours'], [4, '4 colours']], s.colors);
    if (s.style === 'granny') h += sel('layout', 'Square layout', [['same', 'All squares alike'], ['scrappy', 'Scrappy (colours rotate)'], ['checker', 'Checkerboard']], s.layout);
    if (s.colors > 1 || s.seq) h += `<label class="wide"><span${cls('seq')}>Colour sequence (${s.style === 'granny' ? 'rounds' : s.item === 'hat' ? 'rounds' : 'rows'}), e.g. A4 B2 C2</span><input type="text" data-k="seq" value="${esc(s.seq)}" placeholder="${esc(seqText(colourSeq(s)))}" style="font:13px var(--mono);color:var(--ink);background:var(--chip);border:1px solid var(--line);border-radius:7px;padding:6px 7px"></label>`;
    h += `<label class="wide"><span>Yarn colours</span><span style="display:flex;gap:8px;align-items:center">${LETTERS.slice(0, Math.max(1, s.colors)).split('').map((L, i) => `<span style="display:flex;align-items:center;gap:3px;font:600 12px var(--mono);color:var(--ink)">${L}<input type="color" data-p="${i}" value="${S.pal[i]}" aria-label="Colour ${L}" style="width:34px;height:26px;border:1px solid var(--line);border-radius:6px;padding:1px;background:var(--chip)"></span>`).join('')}</span></label>`;
  }
  if ((s.item === 'scarf' || s.item === 'cowl' || (s.item === 'blanket' && s.style !== 'granny'))) h += chk('rib', 'Ribbed (FPdc/BPdc)', s.rib);
  if (s.item === 'hat') h += chk('pompom', 'Pompom', s.pompom);
  if (s.item === 'scarf') h += chk('fringe', 'Fringe', s.fringe);
  if (s.item === 'blanket') h += chk('border', 'Border', s.border);
  f.innerHTML = h;
  f.querySelectorAll('[data-k]').forEach(el => el.addEventListener('change', () => fieldChanged(el)));
  f.querySelectorAll('[data-p]').forEach(el => el.addEventListener('input', () => { S.pal[+el.dataset.p] = el.value; recolour(); }));
}
function isPreset(s) {
  const e = (sizeList(s) || []).find(x => x[0] === s.size); if (!e) return false;
  if (s.item === 'hat') return Math.abs(s.head - e[2]) < 0.05;
  const [a, b] = s.item === 'scarf' ? [s.length, s.width] : s.item === 'cowl' ? [s.circ, s.height] : [s.width, s.length];
  return Math.abs(a - e[2]) < 0.05 && Math.abs(b - e[3]) < 0.05;
}
function fieldChanged(el) {
  const k = el.dataset.k, v = el.type === 'checkbox' ? el.checked : el.value, R = S.raw;
  R.set = R.set || {};
  const put = (key, val) => { R[key] = val; R.set[key] = true; };
  const unset = (...ks) => ks.forEach(x => { delete R[x]; delete R.set[x]; });
  if (k === 'item') { S.raw = { item: v, set: { item: true }, yarn: R.yarn, hook: R.hook, gauge: R.gauge }; ['yarn', 'hook', 'gauge'].forEach(x => R.set[x] && (S.raw.set[x] = true)); if (v === 'ami') { delete S.raw.yarn; delete S.raw.set.yarn; } }
  else if (k === 'style') { put('style', v); unset('depth', 'ease', 'brim', 'stitch', 'circ', 'height', 'length', 'width'); if (S.spec.item === 'hat') { R.head = S.spec.head; R.set.head = true; } }
  else if (k === 'size') {
    const e = (sizeList(S.spec) || []).find(x => x[0] === v); if (!e) return;
    if (S.spec.item === 'hat') { put('head', e[2]); unset('depth'); }
    else if (S.spec.item === 'scarf') { put('length', e[2]); put('width', e[3]); }
    else if (S.spec.item === 'cowl') { put('circ', e[2]); put('height', e[3]); if (v === 'infinity') put('style', 'infinity'); }
    else { put('width', e[2]); put('length', e[3]); }
  }
  else if (k === 'ease') { if (v === '') unset('ease'); else put('ease', +v / 100); }
  else if (k === 'gsts' || k === 'grows') {
    const g0 = S.spec.gauge || { sts: 0, rows: 0, st: S.spec.item === 'ami' ? 'sc' : S.spec.stitch }, n = +v || 0;
    const gg = Object.assign({}, g0, k === 'gsts' ? { sts: n } : { rows: n });
    if (!gg.sts) unset('gauge'); else put('gauge', gg);
  }
  else if (['yarn', 'stripes', 'colors'].includes(k)) { put(k, +v); if (k === 'colors' && R.set.seq) { const q = parseSeq(R.seq).filter(x => LETTERS.indexOf(x[0]) < +v); if (q.length) put('seq', seqText(q)); else unset('seq'); } }
  else if (k === 'seq') { if (!parseSeq(v).length) unset('seq'); else put('seq', v); }
  else if (['hook', 'head', 'depth', 'length', 'width', 'circ', 'height'].includes(k)) { if (v === '' || !(+v > 0)) unset(k); else put(k, +v); }
  else if (k === 'brim') { put('brim', v); put('rib', v === 'ribbed'); }
  else put(k, v);
  applySpec(true);
}
function recolour() { colorize(); drawSchematic(); if (S.D) { const keep = $('pattern').value; if (!S.user) $('pattern').value = patternText(S.D); else $('pattern').value = keep; showYarn(S.D); } }
function applySpec(fromFields) {
  S.spec = normalizeSpec(S.raw); S.spec.cal = typeof CAL !== 'undefined' && CAL ? calActive() : null; S.g = gaugeOf(S.spec);
  if (typeof calChip === 'function') calChip();
  renderFields();
  const t = specToPrompt(S.spec), un = (S.raw.unknown || []).filter(w => !/^\d/.test(w));
  $('parsed').innerHTML = (fromFields ? 'Spec as words: ' : 'Read as: ') + `<i>${esc(t)}</i>` + (un.length && !fromFields ? `<br>Not used: ${un.map(esc).join(', ')}` : '');
  reseed(); start();
}
function designFromPrompt() { S.raw = parsePrompt($('prompt').value); applySpec(false); }

// ---------- optimizer ----------
function reseed() {
  S.user = false; S.fit = true; S.tryHead = null; PASTE = null;
  if (S.spec.item === 'hat' || S.spec.item === 'ami') {
    S.kind = 'rounds'; S.P = roundPlan(S.spec, S.g); S.ga = makeGA(S.P, S.lambda); S.flat = null;
  } else {
    S.kind = 'flat'; S.P = null; S.ga = null;
    S.flat = { cands: flatCandidates(S.spec, S.g), i: 0, best: null, bestScore: Infinity, evals: 0, gen: 0, hist: [], stall: 0 };
  }
  $('lamRow').hidden = S.kind !== 'rounds';
  S.dirty = true; showBest();
}
const OPT = () => S.ga || S.flat;
function optStep() {
  if (S.ga) return gaStep(S.ga);
  const F = S.flat; let imp = false; const end = Math.min(F.cands.length, F.i + 40);
  for (; F.i < end; F.i++) { const v = evalFlat(F.cands[F.i], S.spec, S.g); F.evals++; if (v < F.bestScore) { F.bestScore = v; F.best = F.cands[F.i]; imp = true; } }
  F.gen++; if (F.i >= F.cands.length) F.stall = 1e9; return imp;
}
function start() { S.running = true; OPT().stall = 0; if (S.flat && S.flat.i >= S.flat.cands.length) S.flat.stall = 1e9; updateGo(); }
function stop(msg) { S.running = false; updateGo(msg); if (S.dirty) showBest(); }
function updateGo(msg) {
  const b = $('go'); b.textContent = S.running ? 'Stop' : 'Search'; b.classList.toggle('running', S.running);
  const pill = $('fitPill');
  if (S.running) { pill.textContent = 'searching'; pill.style.background = css('--pill-fit'); }
  else if (msg) { pill.textContent = msg; pill.style.background = css('--pill-good'); }
  else if (S.user) { pill.textContent = 'your edits'; pill.style.background = css('--pill-warn'); }
  else { pill.textContent = 'paused'; pill.style.background = css('--pill-muted'); }
}
function showBest() {
  if (S.kind === 'rounds') {
    if (!S.ga.best) { optStep(); }
    const c = [...S.ga.best]; showDesign({ kind: 'rounds', spec: S.spec, g: S.g, counts: c, st: S.P.st, rounds: roundsFromCounts(c, S.P.st) });
  } else {
    if (!S.flat.best) { while (S.flat.i < S.flat.cands.length && !S.flat.best) optStep(); if (!S.flat.best) optStep(); }
    showDesign({ kind: 'flat', spec: S.spec, g: S.g, cand: S.flat.best });
  }
  S.dirty = false; S.lastShow = performance.now();
}
function patternText(D) {
  const s = D.spec, g = D.g, y = g.yarn, p = YARN[s.yarn], head = [];
  const name = s.item === 'hat' ? `${HAT_STYLES[s.style]} hat` : s.item === 'blanket' ? (s.style === 'granny' ? 'Granny square blanket' : 'Blanket') : s.item === 'cowl' ? (s.style === 'infinity' ? 'Infinity cowl' : 'Cowl') : s.item === 'scarf' ? 'Scarf' : `Amigurumi ${SHAPES[s.style].label.toLowerCase()}`;
  const size = (sizeList(s) || []).find(e => e[0] === s.size);
  head.push(`${name} · ${s.item === 'hat' ? `${size ? size[1] + ', ' : ''}${s.head} cm head` : sizeLine(D)} · ${p.name} (#${p.n}) · ${g.hook} mm hook`);
  const gs = D.kind === 'rounds' ? (s.item === 'hat' ? s.stitch : 'sc') : (D.cand.type === 'granny' ? 'dc' : D.cand.st === 'rib' ? 'dc' : D.cand.st), pp = g.per10(gs);
  head.push(`Gauge: ${r1(pp.sts)} ${gs} and ${r1(pp.rows)} rows = 10 cm. ${g.src === 'profile' ? `From your calibration profile “${g.profile}”.` : g.src === 'typed' ? 'From the gauge you gave.' : 'Standard for the yarn weight; change hook size to match.'}${g.kw !== 1 || g.kh !== 1 ? ` Finished-piece correction applied (width × ${g.kw.toFixed(3)}, height × ${g.kh.toFixed(3)}).` : ''}`);
  const E = estimate(D);
  head.push(`Yarn: about ${Math.round(E.m)} m / ${Math.round(E.yd)} yd (${Math.round(E.grams)} g of ${y.name.toLowerCase()})${s.stripes || s.style === 'granny' ? ', split between colours' : ''}.`);
  let body;
  if (D.kind === 'rounds') {
    const sum = roundsSummary(D.counts, D.st, g, s), ab = s.item === 'hat' ? s.stitch : 'sc', tc = ST[ab].tc;
    if (s.item === 'hat') head.push(`Finished: ${r1(sum.brimC)} cm around the brim unstretched (${Math.round((1 - sum.brimC / s.head) * 100)}% negative ease), ${r1(sum.depth)} cm crown to edge.`);
    else head.push(`Finished: about ${r1(sum.height)} cm tall, ${r1(sum.widest / Math.PI)} cm across.`);
    head.push(s.item === 'hat' ? `Joined rounds: ch ${tc} to start each round (does not count as a st), sl st to the first st to join. inc = 2 ${ab} in the same st; dec = ${ab}2tog.` : 'Spiral rounds, no joining; mark the first st. inc = 2 sc in the same st; dec = invisible decrease.');
    if (D.st.includes('rib')) head.push('rib rounds: FPdc around the post of the FPdc below and BPdc around the BPdc below.');
    body = formatRounds(D.rounds);
    body += s.item === 'hat' ? (s.brim === 'folded' ? '\nFold the cuff up. Fasten off and weave in ends.' : '\nFasten off and weave in ends.') + (s.pompom ? `\nMake a ${Math.round(clamp(s.head * 0.12, 4, 10))} cm pompom and tie it to the crown.` : '') : '\nStuff firmly as you go. Fasten off, close the last round and weave in.';
  } else {
    const F = flatDims(D.cand, s, g);
    head.push(`Finished: ${sizeLine(D)}.${s.item !== 'cowl' && D.cand.type !== 'granny' ? ' The turning chain does not count as a stitch.' : ''}`);
    body = formatFlat(D.cand, s, g);
    if (s.border) body += '\nBorder: join yarn in any corner, 2 rounds of sc around, 3 sc in each corner.';
    if (s.fringe) body += `\nFringe: cut ${2 * Math.ceil(D.cand.n / 2) * 2} strands of 30 cm; knot 2 strands through every other st along both short ends; trim to 12 cm.`;
    body += '\nFasten off and weave in ends. Block to ' + r1(F.W) + ' × ' + r1(F.L) + ' cm.';
  }
  head.push(...colourLines(D));
  return head.join('\n') + '\n\n' + body;
}
function showYarn(D) {
  const E = estimate(D), Y = colourYardage(D), ks = Object.keys(Y);
  $('bYarnK').innerHTML = ks.length > 1 ? 'yarn: ' + ks.map(L => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${palHex(L)};vertical-align:middle"></span> ${L} ${Math.round(Y[L].m)} m`).join(' · ') : `yarn, about ${Math.round(E.grams)} g (${E.balls} × 100 g)`;
}
function colourLines(D) {
  const s = D.spec, Y = colourYardage(D), ks = Object.keys(Y); if (ks.length < 2) return [];
  const seq = colourSeq(s), unit = D.kind === 'rounds' || D.cand.type !== 'rows' ? 'round' : 'row';
  const out = [`Colours: ${ks.map(L => `${L} ${palHex(L)} about ${Math.round(Y[L].m)} m (${Math.round(Y[L].grams)} g)`).join('; ')}.`];
  if (s.style === 'granny') out.push(`Colour per square round: ${seq.map(([L, n]) => `${L} for ${n} round${n > 1 ? 's' : ''}`).join(', ')}, repeating${s.layout === 'scrappy' ? '; rotate the starting colour on each square (scrappy)' : s.layout === 'checker' ? '; swap the first two colours on alternate squares (checkerboard)' : ''}. Fasten off at each change and join the new colour in a corner.`);
  else out.push(`Colour sequence: ${seq.map(([L, n]) => `${n} ${unit}${n > 1 ? 's' : ''} ${L}`).join(', ')}, repeated. Change colour on the last yarn over of the ${unit} before; carry unused yarn up the side${unit === 'round' ? ' at the join' : ''}.`);
  return out;
}
function sizeLine(D) {
  const s = D.spec;
  if (D.kind === 'rounds' && D.pasted) { const m = roundsSummary(D.counts, D.st, D.g, s); return `${r1(m.widest)} cm around at the widest · ${m.rounds} rounds`; }
  if (D.kind === 'rounds') { const m = roundsSummary(D.counts, D.st, D.g, s); return s.item === 'hat' ? `${r1(m.brimC)} cm around · ${r1(m.depth)} cm deep` : `${r1(m.height)} cm tall`; }
  const F = flatDims(D.cand, s, D.g);
  return s.item === 'cowl' ? `${r1(F.W)} cm around × ${r1(F.L)} cm tall` : `${r1(F.W)} × ${r1(F.L)} cm`;
}
function showDesign(D, keepText) {
  S.D = D;
  if (!keepText) { $('pattern').value = patternText(D); $('warns').innerHTML = ''; }
  const s = D.spec, E = estimate(D);
  $('pieceTitle').textContent = s.item === 'hat' ? HAT_STYLES[s.style] + ' hat' : s.item === 'ami' ? 'Amigurumi ' + SHAPES[s.style].label.toLowerCase() : s.item[0].toUpperCase() + s.item.slice(1);
  $('pieceSub').textContent = `${YARN[s.yarn].name} · ${D.g.hook} mm`;
  if (D.pasted) { const m = roundsSummary(D.counts, D.st, D.g, s); $('bSize').textContent = `${r1(m.widest)} cm around`; }
  else if (D.kind === 'rounds') { const m = roundsSummary(D.counts, D.st, D.g, s); $('bSize').textContent = s.item === 'hat' ? `${r1(m.brimC)} cm · ${inch(m.brimC)}` : `${r1(m.height)} cm tall`; }
  else { const F = flatDims(D.cand, s, D.g); $('bSize').textContent = `${Math.round(F.W)} × ${Math.round(F.L)} cm`; }
  $('bYarn').textContent = `${Math.round(E.m)} m · ${Math.round(E.yd)} yd`; showYarn(D);
  $('bTime').textContent = E.minutes < 90 ? Math.round(E.minutes) + ' min' : (E.minutes / 60).toFixed(1) + ' h';
  $('bSt').textContent = fmtN(E.total);
  $('patNote').textContent = D.kind === 'rounds' ? (s.item === 'hat' ? 'top-down, joined rounds' : 'spiral rounds') : D.cand.type === 'granny' ? 'motifs, joined' : D.cand.type === 'tube' ? 'joined rounds' : 'turned rows';
  buildScene(D); drawSchematic(); updateStats(); renderFit();
  if (typeof W !== 'undefined' && W && W.on) walkSetup();
}
function updateStats() {
  const O = OPT(); if (!O) return;
  $('sEvals').textContent = fmtN(O.evals); $('sGen').textContent = fmtN(O.gen); $('sRate').textContent = fmtN(S.lastRate);
  const D = S.D; if (!D) return;
  let miss, txt;
  if (D.pasted) { const gs = D.pasted.gates, ok = gs.filter(G => G.status === 'ok').length, checked = gs.filter(G => G.status === 'ok' || G.status === 'bad').length; miss = checked - ok ? 9 : 0; txt = `${ok}/${checked}`; $('sErrK').textContent = 'rounds matching their printed count'; }
  else if (D.kind === 'rounds' && !(S.P && (S.P.R === D.counts.length))) { miss = 0; txt = '–'; $('sErrK').textContent = 'avg miss per round'; }
  else if (D.kind === 'rounds') { const P = D.counts.length === S.P.R ? S.P : roundPlan(D.spec, D.g); const p = evaluate(D.counts, P.R === D.counts.length ? P : S.P, S.lambda, true); miss = p.rms * TAU; txt = '±' + miss.toFixed(1) + ' st'; $('sErrK').textContent = 'avg miss per round'; }
  else { const T = flatTarget(D.spec), F = flatDims(D.cand, D.spec, D.g); miss = Math.max(Math.abs(F.W - T.W), Math.abs(F.L - T.L)); txt = '±' + miss.toFixed(1) + ' cm'; $('sErrK').textContent = 'size miss'; }
  $('sErr').textContent = txt; $('sErr').className = 'n ' + (miss < 1.5 ? 'tone-good' : miss < 4 ? 'tone-warn' : 'tone-bad');
  const s = D.spec;
  $('topinfo').innerHTML = `<b>${D.pasted ? 'pasted pattern' : S.user ? 'your edits' : 'best of ' + fmtN(O.evals)}</b><br>${esc(sizeLine(D))}<br>${S.formNote || ''}` + (S.stretch && S.sim && S.sim.type === 'rounds' ? '<br>stretch: <span style="color:#7fa0e0">slack</span> · <span style="color:#5cc98a">relaxed</span> · <span style="color:#f2c53d">snug</span> · <span style="color:#ff7a5e">over-stretched</span>' : '');
}

// ---------- fit check panel ----------
function renderFit() {
  const D = S.D, s = D.spec, sec = $('fitSec'), body = $('fitBody');
  const tone = t => css(t === 'good' ? '--good' : t === 'warn' ? '--warn' : '--bad');
  if (D.kind === 'rounds' && s.item === 'hat') {
    sec.hidden = false; const m = roundsSummary(D.counts, D.st, D.g, s), cur = S.tryHead || s.head;
    $('fitNote').textContent = `brim ${r1(m.brimC)} cm unstretched`;
    const rows = fitTable(m.brimC, m.depth, s.style);
    body.innerHTML = `<table class="fit"><tbody>${rows.map(r => `<tr data-h="${r.head}" class="${r.head === cur ? 'on' : ''}" tabindex="0"><td><span class="dot" style="background:${tone(r.tone)}"></span>${esc(r.label)}</td><td class="num">${r.head} cm</td><td class="num">${Math.round(r.ease * 100)}%</td><td>${esc(r.verdict)}${r.depthNote ? '; ' + esc(r.depthNote) : ''}</td></tr>`).join('')}</tbody></table>
      <div class="note">Click a size to try the hat on that head form. % is the stretch needed (negative ease); 3–12% is a comfortable beanie fit. Turn on Stretch map to see where the fabric pulls.</div>`;
    body.querySelectorAll('tr').forEach(tr => { const go = () => { S.tryHead = +tr.dataset.h; S.fit = true; buildScene(S.D); renderFit(); updateStats(); }; tr.onclick = go; tr.onkeydown = e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go()); });
  } else if (s.item === 'scarf') {
    sec.hidden = false; const F = flatDims(D.cand, s, D.g), dr = scarfDrape(F.L);
    $('fitNote').textContent = `${Math.round(F.L)} cm long`;
    body.innerHTML = `<div class="seg"><button data-on="rod" aria-pressed="${S.scarfOn === 'rod'}">On a rod</button><button data-on="neck" aria-pressed="${S.scarfOn === 'neck'}">Round a neck</button></div>
      <div class="note">Draped round the back of the neck the ends hang about ${Math.round(dr.draped)} cm each; wrapped once, about ${Math.round(dr.wrapped)} cm. ${dr.wrapped < 25 ? 'That is short for a wrap; add length for a cosy loop.' : ''}</div>`;
    body.querySelectorAll('button').forEach(b => b.onclick = () => { S.scarfOn = b.dataset.on; S.fit = true; buildScene(S.D); renderFit(); updateStats(); });
  } else sec.hidden = true;
}
// colour each stitch by how far its round is stretched (ring spring length / rest length)
function stretchColors() {
  const sim = S.sim; if (!G.ok || !sim || sim.type !== 'rounds' || !G.iL) return;
  const P = sim.pos, col = new THREE.Color(), stops = [[0.95, 0x5b7fc4], [1.03, 0x5cc98a], [1.12, 0xf2c53d], [1.25, 0xe2553f]], c2 = new THREE.Color();
  for (let i = 1; i < sim.N; i++) {
    const j = i * 3, k = sim.ringNext[i] * 3, L = Math.hypot(P[k] - P[j], P[k + 1] - P[j + 1], P[k + 2] - P[j + 2]) / sim.ws[sim.roundOf[i]];
    let q = 0; while (q < stops.length - 1 && L > stops[q + 1][0]) q++;
    if (q === stops.length - 1 || L <= stops[0][0]) col.setHex(stops[L <= stops[0][0] ? 0 : q][1]);
    else { const u = (L - stops[q][0]) / (stops[q + 1][0] - stops[q][0]); col.setHex(stops[q][1]).lerp(c2.setHex(stops[q + 1][1]), u); }
    G.iL.setColorAt(i - 1, col); G.iR.setColorAt(i - 1, col);
  }
  G.iL.instanceColor.needsUpdate = G.iR.instanceColor.needsUpdate = true;
}

// ---------- printable pattern sheet ----------
function sheetData() {
  const D = S.D, s = D.spec, g = D.g, E = estimate(D), Y = colourYardage(D), y = YARN[s.yarn];
  const text = $('pattern').value, body = text.split('\n\n').slice(1).join('\n\n') || text, head = text.split('\n\n')[0].split('\n');
  const title = head[0].split(' · ')[0], sub = head[0].split(' · ').slice(1).join(' · ');
  const st = D.kind === 'rounds' ? (s.item === 'hat' ? s.stitch : 'sc') : D.cand.type === 'granny' ? 'dc' : D.cand.st === 'rib' ? 'dc' : D.cand.st, p = g.per10(st);
  const size = sizeLine(D);
  const yarnLines = Object.keys(Y).length > 1 ? Object.keys(Y).map(L => `Colour ${L} (${palHex(L)}): about ${Math.round(Y[L].m)} m / ${Math.round(Y[L].m / 0.9144)} yd, ${Math.round(Y[L].grams)} g`) : [`About ${Math.round(E.m)} m / ${Math.round(E.yd)} yd of ${y.name.toLowerCase()} (#${y.n}) yarn, ${Math.round(E.grams)} g (${E.balls} × 100 g ball${E.balls > 1 ? 's' : ''})`];
  const notions = ['Tapestry needle for weaving in ends', 'Scissors'];
  if (D.kind === 'rounds') notions.push('Stitch marker for the start of each round');
  if (s.item === 'ami') notions.push('Toy stuffing');
  if (s.pompom) notions.push('Pompom maker or a piece of card');
  if (s.fringe) notions.push('A piece of card 15 cm wide to cut fringe strands');
  const notes = head.slice(1).filter(l => !/^(Gauge|Yarn|Finished):/.test(l));
  return { title, sub, size, E, yarnLines, hook: `${g.hook} mm${Object.entries(HOOK_US).find(([, v]) => v === g.hook) ? ' (US ' + Object.entries(HOOK_US).find(([, v]) => v === g.hook)[0].toUpperCase() + ')' : ''}`,
    gauge: `${r1(p.sts)} ${st} × ${r1(p.rows)} rows = 10 cm`, swatch: swatchFor(s, g, st), abbr: abbreviationsFor(text), notes, body: body.split('\n').filter(l => l.trim()), skill: skillLevel(D), notions };
}
function openSheet() {
  const d = sheetData(), t = m => m < 90 ? Math.round(m) + ' min' : (m / 60).toFixed(1) + ' h';
  $('shBody').innerHTML = `<h1 id="shTitle">${esc(d.title)}</h1><p class="sub">${esc(d.sub)}</p>
    <div class="glance"><div><span>Finished size</span><b>${esc(d.size)}</b></div><div><span>Yarn</span><b>${Math.round(d.E.m)} m · ${Math.round(d.E.yd)} yd</b></div><div><span>Hook</span><b>${esc(d.hook)}</b></div><div><span>Gauge</span><b>${esc(d.gauge)}</b></div><div><span>Skill</span><b>${d.skill}</b></div><div><span>Time</span><b>about ${t(d.E.minutes)}</b></div></div>
    <h3>Materials</h3><ul>${d.yarnLines.map(l => `<li>${esc(l)}</li>`).join('')}<li>${esc(d.hook)} crochet hook, or the size that gets gauge</li>${d.notions.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
    <h3>Gauge swatch</h3><p>${esc(d.swatch)}</p>
    <h3>Abbreviations</h3><div class="abbr">${d.abbr.map(([a, m]) => `<b>${esc(a)}</b><span>${esc(m)}</span>`).join('')}</div>
    ${d.notes.length ? `<h3>Notes</h3><ul>${d.notes.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
    <h3>Instructions</h3><table class="steps"><tbody>${d.body.map(l => { const x = splitLine(l); return x.label || x.count ? `<tr><td>${esc(x.label)}</td><td>${esc(x.body)}</td><td>${x.count ? '[' + esc(x.count) + ']' : ''}</td></tr>` : `<tr class="note"><td></td><td colspan="2">${esc(l)}</td></tr>`; }).join('')}</tbody></table>
    <p class="sub" style="margin-top:14px">Counts in [ ] are the stitches you should have at the end of the row or round. Made with Picotlab crochet lab; sizes and yardage are estimates from gauge, so check your swatch.</p>`;
  $('sheet').hidden = false; $('shCopy').focus();
}
function sheetText() {
  const d = sheetData(), out = [d.title.toUpperCase(), d.sub, '', `Finished size: ${d.size}`, `Skill: ${d.skill}`, `Gauge: ${d.gauge}`, '', 'MATERIALS', ...d.yarnLines.map(l => '- ' + l), `- ${d.hook} crochet hook`, ...d.notions.map(l => '- ' + l), '', 'GAUGE SWATCH', d.swatch, '', 'ABBREVIATIONS', ...d.abbr.map(([a, m]) => `${a} = ${m}`)];
  if (d.notes.length) out.push('', 'NOTES', ...d.notes);
  out.push('', 'INSTRUCTIONS', ...d.body);
  return out.join('\n');
}

// ---------- charts ----------
function fitCanvas(cv) { const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (cv.width !== Math.round(r.width * d) || cv.height !== Math.round(r.height * d)) { cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); } const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); return { g, w: r.width, h: r.height }; }
function drawSchematic() {
  const { g, w, h } = fitCanvas($('schem')); g.clearRect(0, 0, w, h); const D = S.D; if (!D || w < 60 || h < 60) return;
  const s = D.spec, ink = css('--ink'), mut = css('--muted'), fit = css('--fit'), tgt = css('--target');
  g.font = '11px ' + css('--mono'); g.lineWidth = 1.4;
  const label = (t, x, y, al = 'center') => { g.fillStyle = mut; g.textAlign = al; g.fillText(t, x, y); };
  if (D.kind === 'rounds') {
    const P = S.P, c = D.counts, dm = D.g.dims(s.item === 'hat' ? s.stitch : 'sc');
    const ws = D.st.map(x => x === 'rib' ? dm.w : D.g.dims(x).w), hs = D.st.map(x => D.g.dims(x).h);
    const r = [], z = []; let rp = 0, zp = 0; for (let i = 0; i < c.length; i++) { const ri = c[i] * ws[i] / TAU, dr = ri - rp; zp += Math.sqrt(Math.max(0, hs[i] * hs[i] - dr * dr)); r.push(ri); z.push(zp); rp = ri; }
    let mr = Math.max(...r), mz = Math.max(...z, 1);
    const tr = P && P.R === c.length && !D.pasted ? [...P.Rt] : null; if (tr) mr = Math.max(mr, ...tr);
    const pad = 22, sc = Math.min((w - pad * 2) / (2 * mr), (h - pad * 2) / mz), cx = w / 2, top = pad + (h - pad * 2 - mz * sc) / 2;
    const hat = s.item === 'hat', Y = v => hat ? top + v * sc : top + (mz - v) * sc;
    if (hat) { const k = s.head / TAU, hd = headDims(s.head); g.strokeStyle = css('--line'); g.setLineDash([3, 4]); g.beginPath(); g.ellipse(cx, Y(0) + hd.cu * sc, k * sc, hd.cu * sc, 0, Math.PI, TAU); g.ellipse(cx, Y(0) + hd.cu * sc, k * sc, hd.cl * sc, 0, 0, Math.PI); g.stroke(); const yb = Y(0) + hd.cu * sc; g.beginPath(); g.moveTo(cx - k * sc - 10, yb); g.lineTo(cx + k * sc + 10, yb); g.stroke(); g.setLineDash([]); label('ear tops', cx + k * sc + 12, yb + 4, 'left'); label('head ' + s.head + ' cm', cx, yb + 16); }
    if (tr) { g.strokeStyle = tgt; g.globalAlpha = 0.7; for (const sg of [1, -1]) { g.beginPath(); tr.forEach((v, i) => { const x = cx + sg * v * sc, y = Y(z[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); } g.globalAlpha = 1; }
    g.fillStyle = fit; g.strokeStyle = fit;
    const AS = D.pasted && D.pasted.assumed || []; for (const sg of [1, -1]) { for (let i = 0; i < c.length; i++) { g.beginPath(); g.setLineDash(AS[i] ? [4, 3] : []); g.moveTo(cx + (i ? sg * r[i - 1] * sc : 0), Y(i ? z[i - 1] : 0)); g.lineTo(cx + sg * r[i] * sc, Y(z[i])); g.stroke(); } g.setLineDash([]); if (D.pasted && SHAPES.pasted.closed) { g.beginPath(); g.moveTo(cx + sg * r[c.length - 1] * sc, Y(z[c.length - 1])); g.lineTo(cx, Y(z[c.length - 1])); g.stroke(); } for (let i = 0; i < c.length; i++) { g.beginPath(); g.arc(cx + sg * r[i] * sc, Y(z[i]), D.st[i] === 'rib' ? 2.8 : 2, 0, TAU); g.fill(); } }
    const m = roundsSummary(c, D.st, D.g, s);
    label(hat ? `${r1(m.brimC)} cm around` : `${r1(m.widest / Math.PI)} cm across`, cx, h - 6);
    if (D.pasted) { const A = D.pasted.assumed || [], nm = k => A.map((x, i) => x === k ? 'R' + (i + 1) : '').filter(Boolean).join(', '), a1 = nm('count'), a2 = nm('carry');
      let ly = 28; const wrap = t => { let line = ''; for (const wd of t.split(' ')) { const nx = line ? line + ' ' + wd : wd; if (line && g.measureText(nx).width > w - 12) { label(line, 6, ly, 'left'); ly += 13; line = wd; } else line = nx; } if (line) { label(line, 6, ly, 'left'); ly += 13; } };
      if (a1) wrap(`dashed: ${a1} drawn from the printed count`);
      if (a2) wrap(`dashed: ${a2} has no printed count, kept at the round before`); }
    label(`${c.length} rounds`, 6, 14, 'left'); label(`${r1(m.depth)} cm worked`, w - 6, 14, 'right');
    return;
  }
  const F = flatDims(D.cand, s, D.g), pad = 26, sc = Math.min((w - pad * 2) / F.W, (h - pad * 2) / F.L), x0 = (w - F.W * sc) / 2, y0 = (h - F.L * sc) / 2;
  const A = S.pal[0], seq = colourSeq(s);
  g.fillStyle = A; g.fillRect(x0, y0, F.W * sc, F.L * sc);
  const c = D.cand;
  if (c.type === 'granny') { const b = s.border ? 4 * D.g.h : 0; g.strokeStyle = 'rgba(0,0,0,.35)'; for (let i = 0; i < c.cols; i++) for (let j = 0; j < c.rowsN; j++) { const X = x0 + (b / 2 + i * F.side) * sc, Yv = y0 + (b / 2 + j * F.side) * sc, q = F.side * sc; for (let r = c.R - 1; r >= 0; r -= Math.max(1, Math.floor(c.R / 4))) { const qq = (q - 2) * (r + 1) / c.R; g.fillStyle = palHex(grannyColour(seq, s.layout, r, j * c.cols + i, i, j)); g.fillRect(X + q / 2 - qq / 2, Yv + q / 2 - qq / 2, qq, qq); } g.strokeRect(X + 1, Yv + 1, q - 2, q - 2); } }
  else if (seqPeriod(s) > 1 || s.colors > 1) { const rh = D.g.dims(c.st).h * sc; for (let r = 0; r < c.rows; r++) { g.fillStyle = palHex(colourAt(seq, r)); g.fillRect(x0, y0 + F.L * sc - (r + 1) * rh, F.W * sc, rh + 0.5); } }
  g.strokeStyle = ink; g.strokeRect(x0, y0, F.W * sc, F.L * sc);
  if (s.fringe) { g.strokeStyle = A; for (let x = x0 + 2; x < x0 + F.W * sc; x += 4) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 - 8); g.moveTo(x, y0 + F.L * sc); g.lineTo(x, y0 + F.L * sc + 8); g.stroke(); } }
  label(`${r1(F.W)} cm${s.item === 'cowl' ? ' around' : ''}`, w / 2, y0 - (s.fringe ? 11 : 5)); g.save(); g.translate(x0 - 8, h / 2); g.rotate(-Math.PI / 2); label(`${r1(F.L)} cm`, 0, 0); g.restore();
  label(c.type === 'granny' ? `${c.cols} × ${c.rowsN} squares, ${c.R} rounds` : `${c.n} sts × ${c.rows} ${c.type === 'tube' ? 'rnds' : 'rows'}`, w / 2, h - 6);
}
function drawConv() {
  const { g, w, h } = fitCanvas($('conv')); g.clearRect(0, 0, w, h); if (w < 20) return;
  const hs = OPT() && OPT().hist; if (!hs || hs.length < 2) return;
  const lo = Math.log(Math.min(...hs) + 1e-4), hi = Math.log(Math.max(...hs) + 1e-4);
  const X = i => 6 + (i / (hs.length - 1)) * (w - 12), Yv = v => 6 + (1 - (Math.log(v + 1e-4) - lo) / ((hi - lo) || 1)) * (h - 12);
  g.beginPath(); hs.forEach((v, i) => (i ? g.lineTo(X(i), Yv(v)) : g.moveTo(X(i), Yv(v)))); g.strokeStyle = css('--fit'); g.lineWidth = 1.6; g.stroke();
}

// ---------- physics: colliders ----------
function collide(pos, N, cols, pad, prv, fr) {
  for (let i = 0; i < N; i++) {
    const j = i * 3; let x = pos[j], y = pos[j + 1], z = pos[j + 2], hit = false;
    for (const c of cols) {
      if (c.t === 'ell') {
        if ((c.half === 'up' && y < c.c[1]) || (c.half === 'down' && y > c.c[1])) continue;
        const ax = c.r[0] + pad, ay = c.r[1] + pad, az = c.r[2] + pad, dx = (x - c.c[0]) / ax, dy = (y - c.c[1]) / ay, dz = (z - c.c[2]) / az, L2 = dx * dx + dy * dy + dz * dz;
        if (L2 < 1) { const L = Math.sqrt(L2) || 1e-6; x = c.c[0] + dx / L * ax; y = c.c[1] + dy / L * ay; z = c.c[2] + dz / L * az; hit = true; }
      } else if (c.t === 'cylY') {
        if (y > c.y0 && y < c.y1) { const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), R = c.r + pad; if (d < R) { const k = R / (d || 1e-6); x = c.x + dx * k; z = c.z + dz * k; hit = true; } }
      } else if (c.t === 'cylX') {
        if (x > c.x0 && x < c.x1) { const dy = y - c.y, dz = z - c.z, d = Math.hypot(dy, dz), R = c.r + pad; if (d < R) { const k = R / (d || 1e-6); y = c.y + dy * k; z = c.z + dz * k; hit = true; } }
      } else if (c.t === 'box') {
        const lo = c.min, hi = c.max;
        if (x > lo[0] - pad && x < hi[0] + pad && y > lo[1] - pad && y < hi[1] + pad && z > lo[2] - pad && z < hi[2] + pad) {
          const pen = [x - lo[0] + pad, hi[0] + pad - x, y - lo[1] + pad, hi[1] + pad - y, z - lo[2] + pad, hi[2] + pad - z]; let m = 0; for (let k = 1; k < 6; k++) if (pen[k] < pen[m]) m = k;
          if (m === 0) x = lo[0] - pad; else if (m === 1) x = hi[0] + pad; else if (m === 2) y = lo[1] - pad; else if (m === 3) y = hi[1] + pad; else if (m === 4) z = lo[2] - pad; else z = hi[2] + pad; hit = true;
        }
      }
    }
    if (y < pad) { y = pad; hit = true; }
    if (hit && prv) { prv[j] += (x - prv[j]) * fr; prv[j + 1] += (y - prv[j + 1]) * fr; prv[j + 2] += (z - prv[j + 2]) * fr; }
    pos[j] = x; pos[j + 1] = y; pos[j + 2] = z;
  }
}
// An anatomical head form, scaled by head circumference (measured at the brow line, round the widest part).
// y0 is the brow / ear-top line. Above it the cranium rises cu to the crown (about 11.5 cm on a 56 cm adult head);
// below it the face and jaw drop cl. Ears and a brow ridge are small landmarks the hat can sit on.
// c keeps the older body proportion for the neck and shoulders.
function headDims(head) {
  const s = head / 56, k = head / TAU, a = k * 0.93, b = k * 1.07, c = k * 1.12;
  const cu = 11.5 * s, cl = 1.1 * cu, earH = 6.2 * s, earW = 1.6 * s, earD = 3.4 * s, earTopBelow = 0.3 * s;
  const earDy = earTopBelow + earH / 2, earX = a * Math.sqrt(1 - (earDy / cl) ** 2) + earW * 0.3;
  return { s, k, a, b, c, cu, cl, ear: { h: earH, w: earW, d: earD, topBelowBrow: earTopBelow, x: earX, z: -0.05 * b },
    brow: { r: [a * 0.6, 0.8 * s, b * 0.47], above: 0, z: b * 0.55 } }; // set back inside the head: shows only as a ~2 mm ridge at the centre front
}
function headForm(head, lift = 0) {
  const H = headDims(head), { a, b, c, cu, cl, ear, brow } = H, y0 = 2.75 * c + 2 + lift, earY = y0 - ear.topBelowBrow - ear.h / 2;
  return Object.assign(H, { y0, top: y0 + cu, earTop: y0 - ear.topBelowBrow, cols: [
    { t: 'ell', c: [0, y0, 0], r: [a, cu, b], half: 'up', head: true },                 // cranium, brow line to crown
    { t: 'ell', c: [0, y0, 0], r: [a, cl, b], half: 'down', head: true },               // face and jaw, brow line to chin
    { t: 'ell', c: [-ear.x, earY, ear.z], r: [ear.w / 2, ear.h / 2, ear.d / 2], head: true }, // ears
    { t: 'ell', c: [ear.x, earY, ear.z], r: [ear.w / 2, ear.h / 2, ear.d / 2], head: true },
    { t: 'ell', c: [0, y0 + brow.above, brow.z], r: brow.r, head: true },               // brow ridge
    { t: 'cylY', x: 0, z: 0, r: a * 0.52, y0: y0 - 2.2 * c, y1: y0 - 1.0 * c },
    { t: 'ell', c: [0, y0 - 2.6 * c, 0], r: [a * 2.6, c * 0.72, b * 1.1] },
  ].concat(lift ? [{ t: 'cylY', x: 0, z: 0, r: a * 0.4, y0: 0, y1: y0 - 2.6 * c }] : []) });
}

// ---------- rounds simulation (hats, amigurumi): one node per stitch ----------
function buildRoundSim(D) {
  const s = D.spec, g = D.g, rounds = D.rounds, counts = countsFromRounds(rounds), main = s.item === 'hat' ? s.stitch : 'sc', dm = g.dims(main);
  const st = rounds.map(r => r.st), hs = st.map(x => g.dims(x).h), ws = st.map(x => x === 'rib' ? dm.w : g.dims(x).w);
  const pr = [], pz = []; let rp = 0, zp = 0; for (let i = 0; i < counts.length; i++) { const ri = counts[i] * ws[i] / TAU, dr = ri - rp; zp += Math.sqrt(Math.max(0, hs[i] * hs[i] - dr * dr)); pr.push(ri); pz.push(zp); rp = ri; }
  let N = 1; counts.forEach(c => (N += c));
  const hat = s.item === 'hat', form = hat ? headForm(S.tryHead || s.head) : null, pad = g.t * 0.6 + 0.05;
  const T = !hat ? SHAPES[s.style] : null, flip = T && T.flip, H = pz[pz.length - 1];
  const place = (r, z, a) => {
    if (hat) {
      const y = form.top + pad - z, dy = (y - form.y0) / ((y > form.y0 ? form.cu : form.cl) + pad), q = Math.max(0, 1 - dy * dy), ca = Math.cos(a), sa = Math.sin(a);
      const er = dy > 0 ? Math.sqrt(q) / Math.sqrt(ca * ca / ((form.a + pad) ** 2) + sa * sa / ((form.b + pad) ** 2)) : Math.min(r, (form.a + pad) * 1.02);
      const R = z < 0.3 ? r : Math.max(r, er + 0.05); return [R * ca, z < 0.3 ? form.top + pad : y, R * sa];
    }
    const y = flip ? H - z : z; return [r * Math.cos(a), y + 0.5, r * Math.sin(a)];
  };
  const pos = new Float32Array(N * 3), roundOf = new Int32Array(N), ringPrev = new Int32Array(N), ringNext = new Int32Array(N), par0 = new Int32Array(N), par1 = new Int32Array(N), kOf = new Int32Array(N);
  const sA = [], sB = [], sR = [], sK = [], tris = [], ang = new Float32Array(N), triEnd = [];
  const spring = (a, b, r, k) => { sA.push(a); sB.push(b); sR.push(r); sK.push(k); };
  const p0 = place(0, 0, 0); pos[0] = p0[0]; pos[1] = p0[1]; pos[2] = p0[2]; roundOf[0] = -1;
  let rnd = 12345; const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647) - 0.5;
  let start = 1, prevStart = 0, prevLen = 1;
  for (let r = 0; r < rounds.length; r++) {
    const n = counts[r], parents = [], w = ws[r], hh = hs[r];
    if (r === 0) for (let k = 0; k < n; k++) parents.push([0]);
    else { let j = 0; for (const o of rounds[r].ops) { const Pp = q => prevStart + (q % prevLen); if (o === 'S') { parents.push([Pp(j)]); j++; } else if (o === 'I') { parents.push([Pp(j)], [Pp(j)]); j++; } else { parents.push([Pp(j), Pp(j + 1)]); j += 2; } } }
    const phase = r === 0 ? 0 : ang[parents[0][0]];
    for (let k = 0; k < n; k++) {
      const id = start + k, p = parents[k];
      roundOf[id] = r; kOf[id] = k; par0[id] = p[0]; par1[id] = p[p.length - 1];
      ringPrev[id] = start + ((k - 1 + n) % n); ringNext[id] = start + ((k + 1) % n);
      const a = phase + TAU * (k + 0.5) / n; ang[id] = a;
      const q = place(pr[r] + rand() * 0.04 * w, pz[r] + rand() * 0.04 * w, a); pos[id * 3] = q[0]; pos[id * 3 + 1] = q[1]; pos[id * 3 + 2] = q[2];
      spring(id, ringNext[id], w, 1);
      spring(id, start + ((k + 2) % n), 2 * w * 0.985, 0.06);
      if (r === 0) spring(id, 0, Math.max(0.35 * w, n * w / TAU), 1);
      else { for (const qq of p) spring(id, qq, p.length > 1 ? Math.hypot(hh, w / 2) : hh, 1); const gp = par0[p[0]]; if (gp) spring(id, gp, (hh + hs[r - 1]) * 0.97, 0.06); }
    }
    for (let k = 0; k < n; k++) {
      const c = start + k, c2 = start + ((k + 1) % n), p = parents[k], pn = parents[(k + 1) % n];
      if (r === 0) { tris.push(c, c2, 0); continue; }
      if (p.length > 1) tris.push(c, p[1], p[0]);
      const lp = p[p.length - 1], fp = pn[0]; tris.push(c, c2, lp);
      if (fp !== lp) { tris.push(c2, fp, lp); spring(c2, lp, Math.hypot(hh, w), 0.5); }
    }
    prevStart = start; prevLen = n; start += n; triEnd.push(tris.length);
  }
  const sim = { type: 'rounds', triEnd, N, pos, prv: Float32Array.from(pos), roundOf, kOf, ringPrev, ringNext, par0, par1, counts, st, hs, ws, form, pad, hat, stuffed: !hat && T.closed,
    sA: Int32Array.from(sA), sB: Int32Array.from(sB), sR: Float32Array.from(sR), sK: Float32Array.from(sK), tris: Uint32Array.from(tris), nrm: new Float32Array(N * 3), sign: 1, frames: 0, maxFrames: 900, wm: dm.w, thick: g.t * 1.2 };
  normals(sim); let dot = 0; for (let i = 1; i < N; i++) { dot += sim.nrm[i * 3] * pos[i * 3] + sim.nrm[i * 3 + 2] * pos[i * 3 + 2]; } sim.sign = dot < 0 ? -1 : 1;
  return sim;
}
function normals(sim) {
  const { pos, nrm, tris } = sim; nrm.fill(0);
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t] * 3, b = tris[t + 1] * 3, c = tris[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b, c]) { nrm[q] += nx; nrm[q + 1] += ny; nrm[q + 2] += nz; }
  }
}
function springs(sim, iters, after) {
  const { pos, sA, sB, sR, sK } = sim, M = sA.length;
  for (let it = 0; it < iters; it++) {
    for (let s = 0; s < M; s++) {
      const a = sA[s] * 3, b = sB[s] * 3, dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, f = ((L - sR[s]) / L) * 0.5 * sK[s];
      pos[a] += dx * f; pos[a + 1] += dy * f; pos[a + 2] += dz * f; pos[b] -= dx * f; pos[b + 1] -= dy * f; pos[b + 2] -= dz * f;
    }
    if (after) after();
  }
}
function stepSim(sim) {
  const { N, pos, prv } = sim;
  if (sim.type === 'rounds') normals(sim);
  const grav = sim.grav || 0, pr = sim.stuffed ? 0.0035 * sim.wm * sim.sign : 0, nrm = sim.nrm, damp = sim.damp || 0.86;
  for (let i = 0; i < N; i++) {
    const j = i * 3;
    for (let d = 0; d < 3; d++) { const x = pos[j + d], v = (x - prv[j + d]) * damp; prv[j + d] = x; pos[j + d] = x + v + (pr ? pr * nrm[j + d] : 0); }
    pos[j + 1] -= grav;
  }
  if (sim.pull) for (let i = sim.pullFrom; i < N; i++) pos[i * 3 + 1] -= sim.pull;
  const after = sim.cols ? () => { collide(pos, N, sim.cols, sim.pad, prv, sim.fr || 0.2); if (sim.weld) sim.weld(); if (sim.brimY != null) for (let i = sim.pullFrom; i < N; i++) if (pos[i * 3 + 1] > sim.brimY) pos[i * 3 + 1] = sim.brimY; } : null;
  springs(sim, sim.iters || 12, after);
  sim.frames++;
}

// ---------- cloth simulation (scarves, cowls, blankets): a grid at true size ----------
function buildCloth(D) {
  const s = D.spec, g = D.g, F = flatDims(D.cand, s, D.g), W = F.W, L = F.L, tube = D.cand.type === 'tube';
  const sp = Math.max(0.6, Math.sqrt(W * L / 2600)), nx = Math.max(3, Math.round(W / sp)) + 1, ny = Math.max(3, Math.round(L / sp)) + 1, N = nx * ny;
  const dx = W / (nx - 1), dy = L / (ny - 1), pos = new Float32Array(N * 3), uv = new Float32Array(N * 2);
  const pad = g.t * 0.6 + 0.15, cols = [], visual = [];
  let form = null;
  if (s.item === 'scarf' && S.scarfOn === 'neck') {
    form = headForm(56, Math.max(20, L / 2 - 20)); cols.push(...form.cols); visual.push(...form.cols);
    const rN = form.a * 0.52 + 1.2 + pad, y0 = form.y0 - 2.6 * form.c + form.c * 0.72 + 2, half = Math.PI / 2 * rN;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = (j * nx + i) * 3, sl = -L / 2 + j * dy, y = y0 + i * dx, a = Math.abs(sl);
      if (a <= half) { const th = sl / rN; pos[k] = rN * Math.sin(th); pos[k + 1] = y; pos[k + 2] = -rN * Math.cos(th); }
      else { pos[k] = Math.sign(sl) * rN; pos[k + 1] = y; pos[k + 2] = a - half; }
    }
    const dr = scarfDrape(L); S.formNote = `round the neck of a 56 cm form · ends hang ≈ ${Math.round(dr.draped)} cm`;
  } else if (s.item === 'scarf') {
    const ry = Math.max(55, L / 2 + 18), rr = 1.6, x1 = W / 2 + 14; cols.push({ t: 'cylX', y: ry, z: 0, r: rr, x0: -x1, x1 });
    visual.push({ t: 'cylX', y: ry, z: 0, r: rr, x0: -x1, x1 }, { t: 'cylY', x: -x1, z: 0, r: 1.4, y0: 0, y1: ry }, { t: 'cylY', x: x1, z: 0, r: 1.4, y0: 0, y1: ry });
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = (j * nx + i) * 3; pos[k] = -W / 2 + i * dx; pos[k + 1] = ry + rr + pad + 0.3; pos[k + 2] = -L / 2 + j * dy; }
    S.formNote = `draped over a rod ${Math.round(ry)} cm high`;
  } else if (s.item === 'blanket') {
    const bx = W * 0.55, bz = L * 0.55, bh = 0.25 * Math.max(W, L) + 8, b = { t: 'box', min: [-bx / 2, 0, -bz / 2], max: [bx / 2, bh, bz / 2] }; cols.push(b); visual.push(b);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = (j * nx + i) * 3; pos[k] = -W / 2 + i * dx; pos[k + 1] = bh + pad + 0.3; pos[k + 2] = -L / 2 + j * dy; }
    S.formNote = `draped over a ${Math.round(bx)} × ${Math.round(bz)} × ${Math.round(bh)} cm box`;
  } else { // cowl tube around the neck of a form
    form = headForm(56); cols.push(...form.cols); visual.push(...form.cols);
    const R = W / TAU, top = form.y0 - 0.9 * form.c;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = (j * nx + i) * 3, a = TAU * i / (nx - 1); pos[k] = R * Math.cos(a); pos[k + 1] = top - j * dy; pos[k + 2] = R * Math.sin(a); }
    S.formNote = `on a 56 cm head form${s.style === 'infinity' ? ', shown as one loop' : ''}`;
  }
  const c = D.cand, reps = c.type === 'granny' ? [1, 1] : [c.n / (c.st === 'rib' ? 2 : 1), c.rows / seqPeriod(s)];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = (j * nx + i) * 2; uv[k] = i / (nx - 1) * reps[0]; uv[k + 1] = j / (ny - 1) * reps[1]; }
  const sA = [], sB = [], sR = [], sK = [], tris = [], id = (i, j) => j * nx + i;
  const sp2 = (a, b, k) => { const A = a * 3, B = b * 3; sA.push(a); sB.push(b); sR.push(Math.hypot(pos[A] - pos[B], pos[A + 1] - pos[B + 1], pos[A + 2] - pos[B + 2])); sK.push(k); };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (i < nx - 1) sp2(id(i, j), id(i + 1, j), 1); if (j < ny - 1) sp2(id(i, j), id(i, j + 1), 1);
    if (i < nx - 1 && j < ny - 1) { sp2(id(i, j), id(i + 1, j + 1), 0.5); sp2(id(i + 1, j), id(i, j + 1), 0.5); tris.push(id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j), id(i + 1, j + 1), id(i, j + 1)); }
    if (i < nx - 2) sp2(id(i, j), id(i + 2, j), 0.12); if (j < ny - 2) sp2(id(i, j), id(i, j + 2), 0.12);
  }
  const sim = { type: 'cloth', N, nx, ny, pos, prv: Float32Array.from(pos), uv, tris: Uint32Array.from(tris), sA: Int32Array.from(sA), sB: Int32Array.from(sB), sR: Float32Array.from(sR), sK: Float32Array.from(sK),
    cols, visual, pad, grav: 0.02 * Math.min(1, sp), damp: 0.97, fr: 0.35, iters: 10, frames: 0, maxFrames: 700, form, thick: g.t * 1.2, W, L };
  if (tube) sim.weld = () => { for (let j = 0; j < ny; j++) { const a = id(0, j) * 3, b = id(nx - 1, j) * 3; for (let d = 0; d < 3; d++) { const m = (pos[a + d] + pos[b + d]) / 2; pos[a + d] = pos[b + d] = m; } } };
  return sim;
}

// ---------- three.js scene ----------
const G = { ok: false };
function initThree() {
  try {
    if (!window.THREE) throw new Error('three missing');
    const cv = $('three');
    G.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); G.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera(36, 1, 0.5, 6000);
    G.controls = new THREE.OrbitControls(G.camera, cv); G.controls.enableDamping = true; G.controls.dampingFactor = 0.08;
    G.scene.add(new THREE.HemisphereLight(0xfff6ea, 0x1d3b32, 0.85));
    G.sun = new THREE.DirectionalLight(0xffffff, 0.75); G.sun.position.set(60, 140, 90); G.scene.add(G.sun);
    const f = new THREE.DirectionalLight(0xbcd7ff, 0.3); f.position.set(-80, 40, -60); G.scene.add(f);
    G.root = new THREE.Group(); G.scene.add(G.root);
    G.leg = s => { const q = new THREE.SphereGeometry(0.5, 10, 7); q.scale(0.3, 0.69, 1); q.rotateZ(0.42 * s); q.translate(-0.17 * s, 0, 0); return q; };
    G.legL = G.leg(1); G.legR = G.leg(-1);
    G.stitchMat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 });
    G.skinMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, side: THREE.DoubleSide });
    G.formMat = new THREE.MeshStandardMaterial({ color: 0xd9d4cb, roughness: 0.9, metalness: 0 });
    G.m4 = new THREE.Matrix4(); G.t = new THREE.Vector3(); G.u = new THREE.Vector3(); G.n = new THREE.Vector3(); G.p = new THREE.Vector3(); G.tmp = new THREE.Vector3();
    new ResizeObserver(resize).observe($('mat')); resize(); G.ok = true;
  } catch (e) {
    const d = document.createElement('div'); d.className = 'nogl'; d.textContent = 'The 3D view needs WebGL, which this browser did not provide. The spec, pattern and estimates still work.'; $('mat').appendChild(d);
  }
}
function resize() { const r = $('mat').getBoundingClientRect(); G.renderer.setSize(r.width, r.height, false); G.camera.aspect = r.width / Math.max(1, r.height); G.camera.updateProjectionMatrix(); }
function clearRoot() { while (G.root.children.length) { const m = G.root.children.pop(); m.traverse(o => { if (o.geometry && o.geometry !== G.legL && o.geometry !== G.legR) o.geometry.dispose(); if (o.material && o.material.map) o.material.map.dispose(); }); } }
function formMeshes(list) {
  const grp = new THREE.Group();
  for (const c of list) {
    let m;
    if (c.t === 'ell') { m = new THREE.Mesh(c.half ? new THREE.SphereGeometry(1, 40, 16, 0, TAU, c.half === 'up' ? 0 : Math.PI / 2, Math.PI / 2) : new THREE.SphereGeometry(1, 40, 28), G.formMat); m.scale.set(c.r[0], c.r[1], c.r[2]); m.position.set(...c.c); }
    else if (c.t === 'cylY') { m = new THREE.Mesh(new THREE.CylinderGeometry(c.r, c.r, c.y1 - c.y0, 28), G.formMat); m.position.set(c.x, (c.y0 + c.y1) / 2, c.z); }
    else if (c.t === 'cylX') { m = new THREE.Mesh(new THREE.CylinderGeometry(c.r, c.r, c.x1 - c.x0, 20), G.formMat); m.rotation.z = Math.PI / 2; m.position.set((c.x0 + c.x1) / 2, c.y, c.z); }
    else { m = new THREE.Mesh(new THREE.BoxGeometry(c.max[0] - c.min[0], c.max[1] - c.min[1], c.max[2] - c.min[2]), G.formMat); m.position.set((c.min[0] + c.max[0]) / 2, (c.min[1] + c.max[1]) / 2, (c.min[2] + c.max[2]) / 2); }
    grp.add(m);
  }
  return grp;
}
function matGrid(size) {
  const grp = new THREE.Group();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color: 0x2b5a4b, roughness: 1 })); plane.rotation.x = -Math.PI / 2; plane.position.y = -0.05; grp.add(plane);
  const major = new THREE.GridHelper(size, size / 10, 0xf2d35b, 0xf2d35b); major.material.transparent = true; major.material.opacity = 0.32; grp.add(major);
  if (size <= 160) { const minor = new THREE.GridHelper(size, size, 0xffffff, 0xffffff); minor.material.transparent = true; minor.material.opacity = 0.07; minor.position.y = 0.01; grp.add(minor); }
  return grp;
}
function colours() { return [new THREE.Color(S.pal[0]), new THREE.Color(S.pal[1])]; }
function buildScene(D) {
  S.formNote = '';
  if (D.kind === 'rounds') S.sim = buildRoundSim(D); else S.sim = buildCloth(D);
  const sim = S.sim; if (!G.ok) return;
  clearRoot();
  if (sim.type === 'rounds') {
    sim.grav = sim.hat ? 0.003 : 0;
    if (sim.hat) { const c = sim.counts, L = c.length; sim.pullFrom = sim.N - c[L - 1] - (L > 1 ? c[L - 2] : 0); sim.pull = 0.1; sim.brimY = sim.form.y0; } // worn: the brim is pulled down to at least the brow / ear-top line down to the forehead line
    if (sim.hat) { sim.cols = sim.form.cols.filter(c => c.head); const hd = S.tryHead || D.spec.head, m = roundsSummary(D.counts, D.st, D.g, D.spec); S.formNote = `on a ${hd} cm head form · ${Math.round((1 - m.brimC / hd) * 100)}% stretch`; G.form = formMeshes(sim.form.cols); G.root.add(G.form); }
    else { G.form = null; S.formNote = ''; }
    const geo = new THREE.BufferGeometry();
    G.posAttr = new THREE.BufferAttribute(sim.pos, 3); G.posAttr.setUsage(THREE.DynamicDrawUsage);
    G.nrmAttr = new THREE.BufferAttribute(new Float32Array(sim.N * 3), 3); G.nrmAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', G.posAttr); geo.setAttribute('normal', G.nrmAttr); geo.setIndex(new THREE.BufferAttribute(sim.tris, 1));
    G.skin = new THREE.Mesh(geo, G.skinMat); G.skin.visible = S.skin;
    const n = sim.N - 1; G.iL = new THREE.InstancedMesh(G.legL, G.stitchMat, n); G.iR = new THREE.InstancedMesh(G.legR, G.stitchMat, n);
    G.iL.instanceMatrix.setUsage(THREE.DynamicDrawUsage); G.iR.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    G.root.add(G.skin, G.iL, G.iR);
    G.pom = null; if (D.spec.pompom) { const r = clamp(D.spec.head * 0.06, 2, 5); G.pom = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 3), new THREE.MeshStandardMaterial({ roughness: 1 })); G.pom.userData.r = r; G.root.add(G.pom); }
    G.cloth = null;
  } else {
    G.form = formMeshes(sim.visual); G.root.add(G.form);
    const geo = new THREE.BufferGeometry(); G.posAttr = new THREE.BufferAttribute(sim.pos, 3); G.posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', G.posAttr); geo.setAttribute('uv', new THREE.BufferAttribute(sim.uv, 2)); geo.setIndex(new THREE.BufferAttribute(sim.tris, 1));
    G.cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, side: THREE.DoubleSide }));
    G.root.add(G.cloth); G.skin = G.iL = G.iR = G.pom = null;
    G.fringe = null; if (D.spec.fringe) { const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sim.nx * 4 * 3), 3)); G.fringe = new THREE.LineSegments(fg, new THREE.LineBasicMaterial()); G.root.add(G.fringe); }
  }
  G.form && (G.form.visible = S.form);
  colorize();
  const box = new THREE.Box3(); const P = sim.pos; for (let i = 0; i < sim.N; i++) box.expandByPoint(G.tmp.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]));
  if (G.form) box.expandByObject(G.form);
  box.min.y = Math.min(box.min.y, 0);
  const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3()), ext = Math.max(size.x, size.y, size.z);
  const ms = Math.max(60, Math.ceil(Math.max(size.x, size.z) * 1.8 / 10) * 10 + 20); G.root.add(matGrid(ms));
  if (S.fit) { const dist = ext * 1.35 / Math.tan(THREE.MathUtils.degToRad(G.camera.fov / 2)) * 0.62 + 10; G.controls.target.copy(ctr); G.camera.position.set(ctr.x + dist * 0.55, ctr.y + dist * 0.38, ctr.z + dist * 0.75); G.controls.update(); S.fit = false; }
  updateMeshes();
}
function texCanvas(D) {
  const s = D.spec, c = D.cand, seq = colourSeq(s);
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
  if (c.type === 'granny') { // the whole blanket: one tile per square, coloured by the layout
    const Z = clamp(Math.floor(2048 / Math.max(c.cols, c.rowsN)), 32, 192), R = c.R; cv.width = Z * c.cols; cv.height = Z * c.rowsN;
    let sq = 0;
    for (let row = 0; row < c.rowsN; row++) for (let col = 0; col < c.cols; col++, sq++) {
      const x0 = col * Z, y0 = (c.rowsN - 1 - row) * Z; g.fillStyle = shade(S.pal[0], 0.45); g.fillRect(x0, y0, Z, Z);
      for (let r = R - 1; r >= 0; r--) { const q = ((r + 1) / R) * (Z / 2 - 2); g.fillStyle = palHex(grannyColour(seq, s.layout, r, sq, col, row)); g.fillRect(x0 + Z / 2 - q, y0 + Z / 2 - q, 2 * q, 2 * q);
        const gap = q - (Z / 2 - 2) / R; if (gap > 0) { g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1; g.strokeRect(x0 + Z / 2 - gap, y0 + Z / 2 - gap, 2 * gap, 2 * gap); } }
      g.strokeStyle = shade(S.pal[0], 0.5); g.lineWidth = 2; g.strokeRect(x0 + 1, y0 + 1, Z - 2, Z - 2);
    }
    return cv;
  }
  const rib = c.st === 'rib', per = seqPeriod(s), cw = rib ? 128 : 64, rh = 32; cv.width = cw; cv.height = rh * per;
  const tall = (rib ? 2.3 : ST[c.st].h);
  for (let r = 0; r < per; r++) {
    const col = palHex(colourAt(seq, r)), y0 = (per - 1 - r) * rh;
    g.fillStyle = shade(col, 0.52); g.fillRect(0, y0, cw, rh);
    for (let k = 0; k < (rib ? 2 : 1); k++) {
      const x0 = k * 64, fp = rib && k === 0;
      g.lineCap = 'round'; g.strokeStyle = shade(col, fp ? 1.12 : rib ? 0.78 : 1); g.lineWidth = 13;
      const vTop = y0 + 5, vMid = y0 + rh * (tall > 1.5 ? 0.38 : 0.55);
      g.beginPath(); g.moveTo(x0 + 10, vTop); g.lineTo(x0 + 32, vMid); g.lineTo(x0 + 54, vTop); g.stroke();
      if (tall > 1.2) { g.lineWidth = fp ? 16 : 10; g.beginPath(); g.moveTo(x0 + 32, vMid); g.lineTo(x0 + 30, y0 + rh - 3); g.stroke(); }
      g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0 + 13, vTop + 1); g.lineTo(x0 + 31, vMid - 2); g.stroke();
    }
  }
  return cv;
}
function colorize() {
  const D = S.D, sim = S.sim; if (!G.ok || !sim) return;
  const [A, B] = colours();
  if (sim.type === 'rounds') {
    const col = new THREE.Color(), seq = colourSeq(D.spec), byL = {}; LETTERS.split('').forEach(L => (byL[L] = new THREE.Color(palHex(L))));
    for (let i = 1; i < sim.N; i++) { col.copy(byL[colourAt(seq, sim.roundOf[i])]); col.multiplyScalar(0.93 + 0.07 * ((i * 2654435761) % 97) / 97); G.iL.setColorAt(i - 1, col); G.iR.setColorAt(i - 1, col); }
    G.iL.instanceColor.needsUpdate = G.iR.instanceColor.needsUpdate = true; G.skinMat.color.copy(A).multiplyScalar(0.5);
    if (G.pom) G.pom.material.color.copy(byL[colourAt(seq, sim.counts.length - 1)]);
  } else {
    const t = new THREE.CanvasTexture(texCanvas(D)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = G.renderer.capabilities.getMaxAnisotropy(); t.encoding = THREE.sRGBEncoding;
    if (G.cloth.material.map) G.cloth.material.map.dispose(); G.cloth.material.map = t; G.cloth.material.needsUpdate = true;
    if (G.fringe) G.fringe.material.color.copy(A);
  }
}
function updateMeshes() {
  const sim = S.sim; if (!G.ok || !sim) return;
  if (sim.type === 'cloth') {
    G.posAttr.needsUpdate = true; G.cloth.geometry.computeVertexNormals(); G.cloth.geometry.computeBoundingSphere();
    if (G.fringe) { const a = G.fringe.geometry.attributes.position.array, P = sim.pos, nx = sim.nx, ny = sim.ny; let q = 0;
      for (const [j, jj] of [[0, 1], [ny - 1, ny - 2]]) for (let i = 0; i < nx; i++) { const k = (j * nx + i) * 3, k2 = (jj * nx + i) * 3; let dx = P[k] - P[k2], dy = P[k + 1] - P[k2 + 1], dz = P[k + 2] - P[k2 + 2]; const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy = dy / L - 1.2; dz /= L; const L2 = Math.hypot(dx, dy, dz) || 1;
        a[q++] = P[k]; a[q++] = P[k + 1]; a[q++] = P[k + 2]; a[q++] = P[k] + dx / L2 * 12; a[q++] = P[k + 1] + dy / L2 * 12; a[q++] = P[k + 2] + dz / L2 * 12; }
      G.fringe.geometry.attributes.position.needsUpdate = true; G.fringe.geometry.setDrawRange(0, q / 3); }
    return;
  }
  const P = sim.pos, Nr = sim.nrm, sg = sim.sign, na = G.nrmAttr.array, th = sim.thick, { t, u, n, p, m4 } = G;
  for (let i = 0; i < sim.N; i++) { const j = i * 3, l = Math.hypot(Nr[j], Nr[j + 1], Nr[j + 2]) || 1; na[j] = sg * Nr[j] / l; na[j + 1] = sg * Nr[j + 1] / l; na[j + 2] = sg * Nr[j + 2] / l; }
  for (let i = 1; i < sim.N; i++) {
    const j = i * 3, a = sim.ringNext[i] * 3, b = sim.ringPrev[i] * 3, p0 = sim.par0[i] * 3, p1 = sim.par1[i] * 3, r = sim.roundOf[i], h = sim.hs[r], w = sim.ws[r];
    t.set(P[a] - P[b], P[a + 1] - P[b + 1], P[a + 2] - P[b + 2]).normalize();
    u.set(P[j] - (P[p0] + P[p1]) / 2, P[j + 1] - (P[p0 + 1] + P[p1 + 1]) / 2, P[j + 2] - (P[p0 + 2] + P[p1 + 2]) / 2);
    u.sub(G.tmp.copy(t).multiplyScalar(u.dot(t))).normalize();
    n.crossVectors(t, u).normalize(); if (n.x * na[j] + n.y * na[j + 1] + n.z * na[j + 2] < 0) { t.negate(); n.negate(); }
    const lift = sim.st[r] === 'rib' ? (sim.kOf[i] % 2 ? -0.2 : 0.55) * th : 0.25 * th;
    p.set(P[j], P[j + 1], P[j + 2]).addScaledVector(u, -0.42 * h).addScaledVector(n, lift);
    m4.makeBasis(t.multiplyScalar(w), u.multiplyScalar(h), n.multiplyScalar(th * 0.9)).setPosition(p);
    G.iL.setMatrixAt(i - 1, m4); G.iR.setMatrixAt(i - 1, m4);
  }
  G.iL.instanceMatrix.needsUpdate = G.iR.instanceMatrix.needsUpdate = true; G.posAttr.needsUpdate = true; G.nrmAttr.needsUpdate = true; G.skin.geometry.computeBoundingSphere();
  if (G.pom) G.pom.position.set(P[0], P[1] + G.pom.userData.r * 0.85, P[2]);
}
function scaleBar() {
  const r = $('mat').getBoundingClientRect(), dist = G.camera.position.distanceTo(G.controls.target), cmPerPx = 2 * dist * Math.tan(THREE.MathUtils.degToRad(G.camera.fov / 2)) / Math.max(1, r.height);
  let L = 1; for (const c of [1, 2, 5, 10, 20, 50, 100, 200]) if (c / cmPerPx <= 150) L = c;
  $('scaleBar').style.width = Math.round(L / cmPerPx) + 'px'; $('scaleLbl').textContent = L >= 100 ? L / 100 + ' m' : L + ' cm';
}

// ---------- loop ----------
let lastNow = 0;
function frame(now) {
  const dt = Math.min(0.1, lastNow ? (now - lastNow) / 1000 : 0); lastNow = now;
  const O = OPT();
  if (S.running && O) {
    const t0 = performance.now(); let imp = false;
    while (performance.now() - t0 < 10) { if (optStep()) imp = true; if (O.stall > 1500) break; }
    if (O.gen % 4 === 0 || S.flat) { O.hist.push(S.ga ? S.ga.bestScore : S.flat.bestScore); if (O.hist.length > 400) O.hist.splice(0, O.hist.length - 400); }
    if (imp) S.dirty = true;
    if (S.dirty && now - S.lastShow > 400) showBest();
    if (O.stall > 1500) stop(S.flat ? 'best layout' : 'converged');
  }
  if (O && now - S.rateT > 500) { S.lastRate = S.running ? (O.evals - S.rateEvals) / ((now - S.rateT) / 1000) : 0; S.rateEvals = O.evals; S.rateT = now; updateStats(); drawConv(); }
  if (G.ok && S.sim) {
    if (S.sim.frames < S.sim.maxFrames) { stepSim(S.sim); stepSim(S.sim); updateMeshes(); }
    walkFrame(dt);
    if (S.stretch && S.sim.frames % 12 === 0) stretchColors();
    G.controls.update(); G.renderer.render(G.scene, G.camera); scaleBar();
  }
  requestAnimationFrame(frame);
}

// ---------- export (Blender is Z-up, metres) ----------
function meshData() {
  const sim = S.sim, P = sim.pos, m = x => Math.round(x * 1e4) / 1e6, v = [], f = [];
  for (let i = 0; i < sim.N; i++) v.push([m(P[i * 3]), m(-P[i * 3 + 2]), m(P[i * 3 + 1])]);
  const flip = sim.type === 'rounds' && sim.sign < 0;
  for (let t = 0; t < sim.tris.length; t += 3) { const a = sim.tris[t], b = sim.tris[t + 1], c = sim.tris[t + 2]; f.push(flip ? [a, c, b] : [a, b, c]); }
  return { v, f };
}
function patternComment(pre) { return $('pattern').value.split('\n').map(l => pre + l).join('\n'); }
function objText() { const { v, f } = meshData(); return `# Picotlab Crochet Lab export. Units: metres, true size.\n${patternComment('# ')}\no Picotlab\n` + v.map(p => `v ${p[0]} ${p[1]} ${p[2]}`).join('\n') + '\n' + f.map(t => `f ${t[0] + 1} ${t[1] + 1} ${t[2] + 1}`).join('\n') + '\n'; }
function blenderScript() {
  const { v, f } = meshData(), hex = S.pal[0], th = (S.sim.thick / 100).toFixed(4);
  const lin = i => { const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255; return +(c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).toFixed(4); };
  return `# Picotlab Crochet Lab export. Blender 2.8+: Scripting tab, New, paste, Run Script. Units: metres, true size.
${patternComment('# ')}
import bpy
V = ${JSON.stringify(v)}
F = ${JSON.stringify(f)}
me = bpy.data.meshes.new("Picotlab")
me.from_pydata(V, [], F)
me.update()
ob = bpy.data.objects.new("Picotlab", me)
bpy.context.collection.objects.link(ob)
for p in me.polygons:
    p.use_smooth = True
mat = bpy.data.materials.new("Yarn A")
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
if bsdf:
    bsdf.inputs["Base Color"].default_value = (${lin(0)}, ${lin(1)}, ${lin(2)}, 1)
    bsdf.inputs["Roughness"].default_value = 0.9
me.materials.append(mat)
sol = ob.modifiers.new("Yarn thickness", "SOLIDIFY")
sol.thickness = ${th}
ob.modifiers.new("Subdivision", "SUBSURF").levels = 1
for o in bpy.context.selected_objects:
    o.select_set(False)
bpy.context.view_layer.objects.active = ob
ob.select_set(True)
`;
}
function copyText(text, btn) {
  const box = $('exportBox'), label = btn.dataset.label || (btn.dataset.label = btn.textContent);
  const ok = () => { box.hidden = true; btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = label), 1400); };
  const fail = () => { $('sheet').hidden = true; box.hidden = false; box.scrollIntoView({ block: 'center' }); box.value = text; box.focus(); box.select(); btn.textContent = label; };
  try { navigator.clipboard.writeText(text).then(ok, fail); } catch (e) { fail(); }
}

// ---------- wiring ----------
function initUI() {
  const ex = $('examples');
  EXAMPLES.forEach(t => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = t; b.onclick = () => { $('prompt').value = t; designFromPrompt(); }; ex.appendChild(b); });
  const yr = $('yarns');
  YARNS.forEach(([n, hex], i) => { const b = document.createElement('button'); b.className = 'sw'; b.style.background = hex; b.title = n; b.setAttribute('aria-label', n + ' yarn'); b.setAttribute('aria-pressed', String(i === S.yarn));
    b.onclick = () => { S.yarn = i; S.pal[0] = hex; yr.querySelectorAll('.sw').forEach((x, j) => x.setAttribute('aria-pressed', String(j === i))); renderFields(); recolour(); }; yr.appendChild(b); });
  $('design').onclick = designFromPrompt;
  $('prompt').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) { e.preventDefault(); designFromPrompt(); } });
  const lam = $('lam'), upd = () => { $('lamV').textContent = +lam.value < 25 ? 'size first' : +lam.value > 70 ? 'simple first' : 'balanced'; };
  lam.oninput = upd; upd(); S.lambda = (+lam.value / 100) * 2;
  lam.onchange = () => { S.lambda = (+lam.value / 100) * 2; if (S.ga) { S.ga.lambda = S.lambda; S.ga.bestScore = Infinity; S.ga.sc = S.ga.pop.map(a => evaluate(a, S.P, S.lambda)); } start(); };
  $('go').onclick = () => (S.running ? stop() : (S.user && reseed(), start()));
  $('reseed').onclick = () => { reseed(); start(); };
  const tog = (id, key, after) => $(id).onclick = () => { S[key] = !S[key]; $(id).setAttribute('aria-pressed', String(S[key])); after && after(); };
  tog('form', 'form', () => G.form && (G.form.visible = S.form));
  tog('skin', 'skin', () => G.skin && (G.skin.visible = S.skin));
  tog('stretch', 'stretch', () => { if (S.stretch) stretchColors(); else colorize(); updateStats(); });
  $('relax').onclick = () => S.D && buildScene(S.D);
  $('sim').onclick = () => {
    stop(); const D = S.D, s = S.spec, text = $('pattern').value;
    // our own header (gauge, notes) sits above the first blank line: read only the instructions
    if (D.kind === 'rounds') { const { rounds, warns } = parsePattern(text.includes('\n\n') ? text.slice(text.indexOf('\n\n') + 2) : text); $('warns').innerHTML = warns.map(w => `<div>${esc(w)}</div>`).join(''); const c = countsFromRounds(rounds); S.user = true; showDesign({ kind: 'rounds', spec: s, g: S.g, counts: c, st: rounds.map(r => r.st), rounds }, true); }
    else { const cand = parseFlat(text, s); $('warns').innerHTML = ''; S.user = true; showDesign({ kind: 'flat', spec: s, g: S.g, cand }, true); }
    updateGo();
  };
  $('copy').onclick = () => copyText($('pattern').value, $('copy'));
  $('sheetBtn').onclick = openSheet;
  $('shClose').onclick = () => { $('sheet').hidden = true; $('sheetBtn').focus(); };
  $('sheet').addEventListener('keydown', e => { if (e.key === 'Escape') $('shClose').click(); });
  $('sheet').addEventListener('click', e => { if (e.target === $('sheet')) $('shClose').click(); });
  $('shCopy').onclick = () => copyText(sheetText(), $('shCopy'));
  $('xpy').onclick = () => copyText(blenderScript(), $('xpy'));
  $('xobj').onclick = () => copyText(objText(), $('xobj'));
  addEventListener('resize', () => { drawSchematic(); drawConv(); });
}
