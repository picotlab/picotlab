
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
function pasteRead() {
  const text = $('pasteBox').value; if (!text.trim()) { $('pasteNote').textContent = 'Paste a pattern first.'; return; }
  const res = parsePattern(text), rounds = res.rounds, counts = countsFromRounds(rounds), gates = pasteGates(res, counts), last = counts[counts.length - 1];
  const joined = rounds.some(r => r.join);
  SHAPES.pasted = { label: 'Pasted pattern', closed: last <= 12 && counts.length > 3, flip: false, pts: [[0, 0], [1, 1]] };
  const yarn = S.spec ? S.spec.yarn : 4;
  const spec = normalizeSpec({ item: 'ami', style: 'pasted', height: 10, yarn, hook: YARN[yarn].hook, set: { item: true, style: true, height: true, yarn: true, hook: true } });
  spec.cal = typeof calActive === 'function' ? calActive() : null;
  const g = gaugeOf(spec);
  PASTE = { res, gates, joined, text };
  S.dirty = false; if (S.running) { S.running = false; updateGo(); }
  S.user = true; S.fit = true; S.spec = spec; S.g = g;
  showDesign({ kind: 'rounds', spec, g, counts, st: rounds.map(r => r.st || 'sc'), rounds, pasted: PASTE }, true);
  $('pattern').value = text; $('warns').innerHTML = res.warns.map(w => `<div>${esc(w)}</div>`).join('');
  $('pieceTitle').textContent = 'Pasted pattern'; $('patNote').textContent = joined ? 'joined rounds' : 'spiral rounds';
  const n = { ok: 0, bad: 0, none: 0, human: 0 }; gates.forEach(G => n[G.status]++);
  const humanLines = res.lines.filter(l => l.status === 'unread').length;
  $('pasteNote').innerHTML = `Read ${counts.length} round${counts.length === 1 ? '' : 's'}: <b>${n.ok}</b> match their printed count, <b>${n.bad}</b> ${n.bad === 1 ? 'does' : 'do'} not, ${n.none} print none. ${humanLines ? `<b>${humanLines}</b> line${humanLines === 1 ? '' : 's'} need${humanLines === 1 ? 's' : ''} a human.` : 'Every line was read.'} Sized at the standard gauge for ${YARN[yarn].name.toLowerCase()} yarn.`;
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
  $('pasteGo').onclick = pasteRead;
  $('pasteBox').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); pasteRead(); } });
}
