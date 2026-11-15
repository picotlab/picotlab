// ---------- explain a line: plain steps from core's explain(text), and the paste check's banners ----------
// explain(text) comes from CORE. This file only draws it: one row per part with the hook target on its own line,
// then the count, then warnings; the terms sit below, folded. A bare term shows the term and the "paste the whole line" prompt.
const xN = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
function explainCount(c) {
  const out = [];
  if (!c) return out;
  if (c.exact && c.made != null) out.push(`Makes <b>${xN(c.made, 'stitch', 'stitches')}</b>${c.chains ? ` and <b>${xN(c.chains, 'chain')}</b>` : ''}${c.used ? `, using ${xN(c.used, 'stitch', 'stitches')} or ${c.used === 1 ? 'space' : 'spaces'} of the row below` : ''}.`);
  if (c.alt) out.push(`If “N times” means N in all: ${c.alt.made} stitches and ${c.alt.chains} chains.`);
  if (c.note) out.push(esc(c.note));
  if (c.stated != null) out.push(`Printed count ${c.stated}: ${c.agrees === true ? '<b class="tone-good">matches ✓</b>' : c.agrees === false ? '<b class="tone-bad">does not match ✗</b>' : 'not checked here'}.`);
  if (c.rows && !c.note) out.push(`${xN(c.rows, 'row')}.`);
  if (c.total) out.push(`The pattern asks for a total of ${c.total.n}${c.total.what ? ' ' + esc(c.total.what) : ''}.`);
  return out;
}
function explainParts(parts) {
  return `<ol class="xp">${parts.map(p => `<li><div class="xsay">${esc(p.say)}</div>${p.hook ? `<div class="xhook"><span>Hook goes into</span> ${esc(p.hook)}</div>` : ''}${p.items && p.items.length ? explainParts(p.items) : ''}</li>`).join('')}</ol>`;
}
function explainTerms(terms, open) {
  return terms.map(t => `<div class="xterm"><b>${esc(t.name)}</b><p>${esc(t.means)}</p></div>`).join('');
}
// the whole answer as HTML. `e` is explain()'s result.
function explainHTML(e, folded) {
  if (!e) return '';
  const needs = e.needsHuman && e.needs ? `<div class="xneeds"><b>Needs a human.</b> ${esc(e.needs)}</div>` : '';
  if (e.kind === 'empty') return needs;
  if (e.kind === 'unknown') return needs;
  let h = '';
  if (e.kind === 'term') {
    h += folded ? `<details class="xmoreinfo"><summary>Words in this line (${e.terms.length})</summary>${explainTerms(e.terms)}</details>` : `<div class="xterms">${explainTerms(e.terms)}</div>`;
    if (e.more) h += `<p class="xmore">${esc(e.more)}</p>`;
    return h + needs;
  }
  if (needs) h += needs;
  if (e.parts.length) h += `<div class="xlbl">${e.needsHuman ? 'What was understood' : 'Step by step'}</div>${explainParts(e.parts)}`;
  const cn = explainCount(e.count);
  if (cn.length) h += `<div class="xcount"><span class="xlbl">Count</span> ${cn.join(' ')}</div>`;
  if (e.warnings.length) h += `<div class="xwarn">${e.warnings.map(w => `<div>⚠ ${esc(w)}</div>`).join('')}</div>`;
  const fold = [];
  if (e.terms.length) fold.push(explainTerms(e.terms));
  if (e.uk.length) fold.push(e.uk.map(u => `<p>${esc(u)}</p>`).join(''));
  if (fold.length) h += `<details class="xmoreinfo"><summary>${e.terms.length ? `Words in this line (${e.terms.length}) and US / UK terms` : 'US / UK terms'}</summary>${fold.join('')}</details>`;
  return h;
}
function explainRun() {
  const t = $('xplBox').value, out = $('xplOut');
  if (!t.trim()) { out.innerHTML = '<p class="note">Paste a line or a term first.</p>'; return; }
  out.innerHTML = `<div class="xlbl">Your line</div><div class="xq">${esc(t.trim())}</div>${explainHTML(explain(t))}`;
}
const EXPLAIN_EXAMPLES = ['flo', 'Row 2: sc in next ch-1 sp, ch 1, skip next sc, sc in next ch-1 sp', 'Rnd 2: ch 3, (3 dc, ch 2) x3 in ring [12]'];
function initExplain() {
  $('xplEx').innerHTML = EXPLAIN_EXAMPLES.map((t, i) => `<button class="chip" type="button" data-i="${i}">${esc(t.length > 24 ? t.slice(0, 22) + '…' : t)}</button>`).join('');
  $('xplEx').onclick = e => { const b = e.target.closest('button[data-i]'); if (!b) return; $('xplBox').value = EXPLAIN_EXAMPLES[+b.dataset.i]; explainRun(); };
  $('xplGo').onclick = explainRun;
  $('xplBox').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); explainRun(); } });
  // the per-line "Explain this line" buttons in the walkthrough's pattern text
  $('walkLines').addEventListener('click', e => {
    const b = e.target.closest('button[data-x]'); if (!b || !S.D || !S.D.pasted) return;
    const i = +b.dataset.x, ln = S.D.pasted.res.lines[i]; if (!ln) return;
    const box = $('lnExp'); box.hidden = false;
    box.innerHTML = `<div class="row"><h2>Explained</h2><button class="btn" type="button" id="lnExpX">Close</button></div><div class="xq">${esc(ln.text)}</div>${explainHTML(explain(ln.text))}`;
    $('lnExpX').onclick = () => { box.hidden = true; };
    box.scrollIntoView({ block: 'nearest' });
  });
}
// ---------- the paste check (checkPattern): one banner for warnings; for needs-human no steps, the findings and each line's explain ----------
function checkFold(list, n, cls) {
  const li = m => `<li>${esc(m)}</li>`, a = list.slice(0, n), b = list.slice(n);
  return `<ul class="${cls}">${a.map(f => li(f.msg)).join('')}</ul>${b.length ? `<details class="xmoreinfo"><summary>${b.length} more</summary><ul class="${cls}">${b.map(f => li(f.msg)).join('')}</ul></details>` : ''}`;
}
// warn: one banner above the walkthrough steps; ok: nothing; needs-human: no banner here (pasteHuman fills #pasteCheck)
function pasteBanner(C) {
  const el = $('walkBanner'); if (!el) return;
  const warns = C ? C.findings.filter(f => f.level === 'warn') : [];
  if (!C || C.verdict !== 'warn' || !warns.length) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = `<b>${xN(warns.length, 'warning')}.</b> ${esc(C.summary)}${checkFold(warns, 3, 'xl')}`;
}
// the flagged lines the reader gave up on come first; the same text is listed once
function flaggedLines(C) {
  const unread = new Set((C.P.unread || []).map(u => u.text)), notes = new Set((C.P.lines || []).filter(l => l.status === 'note').map(l => l.text)), seen = new Set(), out = [];
  for (const f of C.flagged) { if (seen.has(f.text) || (notes.has(f.text) && !unread.has(f.text))) continue; seen.add(f.text); out.push(f); } // header and note lines are not lines to chase
  return out.sort((a, b) => (unread.has(b.text) ? 1 : 0) - (unread.has(a.text) ? 1 : 0));
}
// needs-human: nothing is presented as steps. The summary, the human findings, and each flagged line's own explanation.
function pasteHuman(C) {
  if (typeof W !== 'undefined' && W.on) walkToggle(false);
  if (S.spec && S.spec.style === 'pasted') designFromPrompt(); // an earlier pasted piece must not sit beside a "not shown as steps" message: back to the designer's own piece
  $('walkBanner').hidden = true; $('pasteSet').hidden = true; $('lnExp').hidden = true;
  const hum = C.findings.filter(f => f.level === 'human'), fl = flaggedLines(C);
  const item = f => `<div class="xflag"><div class="xq">${esc(f.text)}</div>${explainHTML(f.explain, true)}</div>`;
  $('pasteNote').innerHTML = `<b class="tone-bad">Not shown as steps.</b> ${esc(C.summary)}`;
  const box = $('pasteCheck'); box.hidden = false;
  box.innerHTML = (hum.length ? `<div class="xlbl">Why it needs a person</div>${checkFold(hum, 3, 'xl')}` : '')
    + (fl.length ? `<div class="xlbl" style="margin-top:10px">Lines it could not fully read</div>${fl.slice(0, 3).map(item).join('')}${fl.length > 3 ? `<details class="xmoreinfo"><summary>${fl.length - 3} more lines</summary>${fl.slice(3).map(item).join('')}</details>` : ''}` : '');
  updateGo('your pattern');
  if (window.innerWidth < 1060) $('pasteSec').scrollIntoView({ block: 'start' });
}
