
// ---------- walkthrough: work the pattern on screen, stitch by stitch ----------
// Hook motions are a simplified teaching animation (keyframed poses, loops drawn as tubes), not a yarn physics simulation.
var W = { on: false, steps: [], i: 0, playing: false, speed: 0.5, t: 0, first: new Set(), lines: [], nodeUpTo: null, lastI: -1, lastLine: -1 };
var CU = null;
const POSE = { rest: [0.2, 1.3, 0.9], insert: [0, -0.15, -0.5], insertSame: [0, -0.15, -0.5], insertNext: [1, -0.15, -0.5], insertRing: [0, -0.35, -0.45],
  insertFront: [0, -0.95, -0.45], insertBack: [0, -0.95, 0.55], pull: [0.1, 1.0, 0.75], through: [0.25, 1.35, 0.95] };
const speedOf = v => 0.25 * Math.pow(2, v / 10); // 0.25 … 256 steps per second
const isHuman = st => !!(st && (st.human || st.op === 'unread'));
function closeupFor(i) { if (isHuman(W.steps[i])) return false; return W.speed <= 1.5 || (W.speed <= 8 && W.first.has(i)); }
function stepDur(i) { const b = 1 / W.speed; if (isHuman(W.steps[i])) return Math.max(b, 2.5); if (!closeupFor(i)) return b; return Math.max(b, phasesFor(W.steps[i]).length * 0.42); }

function walkSetup() {
  const D = S.D; if (!D) return;
  W.steps = D.pasted ? pastedSteps(D) : walkSteps(D); W.i = Math.min(W.i, W.steps.length - 1); W.t = 0; W.lastI = -1; W.lastLine = -1;
  W.first = new Set(); const seen = new Set();
  W.steps.forEach((s, i) => { const k = s.op + '/' + s.st + '/' + (s.into || ''); if (!seen.has(k)) { seen.add(k); W.first.add(i); } });
  W.nodeUpTo = new Int32Array(W.steps.length); let m = 0; W.steps.forEach((s, i) => { if (s.node > m) m = s.node; W.nodeUpTo[i] = m; });
  W.lines = D.pasted ? D.pasted.res.lines.map(l => l.text) : $('pattern').value.split('\n');
  $('walkLines').innerHTML = D.pasted ? pastedLinesHTML(D.pasted) : W.lines.map((l, i) => `<div data-l="${i}">${esc(l) || '&nbsp;'}</div>`).join('');
  $('wScrub').max = String(Math.max(0, W.steps.length - 1));
  walkUI(true);
}
function walkToggle(on) {
  W.on = on; $('walk').setAttribute('aria-pressed', String(on));
  $('walkSec').hidden = !on; $('pattern').hidden = on; $('sim').hidden = on;
  if (on) { if (S.running) stop(); W.i = 0; W.t = 0; W.playing = false; initCloseup(); walkSetup(); if (window.innerWidth < 1060) $('walkSec').scrollIntoView({ block: 'nearest' }); }
  else { W.playing = false; $('closeup').hidden = true; revealAll(); }
  $('wPlay').textContent = 'Play';
}
function walkGo(i) { W.i = clamp(i, 0, W.steps.length - 1); W.t = 0; walkUI(true); }
function walkUI(force) {
  if (!W.on || !W.steps.length) return;
  if (!force && W.i === W.lastI) return; W.lastI = W.i;
  const s = W.steps[W.i];
  $('walkNow').textContent = s.label; $('walkNow').classList.toggle('human', isHuman(s));
  $('walkPos').textContent = `step ${(W.i + 1).toLocaleString()} of ${W.steps.length.toLocaleString()}`;
  $('wScrub').value = String(W.i); $('wScrubV').textContent = s.kind === 'round' || s.kind === 'unread' ? `R${s.r + 1}` : s.kind === 'granny' ? `Rnd ${s.r + 1}` : s.row === 0 ? 'foundation' : `${D_unit()} ${s.row}`;
  const L = S.D && S.D.pasted ? (s.line == null ? -1 : s.line) : lineForStep(W.lines, s);
  if (L !== W.lastLine) {
    const box = $('walkLines'), prev = box.querySelector('.cur'); prev && prev.classList.remove('cur');
    const el = box.querySelector(`[data-l="${L}"]`); if (el) { el.classList.add('cur'); const top = el.offsetTop - box.clientHeight / 2 + el.clientHeight; box.scrollTop = Math.max(0, top); }
    W.lastLine = L;
  }
}
function D_unit() { return S.D && S.D.cand && S.D.cand.type === 'tube' ? 'Rnd' : 'Row'; }

