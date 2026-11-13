#!/usr/bin/env node
// v2.2.0: simulation of the Ramp Controller tabs (period | freq) and of "Lock osc. screen", with the functions of
// index.html ([RAMP CALC] and [RAMP UI] blocks, rampPeriodCycles(), resetZoomWindow()) and a mocked jQuery / plot.
//   1. Physical relation: a cycle model of gen_ramp.v (port of its RTL: cnt / go / floor / ceil / sawtooth jump /
//      trigger_low) gives the period from scan floor to scan floor and the value at each time after it; compared
//      with rampPeriodCycles() / rampFreqOf() and rampValueAt() (test/ramp_mod_period_sim.sh does the same periods on
//      the RTL itself with xsim).
//   2. f -> step (nearest frequency, float32 steps above 2^24, limits), amp / offset <-> limits (round trip, clamps),
//      parsers.
//   3. Mouse wheel on Frequency: +/- 1, 10, 100, 1000 Hz from the nominal f (no drift); where the step can not move
//      that little, one step of the register (never no move).
//   4. Time zoom -> limits (rampZoomToLims()): full view = same ramp, zoom in on a triangle / sawtooth, frequency kept.
//   5. UI flows: tabs (only one visible, fields reloaded from the board), Amp. p-p changes keep the frequency set
//      (no drift), Sawtooth keeps it in the freq tab, Lock osc. screen on (Scan floor + External + Normal, window
//      0 .. T, slow scans 0 .. 0.98 T), time zoom -> limits + window back to one period, ramp change -> window follows,
//      off: trigger and window kept.
//   6. v2.2.0-rc2: Ramp period with units (s / ms / us) in triangle and sawtooth (T = N (step+1) 8 ns), clamp of the step
//      (float32: 2147483520), "-0 mV" in the labels, Single turns Lock osc. screen off.
//   7. v2.2.0-rc3: triangle: the first half after the scan floor is the rise (both directions, cycle model); Lock osc.
//      screen window 0 .. T/2 in triangle, 0 .. T in sawtooth; time zoom over the half -> low/hig with the line of the
//      rise, f of the whole period kept, window = new T/2; no tooltips on Ramp period / Frequency; box of the tabs.
//      (4.x and 5.8-5.12 were changed for the half view of rc3.) 7.12 (rc4): tolerance 1e-4 of rampLockScreenSync().
//   lock_in+pid v2.2.16: this App has no Sawtooth (no lock_ramp_sawtooth input, its gen_ramp.v is triangle only): the
//   sawtooth cases (1, 2.2, 4.6, 5.6, 6.2, 6.3, 7.3) run only if the page has the checkbox (HAS_SAW), else they are skipped.
//
// Usage:  node test/ramp_ui_sim.js [index.html]      (exit code 1 if a check fails)
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--')) || path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const HAS_SAW = /id="lock_ramp_sawtooth"/.test(html);   // lock_in+pid v2.2.16: sawtooth cases only with the checkbox
const js = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

function braceFrom(i) {
  let d = 0;
  for(let k = js.indexOf('{', i); k < js.length; k++) {
    if(js[k] == '{') d++;
    else if(js[k] == '}' && --d == 0) return js.slice(i, k + 1);
  }
  return '';
}
function fnSrc(name) {
  const i = js.indexOf('function ' + name + '(');
  if(i < 0) throw new Error('function not found: ' + name);
  return braceFrom(i);
}
function blockSrc(tag) {
  const a = js.indexOf('// [' + tag + ' BEGIN]'), b = js.indexOf('// [' + tag + ' END]');
  if(a < 0 || b < 0) throw new Error('block not found: ' + tag);
  return js.slice(a, b);
}
function varSrc(name) {
  const m = new RegExp('var ' + name + '\\s*=\\s*').exec(js);
  if(!m) throw new Error('var not found: ' + name);
  const j = m.index + m[0].length;
  if(js[j] == '{') return braceFrom(m.index) + ';';
  return js.slice(m.index, js.indexOf(';', j) + 1);
}

let fails = 0, n = 0;
function skip(name) { console.log('skip ' + name + '  [no Sawtooth in this App]'); }
function check(name, cond, extra) {
  n++;
  console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if(!cond) fails++;
}

