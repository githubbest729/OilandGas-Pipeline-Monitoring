/* Oil & Gas Pipeline Monitoring: SCADA Engineering Field Guide
   Arab Global Oil & Gas Operations (agac.ae), Dubai, UAE
   Zero build step. Single init lifecycle: only this file runs init(). */
(function () {
'use strict';

/* =====================================================================
   1. CONSTANTS, UTILITIES, PHYSICAL CLAMPS
   ===================================================================== */
var SHARE_URL = 'https://githubbest729.github.io/OilandGas-Pipeline-Monitoring/';
var APP_VERSION = '1.0.0';
var G = 9.80665;
var LIM = {
  SG: [0.5, 2.0],
  BETA: [0.0001, 0.0025],   // 1/degC
  MA: [0.0, 25.0],          // mA hard limits; NE43 fault ranges 3.6 / 21.0
  FLOW: [1, 30000],         // m3/h
  PRESS_BAR: [0, 250],      // bar g
  LEN_KM: [0.01, 2000],
  DIA_MM: [25, 2000]
};

function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function isNum(v) { return typeof v === 'number' && isFinite(v); }

/* Defensive numeric read: never touches .value on a missing node. */
function numVal(sel, def, lo, hi) {
  var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  var raw = el ? parseFloat(el.value) : NaN;
  var v = isNum(raw) ? raw : def;
  return clamp(v, lo, hi);
}
function setVal(sel, v) {
  var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (el) el.value = String(v);
}
function setText(sel, t) {
  var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (el) el.textContent = t;
}
function setHTML(sel, h) {
  var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (el) el.innerHTML = h;
}
function on(sel, ev, fn, opts) {
  var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (el) el.addEventListener(ev, fn, opts);
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}
function fmt(v, d) {
  if (!isNum(v)) return '-';
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function stamp() { var d = new Date(); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()); }

/* =====================================================================
   2. PREFERENCES AND MODES (Sunlight / Battery Saver / Mute)
   ===================================================================== */
var PREF_KEY = 'og-scada-prefs-v1';
var prefs = { sun: false, batt: false, mute: false };
function loadPrefs() {
  try { var o = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); if (o && typeof o === 'object') { prefs.sun = !!o.sun; prefs.batt = !!o.batt; prefs.mute = !!o.mute; } } catch (e) { /* storage blocked */ }
}
function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } }

var theme = {};
function readTheme() {
  var cs = getComputedStyle(document.documentElement);
  function g(n, d) { var v = cs.getPropertyValue(n); return v && v.trim() ? v.trim() : d; }
  theme = { bg: g('--bg', '#0a0f1d'), text: g('--text', '#e8edf7'), muted: g('--muted', '#93a0bb'), accent: g('--accent', '#5ec8ff'),
            ok: g('--ok', '#34d399'), warn: g('--warn', '#fbbf24'), crit: g('--crit', '#ff2d6f'), info: g('--info', '#22d3ee'),
            sun: !!prefs.sun };
}

function applyModes() {
  var r = document.documentElement;
  r.classList.toggle('sunlight-mode', !!prefs.sun);
  r.classList.toggle('battery-saver', !!prefs.batt);
  var pairs = [['#btnSun', prefs.sun], ['#btnBatt', prefs.batt], ['#btnMute', prefs.mute]];
  pairs.forEach(function (p) { var b = $(p[0]); if (b) b.setAttribute('aria-pressed', p[1] ? 'true' : 'false'); });
  var wave = $('#muteWave'); if (wave) wave.style.display = prefs.mute ? 'none' : '';
  var meta = $('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', (prefs.sun || prefs.batt) ? '#000000' : '#0B132B');
  readTheme();
  markAllDirty();
  scheduleTelemetry(); // re-time the timer for the new power profile
}

/* =====================================================================
   3. SENSORY FEEDBACK (haptics and Web Audio, zero audio files)
   ===================================================================== */
var actx = null;
function audioCtx() {
  if (prefs.mute) return null;
  try {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; actx = new AC(); }
    if (actx.state === 'suspended' && actx.resume) actx.resume();
    return actx;
  } catch (e) { return null; }
}
function tone(freq, dur, type, gain, delay) {
  var ctx = audioCtx(); if (!ctx) return;
  try {
    var t0 = ctx.currentTime + (delay || 0);
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type || 'sine'; osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.05, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  } catch (e) { /* ignore audio failures */ }
}
function haptic(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* unsupported (iOS Safari) */ } }
var fx = {
  tap: function () { haptic(10); tone(1900, 0.035, 'triangle', 0.035); },
  tick: function () { haptic(5); },
  ok: function () { haptic([10, 40, 10]); tone(660, 0.12, 'sine', 0.05); tone(990, 0.16, 'sine', 0.045, 0.09); },
  chime: function () { tone(880, 0.25, 'triangle', 0.06); tone(660, 0.35, 'triangle', 0.06, 0.2); },
  alarm: function () {
    haptic([220, 90, 220, 90, 440]);
    for (var i = 0; i < 3; i++) { tone(1040, 0.16, 'square', 0.04, i * 0.34); tone(780, 0.16, 'square', 0.04, i * 0.34 + 0.17); }
  }
};

var toastTimer = 0;
function toast(msg) {
  var t = $('#toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
}
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
  }
  return Promise.resolve(legacyCopy(text));
}
function legacyCopy(text) {
  try {
    var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-999px;top:0;opacity:0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    var ok = document.execCommand && document.execCommand('copy'); document.body.removeChild(ta); return !!ok;
  } catch (e) { return false; }
}
function download(name, text, mime) {
  try {
    var blob = new Blob([text], { type: mime || 'text/plain' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    return true;
  } catch (e) { return false; }
}

/* =====================================================================
   4. CANVAS LOOP ENGINE (visibility-aware, dirty-flag, throttled)
   ===================================================================== */
var loops = [];
var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
  es.forEach(function (e) { var L = e.target.__loop; if (L) { L.vis = e.isIntersecting; if (L.vis) L.dirty = true; } });
}, { threshold: 0 }) : null;

function addLoop(el, draw, continuous) {
  if (!el) return null;
  var L = { el: el, draw: draw, cont: continuous || null, dirty: true, vis: !io, last: 0 };
  el.__loop = L; loops.push(L);
  if (io) io.observe(el);
  return L;
}
function markAllDirty() { loops.forEach(function (L) { L.dirty = true; }); }
function frame(ts) {
  if (!document.hidden) {
    var minDt = prefs.batt ? 200 : 16;     // battery saver: 5 fps. Normal: up to 60 fps.
    for (var i = 0; i < loops.length; i++) {
      var L = loops[i];
      if (!L.vis) continue;
      var run = L.dirty || (L.cont && L.cont());
      if (!run || ts - L.last < minDt) continue;
      L.last = ts; L.dirty = false;
      try { L.draw(ts); } catch (e) { /* keep loop alive */ }
    }
  }
  requestAnimationFrame(frame);
}
function fitCanvas(c) {
  if (!c.dataset.h) c.dataset.h = c.getAttribute('height') || '300';
  var H = parseInt(c.dataset.h, 10) || 300;
  var dpr = prefs.batt ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  var w = Math.max(160, Math.round(c.clientWidth || c.parentNode.clientWidth || 320));
  c.style.height = H + 'px';
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(H * dpr); }
  var ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx: ctx, w: w, h: H };
}

/* =====================================================================
   5. UI SHELL: tabs, header, share, scroll collapse
   ===================================================================== */
function selectTab(id, silent) {
  var ok = false;
  $$('.tab').forEach(function (b) { var sel = b.getAttribute('data-tab') === id; b.setAttribute('aria-selected', sel ? 'true' : 'false'); if (sel) ok = true; });
  if (!ok) return;
  $$('.panel').forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + id); });
  if (id !== 'glance') exitGlanceFull();
  var w = $('#btnWidget'); if (w) w.setAttribute('aria-pressed', id === 'glance' ? 'true' : 'false');
  markAllDirty();
  if (!silent) { try { window.scrollTo(0, 0); } catch (e) { /* ignore */ } }
  try { localStorage.setItem('og-scada-tab', id); } catch (e) { /* ignore */ }
  var active = $('.tab[aria-selected="true"]'); if (active && active.scrollIntoView) { try { active.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) { /* ignore */ } }
}
function enterGlanceFull() {
  var p = $('#tab-glance'); if (!p) return;
  p.classList.add('glance-full'); document.body.style.overflow = 'hidden'; tickGlanceClock();
}
function exitGlanceFull() {
  var p = $('#tab-glance'); if (p) p.classList.remove('glance-full'); document.body.style.overflow = '';
}

function shareGuide() {
  var data = { title: document.title, text: 'Oil & Gas Pipeline Monitoring: SCADA Engineering Field Guide (AGAC Dubai)', url: SHARE_URL };
  function fallback() {
    copyText(SHARE_URL).then(function (ok) { toast(ok ? 'Link copied to clipboard' : 'Copy failed. URL: ' + SHARE_URL); });
  }
  if (navigator.share) {
    navigator.share(data).catch(function (e) { if (!e || e.name !== 'AbortError') fallback(); });
  } else { fallback(); }
}
function refreshApp() {
  toast('Checking for updates...');
  var done = function () { setTimeout(function () { location.reload(); }, 450); };
  if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistration) {
    navigator.serviceWorker.getRegistration().then(function (r) { if (r && r.update) return r.update(); }).then(done, done);
  } else { done(); }
}

var collapsed = false;
function onScroll() {
  var y = window.pageYOffset || document.documentElement.scrollTop || 0;
  var hdr = $('#appHeader'); if (!hdr) return;
  if (!collapsed && y > 60) { collapsed = true; hdr.classList.add('collapsed'); }
  else if (collapsed && y < 8) { collapsed = false; hdr.classList.remove('collapsed'); }
}

/* =====================================================================
   6. SIMULATED TELEMETRY (drives island, widget, ISA bars, sparks, mimic)
   ===================================================================== */
var tele = { p: 64.2, dp: 0.12, flow: 2150, batt: 13.1, temp: 48, vsat: 6.4, imb: 0.04, ft: 41, level: 'normal', alarmUntil: 0, tick: 0,
             hist: { p: [], dp: [], flow: [] } };
var HIST_N = 90;
var teleTimer = 0;

function seedHistory() {
  var p = 64, dp = 0.12, fl = 2150;
  for (var i = 0; i < HIST_N; i++) {
    p += rand(-0.35, 0.35) + (64.2 - p) * 0.1; dp += rand(-0.01, 0.01) + (0.12 - dp) * 0.2; fl += rand(-18, 18) + (2150 - fl) * 0.1;
    tele.hist.p.push(p); tele.hist.dp.push(Math.max(0.02, dp)); tele.hist.flow.push(fl);
  }
}
function levelOf(k, v) {
  if (k === 'p') return (v < 20 || v > 80) ? 'alarm' : (v < 30 || v > 70) ? 'warn' : 'normal';
  if (k === 'dp') return v > 3 ? 'alarm' : v > 2 ? 'warn' : 'normal';
  if (k === 'batt') return v < 10.9 ? 'alarm' : v < 11.8 ? 'warn' : 'normal';
  if (k === 'vsat') return v < 1 ? 'alarm' : v < 3 ? 'warn' : 'normal';
  if (k === 'imb') return v > 2 ? 'alarm' : v > 0.5 ? 'warn' : 'normal';
  return 'normal';
}
function worst(a) { return a.indexOf('alarm') >= 0 ? 'alarm' : a.indexOf('warn') >= 0 ? 'warn' : 'normal'; }

function stepTelemetry() {
  tele.tick++;
  var alarm = Date.now() < tele.alarmUntil;
  var flowPct = numVal('#mimicFlow', 60, 0, 100) / 100;
  var through = valveState['ESDV-101'] === 'open' && (valveState['LBV-04'] === 'open' || valveState['MOV-102'] === 'open');
  var tgtP = alarm ? 17 : 64.2, tgtDp = alarm ? 3.4 : 0.12, tgtImb = alarm ? 4.8 : 0.04;
  var tgtFlow = through ? lerp(300, 3600, flowPct) : 0;
  tele.p += (tgtP - tele.p) * (alarm ? 0.35 : 0.08) + rand(-0.25, 0.25);
  tele.dp += (tgtDp - tele.dp) * (alarm ? 0.35 : 0.2) + rand(-0.008, 0.008);
  tele.imb += (tgtImb - tele.imb) * 0.3 + rand(-0.01, 0.01);
  tele.flow += (tgtFlow - tele.flow) * 0.15 + rand(-8, 8);
  tele.batt += (13.1 - tele.batt) * 0.05 + rand(-0.03, 0.03) + Math.sin(tele.tick / 40) * 0.01;
  tele.temp = 47 + Math.sin(tele.tick / 90) * 5 + rand(-0.2, 0.2);
  tele.vsat += (6.4 - tele.vsat) * 0.1 + rand(-0.12, 0.12);
  tele.ft = 41 + Math.sin(tele.tick / 70) * 1.2;
  tele.p = clamp(tele.p, 0, 100); tele.dp = clamp(tele.dp, 0.01, 4); tele.imb = clamp(tele.imb, 0, 10);
  tele.flow = clamp(tele.flow, 0, 6000); tele.batt = clamp(tele.batt, 10, 14.5); tele.vsat = clamp(tele.vsat, 0, 12);
  tele.level = worst([levelOf('p', tele.p), levelOf('dp', tele.dp), levelOf('batt', tele.batt), levelOf('vsat', tele.vsat), levelOf('imb', tele.imb)]);
  var h = tele.hist;
  h.p.push(tele.p); h.dp.push(tele.dp); h.flow.push(tele.flow);
  if (h.p.length > HIST_N) { h.p.shift(); h.dp.shift(); h.flow.shift(); }
  renderTelemetry();
}

function setBar(id, v, lo, hi, text, lvl) {
  var f = clamp((v - lo) / (hi - lo), 0, 1) * 100;
  var root = $('#' + id); if (!root) return;
  root.setAttribute('data-zone', lvl === 'alarm' ? 'trip' : lvl === 'warn' ? 'warn' : 'spec');
  var fill = $('#' + id + '-f'), mark = $('#' + id + '-m');
  if (fill) fill.style.width = f.toFixed(1) + '%';
  if (mark) mark.style.left = 'calc(' + f.toFixed(1) + '% - 1px)';
  setText('#' + id + '-v', text);
}
function setSpark(id, arr, lo, hi) {
  var svg = $('#' + id); if (!svg || !arr.length) return;
  var n = arr.length, pts = [];
  for (var i = 0; i < n; i++) { pts.push((i / (n - 1) * 100).toFixed(1) + ',' + (36 - clamp((arr[i] - lo) / (hi - lo), 0, 1) * 34).toFixed(1)); }
  var ly = 36 - clamp((arr[n - 1] - lo) / (hi - lo), 0, 1) * 34;
  svg.innerHTML = '<rect class="band" x="0" y="8" width="100" height="22"></rect><polyline points="' + pts.join(' ') + '"></polyline><circle class="last" cx="100" cy="' + ly.toFixed(1) + '" r="1.8"></circle>';
}
function levelLabel(l) { return l === 'alarm' ? 'ALARM' : l === 'warn' ? 'Warning' : 'Normal'; }
function setTile(id, lvl) { var t = $('#' + id); if (t) t.setAttribute('data-level', lvl); }