// reveal the piece up to the current step and put the hook on the working stitch
function revealAll() {
  if (!G.ok || !S.sim) return;
  if (G.iL) { G.iL.count = G.iR.count = S.sim.N - 1; }
  if (G.skin) G.skin.geometry.setDrawRange(0, Infinity);
  if (G.cloth) G.cloth.geometry.setDrawRange(0, Infinity);
  if (G.fringe) G.fringe.visible = true;
  if (G.pom) G.pom.visible = true;
  if (G.hookMain) G.hookMain.visible = false;
}
function hookMesh(mm, scale) {
  const g = new THREE.Group(), r = mm / 20 * scale, L = 13 * scale, mat = new THREE.MeshStandardMaterial({ color: 0x8fa3b8, metalness: 0.55, roughness: 0.35 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 16), mat); shaft.position.y = L / 2 + r * 3; g.add(shaft);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, r * 3, 16), mat); neck.position.y = r * 1.5; g.add(neck);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(r * 0.8, 14, 10), mat); g.add(tip);
  const throat = new THREE.Mesh(new THREE.TorusGeometry(r * 0.9, r * 0.35, 8, 16, Math.PI * 1.1), mat); throat.position.set(r * 0.6, r * 0.6, 0); throat.rotation.z = -0.3; g.add(throat);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.5, r * 1.5, L * 0.35, 16), new THREE.MeshStandardMaterial({ color: 0xf2c53d, roughness: 0.6 })); grip.position.y = L * 0.7; g.add(grip);
  return g;
}
const _v = { a: null, b: null, n: null };
function walkReveal() {
  const sim = S.sim, s = W.steps[W.i]; if (!G.ok || !sim || !s) return;
  if (!G.hookMain || G.hookMain.userData.mm !== S.g.hook) { if (G.hookMain) G.scene.remove(G.hookMain); G.hookMain = hookMesh(S.g.hook, 1); G.hookMain.userData.mm = S.g.hook; G.scene.add(G.hookMain); }
  if (!_v.a) { _v.a = new THREE.Vector3(); _v.b = new THREE.Vector3(); _v.n = new THREE.Vector3(); }
  const H = G.hookMain; H.visible = true;
  const up = _v.b.set(0, 1, 0);
  if (sim.type === 'rounds') {
    const nodes = W.nodeUpTo[W.i]; G.iL.count = G.iR.count = nodes;
    const last = W.i === W.steps.length - 1 || W.steps[W.i + 1].r !== s.r, done = s.r + (last ? 1 : 0);
    G.skin.geometry.setDrawRange(0, done > 0 ? sim.triEnd[done - 1] : 0);
    if (G.pom) G.pom.visible = W.i === W.steps.length - 1;
    const id = Math.max(0, nodes), P = sim.pos, j = id * 3, na = G.nrmAttr.array;
    _v.n.set(na[j], na[j + 1], na[j + 2]); if (_v.n.lengthSq() < 0.1) _v.n.set(0, 1, 0);
    H.position.set(P[j], P[j + 1], P[j + 2]).addScaledVector(_v.n, 0.25);
    _v.a.copy(_v.n).multiplyScalar(0.7).addScaledVector(up, 0.7).normalize(); H.quaternion.setFromUnitVectors(up, _v.a);
  } else {
    const c = S.D.cand, nx = sim.nx, ny = sim.ny;
    let f = c.type === 'granny' ? W.i / Math.max(1, W.steps.length - 1) : s.row === 0 ? 0 : (s.row - 1 + (s.made || 0) / c.n) / c.rows;
    if (W.i === W.steps.length - 1) f = 1;
    const rows = Math.ceil(f * (ny - 1)); G.cloth.geometry.setDrawRange(0, rows * (nx - 1) * 6);
    if (G.fringe) G.fringe.visible = f >= 1;
    const gi = Math.round(clamp(s.x == null ? 0.5 : s.x, 0, 1) * (nx - 1)), gj = Math.min(ny - 1, Math.max(0, rows)), k = (gj * nx + gi) * 3, P = sim.pos;
    H.position.set(P[k], P[k + 1] + 0.3, P[k + 2]);
    _v.a.set(0.35, 1, 0.45).normalize(); H.quaternion.setFromUnitVectors(up, _v.a);
  }
}