// ---- mocked DOM / jQuery ---------------------------------------------------------------------------------
const elems = {};
function E(id) {
  if(!elems[id]) elems[id] = { id, value: '', html: '', prop: {}, shown: true, focus: false, cls: {} };
  return elems[id];
}
function jq(sel) {
  if(sel && typeof sel === 'object') return { closest() { return { length: 0 }; }, blur() {} };
  const s = String(sel);
  if(s.startsWith('#ramp_tabs a[data-ramp-tab="')) {
    const t = s.match(/"([a-z]+)"/)[1];
    return { parent() { return { addClass() { E('tab_' + t).cls.active = true; } }; } };
  }
  if(s === '#ramp_tabs li') return { removeClass() { E('tab_period').cls.active = false; E('tab_freq').cls.active = false; } };
  const id = s.replace(/^#/, '');
  const e = E(id);
  const o = {
    0: e,
    val(v) { if(v === undefined) return e.value; e.value = String(v); return o; },
    html(v) { if(v === undefined) return e.html; e.html = String(v); return o; },
    prop(k, v) { if(v === undefined) return e.prop[k]; e.prop[k] = v; return o; },
    toggle(v) { e.shown = !!v; return o; },
    is(q) { return q === ':focus' ? e.focus : (q === ':checked' ? !!e.prop.checked : false); },
    addClass() { return o; }, removeClass() { return o; }, parent() { return o; }, blur() { e.focus = false; return o; },
    tooltip() { return o; },
  };
  return o;
}
jq.extend = function() {
  let deep = false, a = Array.from(arguments);
  if(typeof a[0] === 'boolean') { deep = a.shift(); }
  const t = a.shift();
  for(const src of a) for(const k in src) {
    if(deep && src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) t[k] = jq.extend(true, t[k] || {}, src[k]);
    else t[k] = src[k];
  }
  return t;
};
jq.isNumeric = v => !isNaN(parseFloat(v)) && isFinite(v);

// ---- context with the functions of the page --------------------------------------------------------------
const posts = [];
const ctx = {
  $: jq, console: { log() {}, warn() {}, info() {} }, Math, Number, String, parseFloat, parseInt, isNaN, isFinite, JSON,
  document: { activeElement: null },
  localStorage: { store: {}, getItem(k) { return this.store[k] || null; }, setItem(k, v) { this.store[k] = String(v); } },
  params: { local: null, original: null },
  plot: null, plot_options: { xaxis: {} },
  runs: 0,
};
vm.createContext(ctx);
let src = varSrc('units') + '\n' + varSrc('scope_dec_list') + '\n' + varSrc('scope_mem_s') + '\n' +
          varSrc('reset_zoom_margin') + '\n' + varSrc('reset_zoom_long_s') + '\n' + varSrc('reset_zoom_rearm_frac') + '\n' +
          varSrc('reset_zoom_rearm_min_s') + '\n';
src += fnSrc('rampPeriodCycles') + '\n' + fnSrc('modPeriodCycles') + '\n' + fnSrc('resetZoomWindow') + '\n' +
       fnSrc('timeUnitFactor') + '\n' + fnSrc('lockSetXWindow') + '\n' + fnSrc('lockScopeSelects') + '\n';
// v2.2.0-rc3: the cycle of Reset Zoom (whole / half period), broken by the changes of the ramp
src += varSrc('reset_zoom_cycle') + '\n' + ['resetZoomHalfOk', 'resetZoomCycleKey', 'resetZoomCycleNext', 'resetZoomCycleSet',
       'resetZoomCycleBreak'].map(fnSrc).join('\n') + '\n';
src += 'var ramp_step, lock_ramp_low_lim, lock_ramp_hig_lim, lock_ramp_B_factor, lock_ramp_sawtooth, period, oom, val, txt;\n';
src += fnSrc('toFixedNz') + '\n' + fnSrc('lock_ramp_step_update') + '\n';
src += 'function parseLocalFloat(v) { return parseFloat(String(v).replace(",", ".")); }\n';
src += 'var autorun = 1, lock_cap_on = false;\nfunction lockCaptureActive() { return lock_cap_on; }\n' +
       'function lockCaptureLeave() { return false; }\nfunction plotWheelCursor() {}\nfunction trigFromGraphMsg() {}\n' +
       'function updateRanges() {}\nfunction updateTriggerSlider() {}\nvar cleared = 0;\nfunction plotClearStale() { cleared++; }\n' +
       'function runStop() { runs++; }\nfunction sendParams() { posts.push(JSON.parse(JSON.stringify(params.local))); }\n';
// v2.2.16 (as lock_in+pid_harmonic 2.3.31): ramp_tab_key = 'lockin_ramp_tab_' + app_id (pid_plus 2.2.0 used a literal key)
src += (/var app_id\s*=/.test(js) ? varSrc('app_id') : "var app_id = 'app';") + '\n';
src += blockSrc('RAMP CALC') + '\n' + blockSrc('RAMP UI') + '\n';
src += 'var single_seq = 0;\n' + fnSrc('singleUpdate') + '\n';   // v2.2.0-rc2: Single ends Lock osc. screen
src += 'this.__get = function(e) { return eval(e); };';
ctx.posts = posts;
vm.runInContext(src, ctx);
const G = e => ctx.__get(e);
const F = name => G(name);

// ---- 1. cycle model of gen_ramp.v -----------------------------------------------------------------------
// One simulation from ramp_reset (signal 0) with constant step / limits; returns the cycles of the trigger_low
// pulses and the signal at each cycle (from the first floor on).
function genRamp(step, low, hig, saw, dir, cycles) {
  let cnt = 0, sig = 0, slope = dir ? 0 : 1, dlast = dir, dnow = dir;   // after ramp_reset: slope = ~direction
  slope = (~dir) & 1;
  let tl_now = 0, tl_last = 0;
  const trig = [], vals = [];
  for(let c = 0; c < cycles; c++) {
    const go = (cnt === step || step === 0);
    const floor = sig <= low, ceil = sig >= hig;
    const trig_low = (sig === low && go && !tl_last) ? 1 : 0;
    if(trig_low) trig.push(c);
    vals.push(sig);
    let next = sig, slope_next = slope;
    if(go) {
      if(!saw) next = floor ? sig + 1 : ceil ? sig - 1 : slope ? sig + 1 : sig - 1;
      else     next = floor ? (!dir ? hig : sig + 1) : ceil ? (dir ? low : sig - 1) : dir ? sig + 1 : sig - 1;
      const slope_changed = dnow ^ dlast;
      slope_next = floor ? 1 : ceil ? 0 : slope_changed ? (slope ^ 1) : slope;
    }
    tl_last = tl_now; tl_now = trig_low;
    if(go) { sig = next; slope = slope_next; dlast = dnow; dnow = dir; }
    cnt = (step === cnt) ? 0 : cnt + 1;
  }
  return { trig, vals };
}
{
  const cases = [[0, -5, 5, 0, 0], [3, -10, 7, 0, 1], [0, 2, 9, 1, 1], [2, -4, 6, 1, 1], [1, -6, 3, 1, 0], [4, 0, 1, 0, 0], [0, -3, 3, 1, 0]];
  for(const [step, low, hig, saw, dir] of cases) {
    if(saw && !HAS_SAW) { skip(`1 gen_ramp step ${step} lim ${low}..${hig} sawtooth dir ${dir}`); continue; }
    const p = { lock_ramp_step: step, lock_ramp_low_lim: low, lock_ramp_hig_lim: hig, lock_ramp_sawtooth: saw, lock_ramp_direction: dir };
    const r = genRamp(step, low, hig, saw, dir, 4000);
    const per = r.trig.slice(2).map((t, i) => t - r.trig[i + 1]);
    const cyc = F('rampPeriodCycles')(p);
    const f = F('rampFreqOfP')(p);
    // value model: within 1 count (the steps of gen_ramp) at every cycle of one period after a floor (the jump of a
    // falling sawtooth at t = 0 is the one exception, its first step)
    const t0 = r.trig[2];
    let maxerr = 0;
    for(let c = 0; c < cyc; c++) {
      // the jump of a sawtooth: trigger_low comes with the 'go' at the end of the step at low, so the jump is in the
      // first step after the floor (falling) or in the last one of the period (rising, the step at low before the floor)
      if(saw && (c < step + 1 || c >= cyc - (step + 1))) continue;
      const v = G('rampValueAt')(p, c * 8e-9);
      maxerr = Math.max(maxerr, Math.abs(v - r.vals[t0 + c]));
    }
    check(`1 gen_ramp step ${step} lim ${low}..${hig} ${saw ? 'sawtooth dir ' + dir : 'triangle'}: period ${per[0]} cycles = rampPeriodCycles, f = 125 MHz/period, value model within 1 count`,
          per.length > 2 && per.every(x => x === cyc) && Math.abs(f - 125e6 / cyc) < 1e-9 * f && maxerr <= 1.0000001,
          `periods ${per.slice(0, 3)}, model ${cyc}, max err ${maxerr.toFixed(3)}`);
  }
}

// ---- 2. f <-> step, amp / offset ------------------------------------------------------------------------
{
  const stepFor = F('rampStepForFreq'), fOf = F('rampFreqOf');
  // triangle 10000 counts: N = 20000, f = 6250 / (step+1)
  const s = stepFor(100, 10000, 0);
  check('2.1 100 Hz, triangle 10000: step 62 (f 99.206, 0.794 Hz away) is nearer than 61 (100.806, 0.806 Hz away)', s === 62, s);
  // nearest in frequency among all steps (brute force)
  let ok = true, worst = '';
  for(const f of [0.37, 1, 3.3, 47.1, 1000, 12345.6, 62500]) for(const [amp, saw] of (HAS_SAW ? [[1, 0], [7, 1], [10000, 0], [16383, 1]] : [[1, 0], [7, 0], [10000, 0], [16383, 0]])) {
    const st = stepFor(f, amp, saw), x = 125e6 / ((saw ? amp + 1 : 2 * amp) * f) - 1;
    if(x > 1e7) continue;
    let best = 0;
    for(let k = Math.max(0, Math.floor(x) - 3); k <= Math.ceil(x) + 3; k++)
      if(Math.abs(fOf(k, amp, saw) - f) < Math.abs(fOf(best, amp, saw) - f)) best = k;
    if(st !== best) { ok = false; worst = `${f} Hz amp ${amp}: ${st} vs ${best}`; }
  }
  check('2.2 rampStepForFreq() = nearest frequency (brute force, steps < 1e7)', ok, worst);
  const big = stepFor(0.001, 1, 0);           // x = 6.25e10 - 1 -> clamp
  const mid = stepFor(125e6 / (2 * 3e7 + 2), 1, 0);   // x near 3e7 (> 2^24): float32 integers 2 apart
  check('2.3 steps above 2^24 are float32 integers; slow end clamped to 2^31-128', big === 2147483520 && Math.fround(mid) === mid && mid % 2 === 0, `${big}, ${mid}`);
  check('2.4 f above 125 MHz/N -> step 0; f not valid -> NaN', stepFor(1e9, 1, 0) === 0 && isNaN(stepFor(0, 100, 0)) && isNaN(stepFor(10, 0, 0)));
  // amp / offset round trip
  let rt = true;
  for(let low = -8192; low <= 8191; low += 997) for(let hig = low + 1; hig <= 8191; hig += 1301) {
    const ao = G('rampAmpOffOf')(low, hig), l = G('rampLimsOf')(ao.amp, ao.off);
    if(l.low !== low || l.hig !== hig) rt = false;
  }
  check('2.5 limits -> amp / offset -> limits: the same (odd and even amp)', rt);
  const c1 = G('rampClampAmpOff')(16383, 5000, 'amp'), c2 = G('rampClampAmpOff')(3000, 8000, 'off'), c3 = G('rampClampAmpOff')(16383, -1, 'amp');
  const l1 = G('rampLimsOf')(c1.amp, c1.off), l2 = G('rampLimsOf')(c2.amp, c2.off), l3 = G('rampLimsOf')(c3.amp, c3.off);
  check('2.6 clamps: amp limited by the offset, offset limited by the amp, full scale -8192..8191',
        c1.off === 5000 && l1.hig === 8191 && l1.low >= -8192 && c2.amp === 3000 && l2.hig === 8191 && l3.low === -8192 && l3.hig === 8191,
        JSON.stringify([l1, l2, l3]));
  const pc = F('parseRampCounts'), pf = F('parseRampFreq');
  check('2.7 parsers: 500 mV = 4096, 0.5 V = 4096, "-200" = -200, "abc" NaN; 2.5 kHz, 500 mHz, 1e3, 0 / -1 not valid',
        pc('500 mV') === 4096 && pc('0.5 V') === 4096 && pc('-200') === -200 && isNaN(pc('abc')) &&
        pf('2.5 kHz') === 2500 && pf('500 mHz') === 0.5 && pf('1e3') === 1000 && isNaN(pf('0')) && isNaN(pf('-1')));
}

// ---- 3. wheel on Frequency ------------------------------------------------------------------------------
{
  const target = F('rampFreqWheelTarget'), stepFor = F('rampStepForFreq'), fOf = F('rampFreqOf');
  // amp 10 (triangle, N = 20): fine resolution at 1 kHz (step ~6249)
  let p = { lock_ramp_step: stepFor(1000, 10, 0), lock_ramp_low_lim: -5, lock_ramp_hig_lim: 5, lock_ramp_sawtooth: 0 };
  let f = 1000, okd = true;
  for(let i = 0; i < 50; i++) {
    const t = target(p, f, true, 1);
    f = t.f_nominal; p.lock_ramp_step = t.step;
  }
  check('3.1 50 wheel steps of +1 Hz from 1000 Hz (amp 10): nominal 1050 Hz exactly, real f within the resolution',
        f === 1050 && Math.abs(fOf(p.lock_ramp_step, 10, 0) - 1050) < 0.1, `${f}, real ${fOf(p.lock_ramp_step, 10, 0)}`);
  const m = [1, 10, 100, 1000].map(k => target(p, 1050, true, k).f_nominal);
  check('3.2 SHIFT / CTRL / both: +10, +100, +1000 Hz', m.join() === '1051,1060,1150,2050', m.join());
  // coarse: amp 10000 triangle, 1 kHz: step 5 (f = 6250/6 = 1041.7); +1 Hz keeps step 5 -> minimum move: step 4 (1250 Hz)
  p = { lock_ramp_step: 5, lock_ramp_low_lim: -5000, lock_ramp_hig_lim: 5000, lock_ramp_sawtooth: 0 };
  const up = target(p, 1041.67, true, 1), dn = target(p, 1041.67, false, 1);
  check('3.3 coarse resolution: +1 Hz -> one step of the register up in f (step 4, 1250 Hz), -1 Hz -> step 6 (892.9 Hz)',
        up.step === 4 && Math.abs(up.f_nominal - 1250) < 1e-6 && dn.step === 6 && Math.abs(dn.f_nominal - 6250 / 7) < 1e-6,
        `${JSON.stringify(up)} ${JSON.stringify(dn)}`);
  // below 1 Hz, going down: never no move (f - 1 Hz < 0 -> one step of the register)
  p = { lock_ramp_step: stepFor(0.5, 10000, 0), lock_ramp_low_lim: -5000, lock_ramp_hig_lim: 5000, lock_ramp_sawtooth: 0 };
  const lo = target(p, 0.5, false, 1);
  check('3.4 0.5 Hz, -1 Hz: one step of the register down in f (step + 1)', lo && lo.step === p.lock_ramp_step + 1 && lo.f_nominal < 0.5, JSON.stringify(lo));
  const top = target({ lock_ramp_step: 0, lock_ramp_low_lim: -5000, lock_ramp_hig_lim: 5000, lock_ramp_sawtooth: 0 }, 6250, true, 1);
  check('3.5 at step 0 (highest f) +1 Hz: no move possible (null)', top === null);
  // float32 region: the next step is the next float32 integer
  const sbig = 40000000;
  const t6 = target({ lock_ramp_step: sbig, lock_ramp_low_lim: -8192, lock_ramp_hig_lim: 8191, lock_ramp_sawtooth: 0 }, fOf(sbig, 16383, 0), false, 1);
  check('3.6 step 4e7 (float32 integers 4 apart, f 95 uHz): -1 Hz -> step 40000004', t6 && t6.step === 40000004, JSON.stringify(t6));
}

// ---- 4. time zoom -> limits ------------------------------------------------------------------------------
{
  const z = F('rampZoomToLims'), cyc = F('rampPeriodCycles'), fOf = F('rampFreqOfP');
  const tri = { lock_ramp_step: 99, lock_ramp_low_lim: -4000, lock_ramp_hig_lim: 4000, lock_ramp_sawtooth: 0, lock_ramp_direction: 0 };
  const T = cyc(tri) * 8e-9, f0 = fOf(tri);
  // v2.2.0-rc3: in triangle the plot shows the rising half 0 .. T/2 (low -> high): linear map v = low + amp t/(T/2)
  const full = z(tri, 0, T / 2, f0);
  check('4.1 triangle, window = the rising half 0 .. T/2: same limits and step', full.low === -4000 && full.hig === 4000 && full.step === 99, JSON.stringify(full));
  const q = z(tri, T / 8, T / 4, f0);   // rising half: -4000 + 16000*t/T -> -2000 .. 0
  const fq = 125e6 / (2 * (q.hig - q.low) * (q.step + 1));
  check('4.2 triangle, zoom 1/8 .. 1/4 T: limits -2000 .. 0, frequency kept (within the step resolution)',
        q.low === -2000 && q.hig === 0 && Math.abs(fq - f0) / f0 < 0.01, `${JSON.stringify(q)} f ${fq.toFixed(2)} vs ${f0.toFixed(2)}`);
  const t2 = z(tri, 0.3 * T, 0.45 * T, f0);   // -4000 + 16000*0.3 = 800 .. 3200
  check('4.3 triangle, zoom 0.3 .. 0.45 T (near the top): 800 .. 3200', t2.low === 800 && t2.hig === 3200, JSON.stringify(t2));
  const t3 = z(tri, -0.05 * T, 0.2 * T, f0);  // pan below the floor: the straight line goes on: -4800 .. -800
  check('4.4 triangle, window from before the scan floor: the line of the rise goes on, -4800 .. -800', t3.low === -4800 && t3.hig === -800, JSON.stringify(t3));
  const t4 = z(tri, -T / 4, 3 * T / 4, f0);
  check('4.5 triangle, zoom out x2 around the half: same center, amplitude x2 (-8000 .. 8000)', t4.low === -8000 && t4.hig === 8000, JSON.stringify(t4));
  if(!HAS_SAW) skip('4.6 sawtooth zoom'); else {
  const saw = { lock_ramp_step: 9, lock_ramp_low_lim: 0, lock_ramp_hig_lim: 1000, lock_ramp_sawtooth: 1, lock_ramp_direction: 1 };
  const Ts = cyc(saw) * 8e-9;
  const s1 = z(saw, 0.25 * Ts, 0.5 * Ts, fOf(saw)), s2 = z({ ...saw, lock_ramp_direction: 0 }, 0.25 * Ts, 0.5 * Ts, fOf(saw));
  check('4.6 sawtooth rising 0..1000, zoom 1/4..1/2: 250 .. 500; falling: 500 .. 750 (+/- 1 count, the step model)', Math.abs(s1.low - 250) <= 1 && Math.abs(s1.hig - 500) <= 1 && Math.abs(s2.low - 500) <= 1 && Math.abs(s2.hig - 750) <= 1,
        JSON.stringify([s1, s2]));
  }
  check('4.7 empty window / no ramp: null', z(tri, 0.5, 0.5, f0) === null && z({ ...tri, lock_ramp_hig_lim: -4000 }, 0, 1, f0) === null);
  check('4.8 rampZoomIsView: whole view (2 %) yes, half no', G('rampZoomIsView')(0.001, 0.999, 0, 1) && !G('rampZoomIsView')(0, 0.5, 0, 1));
}

// ---- 5. UI flows --------------------------------------------------------------------------------------------
{
  // lock_in+pid v2.2.16: without the checkbox the server has no lock_ramp_sawtooth (undefined: triangle)
  const base = { lock_ramp_step: 99, lock_ramp_low_lim: -4000, lock_ramp_hig_lim: 4000, ...(HAS_SAW ? { lock_ramp_sawtooth: 0 } : {}), lock_ramp_direction: 0,
                 lock_ramp_B_factor: 4096, trig_mode: 0, trig_source: 0, lock_trig_sw: 0, time_units: 0, time_range: 0, xmin: 0, xmax: 100,
                 lock_osc_raw_mode: 0 };
  ctx.params.local = JSON.parse(JSON.stringify(base));
  const opts = { xaxes: [{ min: 0, max: 100 }], yaxes: [{}, {}] };
  ctx.plot = { getOptions: () => opts, setupGrid() {}, draw() {} };
  E('lock_ramp_step').value = '99'; E('lock_ramp_low_lim').value = '-4000'; E('lock_ramp_hig_lim').value = '4000';
  E('lock_ramp_B_factor').value = '4096'; E('lock_ramp_sawtooth').value = 'on';
  F('rampTabSet')('freq');
  check('5.1 tab freq: freq pane shown, period pane hidden, fields from the board (f 78.125 Hz, amp 8000, offset 0), tab saved',
        E('ramp_tab_freq').shown && !E('ramp_tab_period').shown && E('ramp_f_freq').value === '78.125' && E('ramp_f_amp').value === '8000' &&
        E('ramp_f_off').value === '0' && ctx.localStorage.store[G('ramp_tab_key')] === 'freq',
        [E('ramp_f_freq').value, E('ramp_f_amp').value, E('ramp_f_off').value].join());
  // set 100 Hz
  posts.length = 0;
  E('ramp_f_freq').value = '100'; F('rampFreqApply')('freq');
  const p = ctx.params.local;
  check('5.2 Frequency 100 Hz: step 77 (100.16 Hz, nearest), one POST, field shows the real f',
        p.lock_ramp_step === 77 && posts.length === 1 && E('ramp_f_freq').value === String(+(125e6 / (16000 * 78)).toPrecision(7)), `${p.lock_ramp_step} ${E('ramp_f_freq').value}`);
  // amplitude changes keep 100 Hz (nominal), no drift
  let okamp = true, lastf = '';
  for(const a of [6000, 4321, 1000, 3, 8000]) {
    E('ramp_f_amp').value = String(a); F('rampFreqApply')('amp');
    const f = 125e6 / (2 * (p.lock_ramp_hig_lim - p.lock_ramp_low_lim) * (p.lock_ramp_step + 1));
    const best = F('rampStepForFreq')(100, a, 0);
    if(p.lock_ramp_hig_lim - p.lock_ramp_low_lim !== a || p.lock_ramp_step !== best) okamp = false;
    lastf = f;
  }
  check('5.3 Amp. p-p 6000, 4321, 1000, 3, 8000: limits follow, step = nearest to the nominal 100 Hz each time (no drift)',
        okamp && p.lock_ramp_step === 77 && G('ramp_f_nominal') === 100, `step ${p.lock_ramp_step}, f ${lastf}`);
  E('ramp_f_off').value = '500 mV'; F('rampFreqApply')('off');
  check('5.4 Offset "500 mV": 4096, limits 96 .. 8096, step unchanged', p.lock_ramp_low_lim === 96 && p.lock_ramp_hig_lim === 8096 && p.lock_ramp_step === 77,
        `${p.lock_ramp_low_lim} ${p.lock_ramp_hig_lim}`);
  posts.length = 0;
  F('rampFreqApply')('off');   // text unchanged (rampFreqShow() wrote it): nothing sent, nominal kept
  check('5.5 Enter on an unchanged field: no POST', posts.length === 0);
  // sawtooth in the freq tab: frequency kept
  if(!HAS_SAW) skip('5.6 Sawtooth checked in the freq tab'); else {
  const fk = F('rampSawtoothKeep')();
  p.lock_ramp_sawtooth = 1; F('rampSawtoothChanged')(fk);
  check('5.6 Sawtooth checked in the freq tab: step recomputed for 100 Hz with N = amp+1 (156)',
        p.lock_ramp_step === F('rampStepForFreq')(100, 8000, 1) && p.lock_ramp_step === 155, p.lock_ramp_step);
  const fk2 = F('rampSawtoothKeep')(); p.lock_ramp_sawtooth = 0; F('rampSawtoothChanged')(fk2);
  }
  // back to period tab: fields from params.local
  F('rampTabSet')('period');
  check('5.7 tab period: period pane shown, its fields = the board (step 77, 96 .. 8096), freq hidden',
        E('ramp_tab_period').shown && !E('ramp_tab_freq').shown && E('lock_ramp_step').value === '77' && E('lock_ramp_low_lim').value === '96' &&
        E('lock_ramp_hig_lim').value === '8096');
  // Lock osc. screen: T = 2*8000*78*8 ns = 9.984 ms -> window 0 .. 9.984 ms (time units us: 0 .. 9984)
  ctx.runs = 0; posts.length = 0;
  F('rampLockScreenOn')();
  check('5.8 Lock osc. screen on: Scan floor (2), External, Normal; triangle: window 0 .. T/2 = 4992 us (rc3); scope restarted, one POST',
        p.lock_trig_sw === 2 && p.trig_source === 2 && p.trig_mode === 1 && Math.abs(p.xmin) < 1e-9 && Math.abs(p.xmax - 4992) < 1e-6 &&
        opts.xaxes[0].max === p.xmax && ctx.runs === 1 && posts.length === 1, `${p.xmin} .. ${p.xmax}`);
  // time zoom to the first half of the view, 0 .. T/4 (values 96 .. 4096)
  const cl0 = G('cleared');
  F('rampLockScreenFromX')(0, 9984 / 4);
  const cl1 = G('cleared');
  const fz = 125e6 / (2 * (p.lock_ramp_hig_lim - p.lock_ramp_low_lim) * (p.lock_ramp_step + 1));
  check('5.9 time zoom 0 .. T/4: limits 96 .. 4096, frequency 100 Hz kept (step 155), window back to the new half period (~5 ms)',
        p.lock_ramp_low_lim === 96 && p.lock_ramp_hig_lim === 4096 && p.lock_ramp_step === 155 && Math.abs(p.xmax - 0.5e6 / fz) < 1e-6 && p.xmin === 0,
        `${p.lock_ramp_low_lim} .. ${p.lock_ramp_hig_lim} step ${p.lock_ramp_step} window ${p.xmax}`);
  check('5.9b same frequency -> same window: the trace is not cleared (the acquisition in progress goes on; enabling cleared it once)',
        cl0 === 1 && cl1 === 1, `${cl0} ${cl1}`);
  const before = JSON.stringify([p.lock_ramp_low_lim, p.lock_ramp_hig_lim, p.lock_ramp_step]);
  F('rampLockScreenFromX')(1, p.xmax - 1);
  check('5.10 box over the whole view (Y only): ramp unchanged', JSON.stringify([p.lock_ramp_low_lim, p.lock_ramp_hig_lim, p.lock_ramp_step]) === before);
  // a ramp change from elsewhere (another client / period tab): the window follows
  p.lock_ramp_step = 1999;   // T = 2*4000*2000*8 ns = 128 ms
  F('rampLockScreenSync')(false);
  check('5.11 ramp changed (step 1999): window 0 .. T/2 = 64 ms', Math.abs(p.xmax - 64000) < 1e-6, p.xmax);
  // slow scan (continuous update): triangle T = 2.56 s -> 0 .. T/2 = 1.28 s (ends T/2 before the next floor: no 0.98)
  p.lock_ramp_step = 39999;  // T = 2.56 s
  F('rampLockScreenSync')(false);
  check('5.12 slow scan (T = 2.56 s): window 0 .. T/2 = 1.28 s', Math.abs(p.xmax - 1280000) < 1e-3, p.xmax);
  p.lock_ramp_step = 79999;  // T = 5.12 s, T/2 = 2.56 s >= 1.5 s (continuous update of the half)
  F('rampLockScreenSync')(false);
  check('5.12b slow scan (T = 5.12 s): window 0 .. T/2 = 2.56 s', Math.abs(p.xmax - 2560000) < 1e-3, p.xmax);
  check('5.13 sync with the same ramp: nothing changes (no loop)', F('rampLockScreenSync')(false) === false);
  // capture active: suspended
  ctx.lock_cap_on = true; vm.runInContext('lock_cap_on = true', ctx);
  p.lock_ramp_step = 99;
  check('5.14 during a Capture Lock: the window is not touched, the time zoom is not taken', F('rampLockScreenSync')(false) === false && !F('rampLockScreenTakesX')());
  vm.runInContext('lock_cap_on = false', ctx);
  // off: trigger and window kept
  const keep = JSON.stringify([p.trig_mode, p.trig_source, p.lock_trig_sw, p.xmin, p.xmax]);
  posts.length = 0;
  F('rampLockScreenSet')(false);
  check('5.15 Lock osc. screen off: trigger and window as they were, no POST, full zoom back (rampLockScreenTakesX false)',
        JSON.stringify([p.trig_mode, p.trig_source, p.lock_trig_sw, p.xmin, p.xmax]) === keep && posts.length === 0 && !F('rampLockScreenTakesX')() &&
        E('ramp_lock_screen').prop.checked === false && E('ramp_lock_screen_text').html === '');
}

// ---- 6. v2.2.0-rc2: Ramp period in s / ms, clamp of the step, "-0 mV", Single ends Lock osc. screen ---------------
{
  const strip = h => String(h).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&tau;/g, 'tau').trim();
  const ps = F('rampParseStep'), cyc = F('rampPeriodCycles'), smax = G('ramp_step_max');
  const fld = F('rampStepParseField');
  ctx.params.local = { lock_ramp_step: 99, lock_ramp_low_lim: -4000, lock_ramp_hig_lim: 4000, lock_ramp_sawtooth: 0, lock_ramp_direction: 0,
                       lock_ramp_B_factor: 4096, trig_mode: 0, trig_source: 0, lock_trig_sw: 0, time_units: 0, time_range: 0, xmin: 0, xmax: 100,
                       lock_osc_raw_mode: 0 };
  const p = ctx.params.local;
  const opts = { xaxes: [{ min: 0, max: 100 }], yaxes: [{}, {}] };
  ctx.plot = { getOptions: () => opts, setupGrid() {}, draw() {} };
  E('lock_ramp_low_lim').value = '-4000'; E('lock_ramp_hig_lim').value = '4000'; E('lock_ramp_B_factor').value = '4096';
  const Tof = (step, saw) => cyc({ lock_ramp_step: step, lock_ramp_low_lim: -4000, lock_ramp_hig_lim: 4000, lock_ramp_sawtooth: saw }) * 8e-9;
  // triangle: N = 2*8000 = 16000; 10 ms -> step+1 = 78.125 -> step 77 (T 9.984 ms); before: (high-low) steps -> step 155 (T 19.97 ms)
  E('lock_ramp_step').value = '10 ms'; F('lock_ramp_step_update')();
  const s1 = fld('10 ms'), l1 = strip(E('lock_ramp_step_text').html);
  check('6.1 triangle, "10 ms": step 77 (T = 16000 x 78 x 8 ns = 9.984 ms, not 20 ms), label tau = 9.98 ms / f = 100.16 Hz',
        s1 === 77 && Math.abs(Tof(s1, 0) - 9.984e-3) < 1e-12 && /tau = 9\.98 ms/.test(l1) && /f = 100\.16\s+Hz/.test(l1), `${s1} | ${l1}`);
  // sawtooth: N = 8001; 10 ms -> step+1 = 156.23 -> step 155 (T 9.986 ms)
  if(!HAS_SAW) skip('6.2 sawtooth, "10 ms"'); else {
  p.lock_ramp_sawtooth = 1;
  F('lock_ramp_step_update')();
  const s2 = fld('10 ms'), l2 = strip(E('lock_ramp_step_text').html);
  check('6.2 sawtooth, "10 ms": step 155 (T = 8001 x 156 x 8 ns = 9.985 ms), label tau = 9.99 ms',
        s2 === 155 && Math.abs(Tof(s2, 1) - 8001 * 156 * 8e-9) < 1e-12 && /tau = 9\.99 ms/.test(l2), `${s2} | ${l2}`);
  p.lock_ramp_sawtooth = 0;
  }
  // round trip: the period of the step is the nearest to the period asked (within half a step), both modes, s / ms / us
  let worst = 0, okrt = true;
  for(const saw of (HAS_SAW ? [0, 1] : [0])) for(const amp of [1, 7, 100, 8000, 16383]) for(const T of [2e-7, 1e-5, 3.3e-4, 0.01, 0.123, 1, 7.5, 30]) {
    const n = (saw ? amp + 1 : 2 * amp), st = F('rampStepForPeriod')(T, amp, saw);
    const Tr = n * (st + 1) * 8e-9, half = n * 8e-9 / 2 * (st >= 16777216 ? Math.pow(2, Math.floor(Math.log2(st)) - 23) : 1);
    const minT = n * 8e-9;
    if(!(Number.isInteger(st) && st >= 0 && st <= smax && Math.fround(st) === st)) okrt = false;
    if(T >= minT && Math.abs(Tr - T) > half * (1 + 1e-9)) okrt = false;
    if(T < minT && st !== 0) okrt = false;
    worst = Math.max(worst, T >= minT ? Math.abs(Tr - T) / half : 0);
  }
  check('6.3 rampStepForPeriod: T(step) within half a step of the T asked (triangle and sawtooth, 5 amplitudes, 200 ns .. 30 s); step 0 below one step',
        okrt, `worst ${worst.toFixed(3)} half steps`);
  check('6.4 units: "0.5 s" = "500 ms" = "500000 us" = "0,5 s"; "7 seg" = "7 s"; "10ms" (no space)',
        ps('0.5 s', 8000, 0) === ps('500 ms', 8000, 0) && ps('500 ms', 8000, 0) === ps('500000 us', 8000, 0) && ps('0,5 s', 8000, 0) === ps('0.5 s', 8000, 0) &&
        ps('7 seg', 8000, 0) === ps('7 s', 8000, 0) && ps('10ms', 8000, 0) === 77);
  check('6.5 steps: "400" -> 400, "400.6" -> 401, "-3" / "abc" / "10 kg" / "" -> NaN (not sent, the field is restored)',
        ps('400', 8000, 0) === 400 && ps('400.6', 8000, 0) === 401 && isNaN(ps('-3', 8000, 0)) && isNaN(ps('abc', 8000, 0)) &&
        isNaN(ps('10 kg', 8000, 0)) && isNaN(ps('', 8000, 0)));
  // clamp (float32 register: largest integer 2^31 - 128 = 2147483520) of steps and of periods
  check('6.6 clamp: "3000000000" and "4294967295" steps -> 2147483520; "1e6 s" (beyond the slowest ramp) -> 2147483520; "16777217" -> 16777216 (float32)',
        smax === 2147483520 && ps('3000000000', 8000, 0) === smax && ps('4294967295', 8000, 0) === smax && ps('1e6 s', 8000, 0) === smax &&
        ps('16777217', 8000, 0) === 16777216, [ps('3000000000', 8000, 0), ps('1e6 s', 8000, 0), ps('16777217', 8000, 0)].join());
  check('6.7 a period below one step ("0.001 us"): step 0; "1 ns" (ns not accepted): NaN', ps('0.001 us', 8000, 0) === 0 && isNaN(ps('1 ns', 8000, 0)));
  E('lock_ramp_low_lim').value = '4000';
  E('lock_ramp_step').value = '10 ms'; F('lock_ramp_step_update')();
  const l3 = strip(E('lock_ramp_step_text').html);
  check('6.8 period with hig lim = low lim: not valid (NaN), label asks for hig > low; steps still valid (ramp OFF)',
        isNaN(fld('10 ms')) && /hig lim/.test(l3) && fld('400') === 400, l3);
  E('lock_ramp_low_lim').value = '-4000';
  const tag = html.match(/<input[^>]*id="lock_ramp_step"[^>]*>/)[0], lab = html.match(/<label for="lock_ramp_step"[\s\S]*?<\/label>/)[0];
  check('6.9 field: text input (an <input type=number> gives "" for "10 ms"), max = 2147483520, in input_unit_parsers (rc3: no tooltip, part 7)',
        /type="text"/.test(tag) && /max="2147483520"/.test(tag) && /lock_ramp_step:\s*function/.test(js) && !/way I should tell you/.test(html),
        tag.slice(0, 120));
  // "-0 mV": -2 counts is -0.24 mV
  E('lock_ramp_low_lim').value = '-2'; E('lock_ramp_hig_lim').value = '2'; E('lock_ramp_step').value = '99';
  F('lock_ramp_step_update')();
  const lo = strip(E('lock_ramp_low_lim_text').html), hi = strip(E('lock_ramp_hig_lim_text').html), rt = strip(E('lock_ramp_text').html);
  E('lock_ramp_low_lim').value = '-3'; F('lock_ramp_step_update')();
  const rt2 = strip(E('lock_ramp_text').html);
  const nz = F('toFixedNz'), mv = F('rampMv');
  check('6.10 "-0 mV": low lim -2 -> "0 mV", high 2 -> "0 mV", 0 mVpp, 0.0 mVdc; -3 .. 2: -0.1 mVdc (a real negative keeps its sign)',
        lo === '0 mV' && hi === '0 mV' && /^0 mVpp/.test(rt) && /0\.0 mVdc/.test(rt) && !/-0\.0/.test(rt) && /-0\.1 mVdc/.test(rt2), `${lo} | ${hi} | ${rt} | ${rt2}`);
  check('6.11 toFixedNz / rampMv (freq tab, Vtrg): -0.24 -> "0", -0.04 (1 digit) -> "0.0", -0.6 -> "-1", rampMv(-2) = "0 mV", rampMv(-1, 1) = "-0.1 mV"',
        nz(-0.24, 0) === '0' && nz(-0.04, 1) === '0.0' && nz(-0.6, 0) === '-1' && nz(0, 0) === '0' && strip(mv(-2)) === '0 mV' && strip(mv(-1, 1)) === '-0.1 mV');
  E('lock_ramp_low_lim').value = '-4000'; E('lock_ramp_hig_lim').value = '4000';
  // Single with Lock osc. screen on: it is turned off (trigger and window kept, full zoom back), the Single is sent
  F('rampLockScreenOn')();
  const on = G('ramp_ls.on') && F('rampLockScreenTakesX')();
  const keep = JSON.stringify([p.trig_mode, p.trig_source, p.lock_trig_sw, p.xmin, p.xmax]);
  vm.runInContext('autorun = 0', ctx);
  posts.length = 0;
  F('singleUpdate')();
  check('6.12 Single with Lock osc. screen on: off (checkbox unchecked, text cleared, full time zoom back), trigger and window kept, Single sent',
        on && !G('ramp_ls.on') && !F('rampLockScreenTakesX')() && E('ramp_lock_screen').prop.checked === false && E('ramp_lock_screen_text').html === '' &&
        JSON.stringify([p.trig_mode, p.trig_source, p.lock_trig_sw, p.xmin, p.xmax]) === keep && posts.length === 1 && G('single_seq') === 1, keep);
  posts.length = 0;
  F('singleUpdate')();
  check('6.13 Single with Lock osc. screen off: only the Single (nothing else changes)', !G('ramp_ls.on') && posts.length === 1 && G('single_seq') === 2);
  vm.runInContext('autorun = 1', ctx);
}