function renderTelemetry() {
  var lvl = tele.level;
  var pill = $('#islandPill');
  if (pill) pill.setAttribute('data-level', lvl);
  setText('#islandText', 'Line-1: ' + tele.p.toFixed(1) + ' Bar | DP: ' + tele.dp.toFixed(2) + ' | ' + levelLabel(lvl));

  // ISA-101 library (always cheap)
  setBar('ab-press', tele.p, 0, 100, tele.p.toFixed(1) + ' bar', levelOf('p', tele.p));
  setBar('ab-dp', tele.dp, 0, 4, tele.dp.toFixed(2) + ' bar', levelOf('dp', tele.dp));
  setBar('ab-batt', tele.batt, 10, 14.5, tele.batt.toFixed(1) + ' V', levelOf('batt', tele.batt));
  setSpark('sp-press', tele.hist.p, 0, 100); setText('#sp-press-v', tele.p.toFixed(1));
  setSpark('sp-dp', tele.hist.dp, 0, 0.4); setText('#sp-dp-v', tele.dp.toFixed(2));
  setSpark('sp-flow', tele.hist.flow, 0, 4000); setText('#sp-flow-v', String(Math.round(tele.flow)));

  // Lock-screen widget tiles
  var pl = levelOf('p', tele.p);
  setText('#g-press', tele.p.toFixed(1)); setText('#g-press-s', pl === 'normal' ? 'Normal' : pl === 'warn' ? 'Off-normal' : 'CRITICAL LOW/HIGH');
  var ring = $('#g-press-ring'); if (ring) ring.setAttribute('stroke-dashoffset', (138.2 * (1 - clamp(tele.p / 100, 0, 1))).toFixed(1));
  setTile('tile-press', pl);
  var dl = levelOf('dp', tele.dp);
  setText('#g-dp', tele.dp.toFixed(2)); setText('#g-dp-s', valveState['LBV-04'] === 'open' ? 'LBV-04 open' : 'LBV-04 ' + valveState['LBV-04']); setTile('tile-dp', dl);
  var bl = levelOf('batt', tele.batt);
  setText('#g-batt', tele.batt.toFixed(1)); setText('#g-temp', tele.temp.toFixed(0)); setTile('tile-batt', bl);
  var vl = levelOf('vsat', tele.vsat);
  setText('#g-vsat', tele.vsat.toFixed(1)); setText('#g-vsat-s', vl === 'normal' ? 'Link good' : vl === 'warn' ? 'Fade risk' : 'Link critical'); setTile('tile-vsat', vl);
  var il = levelOf('imb', tele.imb);
  setText('#g-leak', il === 'alarm' ? 'LEAK SUSPECTED' : il === 'warn' ? 'LDS Alert' : 'LDS Healthy');
  setText('#g-leak-s', 'Mass balance imbalance ' + tele.imb.toFixed(2) + ' %'); setTile('tile-leak', il);

  updateMimicLive();
  tickGlanceClock();
}
function tickGlanceClock() {
  var el = $('#g-clock'); if (!el) return;
  var d = new Date();
  el.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
function scheduleTelemetry() {
  clearInterval(teleTimer);
  teleTimer = setInterval(function () { if (!document.hidden) stepTelemetry(); }, prefs.batt ? 5000 : 1000);
}
function simulateAlarm() {
  tele.alarmUntil = Date.now() + 9000;
  fx.alarm(); toast('Simulated P1 critical alarm: PAHH/PALL trip');
  stepTelemetry();
}

/* =====================================================================
   7. NAMUR NE43 MODEL (shared by calculator and visualizer)
   ===================================================================== */
var NAMUR_ZONES = [
  { id: 'fault-low', lo: 0, hi: 3.6, cls: 'nm-fault', pill: 'crit', name: 'Sensor burnout / open-loop fault',
    tip: 'Fault downscale. Check loop continuity and terminals, 24 VDC supply, fuse, barrier or isolator output, and the transmitter itself. 0 mA usually means a fully open loop.' },
  { id: 'gap-low', lo: 3.6, hi: 3.8, cls: 'nm-gap', pill: 'warn', name: 'Transition band (not a valid reading)',
    tip: 'Between the NE43 fault level and the measuring range. Treat as suspect. Read HART diagnostics and check for a failing sensor or low loop supply voltage.' },
  { id: 'under', lo: 3.8, hi: 4.0, cls: 'nm-under', pill: 'info', name: 'Under-range measurement',
    tip: 'Process is below the calibrated LRV but the transmitter is healthy. Check for vacuum, empty impulse line or zero shift before trusting the value.' },
  { id: 'valid', lo: 4.0, hi: 20.0, cls: 'nm-valid', pill: 'ok', name: 'Valid linear process range',
    tip: 'Healthy 4-20 mA measurement. Verify the value against a local gauge during commissioning and compare with redundant transmitters.' },
  { id: 'over', lo: 20.0, hi: 20.5, cls: 'nm-over', pill: 'info', name: 'Over-range measurement',
    tip: 'Process is above the calibrated URV. Check for overpressure, a closed block valve on the vent, or a wrong URV setting.' },
  { id: 'gap-high', lo: 20.5, hi: 21.0, cls: 'nm-gap', pill: 'warn', name: 'Transition band (not a valid reading)',
    tip: 'Between the measuring range and the high fault level. Treat as suspect and check HART status and wiring for leakage to ground.' },
  { id: 'fault-high', lo: 21.0, hi: 25.0001, cls: 'nm-short', pill: 'crit', name: 'Hardware short / saturation fault',
    tip: 'Fault upscale. Check for a shorted loop or wet junction box, reversed polarity on a 2-wire device, a failed transmitter driving high, or an input channel in saturation.' }
];
function namurZone(mA) {
  var m = clamp(mA, LIM.MA[0], LIM.MA[1]);
  for (var i = 0; i < NAMUR_ZONES.length; i++) { var z = NAMUR_ZONES[i]; if (m >= z.lo && m < z.hi) return z; }
  return NAMUR_ZONES[NAMUR_ZONES.length - 1];
}
function s7Counts(mA) {
  var raw = Math.round((mA - 4) / 16 * 27648);
  if (raw > 32511) return { v: 32767, note: 'overflow' };
  if (raw < -4864) return { v: -32768, note: 'underflow (wire break)' };
  return { v: raw, note: raw > 27648 ? 'overrange' : raw < 0 ? 'underrange' : 'nominal' };
}
function abCounts(mA) { return clamp(Math.round(mA / 21 * 32767), 0, 32767); }

function pvFromMa(mA, lrv, urv) { return lrv + (mA - 4) / 16 * (urv - lrv); }

function renderNamurBlock(mA, lrv, urv, unit) {
  var z = namurZone(mA);
  var pv = pvFromMa(mA, lrv, urv);
  var s7 = s7Counts(mA), ab = abCounts(mA);
  var span = urv - lrv, pct = span !== 0 ? (pv - lrv) / span * 100 : 0;
  return '<div class="big">' + fmt(pv, Math.abs(span) >= 100 ? 2 : 3) + ' <small>' + esc(unit) + '</small></div>' +
    '<div style="margin:6px 0"><span class="status-pill ' + z.pill + '">' + esc(z.name) + '</span></div>' +
    '<div class="kv"><span>Loop current</span><span>' + fmt(mA, 2) + ' mA</span>' +
    '<span>% of span</span><span>' + fmt(pct, 1) + ' %</span>' +
    '<span>Siemens S7 counts (0-27648)</span><span>' + s7.v + ' <small class="muted">' + s7.note + '</small></span>' +
    '<span>Allen-Bradley counts (0-32767)</span><span>' + ab + '</span></div>' +
    '<div class="note" style="margin-bottom:0">' + esc(z.tip) + '</div>';
}

/* =====================================================================
   8. ENGINEERING CALCULATORS
   ===================================================================== */
var PRESETS = {
  ma: {
    crude: { 'ma-ma': 12, 'ma-lrv': 0, 'ma-urv': 100, 'ma-unit': 'bar' },
    gas: { 'ma-ma': 16.4, 'ma-lrv': 0, 'ma-urv': 250, 'ma-unit': 'bar' },
    dubai: { 'ma-ma': 8, 'ma-lrv': 0, 'ma-urv': 60, 'ma-unit': 'bar' }
  },
  hd: {
    crude: { 'hd-sg': 0.85, 'hd-flow': 1500, 'hd-len': 120, 'hd-dia': 600, 'hd-dz': 150, 'hd-visc': 12, 'hd-pin': 60 },
    gas: { 'hd-sg': 0.5, 'hd-flow': 3000, 'hd-len': 200, 'hd-dia': 900, 'hd-dz': 80, 'hd-visc': 0.6, 'hd-pin': 90 },
    dubai: { 'hd-sg': 0.87, 'hd-flow': 1000, 'hd-len': 45, 'hd-dia': 500, 'hd-dz': 20, 'hd-visc': 9, 'hd-pin': 35 }
  },
  lk: {
    crude: { 'lk-flow': 1500, 'lk-sg': 0.85, 'lk-dia': 600, 'lk-len': 120, 'lk-ui': 0.2, 'lk-uo': 0.2, 'lk-win': 60, 'lk-sigma': 3, 'lk-beta': 0.0008, 'lk-dT': 0.2, 'lk-dP': 0.5, 'lk-k': 1400 },
    gas: { 'lk-flow': 3000, 'lk-sg': 0.5, 'lk-dia': 900, 'lk-len': 200, 'lk-ui': 0.5, 'lk-uo': 0.5, 'lk-win': 120, 'lk-sigma': 3, 'lk-beta': 0.002, 'lk-dT': 0.2, 'lk-dP': 1, 'lk-k': 600 },
    dubai: { 'lk-flow': 1000, 'lk-sg': 0.87, 'lk-dia': 500, 'lk-len': 45, 'lk-ui': 0.2, 'lk-uo': 0.2, 'lk-win': 20, 'lk-sigma': 3, 'lk-beta': 0.0008, 'lk-dT': 0.2, 'lk-dP': 0.3, 'lk-k': 1400 }
  }
};
var CALC_FN = {};
function loadPreset(tool, name) {
  var set = PRESETS[tool] && PRESETS[tool][name]; if (!set) return;
  Object.keys(set).forEach(function (id) { setVal('#' + id, set[id]); });
  if (CALC_FN[tool]) CALC_FN[tool]();
  fx.ok(); toast('Preset loaded: ' + ({ crude: 'Crude Oil Pipeline', gas: 'High-Pressure Gas Trunkline', dubai: 'Dubai Blend Transfer' })[name]);
}

/* 8.1 mA -> PV */
function calcMa() {
  var mA = numVal('#ma-ma', 12, LIM.MA[0], LIM.MA[1]);
  var lrv = numVal('#ma-lrv', 0, -100000, 100000);
  var urv = numVal('#ma-urv', 100, -100000, 100000);
  if (urv === lrv) urv = lrv + 1;
  var unitEl = $('#ma-unit'); var unit = (unitEl && unitEl.value ? unitEl.value : 'bar').slice(0, 8);
  setHTML('#ma-out', renderNamurBlock(mA, lrv, urv, unit));
}
CALC_FN.ma = calcMa;

/* 8.2 hydrostatic + friction + line pack */
function swameeJain(re, eps, d) {
  if (re < 2300) return 64 / Math.max(re, 1);
  var t = Math.log10(eps / (3.7 * d) + 5.74 / Math.pow(re, 0.9));
  return 0.25 / (t * t);
}
function calcHd() {
  var sg = numVal('#hd-sg', 0.85, LIM.SG[0], LIM.SG[1]);
  var Q = numVal('#hd-flow', 2000, LIM.FLOW[0], LIM.FLOW[1]);
  var L = numVal('#hd-len', 120, LIM.LEN_KM[0], LIM.LEN_KM[1]);
  var Dmm = numVal('#hd-dia', 500, LIM.DIA_MM[0], LIM.DIA_MM[1]);
  var dz = numVal('#hd-dz', 150, -3000, 3000);
  var nu = numVal('#hd-visc', 12, 0.2, 2000);
  var pin = numVal('#hd-pin', 60, LIM.PRESS_BAR[0], LIM.PRESS_BAR[1]);
  var unitEl = $('#hd-unit'); var psi = !!(unitEl && unitEl.value === 'psi');
  var cf = psi ? 14.5038 : 1, ul = psi ? 'psi' : 'bar';

  var rho = sg * 1000, D = Dmm / 1000, A = Math.PI * D * D / 4;
  var v = Q / 3600 / A;
  var Re = v * D / (nu * 1e-6);
  var f = swameeJain(Re, 0.045e-3, D);
  var dpFric = f * (L * 1000 / D) * rho * v * v / 2 / 1e5;
  var dpHydro = rho * G * dz / 1e5;
  var dpTot = dpFric + dpHydro;
  var pout = pin - dpTot;
  var Vol = A * L * 1000;
  var mass = Vol * rho;
  var K = 1.4e9;
  var pAvg = clamp((pin + pout) / 2, 0, 400);
  var packExtra = Vol * rho * (pAvg * 1e5) / K;
  var packPerBar = Vol * rho * 1e5 / K;

  var notes = [];
  if (pout < 0) notes.push('Inlet pressure is insufficient: the outlet would be below atmospheric (slack-line / vapour risk). Raise inlet pressure or add a pump station.');
  if (v > 3) notes.push('Velocity above 3 m/s: check erosion limits and surge (water-hammer) margins.');
  if (v < 0.5) notes.push('Velocity below 0.5 m/s: risk of water or sediment drop-out and poor leak-detection sensitivity.');
  if (sg <= 0.6) notes.push('Liquid-equivalent approximation. For compressible gas use a gas-flow model (AGA / Panhandle) or a transient simulator.');
  var status = pout < 0 ? '<span class="status-pill crit">Insufficient inlet pressure</span>' : (v > 3 || v < 0.5) ? '<span class="status-pill warn">Check velocity</span>' : '<span class="status-pill ok">Within typical limits</span>';
  setHTML('#hd-out',
    '<div class="big">' + fmt(dpTot * cf, 1) + ' <small>' + ul + ' total pressure drop</small></div>' +
    '<div style="margin:6px 0">' + status + '</div>' +
    '<div class="kv"><span>Hydrostatic (' + (dz >= 0 ? 'rise' : 'fall') + ' ' + fmt(Math.abs(dz), 0) + ' m)</span><span>' + fmt(dpHydro * cf, 2) + ' ' + ul + '</span>' +
    '<span>Friction (Darcy-Weisbach)</span><span>' + fmt(dpFric * cf, 2) + ' ' + ul + '</span>' +
    '<span>Outlet pressure</span><span>' + fmt(pout * cf, 1) + ' ' + ul + ' g</span>' +
    '<span>Velocity / Reynolds</span><span>' + fmt(v, 2) + ' m/s / ' + fmt(Re, 0) + '</span>' +
    '<span>Friction factor</span><span>' + fmt(f, 4) + '</span>' +
    '<span>Pipe volume</span><span>' + fmt(Vol, 0) + ' m&sup3; (' + fmt(Vol * 6.28981, 0) + ' bbl)</span>' +
    '<span>Line-pack mass (atm. basis)</span><span>' + fmt(mass / 1000, 0) + ' t</span>' +
    '<span>Extra pack at avg ' + fmt(pAvg * cf, 1) + ' ' + ul + '</span><span>' + fmt(packExtra / 1000, 1) + ' t</span>' +
    '<span>Pack / unpack sensitivity</span><span>' + fmt(packPerBar / 1000, 2) + ' t per bar</span></div>' +
    (notes.length ? '<div class="note warn" style="margin-bottom:0">' + notes.map(esc).join('<br>') + '</div>' : '<div class="note" style="margin-bottom:0">Plain English: this is the pressure you spend pushing product up the hill plus the pressure lost to pipe friction. The line-pack figure is the extra product squeezed into the pipe by pressure; it moves in and out as pressure changes, which a leak detector must compensate for.</div>'));
}
CALC_FN.hd = calcHd;

/* 8.3 leak sensitivity */
function calcLk() {
  var Q = numVal('#lk-flow', 2000, LIM.FLOW[0], LIM.FLOW[1]);
  var sg = numVal('#lk-sg', 0.85, LIM.SG[0], LIM.SG[1]);
  var Dmm = numVal('#lk-dia', 500, LIM.DIA_MM[0], LIM.DIA_MM[1]);
  var L = numVal('#lk-len', 120, LIM.LEN_KM[0], LIM.LEN_KM[1]);
  var ui = numVal('#lk-ui', 0.25, 0.01, 10), uo = numVal('#lk-uo', 0.25, 0.01, 10);
  var win = numVal('#lk-win', 30, 1, 1440);
  var sigma = numVal('#lk-sigma', 3, 1, 4);
  var beta = numVal('#lk-beta', 0.0008, LIM.BETA[0], LIM.BETA[1]);
  var dT = numVal('#lk-dT', 0.5, 0, 50);
  var dP = numVal('#lk-dP', 0.5, 0, 100);
  var Kmpa = numVal('#lk-k', 1400, 50, 3000);

  var rho = sg * 1000, D = Dmm / 1000, A = Math.PI * D * D / 4, Vol = A * L * 1000;
  var m = Q * rho / 3600;                                  // kg/s
  var uc = Math.sqrt(ui * ui + uo * uo) / 100 * m;         // meter 1-sigma imbalance, kg/s
  var thermal = rho * Vol * beta * dT;                     // kg
  var press = rho * Vol * (dP * 1e5) / (Kmpa * 1e6);       // kg
  var invU = Math.sqrt(thermal * thermal + press * press); // kg inventory uncertainty (1 sigma)
  var invRate = invU / (win * 60);
  var thr = sigma * Math.sqrt(uc * uc + invRate * invRate);
  var thrM3h = thr * 3600 / rho, thrPct = thr / m * 100;

  var rows = [0.5, 1, 2, 5].map(function (pc) {
    var q = pc / 100 * m, r = q / sigma, d = r * r - uc * uc;
    if (d <= 0) return '<tr><td>' + pc + ' %</td><td colspan="2">Below meter noise floor. Needs better meters or a model-based method.</td></tr>';
    var T = invU / Math.sqrt(d) / 60;            // minutes
    T = Math.max(T, 1);
    var lost = q * T * 60 / rho;                 // m3
    return '<tr><td>' + pc + ' %</td><td>' + fmt(T, T < 10 ? 1 : 0) + ' min</td><td>' + fmt(lost, lost < 10 ? 1 : 0) + ' m&sup3;</td></tr>';
  }).join('');
  var verdict = thrPct <= 1 ? '<span class="status-pill ok">Good sensitivity</span>' : thrPct <= 3 ? '<span class="status-pill warn">Moderate sensitivity</span>' : '<span class="status-pill crit">Poor sensitivity</span>';
  setHTML('#lk-out',
    '<div class="big">' + fmt(thrPct, 2) + ' <small>% of flow minimum detectable leak (' + sigma + '&sigma;, ' + fmt(win, 0) + ' min)</small></div>' +
    '<div style="margin:6px 0">' + verdict + '</div>' +
    '<div class="kv"><span>Threshold mass rate</span><span>' + fmt(thr, 2) + ' kg/s</span>' +
    '<span>Threshold volume rate</span><span>' + fmt(thrM3h, 2) + ' m&sup3;/h</span>' +
    '<span>Meter noise (1&sigma;)</span><span>' + fmt(uc, 2) + ' kg/s</span>' +
    '<span>Thermal inventory error</span><span>' + fmt(thermal / 1000, 2) + ' t</span>' +
    '<span>Pressure inventory error</span><span>' + fmt(press / 1000, 2) + ' t</span></div>' +
    '<h4>Window needed to catch a leak of size</h4>' +
    '<div class="table-wrap"><table><thead><tr><th>Leak</th><th>Window</th><th>Lost at detection</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<div class="note" style="margin-bottom:0">Plain English: leaks smaller than the combined meter error and line-pack uncertainty hide inside the noise. Longer windows average noise out, at the cost of losing more product before the alarm.</div>');
}
CALC_FN.lk = calcLk;

/* 8.4 NAMUR slider visualizer */
function buildNamurBar() {
  var bar = $('#nm-bar'), cur = $('#nm-cursor'); if (!bar || !cur) return;
  $$('#nm-bar i').forEach(function (n) { n.parentNode.removeChild(n); });
  NAMUR_ZONES.forEach(function (z) {
    var i = document.createElement('i'); i.className = z.cls;
    i.style.width = ((Math.min(z.hi, 25) - z.lo) / 25 * 100).toFixed(3) + '%'; i.title = z.name;
    bar.insertBefore(i, cur);
  });
  var sc = $('#nm-scale');
  if (sc) sc.innerHTML = [0, 4, 8, 12, 16, 20, 25].map(function (v) { return '<span style="left:' + (v / 25 * 100) + '%">' + v + '</span>'; }).join('');
}
var lastNmNotch = -1;
function updateNamurViz() {
  var mA = numVal('#nm-slider', 12, LIM.MA[0], LIM.MA[1]);
  var cur = $('#nm-cursor'); if (cur) cur.style.left = 'calc(' + (mA / 25 * 100).toFixed(2) + '% - 2px)';
  setHTML('#nm-out', renderNamurBlock(mA, 0, 100, 'bar'));
  var notch = Math.round(mA / 0.5);
  if (notch !== lastNmNotch) { if (lastNmNotch !== -1) fx.tick(); lastNmNotch = notch; }
}

/* =====================================================================
   9. ISA-101 LIBRARY INTERACTIONS (valve glyph states)
   ===================================================================== */
var GLYPH_ORDER = ['open', 'closed', 'transit', 'fault'];
var GLYPH_LABEL = { open: 'Open', closed: 'Closed', transit: 'Transitioning', fault: 'Travel fault' };
function cycleGlyph(btn) {
  var s = btn.getAttribute('data-state') || 'open';
  var n = GLYPH_ORDER[(GLYPH_ORDER.indexOf(s) + 1) % GLYPH_ORDER.length];
  btn.setAttribute('data-state', n);
  var lab = $('.s', btn); if (lab) lab.textContent = GLYPH_LABEL[n];
  if (n === 'fault') fx.alarm(); else fx.tap();
}

/* =====================================================================
   10. INTERACTIVE P&ID MIMIC + TAG BOTTOM SHEET
   ===================================================================== */
var valveState = { 'ESDV-101': 'open', 'LBV-04': 'open', 'MOV-102': 'closed' };
var TAGS = {
  'ESDV-101': { kind: 'valve', title: 'ESDV-101 Inlet Emergency Shutdown Valve', range: '0-100 % travel (ZSO / ZSC limit switches)', units: '% open', cal: 'Full-stroke time target 30 s or less. Partial stroke test (PST) every 6 months, full stroke at turnaround. As-found / as-left record required.', s7: 'ET 200SP: ZSO %I8.0, ZSC %I8.1, SOV %Q8.0 (de-energise to trip)', ab: 'Local:4:I.Pt00 (ZSO), Local:4:I.Pt01 (ZSC), Local:5:O.Pt00 (SOV)' },
  'LBV-04': { kind: 'valve', title: 'LBV-04 Line Break Valve (main block valve)', range: '0-100 % travel, local dP/dt trip logic', units: '% open', cal: 'Stroke time to meet surge study. Verify local trip works with comms disconnected. PST per SIL verification interval.', s7: 'ET 200SP: ZSO %I8.2, ZSC %I8.3, SOV %Q8.1', ab: 'Local:4:I.Pt02 (ZSO), Local:4:I.Pt03 (ZSC), Local:5:O.Pt01 (SOV)' },
  'MOV-102': { kind: 'valve', title: 'MOV-102 Bypass Motor-Operated Valve', range: '0-100 % travel, torque and limit switches', units: '% open', cal: 'Torque switch settings per vendor datasheet. Bypass use is time-limited and logged.', s7: 'ET 200SP: OPEN %Q8.2, CLOSE %Q8.3, ZSO %I8.4, ZSC %I8.5', ab: 'Local:5:O.Pt02 (OPEN), Local:5:O.Pt03 (CLOSE), Local:4:I.Pt04 / I.Pt05' },
  'PT-101': { kind: 'ai', title: 'PT-101 Trunkline Pressure Transmitter', range: '0-100 bar g, 4-20 mA HART (NE43 enabled)', units: 'bar g', cal: 'Calibrate 0, 25, 50, 75, 100 % up and down against a deadweight tester. Accuracy 0.075 % of span. Interval 12 months.', s7: 'AI 8xI HF: %IW64 (CH0), 0-27648 = 4-20 mA', ab: '1756-IF8H: Local:3:I.Ch0Data (0-32767 = 0-21 mA)' },
  'TT-102': { kind: 'ai', title: 'TT-102 Fluid Temperature Transmitter', range: '-20 to 120 C, Pt100 3-wire, 4-20 mA', units: 'deg C', cal: 'Verify at 0 C ice point and at one warm point with a dry-block. Check thermowell immersion length. Interval 12 months.', s7: 'AI 8xI HF: %IW66 (CH1)', ab: '1756-IF8H: Local:3:I.Ch1Data' },
  'FT-103': { kind: 'ai', title: 'FT-103 Custody Flow Transmitter', range: '0-4000 m3/h, 4-20 mA + pulse', units: 'm3/h', cal: 'Meter proving per API MPMS. Verify K-factor and flow-computer configuration. Interval per custody agreement.', s7: 'AI 8xI HF: %IW68 (CH2), HSC pulse in', ab: '1756-IF8H: Local:3:I.Ch2Data' }
};
var sheetTag = null, sheetOpener = null;
var MIM = { x: 0, y: 0, w: 1000, h: 420 };

function tagLive(tag) {
  var t = TAGS[tag]; if (!t) return '-';
  if (t.kind === 'valve') return valveState[tag] === 'open' ? 'OPEN' : 'CLOSED';
  if (tag === 'PT-101') return tele.p.toFixed(1) + ' bar g';
  if (tag === 'TT-102') return tele.ft.toFixed(1) + ' deg C';
  if (tag === 'FT-103') return Math.round(tele.flow) + ' m3/h';
  return '-';
}
function tagMa(tag) {
  if (tag === 'PT-101') return 4 + clamp(tele.p / 100, 0, 1.2) * 16;
  if (tag === 'TT-102') return 4 + clamp((tele.ft + 20) / 140, 0, 1.2) * 16;
  if (tag === 'FT-103') return 4 + clamp(tele.flow / 4000, 0, 1.2) * 16;
  return null;
}
function renderSheet() {
  var t = TAGS[sheetTag]; if (!t) return;
  setText('#sheetTitle', t.title);
  var ma = tagMa(sheetTag);
  var html = '<div class="live" id="sheetLive">' + esc(tagLive(sheetTag)) + '</div>' +
    '<div class="kv"><span>Tag</span><span>' + esc(sheetTag) + '</span>' +
    '<span>Calibration / range</span><span>' + esc(t.range) + '</span>' +
    '<span>Engineering units</span><span>' + esc(t.units) + '</span>' +
    (ma !== null ? '<span>Loop current now</span><span>' + ma.toFixed(2) + ' mA</span>' : '') +
    '<span>PLC I/O (Siemens)</span><span>' + esc(t.s7) + '</span>' +
    '<span>PLC I/O (Rockwell)</span><span>' + esc(t.ab) + '</span></div>' +
    '<div class="note">' + esc(t.cal) + '</div>';
  if (t.kind === 'valve') html += '<div class="btn-row"><button class="btn primary" id="sheetToggle" type="button">Command ' + (valveState[sheetTag] === 'open' ? 'CLOSE' : 'OPEN') + '</button></div>';
  setHTML('#sheetBody', html);
  on('#sheetToggle', 'click', function () { toggleValve(sheetTag); });
}
function openSheet(tag, opener) {
  if (!TAGS[tag]) return;
  sheetTag = tag; sheetOpener = opener || null; renderSheet();
  var sh = $('#sheet'), bd = $('#sheetBackdrop');
  if (sh) { sh.classList.add('open'); sh.setAttribute('aria-hidden', 'false'); }
  if (bd) bd.classList.add('open');
  var c = $('#sheetClose'); if (c) setTimeout(function () { c.focus(); }, 60);
  fx.tap();
}
function closeSheet() {
  sheetTag = null;
  var sh = $('#sheet'), bd = $('#sheetBackdrop');
  if (sh) { sh.classList.remove('open'); sh.setAttribute('aria-hidden', 'true'); }
  if (bd) bd.classList.remove('open');
  if (sheetOpener && sheetOpener.focus) { try { sheetOpener.focus(); } catch (e) { /* ignore */ } }
}
function toggleValve(tag) {
  if (!valveState[tag]) return;
  valveState[tag] = valveState[tag] === 'open' ? 'closed' : 'open';
  if (valveState[tag] === 'closed') fx.alarm(); else fx.ok();
  updateMimicFlow(); renderTelemetry(); if (sheetTag === tag) renderSheet();
  toast(tag + ' ' + (valveState[tag] === 'open' ? 'opened' : 'closed'));
}
function updateMimicLive() { if (sheetTag) { var el = $('#sheetLive'); if (el) el.textContent = tagLive(sheetTag); } }

function updateMimicFlow() {
  var pct = numVal('#mimicFlow', 60, 0, 100);
  setText('#mimicReadout', Math.round(pct) + ' % (' + Math.round(lerp(300, 3600, pct / 100)) + ' m3/h)');
  var through = valveState['ESDV-101'] === 'open' && (valveState['LBV-04'] === 'open' || valveState['MOV-102'] === 'open');
  var run = through && pct > 0;
  var dur = lerp(3.2, 0.35, pct / 100).toFixed(2) + 's';
  var svg = $('#mimic'); if (svg) svg.style.setProperty('--fdur', dur);
  var root = document.documentElement; root.style.setProperty('--fdur', dur);
  ['s1', 's2', 's3', 's4', 's5', 's6'].forEach(function (s) { var p = $('#flow-' + s); if (p) p.classList.toggle('stopped', !run); });
  var byp = $('#flow-byp'); if (byp) byp.classList.toggle('stopped', !(run && valveState['MOV-102'] === 'open'));
  $$('.hs[data-tag]').forEach(function (g) {
    var tg = g.getAttribute('data-tag');
    if (valveState[tg]) g.classList.toggle('closed', valveState[tg] === 'closed');
  });
}
function setMimicVB() { var svg = $('#mimic'); if (svg) svg.setAttribute('viewBox', MIM.x + ' ' + MIM.y + ' ' + MIM.w + ' ' + MIM.h); }
function mimicZoom(f, cx, cy) {
  var nw = clamp(MIM.w * f, 250, 1000), nh = nw * 0.42;
  if (cx === undefined) { cx = MIM.x + MIM.w / 2; cy = MIM.y + MIM.h / 2; }
  MIM.x = cx - (cx - MIM.x) * (nw / MIM.w); MIM.y = cy - (cy - MIM.y) * (nh / MIM.h);
  MIM.w = nw; MIM.h = nh;
  MIM.x = clamp(MIM.x, 0, 1000 - MIM.w); MIM.y = clamp(MIM.y, 0, 420 - MIM.h);
  setMimicVB();
}
function initMimic() {
  var svg = $('#mimic'); if (!svg) return;
  var pts = {}, dragged = false, startDist = 0, startW = 0, downX = 0, downY = 0;
  function toSvg(px, py) {
    var r = svg.getBoundingClientRect();
    return { x: MIM.x + (px - r.left) / r.width * MIM.w, y: MIM.y + (py - r.top) / r.height * MIM.h };
  }
  svg.addEventListener('pointerdown', function (e) {
    pts[e.pointerId] = { x: e.clientX, y: e.clientY }; dragged = false; downX = e.clientX; downY = e.clientY;
    var ids = Object.keys(pts);
    if (ids.length === 2) { var a = pts[ids[0]], b = pts[ids[1]]; startDist = Math.hypot(a.x - b.x, a.y - b.y); startW = MIM.w; }
  });
  svg.addEventListener('pointermove', function (e) {
    var p = pts[e.pointerId]; if (!p) return;
    var ids = Object.keys(pts);
    if (ids.length === 2 && startDist > 0) {
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var a = pts[ids[0]], b = pts[ids[1]]; var d = Math.hypot(a.x - b.x, a.y - b.y);
      var c = toSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
      mimicZoom((startW * startDist / Math.max(d, 1)) / MIM.w, c.x, c.y); dragged = true; return;
    }
    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 8) dragged = true;
    if (dragged && MIM.w < 999) {
      var r = svg.getBoundingClientRect();
      MIM.x = clamp(MIM.x - dx / r.width * MIM.w, 0, 1000 - MIM.w); MIM.y = clamp(MIM.y - dy / r.height * MIM.h, 0, 420 - MIM.h); setMimicVB();
    }
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
  });
  function up(e) { delete pts[e.pointerId]; if (Object.keys(pts).length < 2) startDist = 0; }
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up); svg.addEventListener('pointerleave', up);
  svg.addEventListener('wheel', function (e) { e.preventDefault(); var c = toSvg(e.clientX, e.clientY); mimicZoom(e.deltaY < 0 ? 0.85 : 1.18, c.x, c.y); }, { passive: false });
  svg.addEventListener('click', function (e) {
    if (dragged) { dragged = false; return; }
    var hs = e.target && e.target.closest ? e.target.closest('.hs') : null;
    if (hs) openSheet(hs.getAttribute('data-tag'), hs);
  });
  svg.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var hs = e.target && e.target.closest ? e.target.closest('.hs') : null;
    if (hs) { e.preventDefault(); openSheet(hs.getAttribute('data-tag'), hs); }
  });
  on('#mzIn', 'click', function () { mimicZoom(0.75); });
  on('#mzOut', 'click', function () { mimicZoom(1.33); });
  on('#mzReset', 'click', function () { MIM.x = 0; MIM.y = 0; MIM.w = 1000; MIM.h = 420; setMimicVB(); });
  on('#mimicFlow', 'input', function () { updateMimicFlow(); });
  updateMimicFlow();
}