// ---------- close-up inset ----------
function initCloseup() {
  if (!G.ok || CU) return;
  try {
    const cv = $('closeCv'), R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); R.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 4 / 3, 0.1, 100); cam.position.set(1.4, 1.2, 8); cam.lookAt(0.4, 0.2, 0);
    scene.add(new THREE.HemisphereLight(0xfff6ea, 0x1d3b32, 0.9)); const d = new THREE.DirectionalLight(0xffffff, 0.75); d.position.set(3, 6, 5); scene.add(d);
    const yarnMat = new THREE.MeshStandardMaterial({ roughness: 0.85 }), baseMat = new THREE.MeshStandardMaterial({ color: 0xe9dfc8, roughness: 0.9 });
    const tube = (pts, r, mat) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2]))), 20, r, 7, false), mat);
    const base = new THREE.Group();
    for (let x = -2; x <= 2; x++) {
      const m = x === 0 ? yarnMat : baseMat;
      for (const z of [0.13, -0.13]) base.add(tube([[x - 0.48, 0, z], [x - 0.2, -0.2, z * 1.6], [x + 0.2, -0.2, z * 1.6], [x + 0.48, 0, z]], 0.09, m));
      base.add(tube([[x, -0.25, 0], [x - 0.1, -0.8, 0.06], [x + 0.05, -1.4, 0]], 0.12, m));
      base.add(tube([[x - 0.48, -1.5, 0], [x, -1.72, 0.14], [x + 0.48, -1.5, 0]], 0.09, baseMat));
    }
    scene.add(base);
    const hook = hookMesh(10, 0.62); scene.add(hook);
    const dyn = new THREE.Group(); scene.add(dyn);
    const dir = new THREE.Vector3(0.5, 0.78, 0.38).normalize();
    hook.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    CU = { R, scene, cam, hook, dyn, yarnMat, tube, dir, tip: new THREE.Vector3(), q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir), lastKey: '' };
  } catch (e) { CU = null; }
}
function poseBefore(P, k) { for (let q = k; q >= 0; q--) if (POSE[P[q].a]) return POSE[P[q].a]; return POSE.rest; }
function drawCloseup(step, u) {
  if (!CU) return;
  const box = $('closeup'), w = box.clientWidth, h = box.clientHeight; if (w < 20) return;
  if (CU.w !== w || CU.h !== h) { CU.R.setSize(w, h, false); CU.cam.aspect = w / h; CU.cam.updateProjectionMatrix(); CU.w = w; CU.h = h; }
  const P = phasesFor(step), n = P.length, f = clamp(u, 0, 0.999) * n, pi = Math.floor(f), t = f - pi, ph = P[pi];
  const a = pi ? poseBefore(P, pi - 1) : POSE.rest, b = POSE[ph.a] || a, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const tip = CU.tip.set(a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e);
  CU.hook.position.copy(tip);
  while (CU.dyn.children.length) { const m = CU.dyn.children.pop(); m.geometry.dispose(); }
  CU.yarnMat.color.set(YARNS[S.yarn][1]);
  const V = (x, y, z) => new THREE.Vector3(x, y, z), d = CU.dir, along = k => tip.clone().addScaledVector(d, k);
  const loops = t > 0.6 ? ph.loops : (pi ? P[pi - 1].loops : 1);
  for (let i = 0; i < loops; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.075, 8, 20), CU.yarnMat); ring.position.copy(along(0.75 + i * 0.32)); ring.quaternion.copy(CU.q); CU.dyn.add(ring); }
  const ball = V(3.4, 3.6, -1.6), first = along(0.75);
  if (ph.a === 'yo' || ph.a === 'yoKeep') { const w1 = along(0.45 + 0.6 * (1 - e)); CU.dyn.add(CU.tube([ball, along(1.4).add(V(0.6, 0.2, -0.4)), w1.clone().add(V(0.3, 0.05, -0.28)), w1.clone().add(V(-0.05, 0.1, 0.3)), w1.clone().add(V(-0.3, -0.05, 0))], 0.075, CU.yarnMat)); }
  else CU.dyn.add(CU.tube([ball, along(2).add(V(0.7, 0.3, -0.3)), first.clone().add(V(0.25, 0, -0.1))], 0.075, CU.yarnMat));
  if (ph.a === 'pull' || (ph.a === 'through' && t < 0.5)) { const top = tip.clone(); CU.dyn.add(CU.tube([V(-0.18, -0.1, -0.25), top.clone().add(V(-0.12, -0.05, 0)), top.clone().add(V(0.12, 0.05, 0)), V(0.18, -0.1, -0.25)], 0.07, CU.yarnMat)); }
  if (ph.a === 'through') { const k = Math.max(1, (pi ? P[pi - 1].loops : 1)); CU.dyn.add(CU.tube([tip, along(0.4 + k * 0.32 * e)], 0.07, CU.yarnMat)); }
  const key = step.i + '/' + pi;
  if (key !== CU.lastKey) { $('closeCap').innerHTML = `${esc(ph.text)}<small>${OP_NAME[step.op]} · move ${pi + 1} of ${n} · ${ph.loops} loop${ph.loops > 1 ? 's' : ''} on hook · simplified teaching animation</small>`; CU.lastKey = key; }
  CU.R.render(CU.scene, CU.cam);
}

