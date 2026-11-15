// Paste into the page (browser devtools or the browser pane's javascript tool) to audit the current viewport.
// Reports: horizontal overflow, visible tap targets under 44 px, and text below WCAG AA contrast.
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
__audit()