/* =====================================================================
   11. 3D RTU DIGITAL TWIN (Three.js via CDN, lightweight canvas fallback)
   ===================================================================== */
var THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.min.js';
var RTU = { yaw: 0.75, pitch: 0.42, dist: 10.5, ex: 0, exT: 0, dirty: true, backend: 'canvas', canvas: null, three: null, pinEls: {}, sel: null, moved: false };
var RTU_TARGET = [-0.4, 1.3, -0.2];
var RTU_PARTS = [
  { id: 'enclosure', ex: [0, 1.0, 0], boxes: [{ c: [0, 1.1, 0], s: [1.3, 1.7, 0.75], col: '#b9c4cf', a: 0.32 }] },
  { id: 'chassis', ex: [0, 0.7, 1.5], boxes: [{ c: [0, 1.45, 0.05], s: [0.9, 0.5, 0.4], col: '#2dd4bf' }] },
  { id: 'charge', ex: [-1.7, 0.2, 0.9], boxes: [{ c: [-0.35, 0.85, 0.1], s: [0.35, 0.3, 0.2], col: '#f59e0b' }] },
  { id: 'spd', ex: [1.7, 0.2, 0.9], boxes: [{ c: [0.38, 0.82, 0.1], s: [0.3, 0.25, 0.2], col: '#a78bfa' }] },
  { id: 'solar', ex: [-0.9, 1.3, -1.3], boxes: [
    { c: [-3.1, 1.7, -1.0], s: [1.35, 0.06, 0.9], r: [-0.5, 0, 0], col: '#1d4ed8' },
    { c: [-1.7, 1.7, -1.0], s: [1.35, 0.06, 0.9], r: [-0.5, 0, 0], col: '#1d4ed8' },
    { c: [-0.3, 1.7, -1.0], s: [1.35, 0.06, 0.9], r: [-0.5, 0, 0], col: '#1d4ed8' },
    { c: [-3.1, 0.7, -1.2], s: [0.08, 1.4, 0.08], col: '#6b7280' },
    { c: [-0.3, 0.7, -1.2], s: [0.08, 1.4, 0.08], col: '#6b7280' }] },
  { id: 'battery', ex: [1.9, 0, 0.7], boxes: [
    { c: [2.4, 0.3, 0.1], s: [1.0, 0.55, 0.6], col: '#1e40af' },
    { c: [2.4, 0.9, 0.1], s: [1.0, 0.55, 0.6], col: '#1e40af' }] },
  { id: 'mast', ex: [1.0, 1.0, -1.0], boxes: [
    { c: [1.5, 1.6, -1.1], s: [0.08, 3.2, 0.08], col: '#9aa5b1' },
    { c: [1.5, 3.1, -1.05], s: [0.55, 0.55, 0.06], col: '#e5e7eb' }] },
  { id: 'modem', ex: [1.5, 1.4, -0.5], boxes: [{ c: [1.5, 2.3, -1.0], s: [0.4, 0.25, 0.18], col: '#ff7a00' }] }
];
var RTU_PINS = [
  { id: 'spd', label: 'SPD', part: 'spd', pos: [0.38, 1.15, 0.1], info: '<b>Surge Protection Devices (SPD)</b>: Type 2/3 protection on the solar input, 24 VDC loops, signal pairs and antenna coax. Check status windows after storms, replace after a strike, and keep earth resistance low (chemical earthing in dry sand).' },
  { id: 'charge', label: 'DC-DC charge ctrl', part: 'charge', pos: [-0.35, 1.15, 0.1], info: '<b>DC-DC solar charge controller (MPPT)</b>: temperature-compensated absorption / float setpoints, low-voltage load disconnect and reconnect levels. Verify these during the 24 VDC solar loop stability SAT.' },
  { id: 'modem', label: 'Cell / VSAT modem', part: 'modem', pos: [1.5, 2.55, -1.0], info: '<b>Industrial cellular / satellite modem</b>: private APN with VPN, dual-path failover, RSSI / SNR monitoring and a watchdog reboot. Report signal margin to SCADA as a diagnostic tag.' },
  { id: 'chassis', label: 'Redundant RTU chassis', part: 'chassis', pos: [0, 1.8, 0.05], info: '<b>Redundant RTU chassis</b>: dual CPU / power modules with hot-swap I/O. Local ESD and LBV logic runs here without comms. Test failover and bumpless transfer during SAT.' },
  { id: 'battery', label: 'Battery bank', part: 'battery', pos: [2.4, 1.3, 0.1], info: '<b>Battery bank</b>: LiFePO4 with BMS, or VRLA derated for temperature. Enclosure heat is the main ageing driver; size for 3 to 5 days of autonomy.' },
  { id: 'solar', label: 'Solar array', part: 'solar', pos: [-1.7, 2.45, -1.0], info: '<b>Solar array</b>: tilt for the UAE latitude (around 25 degrees), plan cleaning for dust and sand soiling, and keep wiring runs short and protected.' }
];
function v3sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function v3dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function v3cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function v3norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function rotEuler(p, r) {
  var x = p[0], y = p[1], z = p[2], c, s, t;
  if (r[2]) { c = Math.cos(r[2]); s = Math.sin(r[2]); t = x * c - y * s; y = x * s + y * c; x = t; }
  if (r[1]) { c = Math.cos(r[1]); s = Math.sin(r[1]); t = x * c + z * s; z = -x * s + z * c; x = t; }
  if (r[0]) { c = Math.cos(r[0]); s = Math.sin(r[0]); t = y * c - z * s; z = y * s + z * c; y = t; }
  return [x, y, z];
}
function hexRGB(h) { var n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rtuBasis() {
  var cp = Math.cos(RTU.pitch), sp = Math.sin(RTU.pitch);
  var pos = [RTU_TARGET[0] + RTU.dist * cp * Math.sin(RTU.yaw), RTU_TARGET[1] + RTU.dist * sp, RTU_TARGET[2] + RTU.dist * cp * Math.cos(RTU.yaw)];
  var fwd = v3norm(v3sub(RTU_TARGET, pos)); var right = v3norm(v3cross(fwd, [0, 1, 0])); var up = v3cross(right, fwd);
  return { pos: pos, fwd: fwd, right: right, up: up };
}
function partById(id) { for (var i = 0; i < RTU_PARTS.length; i++) if (RTU_PARTS[i].id === id) return RTU_PARTS[i]; return null; }
function pinWorld(p) { var part = partById(p.part), e = part ? part.ex : [0, 0, 0]; return [p.pos[0] + e[0] * RTU.ex, p.pos[1] + e[1] * RTU.ex, p.pos[2] + e[2] * RTU.ex]; }

function rtuFallbackRender() {
  var c = RTU.canvas; if (!c) return;
  var f = fitCanvas(c), ctx = f.ctx, w = f.w, h = f.h;
  var B = rtuBasis(), fl = (h / 2) / Math.tan(20 * Math.PI / 180);
  function proj(p) {
    var rel = v3sub(p, B.pos), z = v3dot(rel, B.fwd);
    if (z < 0.2) return null;
    return { x: w / 2 + v3dot(rel, B.right) / z * fl, y: h / 2 - v3dot(rel, B.up) / z * fl, z: z };
  }
  ctx.clearRect(0, 0, w, h);
  // ground grid
  ctx.strokeStyle = theme.sun ? '#ffff00' : 'rgba(180,160,110,0.25)'; ctx.lineWidth = 1; ctx.beginPath();
  for (var g = -8; g <= 8; g += 2) {
    var a1 = proj([g, 0, -8]), a2 = proj([g, 0, 8]), b1 = proj([-8, 0, g]), b2 = proj([8, 0, g]);
    if (a1 && a2) { ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y); }
    if (b1 && b2) { ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); }
  }
  ctx.stroke();
  var wire = RTU.ex > 0.5 || RTU.exT > 0.5;
  var faces = [], FI = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]];
  var light = v3norm([0.4, 0.9, 0.5]);
  RTU_PARTS.forEach(function (part) {
    var off = [part.ex[0] * RTU.ex, part.ex[1] * RTU.ex, part.ex[2] * RTU.ex];
    part.boxes.forEach(function (b) {
      var r = b.r || [0, 0, 0], pts = [];
      for (var i = 0; i < 8; i++) {
        var lp = [(i & 1 ? 1 : -1) * b.s[0] / 2, (i & 2 ? 1 : -1) * b.s[1] / 2, (i & 4 ? 1 : -1) * b.s[2] / 2];
        var q = rotEuler(lp, r); pts.push([q[0] + b.c[0] + off[0], q[1] + b.c[1] + off[1], q[2] + b.c[2] + off[2]]);
      }
      FI.forEach(function (fi) {
        var P = fi.map(function (k) { return proj(pts[k]); });
        if (P.indexOf(null) >= 0) return;
        var n = v3norm(v3cross(v3sub(pts[fi[1]], pts[fi[0]]), v3sub(pts[fi[3]], pts[fi[0]])));
        var depth = (P[0].z + P[1].z + P[2].z + P[3].z) / 4;
        faces.push({ P: P, depth: depth, shade: 0.45 + 0.55 * Math.abs(v3dot(n, light)), col: b.col, a: b.a || 1 });
      });
    });
  });
  faces.sort(function (a, b) { return b.depth - a.depth; });
  faces.forEach(function (fc) {
    var rgb = hexRGB(fc.col);
    ctx.beginPath(); ctx.moveTo(fc.P[0].x, fc.P[0].y);
    for (var i = 1; i < 4; i++) ctx.lineTo(fc.P[i].x, fc.P[i].y);
    ctx.closePath();
    if (!wire) {
      ctx.fillStyle = 'rgba(' + Math.round(rgb[0] * fc.shade) + ',' + Math.round(rgb[1] * fc.shade) + ',' + Math.round(rgb[2] * fc.shade) + ',' + fc.a + ')';
      ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1;
    } else { ctx.strokeStyle = theme.sun ? '#00e5ff' : 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')'; ctx.lineWidth = 1.3; }
    ctx.stroke();
  });
  positionPins(function (p3) { var s = proj(p3); return s ? { x: s.x, y: s.y, vis: true } : { vis: false }; });
}
function positionPins(projFn) {
  RTU_PINS.forEach(function (p) {
    var el = RTU.pinEls[p.id]; if (!el) return;
    var s = projFn(pinWorld(p));
    if (!s.vis) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden'); el.style.left = s.x.toFixed(1) + 'px'; el.style.top = s.y.toFixed(1) + 'px';
  });
}
function rtuDraw() {
  RTU.ex += (RTU.exT - RTU.ex) * 0.12;
  if (Math.abs(RTU.exT - RTU.ex) < 0.004) RTU.ex = RTU.exT;
  if (RTU.backend === 'three' && RTU.three) rtuThreeRender(); else rtuFallbackRender();
}
function rtuThreeBuild(THREE, host) {
  var wrap = $('#rtuWrap');
  var renderer = new THREE.WebGLRenderer({ antialias: !prefs.batt, alpha: true, powerPreference: prefs.batt ? 'low-power' : 'default' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, prefs.batt ? 1 : 2));
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, wrap.clientWidth / wrap.clientHeight, 0.1, 100);
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  var dl = new THREE.DirectionalLight(0xffffff, 0.95); dl.position.set(4, 8, 5); scene.add(dl);
  var ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x4a3f26, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  var grid = new THREE.GridHelper(16, 8, 0x8a7a50, 0x5a4d30); grid.position.y = 0.01; scene.add(grid);
  var meshes = [];
  RTU_PARTS.forEach(function (part) {
    part.boxes.forEach(function (b) {
      var mat = new THREE.MeshStandardMaterial({ color: b.col, metalness: 0.5, roughness: 0.45, transparent: !!b.a && b.a < 1, opacity: b.a || 1 });
      var m = new THREE.Mesh(new THREE.BoxGeometry(b.s[0], b.s[1], b.s[2]), mat);
      if (b.r) m.rotation.set(b.r[0], b.r[1], b.r[2]);
      scene.add(m); meshes.push({ m: m, part: part, b: b });
    });
  });
  host.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
  RTU.three = { THREE: THREE, renderer: renderer, scene: scene, camera: camera, meshes: meshes, wrap: wrap };
}
function rtuThreeRender() {
  var T = RTU.three, THREE = T.THREE, w = T.wrap.clientWidth, h = T.wrap.clientHeight;
  if (T.renderer.domElement.width !== Math.round(w * T.renderer.getPixelRatio())) { T.renderer.setSize(w, h); T.camera.aspect = w / h; T.camera.updateProjectionMatrix(); }
  var B = rtuBasis(); T.camera.position.set(B.pos[0], B.pos[1], B.pos[2]); T.camera.lookAt(RTU_TARGET[0], RTU_TARGET[1], RTU_TARGET[2]);
  var wire = RTU.ex > 0.5 || RTU.exT > 0.5;
  T.meshes.forEach(function (o) {
    o.m.position.set(o.b.c[0] + o.part.ex[0] * RTU.ex, o.b.c[1] + o.part.ex[1] * RTU.ex, o.b.c[2] + o.part.ex[2] * RTU.ex);
    o.m.material.wireframe = wire;
  });
  T.renderer.render(T.scene, T.camera);
  positionPins(function (p3) {
    var v = new THREE.Vector3(p3[0], p3[1], p3[2]).project(T.camera);
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, vis: v.z < 1 };
  });
}
function loadScript(url, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var s = document.createElement('script'); var done = false;
    var t = setTimeout(function () { if (!done) { done = true; reject(new Error('timeout')); } }, timeoutMs || 8000);
    s.src = url; s.async = true;
    s.onload = function () { if (!done) { done = true; clearTimeout(t); resolve(); } };
    s.onerror = function () { if (!done) { done = true; clearTimeout(t); reject(new Error('load')); } };
    document.head.appendChild(s);
  });
}
function showPin(id) {
  var p = null; RTU_PINS.forEach(function (x) { if (x.id === id) p = x; });
  if (!p) return;
  RTU.sel = id;
  setHTML('#rtuInfo', p.info);
  $$('.pin3d').forEach(function (el) { el.style.background = el.getAttribute('data-pin') === id ? 'var(--accent)' : ''; el.style.color = el.getAttribute('data-pin') === id ? '#04121f' : ''; });
  fx.tap();
}
function initRtu() {
  var wrap = $('#rtuWrap'), stage = $('#rtuStage'), pinsHost = $('#rtuPins');
  if (!wrap || !stage || !pinsHost) return;
  var cv = document.createElement('canvas'); cv.setAttribute('height', '340'); cv.dataset.h = '340';
  cv.style.cssText = 'width:100%;height:340px;display:block'; cv.setAttribute('aria-label', '3D view of remote solar RTU station');
  stage.appendChild(cv); RTU.canvas = cv;
  RTU_PINS.forEach(function (p) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'pin3d'; b.setAttribute('data-pin', p.id); b.textContent = p.label;
    b.addEventListener('click', function () { if (!RTU.moved) showPin(p.id); });
    pinsHost.appendChild(b); RTU.pinEls[p.id] = b;
  });
  var ptrs = {}, startD = 0, startDist = 10.5;
  wrap.addEventListener('pointerdown', function (e) {
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; RTU.moved = false;
    var ids = Object.keys(ptrs); if (ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]]; startD = Math.hypot(a.x - b.x, a.y - b.y); startDist = RTU.dist; }
  });
  wrap.addEventListener('pointermove', function (e) {
    var p = ptrs[e.pointerId]; if (!p) return;
    var ids = Object.keys(ptrs);
    if (ids.length === 2 && startD > 0) {
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      var a = ptrs[ids[0]], b = ptrs[ids[1]]; RTU.dist = clamp(startDist * startD / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), 4.5, 20);
      RTU.moved = true; RTU.dirty = true; if (RTU.loop) RTU.loop.dirty = true; return;
    }
    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (Math.abs(dx) + Math.abs(dy) > 1) { RTU.moved = RTU.moved || (Math.abs(dx) + Math.abs(dy) > 3); }
    RTU.yaw -= dx * 0.008; RTU.pitch = clamp(RTU.pitch + dy * 0.006, 0.05, 1.45);
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; if (RTU.loop) RTU.loop.dirty = true;
  });
  function up(e) { delete ptrs[e.pointerId]; if (Object.keys(ptrs).length < 2) startD = 0; setTimeout(function () { RTU.moved = false; }, 60); }
  wrap.addEventListener('pointerup', up); wrap.addEventListener('pointercancel', up); wrap.addEventListener('pointerleave', up);
  wrap.addEventListener('wheel', function (e) { e.preventDefault(); RTU.dist = clamp(RTU.dist * (e.deltaY > 0 ? 1.08 : 0.92), 4.5, 20); if (RTU.loop) RTU.loop.dirty = true; }, { passive: false });
  on('#rtuLow', 'change', function () {
    var chk = $('#rtuLow'); RTU.exT = chk && chk.checked ? 1 : 0; if (RTU.loop) RTU.loop.dirty = true;
    toast(RTU.exT ? 'Low Battery: exploded wireframe view' : 'Normal solid view'); fx.tick();
  });
  on('#rtuReset', 'click', function () { RTU.yaw = 0.75; RTU.pitch = 0.42; RTU.dist = 10.5; if (RTU.loop) RTU.loop.dirty = true; });
  RTU.loop = addLoop(wrap, rtuDraw, function () { return Math.abs(RTU.exT - RTU.ex) > 0.004; });
  setText('#rtuStatus', 'Lightweight canvas renderer');
  if (!prefs.batt && navigator.onLine !== false) {
    loadScript(THREE_URL, 9000).then(function () {
      if (!window.THREE) return;
      try {
        rtuThreeBuild(window.THREE, stage);
        if (RTU.canvas && RTU.canvas.parentNode) RTU.canvas.parentNode.removeChild(RTU.canvas);
        RTU.backend = 'three'; setText('#rtuStatus', 'WebGL via Three.js'); if (RTU.loop) RTU.loop.dirty = true;
      } catch (e) { RTU.three = null; RTU.backend = 'canvas'; }
    }).catch(function () { /* offline or blocked: keep the canvas renderer */ });
  } else if (prefs.batt) { setText('#rtuStatus', 'Canvas renderer (Battery Saver)'); }
}