// ---------- per-frame driver (called from the main loop) ----------
function walkFrame(dt) {
  if (!W.on || !W.steps.length) return;
  if (W.playing) {
    W.t += dt; let guard = 0;
    while (W.t >= stepDur(W.i) && guard++ < 2000) {
      W.t -= stepDur(W.i);
      if (W.i >= W.steps.length - 1) { W.playing = false; W.t = 0; $('wPlay').textContent = 'Replay'; break; }
      W.i++;
      if (isHuman(W.steps[W.i])) { W.playing = false; W.t = 0; $('wPlay').textContent = 'Play'; break; } // stop and let a person read the line
    }
  }
  walkUI(false); walkReveal();
  const cu = closeupFor(W.i) && !!CU; $('closeup').hidden = !cu;
  if (cu) drawCloseup(W.steps[W.i], W.playing ? W.t / stepDur(W.i) : 0.999);
}
function initWalk() {
  $('walk').onclick = () => walkToggle(!W.on);
  $('wPlay').onclick = () => { if (W.i >= W.steps.length - 1) walkGo(0); W.playing = !W.playing; $('wPlay').textContent = W.playing ? 'Pause' : 'Play'; };
  $('wFwd').onclick = () => { W.playing = false; $('wPlay').textContent = 'Play'; walkGo(W.i + 1); W.t = 0; };
  $('wBack').onclick = () => { W.playing = false; $('wPlay').textContent = 'Play'; walkGo(W.i - 1); };
  $('wScrub').oninput = e => { W.playing = false; $('wPlay').textContent = 'Play'; walkGo(+e.target.value); };
  const sp = $('wSpeed'), upd = () => { W.speed = speedOf(+sp.value); $('wSpeedV').textContent = W.speed < 1 ? `1 stitch / ${Math.round(1 / W.speed * 10) / 10} s` : `${Math.round(W.speed)} stitches / s`; };
  sp.oninput = upd; upd();
}

initThree();
initUI();
initWalk();
initPaste();
initPhoto();
initCal();
$('prompt').value = EXAMPLES[0];
designFromPrompt();
requestAnimationFrame(frame);
