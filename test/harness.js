// Paste into the page in a browser at the size under test. Adds the viewport meta that the artifact publisher adds,
// the layout audit (window.__audit) and a driver for each user flow (window.__flows). Used for the H-07 phone/dark pass.
(() => { if (!document.querySelector('meta[name=viewport]')) { const m = document.createElement('meta'); m.name = 'viewport'; m.content = 'width=device-width,initial-scale=1,viewport-fit=cover'; document.head.appendChild(m); } })();
window.__audit = () => {
  const vw = document.documentElement.clientWidth, out = { vw, scrollW: document.documentElement.scrollWidth, wide: [], small: [], lowContrast: [] };
  const vis = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden]'); };
  const name = el => el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '') + (el.dataset.k ? `[${el.dataset.k}]` : '') + (el.textContent ? ` "${el.textContent.trim().slice(0, 24)}"` : '');
  for (const el of document.querySelectorAll('body *')) { if (!vis(el)) continue; const r = el.getBoundingClientRect(); if (r.right > vw + 1 && !el.closest('.mat')) out.wide.push(`${name(el)} right=${Math.round(r.right)}`); }
  for (const el of document.querySelectorAll('button, select, input, textarea, summary, a[href], .chip, tr[tabindex]')) {
    if (!vis(el)) continue; const lab = (el.type === 'checkbox' || el.type === 'radio') && el.closest('label'); const r = (lab || el).getBoundingClientRect();
    if (el.type === 'range') { if (r.height < 44) out.small.push(`${name(el)} ${Math.round(r.width)}×${Math.round(r.height)}`); continue; }
    if (r.height < 44 || r.width < 44) out.small.push(`${name(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  const rgb = c => { const m = c.match(/[\d.]+/g); return m ? m.slice(0, 4).map(Number) : [0, 0, 0, 0]; };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = el => { const stack = []; for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c[3] === undefined) c[3] = 1; if (c[3] > 0) { stack.push(c); if (c[3] >= 1) break; } } let base = [255, 255, 255]; for (let i = stack.length - 1; i >= 0; i--) { const [r, g, b, a] = stack[i]; base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)]; } return base; };
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el) || el.closest('.mat') || el.closest('canvas')) continue;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()); if (!own) continue;
    const cs = getComputedStyle(el), fg = rgb(cs.color), bg = bgOf(el), L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const big = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700), need = big ? 3 : 4.5;
    if (ratio < need) { const k = name(el) + ' ' + ratio.toFixed(2); if (!seen.has(cs.color + bg)) { seen.add(cs.color + bg); out.lowContrast.push(k); } }
  }
  out.counts = { wide: out.wide.length, small: out.small.length, lowContrast: out.lowContrast.length };
  return out;
};
(() => {
  const wait = ms => new Promise(r => setTimeout(r, ms)), chip = t => [...document.querySelectorAll('.chip')].find(b => b.textContent.startsWith(t)).click(), top = el => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 6);
  window.__flows = {
    prompt: async () => { $('sheet').hidden = true; $('cal').hidden = true; if (W.on) walkToggle(false); window.scrollTo(0, 0); },
    hat: async () => { chip('Slouchy'); await wait(2500); top($('mat')); },
    scarf: async () => { chip('Chunky'); await wait(3000); top($('mat')); },
    blanket: async () => { chip('Baby blanket'); await wait(3500); top($('mat')); },
    walkthrough: async () => { chip('Slouchy'); await wait(2000); if (!W.on) $('walk').click(); const sp = $('wSpeed'); sp.value = 0; sp.dispatchEvent(new Event('input')); $('wScrub').value = 30; $('wScrub').dispatchEvent(new Event('input')); if (!W.playing) $('wPlay').click(); await wait(1300); top($('mat')); await wait(200); },
    walkpanel: async () => { if (W.playing) $('wPlay').click(); top($('walkSec')); },
    fit: async () => { if (W.on) walkToggle(false); chip('Slouchy'); await wait(2000); document.querySelector('#fitBody tr[data-h="56"]').click(); await wait(1500); top($('fitSec')); await wait(300); top($('fitSec')); }, // take the screenshot after a separate scroll: the page can still move
    sheet: async () => { $('sheetBtn').click(); await wait(300); $('sheet').scrollTop = 0; },
    calibrate: async () => { $('sheet').hidden = true; $('calBtn').click(); await wait(200); if (!CAL.profiles.length) { $('calNew').click(); await wait(300); } const set = (f, v) => { const e = document.querySelector(`#calBody [data-f="${f}"]`); e.value = v; e.dispatchEvent(new Event('change')); }; const el = document.querySelector('#calBody [data-f="sw.hdc.n"]'); if (el && !el.value) { set('sw.hdc.n', 20); await wait(100); set('sw.hdc.wcm', 16.5); await wait(100); set('sw.hdc.m', 10); await wait(100); set('sw.hdc.hcm', 10.8); await wait(200); } await wait(500); const r = [...document.querySelectorAll('#calBody .swt tr')][2]; $('cal').scrollTop = r.getBoundingClientRect().top - $('cal').getBoundingClientRect().top + $('cal').scrollTop - 40; },
    photo: async () => { $('cal').hidden = true; const c = document.createElement('canvas'); c.width = 600; c.height = 800; const g = c.getContext('2d'); g.fillStyle = '#d8d4cc'; g.fillRect(0, 0, 600, 800); g.fillStyle = '#c0503a'; g.beginPath(); g.ellipse(300, 420, 170, 250, 0, 0, Math.PI * 2); g.fill(); const blob = await new Promise(r => c.toBlob(r, 'image/png')); $('photoSec').open = true; photoLoad(new File([blob], 'egg.png')); await wait(900); top($('photoSec')); },
  };
  window.__theme = t => { if (t === 'dark') document.documentElement.dataset.theme = 'dark'; else document.documentElement.removeAttribute('data-theme'); drawSchematic(); drawConv(); if (S.D) updateStats(); };
  window.__auditAll = async () => { const res = {}; for (const theme of ['light', 'dark']) { __theme(theme); for (const [k, f] of Object.entries(__flows)) { await f(); await wait(300); drawSchematic(); const a = __audit(); if (a.counts.wide || a.counts.small || a.counts.lowContrast) res[theme + ':' + k] = { scrollW: a.scrollW, wide: a.wide.slice(0, 6), small: a.small.slice(0, 10), low: a.lowContrast }; } } __theme('light'); $('sheet').hidden = true; $('cal').hidden = true; return res; };
})();
'harness ready';