/* =====================================================================
   12. ELEVATION AND HYDRAULIC GRADIENT PROFILE (Habshan to Fujairah)
   ===================================================================== */
var EL_KP = [[0, 110], [25, 95], [55, 140], [85, 100], [120, 160], [150, 190], [185, 150], [215, 230], [245, 380], [270, 560], [285, 640], [300, 580], [315, 430], [335, 260], [352, 90], [366, 45], [370, 4]];
var EL_LEN = 370, PS_KM = 150, MAOP_BAR = 100;
var EL = { cursor: null, loop: null, data: null };
function elevAt(km) {
  km = clamp(km, 0, EL_LEN);
  for (var i = 0; i < EL_KP.length - 1; i++) {
    var a = EL_KP[i], b = EL_KP[i + 1];
    if (km <= b[0]) { var t = (km - a[0]) / (b[0] - a[0]); return lerp(a[1], b[1], (1 - Math.cos(Math.PI * t)) / 2); }
  }
  return EL_KP[EL_KP.length - 1][1];
}
function elState() {
  return { pin: numVal('#el-pin', 20, 0, 120), pd: numVal('#el-pd', 45, 0, 150), sg: numVal('#el-sg', 0.85, LIM.SG[0], LIM.SG[1]),
           q: numVal('#el-flow', 5000, 500, 12000), vp: numVal('#el-vp', 0.8, 0.05, 10) };
}
function elCompute(s) {
  var rho = s.sg * 1000, D = 1.067, A = Math.PI * D * D / 4, v = s.q / 3600 / A, Re = v * D / 12e-6;
  var fr = swameeJain(Re, 0.045e-3, D), grad = fr / D * v * v / (2 * G);  // m of head per m of pipe
  var hIn = s.pin * 1e5 / (rho * G) + elevAt(0), hD = s.pd * 1e5 / (rho * G) + elevAt(PS_KM);
  var N = 185, pts = [], minP = 1e9, minKm = 0, maxP = -1e9, maxKm = 0;
  for (var i = 0; i <= N; i++) {
    var km = i * EL_LEN / N, z = elevAt(km);
    var H = km < PS_KM ? hIn - grad * 1000 * km : hD - grad * 1000 * (km - PS_KM);
    var P = (H - z) * rho * G / 1e5, Pabs = P + 1.01325;
    var st = Pabs < s.vp ? 'vac' : P < 0 ? 'slack' : 'ok';
    pts.push({ km: km, z: z, H: H, P: P, st: st });
    if (P < minP) { minP = P; minKm = km; } if (P > maxP) { maxP = P; maxKm = km; }
  }
  var Psuc = (hIn - grad * 1000 * PS_KM - elevAt(PS_KM)) * rho * G / 1e5;
  return { pts: pts, grad: grad, minP: minP, minKm: minKm, maxP: maxP, maxKm: maxKm, Psuc: Psuc, v: v, s: s };
}
function elZones(d, st) {
  var out = [], cur = null;
  d.pts.forEach(function (p, i) {
    if (p.st === st) { if (!cur) cur = { a: p.km, b: p.km }; cur.b = p.km; } else if (cur) { out.push(cur); cur = null; }
    if (i === d.pts.length - 1 && cur) out.push(cur);
  });
  return out;
}
function elUpdate() {
  var s = elState();
  setText('#el-pin-v', fmt(s.pin, 1) + ' bar'); setText('#el-pd-v', fmt(s.pd, 1) + ' bar'); setText('#el-sg-v', fmt(s.sg, 2));
  setText('#el-flow-v', fmt(s.q, 0)); setText('#el-vp-v', fmt(s.vp, 2) + ' bar a');
  var d = elCompute(s); EL.data = d;
  var vac = elZones(d, 'vac'), slack = elZones(d, 'slack');
  function zs(z) { return z.map(function (r) { return 'km ' + fmt(r.a, 0) + ' to ' + fmt(r.b, 0); }).join('; '); }
  var risk = vac.length ? 'crit' : slack.length ? 'warn' : (d.maxP > MAOP_BAR || d.Psuc < s.vp - 1.01325) ? 'warn' : 'ok';
  var pill = risk === 'crit' ? '<span class="status-pill crit">Vapour-pocket risk</span>' : risk === 'warn' ? '<span class="status-pill warn">Slack line / check limits</span>' : '<span class="status-pill ok">HGL clear of terrain</span>';
  setHTML('#el-out',
    '<div class="big">' + fmt(d.minP, 1) + ' <small>bar g minimum, at km ' + fmt(d.minKm, 0) + ' (elev ' + fmt(elevAt(d.minKm), 0) + ' m)</small></div>' +
    '<div style="margin:6px 0">' + pill + '</div>' +
    '<div class="kv"><span>Friction gradient (42 in, 12 cSt)</span><span>' + fmt(d.grad * 1000, 2) + ' m/km</span>' +
    '<span>Velocity</span><span>' + fmt(d.v, 2) + ' m/s</span>' +
    '<span>PS-2 suction pressure</span><span>' + fmt(d.Psuc, 1) + ' bar g</span>' +
    '<span>Maximum pressure</span><span>' + fmt(d.maxP, 1) + ' bar g at km ' + fmt(d.maxKm, 0) + '</span>' +
    '<span>Vapour-pocket zones</span><span>' + (vac.length ? esc(zs(vac)) : 'none') + '</span>' +
    '<span>Slack-line zones</span><span>' + (slack.length ? esc(zs(slack)) : 'none') + '</span></div>' +
    '<div class="note' + (risk === 'ok' ? '' : ' warn') + '" style="margin-bottom:0">Plain English: the dashed gradient line is the pressure energy left in the product. Where it dips under the mountain crest the pipe cannot stay full: the line goes slack or the liquid boils into vapour. Raise PS-2 discharge pressure or reduce flow. Assumed MAOP ' + MAOP_BAR + ' bar.</div>');
  if (EL.loop) EL.loop.dirty = true;
}
function elDraw() {
  var c = $('#elevCanvas'); if (!c || !EL.data) return;
  var f = fitCanvas(c), ctx = f.ctx, w = f.w, h = f.h, d = EL.data;
  var ml = 46, mr = 12, mt = 16, mb = 30, pw = w - ml - mr, ph = h - mt - mb;
  var maxH = 0; d.pts.forEach(function (p) { if (p.H > maxH) maxH = p.H; if (p.z > maxH) maxH = p.z; });
  var ymax = clamp(Math.ceil(maxH * 1.05 / 100) * 100, 800, 4000);
  function X(km) { return ml + km / EL_LEN * pw; }
  function Y(m) { return mt + ph - clamp(m, -ymax * 0.05, ymax) / ymax * ph; }
  ctx.clearRect(0, 0, w, h);
  ctx.font = '11px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
  // grid
  ctx.strokeStyle = theme.muted; ctx.globalAlpha = 0.25; ctx.lineWidth = 1; ctx.beginPath();
  for (var g = 0; g <= 4; g++) { var yy = mt + ph * g / 4; ctx.moveTo(ml, yy); ctx.lineTo(ml + pw, yy); }
  ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = theme.muted; ctx.textAlign = 'right';
  for (var g2 = 0; g2 <= 4; g2++) ctx.fillText(Math.round(ymax * (4 - g2) / 4) + '', ml - 6, mt + ph * g2 / 4 + 4);
  ctx.textAlign = 'center';
  [0, 100, 200, 300, 370].forEach(function (k) { ctx.fillText(k + ' km', X(k), h - 10); });
  ctx.save(); ctx.translate(11, mt + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Elevation / head (m)', 0, 0); ctx.restore();
  // risk bands
  [['vac', theme.crit, 'Vapour-pocket risk'], ['slack', theme.warn, 'Slack line']].forEach(function (z) {
    elZones(d, z[0]).forEach(function (r) {
      var x1 = X(r.a) - 2, x2 = Math.max(X(r.b) + 2, x1 + 4);
      ctx.globalAlpha = 0.2; ctx.fillStyle = z[1]; ctx.fillRect(x1, mt, x2 - x1, ph);
      ctx.globalAlpha = 1; ctx.strokeStyle = z[1]; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.strokeRect(x1, mt, x2 - x1, ph); ctx.setLineDash([]);
      ctx.fillStyle = z[1]; ctx.textAlign = 'center'; ctx.fillText(z[2], (x1 + x2) / 2, mt + 12);
    });
  });
  // terrain
  ctx.beginPath(); ctx.moveTo(X(0), Y(0));
  d.pts.forEach(function (p) { ctx.lineTo(X(p.km), Y(p.z)); });
  ctx.lineTo(X(EL_LEN), Y(0)); ctx.closePath();
  ctx.fillStyle = theme.sun ? 'rgba(255,255,0,0.18)' : 'rgba(190,160,100,0.28)'; ctx.fill();
  ctx.beginPath(); d.pts.forEach(function (p, i) { if (i) ctx.lineTo(X(p.km), Y(p.z)); else ctx.moveTo(X(p.km), Y(p.z)); });
  ctx.strokeStyle = theme.sun ? '#ffff00' : '#c9a76a'; ctx.lineWidth = 2.5; ctx.stroke();
  // HGL (clipped to plot)
  ctx.save(); ctx.beginPath(); ctx.rect(ml, mt, pw, ph); ctx.clip();
  ctx.beginPath(); var started = false;
  d.pts.forEach(function (p, i) {
    var x = X(p.km), y = Y(p.H);
    var jump = i > 0 && d.pts[i - 1].km < PS_KM && p.km >= PS_KM;
    if (!started || jump) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = theme.accent; ctx.lineWidth = 2.5; ctx.setLineDash([7, 4]); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
  // pump station marker
  ctx.strokeStyle = theme.text; ctx.globalAlpha = 0.5; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(X(PS_KM), mt); ctx.lineTo(X(PS_KM), mt + ph); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  ctx.fillStyle = theme.text; ctx.textAlign = 'center'; ctx.fillText('PS-2', X(PS_KM), mt + ph - 6);
  ctx.textAlign = 'left'; ctx.fillText('Habshan', ml + 4, mt + ph - 6); ctx.textAlign = 'right'; ctx.fillText('Fujairah', ml + pw - 4, mt + ph - 6);
  ctx.textAlign = 'center'; ctx.fillText('Hajar crest', X(285), Y(elevAt(285)) - 8);
  // legend
  ctx.textAlign = 'left'; ctx.fillStyle = theme.accent; ctx.fillText('- - HGL', ml + 6, mt + 12); ctx.fillStyle = theme.sun ? '#ffff00' : '#c9a76a'; ctx.fillText('--- Pipe / terrain', ml + 62, mt + 12);
  // cursor
  if (EL.cursor !== null) {
    var km = clamp(EL.cursor, 0, EL_LEN), idx = Math.round(km / EL_LEN * (d.pts.length - 1)), p = d.pts[idx];
    ctx.strokeStyle = theme.text; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(p.km), mt); ctx.lineTo(X(p.km), mt + ph); ctx.stroke();
    var txt = 'km ' + fmt(p.km, 0) + ' | z ' + fmt(p.z, 0) + ' m | HGL ' + fmt(p.H, 0) + ' m | ' + fmt(p.P, 1) + ' bar g';
    var tw = ctx.measureText(txt).width + 14, tx = clamp(X(p.km) - tw / 2, ml, ml + pw - tw);
    ctx.fillStyle = theme.sun ? '#000' : 'rgba(0,0,0,0.85)'; ctx.fillRect(tx, mt + 18, tw, 20);
    ctx.strokeStyle = theme.accent; ctx.strokeRect(tx, mt + 18, tw, 20);
    ctx.fillStyle = theme.text; ctx.textAlign = 'left'; ctx.fillText(txt, tx + 7, mt + 32);
  }
}
function initElevation() {
  var c = $('#elevCanvas'); if (!c) return;
  EL.loop = addLoop(c, elDraw);
  ['#el-pin', '#el-pd', '#el-sg', '#el-flow', '#el-vp'].forEach(function (id) { on(id, 'input', elUpdate); });
  function setCursor(e) {
    var r = c.getBoundingClientRect(), x = e.clientX - r.left, ml = 46, pw = r.width - 58;
    EL.cursor = clamp((x - ml) / pw, 0, 1) * EL_LEN; if (EL.loop) EL.loop.dirty = true;
  }
  c.addEventListener('pointermove', setCursor); c.addEventListener('pointerdown', setCursor);
  c.addEventListener('pointerleave', function () { EL.cursor = null; if (EL.loop) EL.loop.dirty = true; });
  elUpdate();
}

/* =====================================================================
   13. RTTM LEAK SIMULATOR AND TRANSIENT WAVEFORM
   ===================================================================== */
var RT = { t: 0, last: 0, leak: null, outTs: 0, loop: null };
var RT_M0 = 500, RT_D = 0.6, RT_DT = 0.1, RT_DA = 0.03;   // kg/s, m, s timing resolution, wave-speed uncertainty
function rtParams() {
  return { L: numVal('#rttm-len', 50, 1, 500), pos: numVal('#rttm-pos', 36, 1, 99) / 100, size: numVal('#rttm-size', 5, 0.5, 50) / 100, a: numVal('#rttm-a', 1000, 300, 1600) };
}
function rtNoise(k, ch) { var x = Math.sin(k * 12.9898 + ch * 78.233) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; }
function rtScale(P) { return Math.max(1, (P.L * 1000 / P.a) / 40); }
function rtDeltaP(P, aEff) { var A = Math.PI * RT_D * RT_D / 4; return aEff * (P.size * RT_M0) / (2 * A) / 1e5; } // bar, Joukowsky split to both sides
function rtInject() {
  if (RT.leak) { toast('Leak already active. Press Reset to run again.'); return; }
  var P = rtParams(), aTrue = P.a * (1 + (Math.random() * 2 - 1) * RT_DA), xl = P.L * P.pos;
  RT.leak = { t0: RT.t, x: xl, aTrue: aTrue, P: P, tIn: RT.t + xl * 1000 / aTrue, tOut: RT.t + (P.L - xl) * 1000 / aTrue,
              jIn: Math.random() * RT_DT, jOut: Math.random() * RT_DT, dP: rtDeltaP(P, aTrue), q: P.size * RT_M0 };
  fx.alarm(); toast('Leak injected at ' + fmt(xl, 2) + ' km (hidden). Watch the negative pressure wave.');
}
function rtReset() { RT.t = 0; RT.leak = null; if (RT.loop) RT.loop.dirty = true; }
function rtSample(tau, ch, lk) {
  var n = rtNoise(Math.floor(tau * 10), ch), v;
  if (ch === 0) { v = RT_M0 + n * 1.2; if (lk && tau > lk.tIn) v += 0.35 * lk.q * (1 - Math.exp(-(tau - lk.tIn) / 8)); return v; }
  if (ch === 1) { v = RT_M0 + n * 1.2; if (lk && tau > lk.tOut) v -= 0.65 * lk.q * (1 - Math.exp(-(tau - lk.tOut) / 8)); return v; }
  v = n * 0.03;
  var te = ch === 2 ? (lk && lk.tIn) : (lk && lk.tOut);
  if (lk && tau > te) v -= lk.dP * (0.35 + 0.65 * Math.exp(-(tau - te) / 6));
  return v;
}
function rtEstimate() {
  var lk = RT.leak; if (!lk) return null;
  var tInD = lk.tIn + lk.jIn, tOutD = lk.tOut + lk.jOut, P = lk.P;
  var have = RT.t >= Math.max(tInD, tOutD);
  var dtm = tInD - tOutD;                                 // inlet arrival minus outlet arrival
  var X = (P.L * 1000 + P.a * dtm) / 2;                   // X = (L + a * dt) / 2   [m from inlet]
  var margin = Math.sqrt(2 * Math.pow(P.a * RT_DT / 2, 2) + Math.pow(dtm * P.a * RT_DA / 2, 2)); // m
  return { have: have, tInD: tInD, tOutD: tOutD, dt: dtm, X: X / 1000, margin: margin, actual: lk.x, err: Math.abs(X / 1000 - lk.x) * 1000 };
}
function rtDraw(ts) {
  var c = $('#rttmCanvas'); if (!c) return;
  var P = rtParams(), scale = rtScale(P);
  var dt = RT.last ? Math.min(0.1, (ts - RT.last) / 1000) : 0; RT.last = ts;
  RT.t += dt * scale;
  var f = fitCanvas(c), ctx = f.ctx, w = f.w, h = f.h, lk = RT.leak;
  var ml = 50, mr = 52, mt = 14, mb = 74, pw = w - ml - mr, ph = h - mt - mb;
  var W = 150 * scale, t1 = RT.t, t0 = t1 - W;
  var qRef = P.size * RT_M0, dpRef = rtDeltaP(P, P.a);
  var mLo = RT_M0 - Math.max(8, 0.8 * qRef), mHi = RT_M0 + Math.max(6, 0.4 * qRef);
  var pLo = -Math.max(0.25, 1.4 * dpRef), pHi = Math.max(0.1, 0.25 * dpRef);
  function X(t) { return ml + (t - t0) / W * pw; }
  function YM(v) { return mt + ph - (v - mLo) / (mHi - mLo) * ph; }
  function YP(v) { return mt + ph - (v - pLo) / (pHi - pLo) * ph; }
  ctx.clearRect(0, 0, w, h);
  ctx.font = '11px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
  ctx.strokeStyle = theme.muted; ctx.globalAlpha = 0.25; ctx.lineWidth = 1; ctx.beginPath();
  for (var g = 0; g <= 4; g++) { var yy = mt + ph * g / 4; ctx.moveTo(ml, yy); ctx.lineTo(ml + pw, yy); }
  ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = theme.muted; ctx.textAlign = 'right';
  for (var g2 = 0; g2 <= 4; g2++) ctx.fillText(fmt(mHi - (mHi - mLo) * g2 / 4, 0), ml - 5, mt + ph * g2 / 4 + 4);
  ctx.textAlign = 'left';
  for (var g3 = 0; g3 <= 4; g3++) ctx.fillText(fmt(pHi - (pHi - pLo) * g3 / 4, 2), ml + pw + 5, mt + ph * g3 / 4 + 4);
  ctx.save(); ctx.translate(11, mt + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('Mass flow (kg/s)', 0, 0); ctx.restore();
  ctx.save(); ctx.translate(w - 8, mt + ph / 2); ctx.rotate(Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('Pressure deviation (bar)', 0, 0); ctx.restore();
  ctx.textAlign = 'center'; ctx.fillText('Time (s)  window ' + fmt(W, 0) + ' s' + (scale > 1 ? '  (time x' + fmt(scale, 1) + ')' : ''), ml + pw / 2, mt + ph + 14);
  // series
  var series = [[0, 'Mass in', theme.accent, [], YM], [1, 'Mass out', theme.warn, [6, 3], YM], [2, 'P inlet', theme.ok, [], YP], [3, 'P outlet', theme.crit, [2, 3], YP]];
  ctx.save(); ctx.beginPath(); ctx.rect(ml, mt, pw, ph); ctx.clip();
  var step = Math.max(0.1, W / pw);
  series.forEach(function (s) {
    ctx.beginPath(); var first = true;
    for (var t = t0; t <= t1; t += step) { var v = rtSample(t, s[0], lk), x = X(t), y = s[4](v); if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); }
    ctx.strokeStyle = s[2]; ctx.lineWidth = 2; ctx.setLineDash(s[3]); ctx.stroke(); ctx.setLineDash([]);
  });
  var est = rtEstimate();
  if (lk) {
    [[lk.tIn + lk.jIn, 'Inlet detect'], [lk.tOut + lk.jOut, 'Outlet detect']].forEach(function (m, i) {
      if (RT.t < m[0]) return; ctx.strokeStyle = theme.text; ctx.globalAlpha = 0.6; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(m[0]), mt); ctx.lineTo(X(m[0]), mt + ph); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = theme.text; ctx.textAlign = 'left'; ctx.fillText(m[1], X(m[0]) + 4, mt + 12 + i * 12);
    });
  }
  ctx.restore();
  // legend
  ctx.textAlign = 'left'; var lx = ml + 6;
  series.forEach(function (s) { ctx.fillStyle = s[2]; ctx.fillRect(lx, h - mb + 24, 16, 3); ctx.fillStyle = theme.text; ctx.fillText(s[1], lx + 20, h - mb + 30); lx += ctx.measureText(s[1]).width + 36; });
  // pipeline strip
  var sy = h - 22, L = P.L;
  function XK(km) { return ml + km / L * pw; }
  ctx.strokeStyle = theme.muted; ctx.lineWidth = 8; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(ml, sy); ctx.lineTo(ml + pw, sy); ctx.stroke();
  ctx.fillStyle = theme.muted; ctx.textAlign = 'left'; ctx.fillText('Inlet 0 km', ml, sy + 18); ctx.textAlign = 'right'; ctx.fillText('Outlet ' + fmt(L, 0) + ' km', ml + pw, sy + 18);
  if (lk) {
    var tt = RT.t - lk.t0, wu = lk.x - lk.aTrue * tt / 1000, wd = lk.x + lk.aTrue * tt / 1000;
    ctx.strokeStyle = theme.crit; ctx.lineWidth = 3;
    if (wu > 0) { ctx.beginPath(); ctx.moveTo(XK(wu), sy - 10); ctx.lineTo(XK(wu), sy + 10); ctx.stroke(); }
    if (wd < L) { ctx.beginPath(); ctx.moveTo(XK(wd), sy - 10); ctx.lineTo(XK(wd), sy + 10); ctx.stroke(); }
    if (est && est.have) {
      var e1 = clamp(est.X - est.margin / 1000, 0, L), e2 = clamp(est.X + est.margin / 1000, 0, L);
      ctx.globalAlpha = 0.35; ctx.fillStyle = theme.info; ctx.fillRect(XK(e1), sy - 16, Math.max(3, XK(e2) - XK(e1)), 32); ctx.globalAlpha = 1;
      ctx.fillStyle = theme.info; ctx.beginPath(); var ex = XK(clamp(est.X, 0, L)); ctx.moveTo(ex, sy - 18); ctx.lineTo(ex + 6, sy - 26); ctx.lineTo(ex - 6, sy - 26); ctx.closePath(); ctx.fill();
      ctx.textAlign = 'center'; ctx.fillText('Estimate +/- ' + fmt(est.margin, 0) + ' m', clamp(ex, ml + 60, ml + pw - 60), sy - 30);
    }
    ctx.fillStyle = theme.crit; ctx.beginPath(); var lxk = XK(lk.x); ctx.moveTo(lxk, sy + 14); ctx.lineTo(lxk + 7, sy + 26); ctx.lineTo(lxk - 7, sy + 26); ctx.closePath(); ctx.fill();
  }
  if (ts - RT.outTs > 250) { RT.outTs = ts; rtRenderOut(est); }
}
function rtRenderOut(est) {
  var lk = RT.leak, P = rtParams();
  var sIn = 0, sOut = 0, n = 30;
  for (var i = 0; i < n; i++) { var tau = RT.t - i * 0.1; sIn += rtSample(tau, 0, lk); sOut += rtSample(tau, 1, lk); }
  var imb = (sIn - sOut) / n, imbPct = imb / RT_M0 * 100;
  var head;
  if (!lk) {
    head = '<div class="big">Steady state <small>no leak</small></div><div style="margin:6px 0"><span class="status-pill ok">Mass balance healthy</span></div>' +
      '<div class="kv"><span>Imbalance (3 s mean)</span><span>' + fmt(imb, 2) + ' kg/s (' + fmt(imbPct, 2) + ' %)</span><span>Expected wave pressure step</span><span>' + fmt(rtDeltaP(P, P.a), 2) + ' bar</span><span>Wave transit across line</span><span>' + fmt(P.L * 1000 / P.a, 1) + ' s</span></div>';
  } else if (!est.have) {
    head = '<div class="big">Wave travelling <small>awaiting both sensors</small></div><div style="margin:6px 0"><span class="status-pill warn">Transient in progress</span></div>' +
      '<div class="kv"><span>Imbalance (3 s mean)</span><span>' + fmt(imb, 2) + ' kg/s (' + fmt(imbPct, 2) + ' %)</span><span>Pressure step</span><span>' + fmt(lk.dP, 2) + ' bar</span></div>';
  } else {
    var inside = est.err <= est.margin;
    head = '<div class="big">X = ' + fmt(est.X, 3) + ' km <small>from inlet, +/- ' + fmt(est.margin, 0) + ' m</small></div>' +
      '<div style="margin:6px 0"><span class="status-pill ' + (inside ? 'ok' : 'warn') + '">' + (inside ? 'Actual leak inside error zone' : 'Outside zone (wave-speed error)') + '</span></div>' +
      '<div class="kv"><span>Inlet arrival</span><span>' + fmt(est.tInD - lk.t0, 2) + ' s after rupture</span><span>Outlet arrival</span><span>' + fmt(est.tOutD - lk.t0, 2) + ' s after rupture</span>' +
      '<span>&Delta;t (inlet &minus; outlet)</span><span>' + fmt(est.dt, 3) + ' s</span><span>Actual position</span><span>' + fmt(est.actual, 3) + ' km</span><span>Location error</span><span>' + fmt(est.err, 0) + ' m</span>' +
      '<span>Mass imbalance</span><span>' + fmt(imb, 1) + ' kg/s (' + fmt(imbPct, 1) + ' %)</span></div>';
  }
  setHTML('#rttm-out', head + '<div class="note" style="margin-bottom:0">Location uses <b>X = (L + a&middot;&Delta;t) / 2</b> with &Delta;t = t<sub>inlet</sub> &minus; t<sub>outlet</sub>. Margin combines sample timing (' + RT_DT * 1000 + ' ms) and &plusmn;' + RT_DA * 100 + ' % wave-speed uncertainty. Wave speed in crude is roughly 1000 m/s; in gas it is far lower.</div>');
}
function initRttm() {
  var c = $('#rttmCanvas'); if (!c) return;
  RT.loop = addLoop(c, rtDraw, function () { return true; });
  on('#rttmLeak', 'click', rtInject); on('#rttmReset', 'click', rtReset);
  ['#rttm-len', '#rttm-pos', '#rttm-size', '#rttm-a'].forEach(function (id) {
    on(id, 'change', function () { var el = $(id); var lim = { '#rttm-len': [1, 500], '#rttm-pos': [1, 99], '#rttm-size': [0.5, 50], '#rttm-a': [300, 1600] }[id]; if (el) el.value = clamp(parseFloat(el.value) || lim[0], lim[0], lim[1]); rtReset(); });
  });
}

/* =====================================================================
   14. CAUSE & EFFECT (SIS) MATRIX
   ===================================================================== */
var CE_EFFECTS = [
  { id: 'ESDV-101', name: 'Trip inlet ESDV' }, { id: 'LBV-04', name: 'Close LBV-04' }, { id: 'BDV-103', name: 'Blowdown BDV' },
  { id: 'SR-001', name: 'Sound desert siren' }, { id: 'K-401', name: 'Stop compressor' }
];
var CE_CAUSES = [
  { tag: 'PAHH-101', desc: 'High-High pressure (2oo3)', map: { 'ESDV-101': 'X', 'LBV-04': 'X', 'SR-001': 'X', 'K-401': 'X' } },
  { tag: 'PALL-102', desc: 'Low-Low pressure (line break)', map: { 'ESDV-101': 'X', 'LBV-04': 'X', 'SR-001': 'X', 'K-401': 'X' } },
  { tag: 'PDT-105 dP/dt', desc: 'Rate-of-fall rupture trip', map: { 'ESDV-101': 'X', 'LBV-04': 'X', 'SR-001': 'X' } },
  { tag: 'FD-201', desc: 'Flame detector (2oo3)', map: { 'ESDV-101': 'X', 'LBV-04': 'X', 'BDV-103': 'T30', 'SR-001': 'X', 'K-401': 'X' } },
  { tag: 'GD-202', desc: 'Gas detector HH (60 % LEL)', map: { 'ESDV-101': 'X', 'LBV-04': 'X', 'BDV-103': 'T30', 'SR-001': 'X', 'K-401': 'X' } },
  { tag: 'LAHH-301', desc: 'Slug catcher level HH', map: { 'ESDV-101': 'X', 'K-401': 'X' } },
  { tag: 'PB-001', desc: 'Manual ESD pushbutton', map: { 'ESDV-101': 'X', 'LBV-04': 'X', 'BDV-103': 'T60', 'SR-001': 'X', 'K-401': 'X' } }
];
var ceTimers = [], ceHistory = [];
function ceCellText(v) { return v === 'X' ? '&#9679;' : v ? esc(v.replace('T', 'T+') + ' s') : ''; }
function buildCe() {
  var h = '<table class="ce"><thead><tr><th>Cause \\ Effect</th>';
  CE_EFFECTS.forEach(function (e) { h += '<th class="col" data-col="' + e.id + '">' + esc(e.id) + '<br><small>' + esc(e.name) + '</small></th>'; });
  h += '</tr></thead><tbody>';
  CE_CAUSES.forEach(function (c, i) {
    h += '<tr class="cause" data-row="' + i + '" tabindex="0" role="button" aria-label="Simulate trip ' + esc(c.tag) + '"><th class="row"><b>' + esc(c.tag) + '</b><br><small>' + esc(c.desc) + '</small></th>';
    CE_EFFECTS.forEach(function (e) { var v = c.map[e.id]; h += '<td class="x' + (v ? ' link' : '') + '" data-col="' + e.id + '">' + ceCellText(v) + '</td>'; });
    h += '</tr>';
  });
  setHTML('#ceTable', h + '</tbody></table>');
}
function ceClear() {
  ceTimers.forEach(clearTimeout); ceTimers = [];
  $$('#ceTable .active, #ceTable .fired').forEach(function (n) { n.classList.remove('active'); n.classList.remove('fired'); });
}
function ceLog(msg) { var l = $('#ceLog'); if (!l) return; l.textContent += (l.dataset.fresh === '0' ? '\n' : '') + msg; l.dataset.fresh = '0'; l.scrollTop = l.scrollHeight; }
function ceTrip(i) {
  var c = CE_CAUSES[i]; if (!c) return;
  ceClear();
  var log = $('#ceLog'); if (log) { log.textContent = ''; log.dataset.fresh = '1'; }
  var row = $('#ceTable tr[data-row="' + i + '"]'); if (row) row.classList.add('fired');
  ceLog('[' + stamp() + '] CAUSE ' + c.tag + ' (' + c.desc + ') TRIPPED');
  fx.alarm();
  ceHistory.push({ cause: c.tag, time: stamp() });
  var any = false;
  CE_EFFECTS.forEach(function (e, k) {
    var v = c.map[e.id]; if (!v) return; any = true;
    var delay = v === 'X' ? 0 : parseInt(v.replace('T', ''), 10) || 0;
    var ms = 350 + k * 260 + Math.min(delay * 60, 3200);
    ceTimers.push(setTimeout(function () {
      $$('#ceTable [data-col="' + e.id + '"]').forEach(function (n) { if (n.tagName === 'TD' ? (n.parentNode && n.parentNode.getAttribute('data-row') === String(i)) : true) n.classList.add('active'); });
      ceLog('[' + stamp() + '] EFFECT ' + e.id + ': ' + e.name.toUpperCase() + (delay ? ' (after ' + delay + ' s delay, time-compressed)' : ''));
      fx.tick();
    }, ms));
  });
  ceTimers.push(setTimeout(function () { ceLog('[' + stamp() + '] Sequence complete. ' + (any ? 'Safe state reached.' : 'No outputs linked.')); fx.chime(); }, 900 + CE_EFFECTS.length * 260 + 3300));
}
function ceExportSummary() {
  var site = ''; var s = $('#satSite'); if (s && s.value) site = s.value;
  var md = '# Cause & Effect matrix summary\n\nSite: ' + (site || 'n/a') + '  \nGenerated: ' + new Date().toLocaleString('en-GB') + '\n\n';
  md += '| Cause | Description | ' + CE_EFFECTS.map(function (e) { return e.id; }).join(' | ') + ' |\n|---|---|' + CE_EFFECTS.map(function () { return ':-:'; }).join('|') + '|\n';
  CE_CAUSES.forEach(function (c) { md += '| ' + c.tag + ' | ' + c.desc + ' | ' + CE_EFFECTS.map(function (e) { var v = c.map[e.id]; return v === 'X' ? 'X' : v ? v.replace('T', 'T+') + 's' : '-'; }).join(' | ') + ' |\n'; });
  md += '\nLegend: X = immediate action, T+n s = timer delay, - = no link.\n';
  md += '\n## Simulated trips this session\n' + (ceHistory.length ? ceHistory.map(function (h) { return '- ' + h.time + ' ' + h.cause + ': outputs verified on simulation'; }).join('\n') : '- none recorded') + '\n';
  var out = $('#ceOut'); if (out) out.value = md;
  copyText(md).then(function (ok) { toast(ok ? 'Summary copied. Downloading .md file' : 'Summary ready in preview'); });
  download('ce-matrix-summary.md', md, 'text/markdown'); fx.ok();
}
function initCe() {
  buildCe();
  var t = $('#ceTable'); if (!t) return;
  t.addEventListener('click', function (e) { var r = e.target.closest ? e.target.closest('tr.cause') : null; if (r) ceTrip(parseInt(r.getAttribute('data-row'), 10)); });
  t.addEventListener('keydown', function (e) { if (e.key !== 'Enter' && e.key !== ' ') return; var r = e.target.closest ? e.target.closest('tr.cause') : null; if (r) { e.preventDefault(); ceTrip(parseInt(r.getAttribute('data-row'), 10)); } });
  on('#ceReset', 'click', function () { ceClear(); var l = $('#ceLog'); if (l) { l.textContent = 'Awaiting simulated trip...'; l.dataset.fresh = '1'; } });
  on('#ceExport', 'click', ceExportSummary);
}

/* =====================================================================
   15. IEC 61131-3 CODE HUB WITH SYNTAX HIGHLIGHTING
   ===================================================================== */
var ST_SNIPPETS = [
  { name: 'FB_LineBreak_dP_dt', desc: 'Rate-of-pressure-fall pipeline rupture detection with persistence, inhibit and latched trip.', code:
'(* FB_LineBreak_dP_dt : pipeline rupture detection by rate of pressure fall.\n' +
'   Call every scan from a fixed-cycle task (for example 100 ms).\n' +
'   P_Bar must be a validated, filtered pressure in bar g (2oo3 voted upstream). *)\n' +
'FUNCTION_BLOCK FB_LineBreak_dP_dt\n' +
'VAR_INPUT\n' +
'  Enable       : BOOL := TRUE;\n' +
'  P_Bar        : REAL;                 // validated pressure, bar g\n' +
'  P_Good       : BOOL;                 // transmitter quality good\n' +
'  Inhibit      : BOOL;                 // known transient: pump trip, valve move, start-up\n' +
'  Reset        : BOOL;                 // operator reset of latched trip\n' +
'  CycleTime_s  : REAL := 0.1;          // task cycle time, s\n' +
'  Window_s     : REAL := 2.0;          // evaluation window, s (max 9.9 s at 100 ms)\n' +
'  Warn_BarPerS : REAL := 0.15;         // rate-of-fall warning limit\n' +
'  Trip_BarPerS : REAL := 0.40;         // rate-of-fall trip limit\n' +
'  MinDrop_Bar  : REAL := 0.50;         // absolute drop required (noise rejection)\n' +
'  Persist_T    : TIME := T#500ms;      // condition must persist this long\n' +
'END_VAR\n' +
'VAR_OUTPUT\n' +
'  dPdt_BarPerS : REAL;                 // signed rate, negative = falling\n' +
'  Warn         : BOOL;\n' +
'  Trip         : BOOL;                 // latched until Reset\n' +
'  Fault        : BOOL;                 // bad input or bad configuration\n' +
'END_VAR\n' +
'VAR\n' +
'  Buf     : ARRAY[0..99] OF REAL;      // circular buffer, 10 s at 100 ms\n' +
'  Idx     : INT := 0;\n' +
'  Cnt     : INT := 0;\n' +
'  N       : INT;\n' +
'  OldIdx  : INT;\n' +
'  Drop    : REAL;\n' +
'  Rate    : REAL;\n' +
'  Armed   : BOOL;\n' +
'  tonWarn : TON;\n' +
'  tonTrip : TON;\n' +
'  Latched : BOOL;\n' +
'END_VAR\n\n' +
'Fault := (NOT P_Good) OR (CycleTime_s <= 0.0) OR (Window_s <= 0.0);\n\n' +
'IF (NOT Enable) OR Fault THEN\n' +
'  Cnt := 0;  Idx := 0;  Rate := 0.0;  Drop := 0.0;  Armed := FALSE;\n' +
'ELSE\n' +
'  // store newest sample, advance circular index\n' +
'  Buf[Idx] := P_Bar;\n' +
'  Idx := (Idx + 1) MOD 100;\n' +
'  IF Cnt < 100 THEN Cnt := Cnt + 1; END_IF;\n\n' +
'  // window length in samples, limited to the buffer\n' +
'  N := REAL_TO_INT(Window_s / CycleTime_s);\n' +
'  N := LIMIT(2, N, 99);\n\n' +
'  IF Cnt > N THEN\n' +
'    OldIdx := (Idx - 1 - N + 200) MOD 100;       // sample N cycles ago\n' +
'    Drop   := Buf[OldIdx] - P_Bar;               // positive when pressure falls\n' +
'    Rate   := Drop / (INT_TO_REAL(N) * CycleTime_s);\n' +
'    Armed  := TRUE;\n' +
'  ELSE\n' +
'    Rate := 0.0;  Drop := 0.0;  Armed := FALSE;  // buffer still filling\n' +
'  END_IF;\n' +
'END_IF;\n\n' +
'dPdt_BarPerS := -Rate;\n\n' +
'tonWarn(IN := Armed AND NOT Inhibit AND (Rate >= Warn_BarPerS) AND (Drop >= MinDrop_Bar), PT := Persist_T);\n' +
'tonTrip(IN := Armed AND NOT Inhibit AND (Rate >= Trip_BarPerS) AND (Drop >= MinDrop_Bar), PT := Persist_T);\n\n' +
'Warn := tonWarn.Q;\n' +
'IF tonTrip.Q THEN Latched := TRUE; END_IF;\n' +
'IF Reset AND NOT tonTrip.IN THEN Latched := FALSE; END_IF;   // reset only when condition has cleared\n' +
'Trip := Latched;\n' +
'END_FUNCTION_BLOCK\n' },
  { name: 'FB_AnalogScale_NAMUR', desc: '4-20 mA scaling with NAMUR NE43 fault detection, range clamps and hold-last-good.', code:
'(* FB_AnalogScale_NAMUR : raw counts -> engineering units with NE43 diagnostics.\n' +
'   Siemens S7: Raw_4mA = 0,  Raw_20mA = 27648.\n' +
'   Set the counts to match your module scaling (ControlLogix 1756-IF: 0..21 mA = 0..32767). *)\n' +
'FUNCTION_BLOCK FB_AnalogScale_NAMUR\n' +
'VAR_INPUT\n' +
'  Raw          : INT;\n' +
'  Raw_4mA      : INT  := 0;\n' +
'  Raw_20mA     : INT  := 27648;\n' +
'  EU_Low       : REAL := 0.0;            // value at 4 mA\n' +
'  EU_High      : REAL := 100.0;          // value at 20 mA\n' +
'  FaultLow_mA  : REAL := 3.6;            // NE43 downscale failure\n' +
'  UnderMin_mA  : REAL := 3.8;            // NE43 measuring range lower limit\n' +
'  OverMax_mA   : REAL := 20.5;           // NE43 measuring range upper limit\n' +
'  FaultHigh_mA : REAL := 21.0;           // NE43 upscale failure\n' +
'  HoldLastGood : BOOL := TRUE;\n' +
'END_VAR\n' +
'VAR_OUTPUT\n' +
'  PV      : REAL;\n' +
'  mA      : REAL;\n' +
'  Status  : BYTE;                        // 0 good, 1 under, 2 over, 3 burnout, 4 short, 5 transition, 6 config\n' +
'  Bad     : BOOL;                        // TRUE when PV is not a valid measurement\n' +
'  Under   : BOOL;\n' +
'  Over    : BOOL;\n' +
'  Burnout : BOOL;\n' +
'  Short   : BOOL;\n' +
'END_VAR\n' +
'VAR\n' +
'  CountSpan : REAL;\n' +
'  mAClamped : REAL;\n' +
'  LastGood  : REAL;\n' +
'END_VAR\n\n' +
'CountSpan := INT_TO_REAL(Raw_20mA - Raw_4mA);\n' +
'Under := FALSE;  Over := FALSE;  Burnout := FALSE;  Short := FALSE;  Bad := FALSE;  Status := 0;\n\n' +
'IF (CountSpan = 0.0) OR (EU_High = EU_Low) THEN\n' +
'  Status := 6;  Bad := TRUE;                     // configuration error\n' +
'ELSE\n' +
'  mA := 4.0 + 16.0 * (INT_TO_REAL(Raw - Raw_4mA) / CountSpan);\n' +
'  mA := LIMIT(0.0, mA, 25.0);                    // physical clamp of the computed loop current\n\n' +
'  IF mA <= FaultLow_mA THEN\n' +
'    Burnout := TRUE;  Bad := TRUE;  Status := 3;\n' +
'  ELSIF mA >= FaultHigh_mA THEN\n' +
'    Short := TRUE;    Bad := TRUE;  Status := 4;\n' +
'  ELSIF mA < UnderMin_mA OR mA > OverMax_mA THEN\n' +
'    Bad := TRUE;      Status := 5;               // transition band: not a valid measurement\n' +
'  ELSIF mA < 4.0 THEN\n' +
'    Under := TRUE;    Status := 1;               // valid but under-range\n' +
'  ELSIF mA > 20.0 THEN\n' +
'    Over := TRUE;     Status := 2;               // valid but over-range\n' +
'  END_IF;\n' +
'END_IF;\n\n' +
'IF NOT Bad THEN\n' +
'  mAClamped := LIMIT(UnderMin_mA, mA, OverMax_mA);\n' +
'  PV := EU_Low + (mAClamped - 4.0) / 16.0 * (EU_High - EU_Low);\n' +
'  LastGood := PV;\n' +
'ELSIF HoldLastGood THEN\n' +
'  PV := LastGood;                                // freeze value, alarm via Bad / Status\n' +
'END_IF;\n' +
'END_FUNCTION_BLOCK\n' },
  { name: 'FB_ValveTravelMonitor', desc: 'Line-break / ESD valve stroke-time monitor with travel-fault alarms and stroke recording.', code:
'(* FB_ValveTravelMonitor : stroke-time supervision for ESDV / LBV.\n' +
'   Limit switches are TRUE when the valve is AT the limit.\n' +
'   TIME_TO_REAL returns milliseconds on most IEC platforms; adjust if your target differs. *)\n' +
'FUNCTION_BLOCK FB_ValveTravelMonitor\n' +
'VAR_INPUT\n' +
'  CmdOpen            : BOOL;\n' +
'  CmdClose           : BOOL;\n' +
'  ZSO                : BOOL;                 // open limit switch\n' +
'  ZSC                : BOOL;                 // closed limit switch\n' +
'  StrokeLimitOpen_T  : TIME := T#30s;\n' +
'  StrokeLimitClose_T : TIME := T#30s;\n' +
'  MinStroke_T        : TIME := T#2s;         // faster than this: suspect limit switch\n' +
'  Reset              : BOOL;\n' +
'END_VAR\n' +
'VAR_OUTPUT\n' +
'  Opening, Closing         : BOOL;\n' +
'  FullyOpen, FullyClosed   : BOOL;\n' +
'  TravelFault              : BOOL;           // latched until Reset\n' +
'  FaultCode                : INT;            // 0 none, 1 open overtime, 2 close overtime, 3 both limits, 4 stroke too fast\n' +
'  LastStrokeOpen_s         : REAL;\n' +
'  LastStrokeClose_s        : REAL;\n' +
'END_VAR\n' +
'VAR\n' +
'  tonOpen, tonClose : TON;\n' +
'  rtZSO, rtZSC      : R_TRIG;\n' +
'  etOpen, etClose   : TIME;\n' +
'  wasOpening, wasClosing : BOOL;\n' +
'END_VAR\n\n' +
'FullyOpen   := ZSO AND NOT ZSC;\n' +
'FullyClosed := ZSC AND NOT ZSO;\n' +
'Opening := CmdOpen  AND NOT ZSO;\n' +
'Closing := CmdClose AND NOT ZSC;\n\n' +
'tonOpen(IN := Opening, PT := StrokeLimitOpen_T);\n' +
'tonClose(IN := Closing, PT := StrokeLimitClose_T);\n' +
'IF Opening THEN etOpen := tonOpen.ET; END_IF;\n' +
'IF Closing THEN etClose := tonClose.ET; END_IF;\n\n' +
'// both limit switches TRUE at once is physically impossible\n' +
'IF ZSO AND ZSC THEN TravelFault := TRUE; FaultCode := 3; END_IF;\n\n' +
'// overtime faults\n' +
'IF tonOpen.Q  THEN TravelFault := TRUE; FaultCode := 1; END_IF;\n' +
'IF tonClose.Q THEN TravelFault := TRUE; FaultCode := 2; END_IF;\n\n' +
'// record the stroke time when the limit switch is reached\n' +
'rtZSO(CLK := ZSO);\n' +
'rtZSC(CLK := ZSC);\n' +
'IF rtZSO.Q AND wasOpening THEN\n' +
'  LastStrokeOpen_s := TIME_TO_REAL(etOpen) / 1000.0;\n' +
'  IF etOpen < MinStroke_T THEN TravelFault := TRUE; FaultCode := 4; END_IF;\n' +
'END_IF;\n' +
'IF rtZSC.Q AND wasClosing THEN\n' +
'  LastStrokeClose_s := TIME_TO_REAL(etClose) / 1000.0;\n' +
'  IF etClose < MinStroke_T THEN TravelFault := TRUE; FaultCode := 4; END_IF;\n' +
'END_IF;\n' +
'wasOpening := Opening;\n' +
'wasClosing := Closing;\n\n' +
'IF Reset AND NOT (tonOpen.Q OR tonClose.Q) AND NOT (ZSO AND ZSC) THEN\n' +
'  TravelFault := FALSE;  FaultCode := 0;\n' +
'END_IF;\n' +
'END_FUNCTION_BLOCK\n' },
  { name: 'FC_LinePackDelta', desc: 'Pipeline inventory packing / unpacking from pressure and temperature change, with clamped coefficients.', code:
'(* FC_LinePackDelta : change in line-pack mass between two scans or windows.\n' +
'   Positive result = pipeline is PACKING (inventory increasing).\n' +
'   Use it to compensate the mass-balance leak detector before alarming. *)\n' +
'FUNCTION FC_LinePackDelta : REAL\n' +
'VAR_INPUT\n' +
'  Volume_m3    : REAL;                 // pipe volume between the meters\n' +
'  Density_kgm3 : REAL;                 // mean density\n' +
'  Bulk_Pa      : REAL := 1.4E9;        // bulk modulus, Pa\n' +
'  P_Now_bar    : REAL;\n' +
'  P_Prev_bar   : REAL;\n' +
'  Beta_perC    : REAL := 0.0008;       // thermal expansion coefficient, 1/degC\n' +
'  T_Now_C      : REAL;\n' +
'  T_Prev_C     : REAL;\n' +
'END_VAR\n' +
'VAR\n' +
'  Beta : REAL;\n' +
'  Bulk : REAL;\n' +
'  dMp  : REAL;\n' +
'  dMt  : REAL;\n' +
'END_VAR\n\n' +
'Beta := LIMIT(0.0001, Beta_perC, 0.0025);      // physical clamp\n' +
'Bulk := LIMIT(1.0E8, Bulk_Pa, 3.0E9);          // physical clamp\n\n' +
'dMp := Volume_m3 * Density_kgm3 * ((P_Now_bar - P_Prev_bar) * 1.0E5) / Bulk;   // compression\n' +
'dMt := -Volume_m3 * Density_kgm3 * Beta * (T_Now_C - T_Prev_C);                  // hotter product expands out\n\n' +
'FC_LinePackDelta := dMp + dMt;\n' +
'END_FUNCTION\n' }
];
var ST_KW = ['FUNCTION_BLOCK', 'END_FUNCTION_BLOCK', 'FUNCTION', 'END_FUNCTION', 'PROGRAM', 'END_PROGRAM', 'VAR_INPUT', 'VAR_OUTPUT', 'VAR_IN_OUT', 'VAR_TEMP', 'VAR', 'END_VAR', 'CONSTANT', 'RETAIN',
             'IF', 'THEN', 'ELSIF', 'ELSE', 'END_IF', 'CASE', 'OF', 'END_CASE', 'FOR', 'TO', 'BY', 'DO', 'END_FOR', 'WHILE', 'END_WHILE', 'REPEAT', 'UNTIL', 'END_REPEAT', 'RETURN', 'EXIT',
             'AND', 'OR', 'XOR', 'NOT', 'MOD', 'ARRAY', 'STRUCT', 'END_STRUCT', 'TYPE', 'END_TYPE'];
var ST_TY = ['BOOL', 'BYTE', 'WORD', 'DWORD', 'INT', 'UINT', 'DINT', 'UDINT', 'SINT', 'LINT', 'REAL', 'LREAL', 'TIME', 'STRING', 'TON', 'TOF', 'TP', 'R_TRIG', 'F_TRIG'];
var ST_RE = /(\(\*[\s\S]*?\*\))|(\/\/[^\n]*)|('(?:[^'\n]|\$')*')|(\bT#[0-9A-Za-z_.]+)|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)/g;
function highlightST(src) {
  var out = '', last = 0, m;
  ST_RE.lastIndex = 0;
  while ((m = ST_RE.exec(src)) !== null) {
    out += esc(src.slice(last, m.index));
    var tok = m[0], cls = '';
    if (m[1] || m[2]) cls = 'tk-cm';
    else if (m[3]) cls = 'tk-str';
    else if (m[4] || m[5]) cls = 'tk-num';
    else if (m[6]) {
      var u = tok.toUpperCase();
      if (ST_KW.indexOf(u) >= 0) cls = 'tk-kw';
      else if (ST_TY.indexOf(u) >= 0) cls = 'tk-ty';
      else if (u === 'TRUE' || u === 'FALSE') cls = 'tk-lit';
      else if (/^\s*\(/.test(src.slice(m.index + tok.length, m.index + tok.length + 3))) cls = 'tk-fn';
    }
    out += cls ? '<span class="' + cls + '">' + esc(tok) + '</span>' : esc(tok);
    last = m.index + tok.length;
  }
  return out + esc(src.slice(last));
}
function initCodeHub() {
  var host = $('#codeHub'); if (!host) return;
  host.innerHTML = ST_SNIPPETS.map(function (s, i) {
    return '<div class="card code-card"><div class="code-head"><h3>' + esc(s.name) + '</h3><span><span class="copy-badge" id="cb-' + i + '" aria-live="polite">Copied &#10003;</span><button class="chip" type="button" data-copy="' + i + '">Copy code</button></span></div>' +
      '<p class="muted small" style="margin:6px 0 0">' + esc(s.desc) + '</p><pre><code>' + highlightST(s.code) + '</code></pre></div>';
  }).join('');
  host.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-copy]') : null; if (!b) return;
    var i = parseInt(b.getAttribute('data-copy'), 10), s = ST_SNIPPETS[i]; if (!s) return;
    copyText(s.code).then(function (ok) {
      var badge = $('#cb-' + i); if (badge) { badge.textContent = ok ? 'Copied \u2713' : 'Copy failed'; badge.classList.add('show'); setTimeout(function () { badge.classList.remove('show'); }, 1800); }
      var old = b.textContent; b.textContent = ok ? 'Copied' : 'Select + copy'; setTimeout(function () { b.textContent = old; }, 1800);
      if (ok) fx.ok();
    });
  });
}

