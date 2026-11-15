
// ---------- paste a pattern → walk through it ----------
// The pasted text goes through the same reader as "Hook my edits" (parsePattern). Every line comes back as a round,
// a merged continuation, a note, or unread: unread lines become "needs a human" steps in the walkthrough, never dropped.
// Each round's printed count ([12], (18 sts)…) is checked against the stitches the reader made: the count gate.
var PASTE = null;
// rebuild the reader's round entries (a round line plus its merged continuation lines) to find each round's printed count
function pasteGates(res, counts) {
  const entries = [];
  res.lines.forEach((l, i) => { if (l.status === 'round') entries.push({ line: i, text: l.text }); else if (l.status === 'merged' && entries.length) entries[entries.length - 1].text += ' ' + l.text; });
  const gates = [];
  for (const e of entries) {
    const m = e.text.match(LBL); if (!m) continue;
    const a = +m[1], b = m[2] ? +m[2] : a, stated = statedCountOf(e.text);
    for (let r = a; r <= Math.max(a, b); r++) gates.push({ line: e.line, label: e.text.split(/[:.)]/)[0].trim(), stated });
  }
  return counts.map((got, i) => {
    const G = gates[i] || { line: -1, label: `R${i + 1}`, stated: null }, human = !!(res.rounds[i] && res.rounds[i].unread);
    return Object.assign({}, G, { got, status: human ? 'human' : G.stated == null ? 'none' : G.stated === got ? 'ok' : 'bad' });
  });
}
function gateText(G) {
  return G.status === 'ok' ? `count ✓ [${G.got}]` : G.status === 'bad' ? `count ✗ printed [${G.stated}], stitches make ${G.got}` : G.status === 'human' ? 'needs a human' : `no count printed (makes ${G.got})`;
}
// yarn weight and hook size from the pattern's own header: the lines above the first round that the reader kept as notes
// (parsePrompt, the same detection as the prompt box). A hook alone picks the nearest yarn weight.
function pasteDetect(res) {
  const out = {}, head = []; for (const l of res.lines) { if (l.status === 'round' || l.status === 'merged') break; head.push(l.text); }
  if (!head.length) return out;
  const p = parsePrompt(head.join('\n'));
  if (p.set.yarn && YARN[p.yarn]) out.yarn = p.yarn;
  if (p.set.hook) out.hook = p.hook;
  if (out.hook && out.yarn == null) out.yarn = YARN.reduce((b, y) => (Math.abs(y.hook - out.hook) < Math.abs(b.hook - out.hook) ? y : b)).n;
  return out;
}
var PASTE_OV = null;
var PASTE_SET_OPEN = false;
// the yarn and hook pickers sit outside #pasteNote (which every read rewrites); changing either re-reads the pasted text
function pasteSetFill(yarn, hook) {
  const sel = $('pasteYarn'); if (!sel.options.length) sel.innerHTML = YARN.map(e => `<option value="${e.n}">${e.n} ${esc(e.name)}</option>`).join('');
  sel.value = String(yarn); $('pasteHook').value = hook; $('pasteSet').hidden = !PASTE_SET_OPEN;
}
function pasteSetInit() {
  const go = () => { PASTE_OV = { yarn: +$('pasteYarn').value, hook: +$('pasteHook').value || null }; pasteRead(); };
  $('pasteYarn').onchange = () => { $('pasteHook').value = YARN[+$('pasteYarn').value].hook; go(); }; $('pasteHook').onchange = go;
}
function pasteFresh() { PASTE_OV = null; PASTE_SET_OPEN = false; pasteRead(); } // a newly pasted pattern drops any earlier yarn/hook override
function pasteExample() { $('pasteBox').value = PASTE_EXAMPLE; pasteFresh(); }
const PASTE_EXAMPLE = `Pocket Ball (an original practice pattern)
Yarn: DK weight (3)
Hook: 3.5 mm
Finished size: about 3 cm across

R1: 6 sc in a magic ring [6]
R2: inc in each st around [12]
R3: (sc, inc) x6 [18]
R4: follow chart A for this round [18]
R5: (sc, dec) x6 [12]
Stuff the ball firmly.
R6: dec x6 [6]
Fasten off, weave the tail through the front loops and pull tight.`;
function pasteRead() {
  const text = $('pasteBox').value; if (!text.trim()) { $('pasteNote').textContent = 'Paste a pattern first.'; return; }
  const res = parsePattern(text), rounds = res.rounds, counts = countsFromRounds(rounds), gates = pasteGates(res, counts), last = counts[counts.length - 1];
  const joined = rounds.some(r => r.join), assumed = [];
  // an unread round that prints a count: stand in plain stitches (even inc or dec) so the shape carries on at that count.
  // The round stays a "needs a human" step; the schematic draws it dashed. With no printed count it stays a gap, labelled.
  rounds.forEach((rd, i) => {
    const G = gates[i]; if (!rd.unread || i === 0 || !G) return;
    if (G.stated == null) { assumed[i] = 'carry'; return; } // no printed count: the reader carries the previous round's count
    if (!(counts[i - 1] > 0)) return;
    const p = counts[i - 1], n = Math.max(1, Math.min(G.stated, p * 2)), d = Math.min(Math.max(0, p - n), Math.floor(p / 2)), inc = Math.max(0, n - p);
    const L = p - d, k = d || inc, pick = new Set(); for (let q = 0; q < k; q++) pick.add(Math.min(L - 1, Math.floor((q + 0.5) * L / k)));
    rd.ops = []; for (let q = 0; q < L; q++) rd.ops.push(pick.has(q) ? (d ? 'D' : 'I') : 'S');
    counts[i] = rd.ops.reduce((x, o) => x + produces(o), 0); assumed[i] = 'count';
  });
  SHAPES.pasted = { label: 'Pasted pattern', closed: last <= 12 && counts.length > 3, flip: false, pts: [[0, 0], [1, 1]] };
  const det = pasteDetect(res), ov = PASTE_OV || {}, found = ov.yarn != null || det.yarn != null;
  const yarn = ov.yarn != null ? ov.yarn : det.yarn != null ? det.yarn : 4;
  const hook = ov.hook || det.hook || YARN[yarn].hook;
  const spec = normalizeSpec({ item: 'ami', style: 'pasted', height: 10, yarn, hook, set: { item: true, style: true, height: true, yarn: true, hook: true } });
  spec.cal = typeof calActive === 'function' ? calActive() : null;
  const g = gaugeOf(spec);
  PASTE = { res, gates, joined, text, assumed };
  S.dirty = false; if (S.running) { S.running = false; updateGo(); }
  S.user = true; S.fit = true; S.spec = spec; S.g = g;
  showDesign({ kind: 'rounds', spec, g, counts, st: rounds.map(r => r.st || 'sc'), rounds, pasted: PASTE }, true);
  if (typeof renderFields === 'function') renderFields();
  $('pattern').value = text; $('warns').innerHTML = res.warns.map(w => `<div>${esc(w)}</div>`).join('');
  $('pieceTitle').textContent = 'Pasted pattern'; $('patNote').textContent = joined ? 'joined rounds' : 'spiral rounds';
  const n = { ok: 0, bad: 0, none: 0, human: 0 }; gates.forEach(G => n[G.status]++);
  const looseLines = res.lines.filter(l => l.status === 'unread').length, humanLines = n.human + looseLines; // a round line the reader found no stitches in counts too
  const standIn = assumed.filter(x => x === 'count').length, carried = assumed.filter(x => x === 'carry').length;
  const humanNote = !humanLines ? 'Every line was read.' : `<b>${humanLines}</b> line${humanLines === 1 ? '' : 's'} need${humanLines === 1 ? 's' : ''} a human${standIn ? `, ${standIn === 1 ? 'one' : standIn} drawn from ${standIn === 1 ? 'its' : 'their'} printed count` : ''}${carried ? `, ${carried === 1 ? 'one' : carried} kept at the round before` : ''}.`;
  $('pasteNote').innerHTML = `Read ${counts.length} round${counts.length === 1 ? '' : 's'}: <b>${n.ok}</b> match their printed count, <b>${n.bad}</b> ${n.bad === 1 ? 'does' : 'do'} not, ${n.none} print none. ${humanNote} ${found ? `Sized for ${YARN[yarn].name.toLowerCase()} yarn on a ${hook} mm hook${ov.yarn != null ? '' : ', from the pattern'}.` : `<b>Assumed ${YARN[yarn].name.toLowerCase()}, ${hook} mm</b> (the pattern names no yarn).`} <button class="btn" type="button" id="pasteChg" style="display:block;margin-top:6px">Change</button>`;
  pasteSetFill(yarn, hook);
  $('pasteChg').onclick = () => { PASTE_SET_OPEN = !PASTE_SET_OPEN; $('pasteSet').hidden = !PASTE_SET_OPEN; };
  updateGo('your pattern');
  W.playing = false; $('wPlay').textContent = 'Play';
  if (!W.on) walkToggle(true); else { W.i = 0; walkSetup(); }
  if (window.innerWidth < 1060) $('mat').scrollIntoView({ block: 'start' });
}
// walkthrough steps for a pasted pattern: the core's steps (which already turn unread lines into steps and take
// chains and joins from each round), plus the line each step belongs to and the count gate at the end of each round.
// A round the reader found no stitches in is shown only as its "needs a human" step: its stitches would be a guess.
function pastedSteps(D) {
  const P = D.pasted, out = [], clip = t => (t.length > 140 ? t.slice(0, 140) + '…' : t);
  const lineIdx = t => P.res.lines.findIndex(l => l.status === 'unread' && l.text === t);
  for (const s of walkSteps({ kind: 'rounds', spec: { item: 'ami' }, rounds: D.rounds })) {
    const rd = D.rounds[s.r], G = P.gates[s.r];
    if (s.op === 'unread') { const li = lineIdx(s.text); s.human = true; s.line = li >= 0 ? li : G ? G.line : -1; s.label = `Needs a human: “${clip(s.text)}” (${s.why}). Read it yourself, then step on.`; out.push(s); continue; }
    if (rd && rd.unread) continue;
    s.line = G ? G.line : -1;
    if (G && s.made === s.of && s.op !== 'ch' && s.op !== 'slst') s.label += ` · ${gateText(G)}`;
    out.push(s);
  }
  out.forEach((s, i) => (s.i = i));
  return out;
}
// the pattern text in the walkthrough panel, with each line's status and each round's count gate
function pastedLinesHTML(P) {
  const byLine = {}; P.gates.forEach(G => { if (G.line >= 0) (byLine[G.line] = byLine[G.line] || []).push(G); });
  return P.res.lines.map((l, i) => {
    let badge = '';
    if (l.status === 'unread') badge = '<span class="gate g-human">needs a human</span>';
    else if (l.status === 'note') badge = '<span class="gate g-none">note</span>';
    else if (byLine[i]) { const gs = byLine[i], worst = gs.find(G => G.status === 'human') || gs.find(G => G.status === 'bad') || gs.find(G => G.status === 'none') || gs[0]; badge = `<span class="gate g-${worst.status}">${esc(gs.length > 1 && worst.status === 'ok' ? `${gs.length} rounds ✓ [${worst.got}]` : gateText(worst))}</span>`; }
    return `<div data-l="${i}">${esc(l.text)}${badge}</div>`;
  }).join('');
}
function initPaste() {
  pasteSetInit();
  $('pasteGo').onclick = pasteFresh;
  $('pasteEx').onclick = e => { e.preventDefault(); pasteExample(); };
  $('pasteBox').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); pasteFresh(); } });
}