// ---- 7. v2.2.0-rc3: Lock osc. screen shows the rising half in triangle, zoom over the half, no tooltips, tab box --------
{
  // 7.1 gen_ramp.v (cycle model): in triangle the first half period after the scan floor (trigger_low) is always the
  // rise low -> high, with Scan direction 0 or 1 (direction only flips the slope for one moment when it changes)
  for(const dir of [0, 1]) {
    const step = 2, low = -6, hig = 9, cyc = 2 * (hig - low) * (step + 1);
    const r = genRamp(step, low, hig, 0, dir, 6 * cyc);
    const t0 = r.trig[2], half = r.vals.slice(t0, t0 + cyc / 2 + 1), rest = r.vals.slice(t0 + cyc / 2, t0 + cyc + 1);
    const p = { lock_ramp_step: step, lock_ramp_low_lim: low, lock_ramp_hig_lim: hig, lock_ramp_sawtooth: 0, lock_ramp_direction: dir };
    let mono = true, merr = 0;
    for(let i = 1; i < half.length; i++) if(half[i] < half[i - 1]) mono = false;
    for(let c = 0; c <= cyc / 2; c++) merr = Math.max(merr, Math.abs(G('rampValueAt')(p, c * 8e-9) - r.vals[t0 + c]));
    check(`7.1 triangle, Scan direction ${dir}: 0 .. T/2 after the scan floor rises low -> high (${low} -> ${hig}), T/2 .. T falls; rampValueAt within 1 count`,
          mono && half[0] === low && Math.max(...half) === hig && rest[rest.length - 1] === low && Math.min(...rest.slice(0, 3)) >= hig - 1 && merr <= 1.0000001,
          `first ${half.slice(0, 4)}.. max ${Math.max(...half)}, err ${merr.toFixed(3)}`);
  }
  const base = { lock_ramp_step: 99, lock_ramp_low_lim: -4000, lock_ramp_hig_lim: 4000, ...(HAS_SAW ? { lock_ramp_sawtooth: 0 } : {}), lock_ramp_direction: 1,
                 lock_ramp_B_factor: 4096, trig_mode: 0, trig_source: 0, lock_trig_sw: 0, time_units: 0, time_range: 0, xmin: 0, xmax: 100,
                 lock_osc_raw_mode: 0 };
  vm.runInContext('ramp_ls.on = false; ramp_f_nominal = NaN;', ctx);
  ctx.params.local = JSON.parse(JSON.stringify(base));
  const p = ctx.params.local;
  const opts = { xaxes: [{ min: 0, max: 100 }], yaxes: [{}, {}] };
  ctx.plot = { getOptions: () => opts, setupGrid() {}, draw() {} };
  E('lock_ramp_step').value = '99'; E('lock_ramp_low_lim').value = '-4000'; E('lock_ramp_hig_lim').value = '4000';
  const freq = () => 125e6 / ((p.lock_ramp_sawtooth ? (p.lock_ramp_hig_lim - p.lock_ramp_low_lim + 1) : 2 * (p.lock_ramp_hig_lim - p.lock_ramp_low_lim)) * (p.lock_ramp_step + 1));
  // T = 2*8000*100*8 ns = 12.8 ms
  F('rampLockScreenOn')();
  const txt = E('ramp_lock_screen_text').html;
  check('7.2 Lock osc. screen, triangle (direction 1): window 0 .. T/2 = 6.4 ms (rising half), text "rising half"',
        Math.abs(p.xmin) < 1e-9 && Math.abs(p.xmax - 6400) < 1e-6 && opts.xaxes[0].max === p.xmax && /rising half/.test(txt), `${p.xmax} | ${txt}`);
  if(!HAS_SAW) skip('7.3 Sawtooth checked: window 0 .. T'); else {
  const fs = F('rampSawtoothKeep')(); p.lock_ramp_sawtooth = 1; F('rampSawtoothChanged')(fs);
  const f_saw = freq();
  check('7.3 Sawtooth checked: window 0 .. T, one whole period (as rc2), frequency kept (78.125 Hz -> 12.8 ms)',
        Math.abs(p.xmax - 1e6 / f_saw) < 1e-6 && Math.abs(f_saw - 78.125) / 78.125 < 0.01, `${p.xmax} us, f ${f_saw}`);
  const fs2 = F('rampSawtoothKeep')(); p.lock_ramp_sawtooth = 0; F('rampSawtoothChanged')(fs2);
  }
  check('7.4 back to triangle: window 0 .. T/2 again', Math.abs(p.xmax - 0.5e6 / freq()) < 1e-6 && Math.abs(p.xmax - 6400) < 1, p.xmax);
  // 7.5 zoom over the half: v = low + amp t/(T/2); f constant (the step is recomputed, N = 2 (hig - low)); window = new T/2
  const f0 = freq();
  let ok = true, worst = '';
  const wins = [[0.1, 0.4], [0.25, 0.75], [0, 0.5], [0.5, 1], [0.9, 0.95], [0.333, 0.334]];
  for(const [a, b] of wins) {
    p.lock_ramp_low_lim = -4000; p.lock_ramp_hig_lim = 4000; p.lock_ramp_step = 99;
    vm.runInContext('ramp_f_nominal = NaN;', ctx);
    F('rampLockScreenSync')(false, true);
    const H = p.xmax;                       // the view: 0 .. T/2 in us
    F('rampLockScreenFromX')(a * H, b * H);
    const el = Math.round(-4000 + 8000 * a), eh = Math.round(-4000 + 8000 * b), fr = freq();
    const res = 125e6 / (2 * (p.lock_ramp_hig_lim - p.lock_ramp_low_lim)) * (1 / (p.lock_ramp_step + 1) - 1 / (p.lock_ramp_step + 2));
    const good = p.lock_ramp_low_lim === el && p.lock_ramp_hig_lim === eh && Math.abs(fr - f0) <= res / 2 + 1e-9 &&
                 Math.abs(p.xmax - 0.5e6 / fr) < 1e-6 && p.xmin === 0;
    if(!good) { ok = false; worst = `${a}..${b}: ${p.lock_ramp_low_lim}..${p.lock_ramp_hig_lim} (exp ${el}..${eh}) f ${fr} vs ${f0}, window ${p.xmax}`; }
  }
  check('7.5 time zoom a .. b of the half view (6 windows): low/hig = low + amp (a, b)/(T/2), f of the whole period kept (within half a step), window = new T/2', ok, worst);
  // the wheel (SHIFT): zoom in x1.5 around the center of the view
  p.lock_ramp_low_lim = -4000; p.lock_ramp_hig_lim = 4000; p.lock_ramp_step = 99; vm.runInContext('ramp_f_nominal = NaN;', ctx);
  F('rampLockScreenSync')(false, true);
  const H = p.xmax, c = H / 2, hw = H / 2 / 1.5;
  F('rampLockScreenFromX')(c - hw, c + hw);
  check('7.6 SHIFT + wheel in (x1.5 around the center): -2667 .. 2667, f kept', p.lock_ramp_low_lim === -2667 && p.lock_ramp_hig_lim === 2667 &&
        Math.abs(freq() - f0) / f0 < 0.01, `${p.lock_ramp_low_lim} .. ${p.lock_ramp_hig_lim}`);
  F('rampLockScreenSync')(false, true);
  const H2 = p.xmax, c2 = H2 / 2;
  F('rampLockScreenFromX')(c2 - H2 / 2 * 1.5, c2 + H2 / 2 * 1.5);
  check('7.7 SHIFT + wheel out (x1.5): back to -4000 .. 4000 (+/- 1), f kept', Math.abs(p.lock_ramp_low_lim + 4000) <= 1 && Math.abs(p.lock_ramp_hig_lim - 4000) <= 1 &&
        Math.abs(freq() - f0) / f0 < 0.01, `${p.lock_ramp_low_lim} .. ${p.lock_ramp_hig_lim}`);
  // a zoom of Lock osc. screen changes the ramp: the cycle of Reset Zoom starts again
  vm.runInContext("reset_zoom_cycle = { key: 'x', half: false, xmin_s: 0, xmax_s: 1 };", ctx);
  F('rampLockScreenFromX')(0.2 * p.xmax, 0.6 * p.xmax);
  check('7.8 a zoom of Lock osc. screen (new limits) breaks the cycle of Reset Zoom', G('reset_zoom_cycle.key') === '');
  F('rampLockScreenSet')(false);
  check('7.9 unchecked: trigger and window kept (the half), full time zoom back', !F('rampLockScreenTakesX')() && p.lock_trig_sw === 2 &&
        Math.abs(p.xmax - 0.5e6 / freq()) < 1e-6);
  // 7.12 v2.2.0-rc4: tolerance of rampLockScreenSync() 1e-4 (it was 0.5 %): the case of testAgent (axis 0 .. 5.011 ms
  // left for a window of 4.992 ms, 0.38 %) is re-fixed; a float32 rounding of the server (1e-7) is not (no loop)
  {
    F('rampLockScreenOn')();
    p.lock_ramp_low_lim = -4000; p.lock_ramp_hig_lim = 4000; p.lock_ramp_step = 77;      // T/2 = 8000*78*8 ns = 4.992 ms
    F('rampLockScreenSync')(false, true);
    const H = p.xmax;
    opts.xaxes[0].max = 5011; p.xmax = 5011;                                               // left by the old tolerance
    vm.runInContext("ramp_ls.key = ''", ctx);                                              // the ramp changed (to these values)
    const r1 = F('rampLockScreenSync')(false);
    check('7.12a window 4.992 ms with the axis at 5.011 ms (0.38 %): re-fixed to 0 .. 4.992 ms', r1 === true && Math.abs(p.xmax - 4992) < 1e-6 &&
          Math.abs(H - 4992) < 1e-6, `${r1} ${p.xmax}`);
    opts.xaxes[0].max = Math.fround(4.992) * 1000; p.xmax = opts.xaxes[0].max;              // float32 of the server, ~1e-7
    vm.runInContext("ramp_ls.key = ''", ctx);
    const r2 = F('rampLockScreenSync')(false);
    check('7.12b same window, axis off by a float32 rounding (' + ((opts.xaxes[0].max - 4992) / 4992).toExponential(1) + '): not re-fixed (no loop)', r2 === false, r2);
    check('7.12c tolerance 1e-4', G('ramp_ls_tol') === 1e-4);
    F('rampLockScreenSet')(false);
  }
  // 7.10 no tooltips on Ramp period / Frequency (label and input): no title, no data-toggle / data-original-title / ...
  const tags = [html.match(/<label for="lock_ramp_step"[^>]*>/)[0], html.match(/<input[^>]*id="lock_ramp_step"[^>]*>/)[0],
                html.match(/<label for="ramp_f_freq"[^>]*>/)[0], html.match(/<input[^>]*id="ramp_f_freq"[^>]*>/)[0]];
  const bad = tags.filter(t => /\btitle=|data-toggle|data-original-title|data-placement|data-content|data-tooltip/.test(t));
  const jsAdds = /#(lock_ramp_step|ramp_f_freq)['"][^;]*\.(tooltip|popover)\(|(lock_ramp_step|ramp_f_freq)['"]\)\.attr\(['"](title|data-)/.test(js) ||
                 /label\[for="(lock_ramp_step|ramp_f_freq)"\]['"]\)\.(tooltip|attr\(['"]title)/.test(js);
  check('7.10 Ramp period and Frequency: label and input without title / bootstrap tooltip attributes, none added by the JS (help on click kept)',
        bad.length === 0 && !jsAdds && /\$\('label\[for="lock_ramp_step"\]'\)\.on\('click'/.test(js), bad.join(' | '));
  // 7.11 the box of the tabs: same line as .nav-tabs (1px #dddddd), sides and bottom, below the tabs; column widths kept
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1];
  const pane = (css.match(/\.ramp-tab-pane \{([^}]*)\}/) || ['', ''])[1];
  check('7.11 tab panes boxed: border 1px solid #dddddd, no top border (the line of the tabs), clear: both; tabs margin 0; head and inner columns padded so the inputs keep their width',
        /border: 1px solid #dddddd/.test(pane) && /border-top: 0/.test(pane) && /clear: both/.test(pane) &&
        /\.nav-tabs\.ramp-tabs \{ margin-bottom: 0; \}/.test(css) && /\.ramp-tabs-head \{ padding-left: 0; padding-right: 0; \}/.test(css) &&
        /\.ramp-tab-pane > \.panel-group \{ padding-left: 14px; padding-right: 14px; \}/.test(css) &&
        /class="[^"]*ramp-tabs-head"[^>]*>\s*<ul class="nav nav-tabs ramp-tabs" id="ramp_tabs">/.test(html) &&
        (html.match(/class="ramp-tab-pane clearfix"/g) || []).length === 2, pane);
}

console.log(`\n${n - fails}/${n} checks passed` + (fails ? `, ${fails} FAILED` : ''));
process.exit(fails ? 1 : 0);