/* =====================================================================
   16. SAT / COMMISSIONING CHECKLIST (localStorage + IndexedDB)
   ===================================================================== */
var SAT_CATS = [
  { name: 'Cable Megger & Shield Grounding', items: [
    ['Insulation resistance (megger at 500 VDC) on every signal and power cable', 'Record value; target 100 Mohm or better per spec'],
    ['Shield grounded at one end only (control-system end)', 'Check drain wire continuity and isolation at the field end'],
    ['Loop continuity and loop resistance recorded', 'Compare with loop drawing and barrier / isolator limits'],
    ['Cable tags and ferrules match loop drawings', 'Spot-check 10 percent minimum']] },
  { name: 'Impulse Line Hydrotesting', items: [
    ['Impulse lines hydrotested at 1.5 x design pressure, 30 min hold', 'Record test pressure and pressure drop'],
    ['No leaks at tube fittings, manifolds and isolation valves', 'Use leak detection fluid on joints'],
    ['Isolation, equalising and vent valves operate freely', 'Label normal positions'],
    ['Slope, supports and heat tracing verified', 'Required for crude and condensate service']] },
  { name: '24VDC Solar Loop Stability', items: [
    ['Battery voltage between 11.8 and 14.4 V under full load', 'Log at dawn, noon and dusk if possible'],
    ['Supply ripple below 100 mVpp at RTU terminals', 'Scope or true-RMS meter'],
    ['Autonomy test: disconnect solar, verify runtime to low-voltage cutoff', 'Record hours of autonomy'],
    ['Low-voltage alarm and load-shed setpoints verified', 'Alarm must reach SCADA before shed']] },
  { name: 'Modbus / OPC Register Verification', items: [
    ['Register map matches device list (address, scaling, endianness)', 'Check word / byte order on first float'],
    ['Analog values match field gauges within tolerance', 'Test 0, 50, 100 percent points'],
    ['Write test on control points (under permit)', 'Verify read-back and bounds clamping'],
    ['Tag quality and timestamps verified (OPC UA / IEC-104 / DNP3)', 'Check SOE ordering and time sync'],
    ['Comms loss produces stale quality and an alarm', 'Pull cable, observe SCADA']] },
  { name: 'ESD Valve Stroke Time Testing (PST)', items: [
    ['Full-stroke close time within limit (record seconds)', 'Compare with surge study and SIL data'],
    ['Partial stroke test runs and returns (record travel percent)', 'Confirm no spurious trip'],
    ['Fail-safe position on loss of air / power verified', 'Run with permit and isolation'],
    ['Limit switch feedback and travel-fault alarm verified', 'Force overtime to test alarm'],
    ['Local ESD action works with comms disconnected', 'Core requirement for remote LBV stations']] }
];
var sat = { site: '', tech: '', updated: 0, items: {} };
var idb = null, satSaveTimer = 0, photoURLs = {};
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function idbOpen() {
  return new Promise(function (res) {
    if (!window.indexedDB) { res(null); return; }
    var rq; try { rq = indexedDB.open('og-scada-db', 1); } catch (e) { res(null); return; }
    rq.onupgradeneeded = function () { var d = rq.result; if (!d.objectStoreNames.contains('state')) d.createObjectStore('state'); if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { keyPath: 'id' }); };
    rq.onsuccess = function () { res(rq.result); }; rq.onerror = function () { res(null); }; rq.onblocked = function () { res(null); };
  });
}
function idbOp(store, mode, fn) {
  return new Promise(function (res) {
    if (!idb) { res(null); return; }
    try {
      var tx = idb.transaction(store, mode), os = tx.objectStore(store), rq = fn(os), val = null;
      if (rq) rq.onsuccess = function () { val = rq.result; };
      tx.oncomplete = function () { res(val === undefined ? null : val); }; tx.onerror = tx.onabort = function () { res(null); };
    } catch (e) { res(null); }
  });
}
function satItem(id) { if (!sat.items[id]) sat.items[id] = { done: false, note: '', photos: [] }; return sat.items[id]; }
function satCounts() {
  var total = 0, done = 0, cats = [];
  SAT_CATS.forEach(function (c, ci) {
    var t = c.items.length, d = 0;
    c.items.forEach(function (it, ii) { if (sat.items['c' + ci + 'i' + ii] && sat.items['c' + ci + 'i' + ii].done) d++; });
    total += t; done += d; cats.push({ t: t, d: d });
  });
  return { total: total, done: done, cats: cats, pct: total ? Math.round(done / total * 100) : 0 };
}
function ringHTML(pct) {
  return '<svg viewBox="0 0 36 36" aria-hidden="true"><circle class="bg" cx="18" cy="18" r="15.9155"></circle><circle class="fg" cx="18" cy="18" r="15.9155" stroke-dasharray="' + pct + ' 100"></circle></svg><b>' + pct + '%</b>';
}
function satStatusText(msg) {
  var cts = satCounts();
  setText('#satStatus', cts.done + ' of ' + cts.total + ' items complete. ' + (msg || ''));
}
function satUpdateProgress(msg) {
  var cts = satCounts();
  setHTML('#satOverall', ringHTML(cts.pct));
  cts.cats.forEach(function (c, ci) { var r = $('#satRing' + ci); if (r) r.innerHTML = ringHTML(c.t ? Math.round(c.d / c.t * 100) : 0); var cc = $('#satCount' + ci); if (cc) cc.textContent = c.d + ' / ' + c.t; });
  SAT_CATS.forEach(function (c, ci) { c.items.forEach(function (it, ii) { var el = $('#sat-item-c' + ci + 'i' + ii); var s = sat.items['c' + ci + 'i' + ii]; if (el) el.classList.toggle('done', !!(s && s.done)); }); });
  satStatusText(msg);
}
function satSave() {
  sat.updated = Date.now();
  try { localStorage.setItem('og-scada-sat-v1', JSON.stringify(sat)); } catch (e) { /* quota or blocked */ }
  idbOp('state', 'readwrite', function (os) { return os.put(JSON.parse(JSON.stringify(sat)), 'sat'); }).then(function () { satStatusText('Saved offline ' + stamp()); });
}
function satSaveSoon() { clearTimeout(satSaveTimer); satSaveTimer = setTimeout(satSave, 250); satUpdateProgress('Saving...'); }
function satLoadThumb(photo, host) {
  if (photoURLs[photo.id]) { addThumb(photoURLs[photo.id], photo, host); return; }
  idbOp('photos', 'readonly', function (os) { return os.get(photo.id); }).then(function (rec) {
    if (!rec || !rec.blob) return;
    photoURLs[photo.id] = URL.createObjectURL(rec.blob); addThumb(photoURLs[photo.id], photo, host);
  });
}
function addThumb(url, photo, host) {
  var img = document.createElement('img'); img.src = url; img.alt = 'Attached photo ' + photo.name; img.title = 'Tap to remove: ' + photo.name; img.setAttribute('data-photo', photo.id);
  host.appendChild(img);
}
function satRender() {
  var h = '';
  SAT_CATS.forEach(function (c, ci) {
    h += '<div class="card sat-cat"><div class="sat-cat-head"><div class="pring" id="satRing' + ci + '"></div><div><h3 style="margin:0">' + esc(c.name) + '</h3><span class="small muted" id="satCount' + ci + '"></span></div></div>';
    c.items.forEach(function (it, ii) {
      var id = 'c' + ci + 'i' + ii, s = satItem(id);
      h += '<div class="sat-item' + (s.done ? ' done' : '') + '" id="sat-item-' + id + '"><div class="sat-row"><input type="checkbox" id="chk-' + id + '" data-id="' + id + '"' + (s.done ? ' checked' : '') + '>' +
        '<label for="chk-' + id + '">' + esc(it[0]) + '<small>' + esc(it[1]) + '</small></label></div>' +
        '<div class="sat-tools"><input type="text" data-note="' + id + '" placeholder="Note / measured value" value="' + esc(s.note) + '" maxlength="300" aria-label="Note for ' + esc(it[0]) + '">' +
        '<input type="file" accept="image/*" capture="environment" data-photo-in="' + id + '" aria-label="Attach photo"></div><div class="thumbs" id="thumbs-' + id + '"></div></div>';
    });
    h += '</div>';
  });
  setHTML('#satList', h);
  var site = $('#satSite'), tech = $('#satTech'); if (site) site.value = sat.site || ''; if (tech) tech.value = sat.tech || '';
  Object.keys(sat.items).forEach(function (id) { var host = $('#thumbs-' + id); if (host) (sat.items[id].photos || []).forEach(function (p) { satLoadThumb(p, host); }); });
  satUpdateProgress('Loaded from device storage.');
}
function satReport() {
  var cts = satCounts();
  return { app: 'Oil & Gas Pipeline Monitoring SCADA Field Guide', version: APP_VERSION, generated: new Date().toISOString(), site: sat.site || '', engineer: sat.tech || '',
    progress: { done: cts.done, total: cts.total, percent: cts.pct },
    categories: SAT_CATS.map(function (c, ci) { return { name: c.name, items: c.items.map(function (it, ii) { var s = satItem('c' + ci + 'i' + ii); return { id: 'c' + ci + 'i' + ii, text: it[0], done: !!s.done, note: s.note || '', photos: (s.photos || []).map(function (p) { return p.name; }) }; }) }; }) };
}
function satFileBase() { return 'sat-report-' + ((sat.site || 'site').replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '') || 'site') + '-' + new Date().toISOString().slice(0, 10); }
function satExportJson() { var r = satReport(); download(satFileBase() + '.json', JSON.stringify(r, null, 2), 'application/json'); toast('JSON report exported (photo file names included, images stay on device)'); fx.ok(); }
function satExportMd() {
  var r = satReport();
  var md = '# SAT / Commissioning Report\n\n- Site: ' + (r.site || 'n/a') + '\n- Engineer: ' + (r.engineer || 'n/a') + '\n- Generated: ' + new Date().toLocaleString('en-GB') + '\n- Progress: ' + r.progress.done + '/' + r.progress.total + ' (' + r.progress.percent + '%)\n';
  r.categories.forEach(function (c) {
    var d = c.items.filter(function (i) { return i.done; }).length;
    md += '\n## ' + c.name + ' (' + d + '/' + c.items.length + ')\n';
    c.items.forEach(function (i) { md += '- [' + (i.done ? 'x' : ' ') + '] ' + i.text + (i.note ? '\n  - Note: ' + i.note : '') + (i.photos.length ? '\n  - Photos: ' + i.photos.join(', ') : '') + '\n'; });
  });
  download(satFileBase() + '.md', md, 'text/markdown'); toast('Markdown report exported'); fx.ok();
}
function satReset() {
  if (!window.confirm('Reset the whole checklist, notes and photos on this device?')) return;
  Object.keys(photoURLs).forEach(function (k) { try { URL.revokeObjectURL(photoURLs[k]); } catch (e) { /* ignore */ } }); photoURLs = {};
  sat = { site: sat.site, tech: sat.tech, updated: 0, items: {} };
  idbOp('photos', 'readwrite', function (os) { return os.clear(); });
  satSave(); satRender(); toast('Checklist reset');
}
function initSat() {
  var list = $('#satList'); if (!list) return;
  list.addEventListener('change', function (e) {
    var t = e.target; if (!t) return;
    var id = t.getAttribute && t.getAttribute('data-id');
    if (id) { satItem(id).done = !!t.checked; if (t.checked) fx.ok(); satSaveSoon(); return; }
    var pin = t.getAttribute && t.getAttribute('data-photo-in');
    if (pin && t.files && t.files.length) {
      var files = Array.prototype.slice.call(t.files), host = $('#thumbs-' + pin);
      files.forEach(function (file) {
        var p = { id: uid(), name: (file.name || 'photo').slice(0, 60) };
        idbOp('photos', 'readwrite', function (os) { return os.put({ id: p.id, itemId: pin, name: p.name, type: file.type, blob: file, ts: Date.now() }); }).then(function () {
          satItem(pin).photos.push(p); if (host) { photoURLs[p.id] = URL.createObjectURL(file); addThumb(photoURLs[p.id], p, host); } satSaveSoon();
        });
      });
      t.value = ''; fx.tap();
    }
  });
  list.addEventListener('input', function (e) { var t = e.target; var id = t && t.getAttribute && t.getAttribute('data-note'); if (id) { satItem(id).note = t.value.slice(0, 300); satSaveSoon(); } });
  list.addEventListener('click', function (e) {
    var img = e.target && e.target.getAttribute && e.target.getAttribute('data-photo') ? e.target : null; if (!img) return;
    if (!window.confirm('Remove this photo?')) return;
    var pid = img.getAttribute('data-photo');
    Object.keys(sat.items).forEach(function (k) { sat.items[k].photos = (sat.items[k].photos || []).filter(function (p) { return p.id !== pid; }); });
    idbOp('photos', 'readwrite', function (os) { return os['delete'](pid); }); if (img.parentNode) img.parentNode.removeChild(img); satSaveSoon();
  });
  on('#satSite', 'input', function () { var el = $('#satSite'); sat.site = el ? el.value.slice(0, 80) : ''; satSaveSoon(); });
  on('#satTech', 'input', function () { var el = $('#satTech'); sat.tech = el ? el.value.slice(0, 80) : ''; satSaveSoon(); });
  on('#satJson', 'click', satExportJson); on('#satMd', 'click', satExportMd); on('#satReset', 'click', satReset);
  // load: newest of localStorage and IndexedDB wins
  var ls = null; try { ls = JSON.parse(localStorage.getItem('og-scada-sat-v1') || 'null'); } catch (e) { ls = null; }
  idbOpen().then(function (db) {
    idb = db;
    return idbOp('state', 'readonly', function (os) { return os.get('sat'); });
  }).then(function (dbState) {
    var best = ls && ls.items ? ls : null;
    if (dbState && dbState.items && (!best || (dbState.updated || 0) > (best.updated || 0))) best = dbState;
    if (best) sat = { site: best.site || '', tech: best.tech || '', updated: best.updated || 0, items: best.items || {} };
    satRender();
  });
}

