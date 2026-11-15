
// ---------- calibration profiles: your swatches and your finished pieces ----------
// Stored in this viewer's private space in the artifact database when it is available (data/users/<id>/),
// otherwise in this browser's localStorage, with export/import as text as a fallback.
var CAL = { profiles: [], active: '', store: 'local', db: null, uid: null, edit: '', msg: '' };
const CAL_KEY = 'hookloop.calibration.v1';
const calActive = () => CAL.profiles.find(p => p.id === CAL.active) || null;
const calEditing = () => CAL.profiles.find(p => p.id === CAL.edit) || calActive();
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function calLocalSave() { try { localStorage.setItem(CAL_KEY, JSON.stringify({ profiles: CAL.profiles, active: CAL.active })); } catch (e) { /* storage blocked: export keeps a copy */ } }
async function calLoad() {
  try { const j = JSON.parse(localStorage.getItem(CAL_KEY) || 'null'); if (j && Array.isArray(j.profiles)) { CAL.profiles = j.profiles; CAL.active = j.active || ''; } } catch (e) { /* no storage */ }
  calChip();
  if (CAL.active) applySpec(true);
  try {
    if (!window.claude || !claude.use) return;
    const db = await claude.use('db'); if (!db) return;
    const user = await claude.use('user'), uid = user && await user.id(); if (!uid) return;
    const col = db.collection('data/users/' + uid);
    const snap = await Promise.race([col.get(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))]);
    CAL.db = db; CAL.uid = uid; CAL.store = 'db';
    const profs = []; let act = '';
    snap.docs.forEach(d => { const v = d.data() || {}; if (d.id === 'active') act = v.id || ''; else if (d.id.startsWith('p_') && v.id) profs.push(v); });
    if (profs.length) { const was = CAL.active; CAL.profiles = profs; CAL.active = act; calLocalSave(); calChip(); if (was !== act || act) applySpec(true); }
    else if (CAL.profiles.length) { for (const p of CAL.profiles) await calSaveProfile(p); await calSaveActive(); } // first visit with db: move local profiles in
    if (!$('cal').hidden) renderCal();
  } catch (e) { CAL.store = 'local'; CAL.db = null; }
}
async function calSaveProfile(p) {
  calLocalSave();
  if (CAL.db) try { await CAL.db.collection('data/users/' + CAL.uid).doc('p_' + p.id).set(JSON.parse(JSON.stringify(p))); } catch (e) { CAL.msg = 'Could not save to the artifact database just now; it is kept in this browser.'; }
}
async function calSaveActive() { calLocalSave(); if (CAL.db) try { await CAL.db.collection('data/users/' + CAL.uid).doc('active').set({ id: CAL.active }); } catch (e) { /* kept locally */ } }
async function calDelete(id) {
  CAL.profiles = CAL.profiles.filter(p => p.id !== id); if (CAL.active === id) CAL.active = ''; if (CAL.edit === id) CAL.edit = '';
  calLocalSave(); if (CAL.db) try { await CAL.db.collection('data/users/' + CAL.uid).doc('p_' + id).delete(); } catch (e) { /* kept locally */ }
  calSaveActive();
}
function calChip() {
  const p = calActive(), el = $('calChip'); if (!el) return;
  if (!p) { el.textContent = 'Standard gauge for the yarn weight. Calibrate with your own swatch to size patterns to your hand.'; return; }
  const on = S.spec && profileApplies(p, S.spec);
  el.innerHTML = `Profile <b>${esc(p.name)}</b> · ${YARN[p.yarn].name}, ${p.hook} mm · ${on ? 'in use' : `not used here (it is for ${YARN[p.yarn].name.toLowerCase()} yarn)`}${p.corr ? ' · with finished-piece correction' : ''}`;
}
function calRefresh() { calChip(); applySpec(true); renderCal(); }
// what the model would assume without any calibration, for a profile's yarn and hook
function modelGauge(p, st) { return gaugeOf({ item: 'scarf', yarn: p.yarn, hook: p.hook }).per10(st); }
// the current design's predictions, with the swatch but WITHOUT the finished-piece correction
function currentPrediction() {
  const D = S.D; if (!D) return null; const s = Object.assign({}, D.spec, { noCorr: true }), g = gaugeOf(s), round = IN_ROUND(s);
  if (D.kind === 'rounds') { const m = roundsSummary(D.counts, D.st, g, s); return s.item === 'hat' ? { round, wl: 'Brim circumference', w: m.brimC, ll: 'Depth, crown to edge', l: m.depth } : { round, wl: 'Widest circumference', w: m.widest, ll: 'Height', l: m.height }; }
  const F = flatDims(D.cand, s, g); return s.item === 'cowl' ? { round, wl: 'Circumference', w: F.W, ll: 'Height', l: F.L } : { round, wl: 'Width', w: F.W, ll: 'Length', l: F.L };
}
function renderCal() {
  const p = calEditing(), b = $('calBody'), pct = (a, m) => { const d = (a - m) / m * 100; return `<span style="color:${Math.abs(d) < 3 ? css('--good') : Math.abs(d) < 8 ? css('--warn') : css('--bad')}">${d > 0 ? '+' : ''}${d.toFixed(1)}%</span>`; };
  const inp = (f, v, w = 70, step = 0.1, type = 'number') => `<input type="${type}" data-f="${f}" value="${v == null ? '' : esc(v)}" step="${step}" min="0" style="width:${w}px;font:13px var(--body);color:var(--ink);background:var(--chip);border:1px solid var(--line);border-radius:6px;padding:5px 6px">`;
  let h = `<h1 id="calTitle">Calibrate</h1><p class="sub">Measure your own swatch and finished pieces so Picotlab sizes patterns to your hook, your yarn and your tension. The active profile drives the pattern search, the 3D fit, the fit check and the yardage.</p>`;
  h += `<div class="row" style="flex-wrap:wrap;gap:8px"><label class="lbl" for="calPick">Profile</label><select id="calPick" style="flex:1;min-width:160px;font:13px var(--body);color:var(--ink);background:var(--chip);border:1px solid var(--line);border-radius:7px;padding:6px">${CAL.profiles.length ? '' : '<option value="">No profiles yet</option>'}${CAL.profiles.map(q => `<option value="${q.id}"${p && q.id === p.id ? ' selected' : ''}>${esc(q.name)}${q.id === CAL.active ? ' (active)' : ''}</option>`).join('')}</select>
    <button class="btn" id="calNew">New profile</button>${p ? `<button class="btn primary" id="calUse" style="flex:0 0 auto">${p.id === CAL.active ? 'Active ✓' : 'Use this profile'}</button><button class="btn" id="calNone">Use none</button><button class="btn" id="calDel">Delete</button>` : ''}</div>
    <p class="note">${CAL.store === 'db' ? 'Profiles are saved in your private space in this artifact (only you can see them) and in this browser.' : 'Profiles are saved in this browser only. Use Export below to keep a copy or move them to another device.'}${CAL.msg ? ' ' + esc(CAL.msg) : ''}</p>`;
  if (p) {
    h += `<h3>Profile</h3><div class="fields" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <label>Name${inp('name', p.name, '100%', 1, 'text')}</label><label>Yarn (brand, fibre)${inp('yarnName', p.yarnName || '', '100%', 1, 'text')}</label>
      <label>Yarn weight<select data-f="yarn" style="font:13px var(--body);color:var(--ink);background:var(--chip);border:1px solid var(--line);border-radius:7px;padding:6px">${YARN.map(y => `<option value="${y.n}"${y.n === p.yarn ? ' selected' : ''}>${y.n} ${y.name}</option>`).join('')}</select></label>
      <label>Hook (mm)${inp('hook', p.hook, '100%', 0.25)}</label></div>`;
    h += `<h3>Swatches</h3><p class="note">Enter stitches and rows in 10 cm, or your raw count: N stitches measured X cm across, M rows measured Y cm tall. Leave a stitch blank if you have not swatched it; Picotlab derives it from the others.</p>
      <table class="steps swt"><tbody><tr class="swh"><td></td><td>Your count</td><td>Gauge / 10 cm</td><td>Model assumed</td></tr>`;
    for (const st of ['sc', 'hdc', 'dc']) {
      const sw = (p.swatches && p.swatches[st]) || {}, G = swatchGauge(sw), M = modelGauge(p, st);
      h += `<tr><td>${st}</td><td style="font-family:var(--body)"><div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">${inp(`sw.${st}.n`, sw.n, 52, 1)} sts in ${inp(`sw.${st}.wcm`, sw.wcm, 58)} cm · ${inp(`sw.${st}.m`, sw.m, 52, 1)} rows in ${inp(`sw.${st}.hcm`, sw.hcm, 58)} cm</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:3px" class="note">or per 10 cm: ${inp(`sw.${st}.sts`, sw.n ? '' : sw.sts, 52)} sts, ${inp(`sw.${st}.rows`, sw.m ? '' : sw.rows, 52)} rows</div></td>
        <td data-l="Your gauge / 10 cm">${G ? `${r1(G.sts)} × ${r1(G.rows)}<br><span class="note">st ${(G.w * 10).toFixed(1)} × ${(G.h * 10).toFixed(1)} mm, h/w ${G.aspect.toFixed(2)}</span>` : '–'}</td>
        <td data-l="Model assumed">${r1(M.sts)} × ${r1(M.rows)}${G ? `<br>${pct(M.sts, G.sts)} sts, ${pct(M.rows, G.rows)} rows` : ''}</td></tr>`;
    }
    h += '</tbody></table><p class="note">Percent = how far the standard model is from your swatch. Positive means the model expected more stitches per 10 cm (smaller stitches) than you make.</p>';
    // finished-piece check
    const pr = currentPrediction(), checks = p.checks || [], F = fitCorrection(checks);
    h += `<h3>Finished-piece check</h3>`;
    if (pr && p.yarn === S.spec.yarn) {
      h += `<p class="note">You hooked the pattern on screen (${esc(sizeLine(S.D))}) with this yarn and hook? Measure it flat and unstretched, then enter what you got.</p>
        <table class="steps"><tbody><tr><td></td><td>Predicted</td><td>You measured (cm)</td></tr>
        <tr><td>${pr.wl}</td><td>${r1(pr.w)} cm</td><td>${inp('m.w', '', 80)}</td></tr><tr><td>${pr.ll}</td><td>${r1(pr.l)} cm</td><td>${inp('m.l', '', 80)}</td></tr></tbody></table>
        <div class="btns" style="margin-top:6px"><button class="btn" id="calAddCheck">Add this measurement</button></div>`;
    } else h += `<p class="note">Design a piece in ${YARN[p.yarn].name.toLowerCase()} yarn first; the check compares its predicted size with what you measure.</p>`;
    if (checks.length) {
      h += `<table class="steps"><tbody>${checks.map((c, i) => `<tr><td>${esc(c.label)}</td><td>${c.width ? `${c.width.label || 'width'} ${r1(c.width.pred)} → ${r1(c.width.meas)} cm` : ''}${c.length ? `<br>${c.length.label || 'length'} ${r1(c.length.pred)} → ${r1(c.length.meas)} cm` : ''}</td><td><button class="btn" data-del="${i}" style="padding:4px 8px">Remove</button></td></tr>`).join('')}</tbody></table>
        <p><b>Fitted correction</b> from ${F.n} measurement${F.n > 1 ? 's' : ''}: in-the-round width × ${F.roundW.toFixed(3)}, flat width × ${F.flatW.toFixed(3)}, height × ${F.h.toFixed(3)}.<br>Prediction error on these pieces: <b>${F.before.toFixed(1)}%</b> before, <b>${F.after.toFixed(1)}%</b> after.</p>
        <label class="chk" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="calUseCorr"${p.corr ? ' checked' : ''}> Apply this correction to new designs</label>
        <p class="note">With one or two pieces the correction mostly reflects those pieces; it gets trustworthy after three or more.</p>`;
    }
  }
  h += `<h3>How to make a calibration swatch</h3><ol style="margin:0;padding-left:20px">
    <li>Use the yarn and hook you will make the piece with.</li>
    <li>Chain 24. Work 20 rows in the stitch you want to calibrate (sc, hdc or dc), turning with the usual turning chain. For super bulky or jumbo yarn, 14 ch and 12 rows is enough.</li>
    <li>Lay it flat without stretching. Measure the middle 10 cm, at least 2 cm in from every edge: the edges are always tighter or looser.</li>
    <li>Count the stitches across and the rows up that 10 cm (or count a whole number of stitches and measure them).</li>
    <li>Blocking: measure it the way the finished piece will be. Acrylic: don't block, measure as is. Wool or cotton you will wash: wet-block, let it dry, then measure. Picotlab does not block for you.</li>
    <li>For hats and other pieces worked in the round, a finished-piece check matters more: fabric in rounds often comes out a few percent wider than a flat swatch.</li></ol>`;
  h += `<h3>Export / import</h3><textarea id="calIO" style="min-height:80px;font:12px/1.5 var(--mono)" placeholder="Export fills this with your profiles as text. Paste text here and press Import to load profiles."></textarea>
    <div class="btns" style="margin-top:6px"><button class="btn" id="calExp">Export all</button><button class="btn" id="calImp">Import</button></div>`;
  b.innerHTML = h;
  calWire(p);
}
function calWire(p) {
  const b = $('calBody');
  $('calPick').onchange = e => { CAL.edit = e.target.value; renderCal(); };
  $('calNew').onclick = async () => { const q = { id: newId(), name: `My ${YARN[S.spec ? S.spec.yarn : 4].name.toLowerCase()}, ${(S.g && S.g.hook) || 5} mm`, yarn: S.spec ? S.spec.yarn : 4, hook: (S.g && S.g.hook) || 5, swatches: {}, checks: [] }; CAL.profiles.push(q); CAL.edit = q.id; await calSaveProfile(q); renderCal(); };
  if (!p) return;
  $('calUse').onclick = async () => { CAL.active = p.id; await calSaveActive(); calRefresh(); };
  $('calNone').onclick = async () => { CAL.active = ''; await calSaveActive(); calRefresh(); };
  $('calDel').onclick = async e => { const bt = e.currentTarget; if (bt.dataset.sure !== '1') { bt.dataset.sure = '1'; bt.textContent = 'Click again to delete'; return; } await calDelete(p.id); calRefresh(); };
  b.querySelectorAll('[data-f]').forEach(el => el.addEventListener('change', async () => {
    const f = el.dataset.f, v = el.value;
    if (f.startsWith('m.')) return;
    if (f === 'name' || f === 'yarnName') p[f] = v.trim() || p[f];
    else if (f === 'yarn') p.yarn = +v;
    else if (f === 'hook') p.hook = Math.max(1, +v || p.hook);
    else if (f.startsWith('sw.')) {
      const [, st, k] = f.split('.'); p.swatches = p.swatches || {}; const sw = p.swatches[st] = p.swatches[st] || {};
      if (v === '' || !(+v > 0)) delete sw[k]; else sw[k] = +v;
      if (k === 'sts' || k === 'rows') { delete sw.n; delete sw.wcm; delete sw.m; delete sw.hcm; } else { delete sw.sts; delete sw.rows; }
      if (!Object.keys(sw).length) delete p.swatches[st];
    }
    if (p.corr) p.corr = fitCorrection(p.checks || []);
    await calSaveProfile(p); if (p.id === CAL.active) calRefresh(); else renderCal();
  }));
  const add = $('calAddCheck');
  if (add) add.onclick = async () => {
    const pr = currentPrediction(), mw = +b.querySelector('[data-f="m.w"]').value, ml = +b.querySelector('[data-f="m.l"]').value; if (!pr || !(mw > 0 || ml > 0)) return;
    const c = { at: new Date().toISOString().slice(0, 10), label: `${$('pieceTitle').textContent}, ${new Date().toISOString().slice(0, 10)}`, round: pr.round };
    if (mw > 0) c.width = { label: pr.wl.toLowerCase(), pred: pr.w, meas: mw };
    if (ml > 0) c.length = { label: pr.ll.toLowerCase(), pred: pr.l, meas: ml };
    (p.checks = p.checks || []).push(c); p.corr = fitCorrection(p.checks);
    await calSaveProfile(p); if (p.id === CAL.active) calRefresh(); else renderCal();
  };
  b.querySelectorAll('[data-del]').forEach(el => el.onclick = async () => { p.checks.splice(+el.dataset.del, 1); if (p.corr) p.corr = p.checks.length ? fitCorrection(p.checks) : null; await calSaveProfile(p); if (p.id === CAL.active) calRefresh(); else renderCal(); });
  const uc = $('calUseCorr'); if (uc) uc.onchange = async () => { p.corr = uc.checked ? fitCorrection(p.checks || []) : null; await calSaveProfile(p); if (p.id === CAL.active) calRefresh(); else renderCal(); };
  $('calExp').onclick = () => { const t = JSON.stringify({ picotlab: 'calibration', v: 1, profiles: CAL.profiles }, null, 1); $('calIO').value = t; $('calIO').select(); copyText(t, $('calExp')); };
  $('calImp').onclick = async () => {
    try { const j = JSON.parse($('calIO').value); const list = (j.profiles || []).filter(q => q && q.id && q.name && YARN[q.yarn]); for (const q of list) { const i = CAL.profiles.findIndex(x => x.id === q.id); if (i >= 0) CAL.profiles[i] = q; else CAL.profiles.push(q); await calSaveProfile(q); } CAL.msg = `Imported ${list.length} profile${list.length === 1 ? '' : 's'}.`; }
    catch (e) { CAL.msg = 'That text is not a Picotlab profile export.'; }
    renderCal();
  };
}
function initCal() {
  $('calBtn').onclick = () => { CAL.edit = CAL.active || (CAL.profiles[0] && CAL.profiles[0].id) || ''; CAL.msg = ''; renderCal(); $('cal').hidden = false; $('calClose').focus(); };
  $('calClose').onclick = () => { $('cal').hidden = true; $('calBtn').focus(); };
  $('cal').addEventListener('keydown', e => { if (e.key === 'Escape') $('calClose').click(); });
  $('cal').addEventListener('click', e => { if (e.target === $('cal')) $('calClose').click(); });
  calLoad();
}
