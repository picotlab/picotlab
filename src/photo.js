
// ---------- photo → pattern ----------
var PH = { w: 0, h: 0, img: null, mask: null, prof: null, tracing: false, poly: [], map: null };
function photoLoad(file) {
  const rd = new FileReader();
  rd.onload = () => { const im = new Image(); im.onload = () => {
    const k = 220 / Math.max(im.width, im.height), w = Math.max(8, Math.round(im.width * k)), h = Math.max(8, Math.round(im.height * k));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); g.drawImage(im, 0, 0, w, h);
    PH.w = w; PH.h = h; PH.img = cv; PH.px = g.getImageData(0, 0, w, h).data; PH.poly = []; PH.tracing = false;
    $('photoCv').hidden = false; ['phAuto', 'phTrace'].forEach(id => ($(id).disabled = false)); photoAuto();
  }; im.onerror = () => { $('phNote').textContent = 'That file could not be read as an image.'; }; im.src = rd.result; };
  rd.readAsDataURL(file);
}
function photoAuto() { PH.tracing = false; $('phTrace').textContent = 'Trace outline'; PH.mask = maskFromImage(PH.px, PH.w, PH.h); photoProfile('auto-detected'); }
function photoProfile(how) {
  PH.prof = profileFromMask(PH.mask, PH.w, PH.h); $('phUse').disabled = !PH.prof;
  $('phNote').textContent = PH.prof ? `Outline ${how}: ${Math.round(PH.prof.widthPx)} × ${Math.round(PH.prof.heightPx)} px, so about ${r1(+$('phH').value * PH.prof.aspect)} cm wide at ${$('phH').value} cm tall. ${PH.prof.closed ? 'Closed at both ends: worked as a stuffed shape.' : 'Open at the wide end: worked like a hat or bowl.'} Started at the ${PH.prof.flip ? 'top' : 'bottom'} (the narrow end). If the outline is wrong, trace it.` : 'No clear outline found. Try Trace outline.';
  photoDraw();
}
function photoDraw() {
  if (!PH.img) return; const cv = $('photoCv'), { g, w, h } = fitCanvas(cv); g.clearRect(0, 0, w, h);
  const k = Math.min(w / PH.w, h / PH.h), ox = (w - PH.w * k) / 2, oy = (h - PH.h * k) / 2; PH.map = { k, ox, oy };
  g.imageSmoothingEnabled = true; g.drawImage(PH.img, ox, oy, PH.w * k, PH.h * k);
  if (PH.mask && !PH.tracing) { g.fillStyle = 'rgba(242,197,61,.38)'; for (let y = 0; y < PH.h; y++) for (let x = 0; x < PH.w; x++) if (PH.mask[y * PH.w + x]) g.fillRect(ox + x * k, oy + y * k, k + 0.5, k + 0.5); }
  if (PH.prof && !PH.tracing) { // the fitted half-profile, mirrored
    g.strokeStyle = css('--target'); g.lineWidth = 2; const p = PH.prof.pts, cx = (() => { let a = 0, n = 0; for (let i = 0; i < PH.mask.length; i++) if (PH.mask[i]) { a += i % PH.w; n++; } return n ? a / n : PH.w / 2; })();
    const y0 = (() => { for (let y = 0; y < PH.h; y++) for (let x = 0; x < PH.w; x++) if (PH.mask[y * PH.w + x]) return y; return 0; })(), y1 = y0 + PH.prof.heightPx;
    for (const sg of [1, -1]) { g.beginPath(); p.forEach(([r, z], i) => { const y = PH.prof.flip ? y0 + z : y1 - z; const X = ox + (cx + sg * r) * k, Y = oy + y * k; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke(); }
  }
  if (PH.poly.length) { g.strokeStyle = css('--fit'); g.fillStyle = css('--fit'); g.lineWidth = 2; g.beginPath(); PH.poly.forEach(([x, y], i) => { const X = ox + x * k, Y = oy + y * k; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); if (!PH.tracing) g.closePath(); g.stroke(); PH.poly.forEach(([x, y]) => { g.beginPath(); g.arc(ox + x * k, oy + y * k, 3, 0, TAU); g.fill(); }); }
}
function photoUse() {
  if (!PH.prof) return;
  SHAPES.photo = shapeFromProfile(PH.prof);
  const R = S.raw || { set: {} }, keep = {}; for (const k of ['yarn', 'hook', 'gauge']) if (R.set && R.set[k]) keep[k] = R[k];
  S.raw = Object.assign({ item: 'ami', style: 'photo', height: Math.max(2, +$('phH').value || 10), set: { item: true, style: true, height: true } }, keep);
  for (const k of Object.keys(keep)) S.raw.set[k] = true;
  $('prompt').value = ''; applySpec(true);
  if (window.innerWidth < 1060) $('mat').scrollIntoView({ block: 'start' });
}
function initPhoto() {
  $('photoFile').onchange = e => e.target.files[0] && photoLoad(e.target.files[0]);
  $('phAuto').onclick = photoAuto;
  $('phTrace').onclick = () => {
    if (!PH.tracing) { PH.tracing = true; PH.poly = []; $('phTrace').textContent = 'Finish outline'; $('phNote').textContent = 'Click around the edge of the piece; press Finish outline (or double-click) when you are back at the start.'; photoDraw(); return; }
    PH.tracing = false; $('phTrace').textContent = 'Trace outline';
    if (PH.poly.length >= 3) { PH.mask = maskFromPolygon(PH.poly, PH.w, PH.h); photoProfile('traced'); } else photoAuto();
  };
  const cv = $('photoCv');
  cv.addEventListener('pointerdown', e => { if (!PH.tracing || !PH.map) return; const r = cv.getBoundingClientRect(), x = (e.clientX - r.left - PH.map.ox) / PH.map.k, y = (e.clientY - r.top - PH.map.oy) / PH.map.k; if (x >= 0 && y >= 0 && x <= PH.w && y <= PH.h) { PH.poly.push([x, y]); photoDraw(); } });
  cv.addEventListener('dblclick', () => PH.tracing && $('phTrace').click());
  $('phH').oninput = () => PH.prof && photoProfile(/traced/.test($('phNote').textContent) ? 'traced' : 'auto-detected');
  $('phUse').onclick = photoUse;
  addEventListener('resize', photoDraw);
}