/* =====================================================================
   17. SCREEN WAKE LOCK
   ===================================================================== */
var wake = { sentinel: null, want: false };
function wakeStatus(t) { setText('#wakeStatus', t); }
function requestWake() {
  if (!('wakeLock' in navigator)) { wakeStatus('Wake Lock not supported on this browser'); var c = $('#wakeToggle'); if (c) c.checked = false; wake.want = false; return Promise.resolve(); }
  return navigator.wakeLock.request('screen').then(function (s) {
    wake.sentinel = s; wakeStatus('Wake Lock active: screen stays on');
    s.addEventListener('release', function () { wake.sentinel = null; if (!wake.want) wakeStatus('Wake Lock off'); });
  }).catch(function () { wakeStatus('Wake Lock denied (battery saver or low power?)'); var c = $('#wakeToggle'); if (c) c.checked = false; wake.want = false; });
}
function setWake(on) {
  wake.want = !!on;
  if (on) { requestWake(); }
  else if (wake.sentinel) { wake.sentinel.release().then(function () { wake.sentinel = null; wakeStatus('Wake Lock off'); }, function () { wakeStatus('Wake Lock off'); }); }
  else wakeStatus('Wake Lock off');
}

/* =====================================================================
   18. INIT (the only init in the project)
   ===================================================================== */
var CLAMP_FIELDS = {
  'ma-ma': [LIM.MA[0], LIM.MA[1], 12], 'hd-sg': [LIM.SG[0], LIM.SG[1], 0.85], 'lk-sg': [LIM.SG[0], LIM.SG[1], 0.85],
  'lk-beta': [LIM.BETA[0], LIM.BETA[1], 0.0008], 'hd-flow': [LIM.FLOW[0], LIM.FLOW[1], 2000], 'lk-flow': [LIM.FLOW[0], LIM.FLOW[1], 2000],
  'hd-len': [LIM.LEN_KM[0], LIM.LEN_KM[1], 120], 'lk-len': [LIM.LEN_KM[0], LIM.LEN_KM[1], 120], 'hd-dia': [LIM.DIA_MM[0], LIM.DIA_MM[1], 500], 'lk-dia': [LIM.DIA_MM[0], LIM.DIA_MM[1], 500],
  'hd-pin': [0, LIM.PRESS_BAR[1], 60], 'hd-dz': [-3000, 3000, 150], 'hd-visc': [0.2, 2000, 12], 'lk-ui': [0.01, 10, 0.25], 'lk-uo': [0.01, 10, 0.25],
  'lk-win': [1, 1440, 30], 'lk-sigma': [1, 4, 3], 'lk-dT': [0, 50, 0.5], 'lk-dP': [0, 100, 0.5], 'lk-k': [50, 3000, 1400]
};
var initDone = false;
function init() {
  if (initDone) return; initDone = true;
  loadPrefs(); seedHistory(); readTheme();

  // header actions
  on('#btnSun', 'click', function () { prefs.sun = !prefs.sun; savePrefs(); applyModes(); toast(prefs.sun ? 'Desert Sunlight Mode on' : 'Sunlight Mode off'); });
  on('#btnBatt', 'click', function () { prefs.batt = !prefs.batt; savePrefs(); applyModes(); toast(prefs.batt ? 'OLED Battery Saver on (5 s refresh, no animation)' : 'Battery Saver off'); });
  on('#btnMute', 'click', function () { prefs.mute = !prefs.mute; savePrefs(); applyModes(); toast(prefs.mute ? 'Sounds muted' : 'Sounds on'); if (!prefs.mute) fx.tap(); });
  on('#btnShare', 'click', shareGuide);
  on('#btnRefresh', 'click', refreshApp);
  on('#btnWidget', 'click', function () { var act = $('.tab[aria-selected="true"]'); selectTab(act && act.getAttribute('data-tab') === 'glance' ? 'arch' : 'glance'); });
  on('#islandPill', 'click', function () { selectTab('glance'); });
  $$('.tab').forEach(function (b) { b.addEventListener('click', function () { selectTab(b.getAttribute('data-tab')); }); });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', markAllDirty);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeSheet(); exitGlanceFull(); } });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { stepTelemetry(); if (wake.want && !wake.sentinel) requestWake(); } });

  // global sensory feedback
  document.addEventListener('click', function (e) { var b = e.target && e.target.closest ? e.target.closest('button') : null; if (b && !b.disabled) fx.tap(); }, true);
  var lastTick = 0;
  document.addEventListener('input', function (e) {
    var t = e.target; if (!t || t.type !== 'range' || t.id === 'nm-slider') return;
    var now = Date.now(); if (now - lastTick > 70) { lastTick = now; fx.tick(); }
  });

  // calculators
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-preset]') : null; if (!b) return;
    loadPreset(b.getAttribute('data-tool'), b.getAttribute('data-preset'));
  });
  Object.keys(CLAMP_FIELDS).forEach(function (id) {
    var tool = id.slice(0, 2);
    on('#' + id, 'input', function () { if (CALC_FN[tool]) CALC_FN[tool](); });
    on('#' + id, 'change', function () {
      var el = $('#' + id), lim = CLAMP_FIELDS[id]; if (!el) return;
      var v = parseFloat(el.value); el.value = isNum(v) ? clamp(v, lim[0], lim[1]) : lim[2];
      if (CALC_FN[tool]) CALC_FN[tool]();
    });
  });
  ['ma-lrv', 'ma-urv', 'ma-unit'].forEach(function (id) { on('#' + id, 'input', calcMa); });
  on('#hd-unit', 'change', calcHd);
  calcMa(); calcHd(); calcLk();

  buildNamurBar(); on('#nm-slider', 'input', updateNamurViz); updateNamurViz();

  // ISA-101 glyphs
  $$('.vg').forEach(function (b) { b.addEventListener('click', function () { cycleGlyph(b); }); });

  // mimic + sheet
  initMimic();
  on('#sheetClose', 'click', closeSheet); on('#sheetBackdrop', 'click', closeSheet);

  // heavier modules
  initRtu(); initElevation(); initRttm(); initCe(); initCodeHub(); initSat();

  // glance view
  on('#glanceFull', 'click', function () { enterGlanceFull(); });
  on('#glanceClose', 'click', exitGlanceFull);
  on('#simAlarm', 'click', simulateAlarm);
  on('#wakeToggle', 'change', function () { var c = $('#wakeToggle'); setWake(!!(c && c.checked)); });
  on('#appVersion', 'click', function () { toast('Version ' + APP_VERSION); });
  setText('#appVersion', 'v' + APP_VERSION);

  // start
  applyModes();
  renderTelemetry();
  var saved = null; try { saved = localStorage.getItem('og-scada-tab'); } catch (e) { saved = null; }
  selectTab(saved && $('.tab[data-tab="' + saved + '"]') ? saved : 'arch', true);
  requestAnimationFrame(frame);
  onScroll();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();



})();
