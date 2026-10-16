#!/usr/bin/env node
// lock_in+pid v2.2.9: test/reset_zoom_sim.js of lock_in+pid_harmonic v2.3.23 (the versions below are those of that App),
// adapted to this App: the ramp is always a triangle (gen_ramp.v has no sawtooth: those cases use triangles), one Y
// axis only, and the "Square mod." Ext Trig (16) takes one period of the square modulation (sqPeriodCycles():
// 2*(lock_gen_mod_sqp+1) cycles, the harmonic period with sqp = 0; gen_mod2.v, measured by test/ramp_mod_period_sim.sh).
// v2.3.21: simulation of the "Reset zoom" button of the scope.
//   - Ext Trig (lock_trig_sw) = Scan floor / Scan ceil: X window = one period of the ramp (as gen_ramp.v:
//     sawtooth (high-low+1)*(step+1), triangle 2*(high-low)*(step+1) cycles of 8 ns; test/ramp_mod_period_sim.sh
//     measures them on the RTL);
//   - Ext Trig = harmonic mod.: one period of the modulation, 2520*(hp+1) cycles (gen_mod_h.v);
//   - otherwise: one whole memory of the scope at the current Dec (16384 * 8 ns * Dec);
//   - Y: -1 .. 1 V, raw mode -8192 .. 8192.
//   - (build 48) during a lock capture, Reset zoom first ends it as AUTO does (scope settings saved before the
//     capture restored, Ext Trig included; console "Capture Lock: ended by Reset zoom"; runStop()), then applies the
//     rule with the restored Ext Trig;
//   - (build 48) Raw Mode button: Y to -8192..8192 / -1..1 V (rawModeRescaleY()).
//   - v2.3.23: slow scans (ramp / modulation period >= 1.5 s): window 0 .. 0.98 T (at least 50 ms before the next
//     trigger: the acquisition ends and the scope is armed again before the next scan floor, every scan is acquired);
//     the trace on the plot is cleared and the data of GET /data started before the answer are dropped (plot_epoch).
// Real functions of index.html: resetZoom(), resetZoomWindow() / modPeriodCycles() (the [RESET ZOOM] block),
// rampPeriodCycles(), lockSetXWindow(), timeUnitFactor(), resetZoomY(), rawModeRescaleY(), and of the capture
// lockCaptureActive(), lockCaptureEnd(), lockCaptureLeave(), lockScopeSelects().
// Mocked: jQuery, the plot (only its options), updateRanges(), updateTriggerSlider(), and sendParams(): POST of
// params.local to a model of the time range code of src/main.c (rp_set_params() -> transform_acq_params(): xmin/xmax
// kept as float32, smallest Dec whose memory covers the window, units from the Dec, forceX answer when the units
// change, and the old "reset zoom" request xmin/xmax = -1e6/1e6 -> 0..130 us at Dec 1), then the forceX of the answer
// into the plot as the page does.
//
// Usage:  node test/reset_zoom_sim.js [index.html] [--old]   (exit code 1 if a check fails)
//         --old: an index.html of an older version (2.3.20: no [RESET ZOOM] block); the checks are the same (they
//         must fail where the old behaviour differs).
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');

const args = process.argv.slice(2);
const OLD = args.includes('--old');
const file = args.find(a => !a.startsWith('--')) || path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const js = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

function braceFrom(i) {
  let d = 0;
  for(let k = js.indexOf('{', i); k < js.length; k++) {
    if(js[k] == '{') d++;
    else if(js[k] == '}' && --d == 0) return js.slice(i, k + 1);
  }
  return '';
}
function fnSrc(name, required) {
  const i = js.indexOf('function ' + name + '(');
  if(i < 0 && required) throw new Error('function not found: ' + name);
  return i < 0 ? '' : braceFrom(i);
}
function blockSrc(tag) {
  const a = js.indexOf('// [' + tag + ' BEGIN]'), b = js.indexOf('// [' + tag + ' END]');
  return (a < 0 || b < 0) ? '' : js.slice(a, b);
}

// ---- model of the server (src/main.c transform_acq_params(), src/fpga.c) -------------------------------------------
const DEC = [1, 8, 64, 128, 256, 512, 1024, 8192, 65536, 524288];
const MEM = 16384 * 8e-9;
function rangeToUnit(r) { return r <= 1 ? 0 : (r <= 6 ? 1 : 2); }
function unitF(tu) { return Math.pow(10, 3 * (2 - tu)); }
function srvPost(srv, p) {
  const out = Object.assign({}, srv);
  const xmin_g = Math.fround(Number(p.xmin)), xmax_g = Math.fround(Number(p.xmax));   // float params
  out.trig_mode = p.trig_mode;
  if(xmin_g == -1e6 && xmax_g == 1e6) {           // old Reset Zoom request: forced 0..130 us, Dec 1
    Object.assign(out, { xmin: 0, xmax: 130, time_units: 0, time_range: 0, forcex_flag: 1 });
    return out;
  }
  const f = unitF(srv.time_units);
  const xmin = xmin_g / f, xmax = xmax_g / f;
  const rdec = (out.trig_mode == 0 ? xmax : (Math.max(xmax, 0) - xmin)) * 125e6 / 16384;
  let i = 0; while(i <= 9 && DEC[i] < rdec) i++;
  if(i > 9) i = 9;
  const tu = rangeToUnit(i), nf = unitF(tu);
  Object.assign(out, { time_range: i, time_units: tu, xmin: xmin * nf, xmax: xmax * nf,
                       forcex_flag: (tu != srv.time_units) ? 1 : 0 });
  return out;
}

// ---- sandbox -------------------------------------------------------------------------------------------------------
function jq() {   // $('#btn_ch1, #btn_ch2').data(..).removeClass(..).addClass(..)
  const o = { data() { return o; }, removeClass() { return o; }, addClass() { return o; }, prop() { return o; },
              html() { return o; }, val() { return o; } };
  return o;
}
function deepExtend(deep, a, b) {
  for(const k in b) {
    if(b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) { a[k] = a[k] || {}; deepExtend(true, a[k], b[k]); }
    else a[k] = b[k];
  }
  return a;
}
function makeSandbox(srv, local) {
  const sb = {
    logs: [],
    lock_cap: { state: 'off', saved: null, offset_s: null, t_armed: 0, late: false, seq: 0 },
    autorun: 1, runStops: 0,
    Math, Number, JSON, isFinite, Object, Array, String,
    xmin: -1000000, xmax: 1000000,                  // globals of the page (the old resetZoom() sends them)
    plot_options: { xaxis: { min: -1000000, max: 1000000 } },
    units: { '-3': 'n', '-2': 'μ', '-1': 'm', '0': '', '1': 'k', '2': 'M' },
    posts: [], srv: srv,
    // v2.3.23: plotted data and epoch (plotClearStale())
    datasets: [ { data: [[0, 0.1], [1, 0.2]] }, { data: [[0, 0.3], [1, 0.4]] } ], plot_epoch: 0, plot_epoch_post: false,
    filterData: d => d, setDataCalls: 0,
  };
  sb.params = { local: Object.assign({}, local), original: Object.assign({}, srv) };
  // plot: x window of the current units (the user zoomed somewhere), Y of an autoscale
  sb.plotOpts = { xaxes: [ { min: srv.xmin + 1, max: srv.xmax / 2 } ], yaxes: [ { min: -0.3, max: 0.2 } ] };   // v2.2.9: one Y axis
  sb.plot = { getOptions: () => sb.plotOpts, setupGrid() {}, draw() {}, setData() { sb.setDataCalls++; }, width: () => 500,
              getAxes: () => ({ xaxis: sb.plotOpts.xaxes[0], yaxis: sb.plotOpts.yaxes[0] }) };
  sb.$ = function() { return jq(); };
  sb.$.extend = function(a, b, c) { return (a === true) ? deepExtend(true, b, c) : Object.assign(a, b, c); };
  sb.format_oom = (v, u) => String(v) + u;
  sb.console = { log(m) { sb.logs.push(String(m)); }, info() {}, warn() {} };
  sb.lockCaptureBanner = () => {};
  sb.trigFromGraphMsg = () => {};
  sb.runStop = () => { sb.runStops++; };
  sb.updateRanges = () => {};
  sb.updateTriggerSlider = () => {};
  // sendParams(): POST of params.local (xmin/xmax always sent), answer, forceX into the plot, params from the answer
  sb.sendParams = function() {
    const sent = Object.assign({}, sb.params.local);
    sb.posts.push(sent);
    const ans = srvPost(sb.srv, sent);
    sb.srv = ans;
    if(ans.forcex_flag == 1) { sb.plotOpts.xaxes[0].min = ans.xmin; sb.plotOpts.xaxes[0].max = ans.xmax; }
    // loadParams(): time units always; xmin/xmax of params from the plot window (the server values only on forceX)
    sb.params.local.time_units = sb.params.original.time_units = ans.time_units;
    sb.params.local.time_range = sb.params.original.time_range = ans.time_range;
    const o = sb.plotOpts.xaxes[0];
    sb.params.local.xmin = (o.min !== null ? o.min : ans.xmin);
    sb.params.local.xmax = (o.max !== null ? o.max : ans.xmax);
  };
  vm.createContext(sb);
  const src = [ blockSrc('RESET ZOOM'), fnSrc('timeUnitFactor', true), fnSrc('rampPeriodCycles', true),
                fnSrc('lockSetXWindow', true), fnSrc('resetZoom', true), fnSrc('resetZoomY', false),
                fnSrc('rawModeRescaleY', false), fnSrc('lockCaptureActive', true), fnSrc('lockCaptureEnd', true),
                fnSrc('lockCaptureLeave', true), fnSrc('lockScopeSelects', true) ].join('\n');
  vm.runInContext(src, sb);
  return sb;
}

// ---- cases ---------------------------------------------------------------------------------------------------------
const U = ['us', 'ms', 's'];
let fails = 0, n = 0;
function near(a, b, rel) { return Math.abs(a - b) <= (rel || 2e-6) * Math.max(Math.abs(b), 1e-12); }
function nearAbs(a, b) { return Math.abs(a - b) <= 1e-12 + 2e-6 * Math.abs(b); }

// cur: { time_range } of the server before Reset zoom; p: params of the page; exp: { win_s, dec, y }
// cap (optional): lock capture in progress { state, saved: { trig_mode, trig_source, lock_trig_sw, xmin_s, xmax_s } }:
// the page is in Single + External + Ext Trig "Lock control trig" (128); exp.scope: the scope settings expected after
function run(name, cur, p, exp, cap) {
  const tr = cur.time_range, tu = rangeToUnit(tr);
  const f = unitF(tu);
  const srv = { time_range: tr, time_units: tu, xmin: 0, xmax: DEC[tr] * MEM * f, trig_mode: 1, forcex_flag: 0,
                gui_reset_y_range: 2 };
  const local = Object.assign({ trig_mode: 1, trig_source: 2, lock_trig_sw: 0, lock_osc_raw_mode: 0,
                                lock_ramp_low_lim: -1000, lock_ramp_hig_lim: 1000, lock_ramp_step: 0,
                                lock_gen_mod_hp: 0, lock_gen_mod_sqp: 0 }, srv, p);   // v2.2.9: no lock_ramp_sawtooth
  if(cap) Object.assign(local, { trig_mode: 2, trig_source: 2, lock_trig_sw: 128 });
  const sb = makeSandbox(srv, local);
  if(cap) { sb.lock_cap.state = cap.state; sb.lock_cap.saved = Object.assign({}, cap.saved); sb.lock_cap.offset_s = 0; sb.autorun = 0; }
  let err = '';
  try { sb.resetZoom(); } catch(e) { err = e.message; }
  const s = sb.srv, sf = unitF(s.time_units), o = sb.plotOpts;
  const win = [ Number(o.xaxes[0].min) / sf, Number(o.xaxes[0].max) / sf ];
  const pw  = [ Number(sb.params.local.xmin) / sf, Number(sb.params.local.xmax) / sf ];
  const y = [ o.yaxes[0].min, o.yaxes[0].max ];
  const checks = [];
  checks.push([ 'x window ' + win.map(v => v.toPrecision(7)).join('..') + ' s (expected ' +
                exp.win_s.map(v => v.toPrecision(7)).join('..') + ')',
                o.xaxes[0].min !== null && nearAbs(win[0], exp.win_s[0]) && near(win[1], exp.win_s[1]) ]);
  checks.push([ 'params xmin/xmax = plot window', o.xaxes[0].min !== null && nearAbs(pw[0], win[0]) && near(pw[1], win[1], 1e-9) ]);
  checks.push([ 'Dec ' + DEC[s.time_range] + ' (expected ' + exp.dec + '), units ' + U[s.time_units],
                DEC[s.time_range] === exp.dec && s.time_units === rangeToUnit(DEC.indexOf(exp.dec)) &&
                sb.params.local.time_units === s.time_units ]);
  checks.push([ 'window inside the memory', win[1] - win[0] <= DEC[s.time_range] * MEM * (1 + 1e-9) ]);
  checks.push([ 'Y ' + y.join('..') + ' (expected ' + exp.y.join('..') + '), one Y axis', y[0] === exp.y[0] && y[1] === exp.y[1] &&
                o.yaxes.length === 1 && sb.plot_options.yaxis.min === exp.y[0] && sb.plot_options.yaxis.max === exp.y[1] ]);
  checks.push([ 'one POST with xmin/xmax', sb.posts.length === 1 && isFinite(sb.posts[0].xmin) && isFinite(sb.posts[0].xmax) ]);
  checks.push([ 'v2.3.23: trace cleared (' + sb.datasets.map(d => d.data.length).join(',') + ' points), plot_epoch ' + sb.plot_epoch +
                ', next POST marked', sb.datasets.every(d => d.data.length === 0) && sb.plot_epoch === 1 && sb.plot_epoch_post === true ]);
  const ended = sb.logs.some(m => /Capture Lock: ended by Reset zoom/.test(m));
  if(cap) {
    const sent = sb.posts[0] || {}, sv = cap.saved;
    checks.push([ 'capture ended (state ' + sb.lock_cap.state + '), console "ended by Reset zoom"', sb.lock_cap.state === 'off' && ended ]);
    checks.push([ 'scope settings restored and sent: trig_mode ' + sent.trig_mode + ', trig_source ' + sent.trig_source +
                  ', Ext Trig ' + sent.lock_trig_sw, sent.trig_mode === sv.trig_mode && sent.trig_source === sv.trig_source &&
                  sent.lock_trig_sw === sv.lock_trig_sw ]);
    checks.push([ 'runStop() after the POST (' + sb.runStops + '), autorun ' + sb.autorun,
                  sb.runStops === 1 && sb.autorun === (sv.trig_mode == 2 ? 0 : 1) ]);
  } else {
    checks.push([ 'no capture: no "ended" message, no runStop()', !ended && sb.runStops === 0 ]);
  }
  if(err) checks.push([ 'exception: ' + err, false ]);
  const bad = checks.filter(c => !c[1]);
  n++;
  if(bad.length) fails++;
  console.log((bad.length ? 'FAIL ' : 'ok   ') + name + ' [scope Dec ' + DEC[tr] + ' ' + U[tu] + ']');
  for(const c of checks) if(!c[1] || OLD || process.env.VERBOSE) console.log('       ' + (c[1] ? 'ok   ' : 'FAIL ') + c[0]);
}

const V = [-1, 1], RAW = [-8192, 8192];
console.log('--- Scan floor / Scan ceil: one ramp period (gen_ramp.v)');
// triangle 2*(hig-low)*(step+1): 2*8000*100 = 1.6e6 cycles = 12.8 ms -> Dec 128 (16.8 ms), from us
run('1 Scan floor, triangle -4000..4000 step 99 (12.8 ms)', { time_range: 0 },
    { lock_trig_sw: 2, lock_ramp_low_lim: -4000, lock_ramp_hig_lim: 4000, lock_ramp_step: 99 },
    { win_s: [0, 12.8e-3], dec: 128, y: V });
// v2.2.9 (no sawtooth here): triangle 2*4096*(0+1) = 8192 cycles = 65.536 us -> Dec 1, from s (forceX to us)
run('2 Scan ceil, triangle 0..4096 step 0 (65.536 us)', { time_range: 8 },
    { lock_trig_sw: 4, lock_ramp_low_lim: 0, lock_ramp_hig_lim: 4096, lock_ramp_step: 0 },
    { win_s: [0, 65.536e-6], dec: 1, y: V });
// triangle with step: 2*200*(1249+1) = 500000 cycles = 4 ms -> Dec 64 (8.39 ms), from ms
run('3 Scan floor, triangle -100..100 step 1249 (4 ms)', { time_range: 5 },
    { lock_trig_sw: 2, lock_ramp_low_lim: -100, lock_ramp_hig_lim: 100, lock_ramp_step: 1249 },
    { win_s: [0, 4e-3], dec: 64, y: V });
// triangle 2*16000*(31249+1) = 1e9 cycles = 8 s -> Dec 65536 (8.59 s). v2.3.23: slow scan, 0 .. 0.98 T = 7.84 s
run('4 Scan floor, triangle -8000..8000 step 31249 (8 s): 0.98 T', { time_range: 2 },
    { lock_trig_sw: 2, lock_ramp_low_lim: -8000, lock_ramp_hig_lim: 8000, lock_ramp_step: 31249 },
    { win_s: [0, 7.84], dec: 65536, y: V });
// v2.3.23: the 30 s scan of the lock tests (2*10000*(187499+1)*8 ns = 30 s) -> 0 .. 29.4 s, Dec 524288
run('4b Scan floor, triangle -5000..5000 step 187499 (30 s): 0.98 T', { time_range: 5 },
    { lock_trig_sw: 2, lock_ramp_low_lim: -5000, lock_ramp_hig_lim: 5000, lock_ramp_step: 187499 },
    { win_s: [0, 29.4], dec: 524288, y: V });
// v2.3.23: 1.6 s (triangle 2*500*(199999+1) = 2e8 cycles): 2 % = 32 ms < 50 ms -> 0 .. 1.55 s
run('4c Scan ceil, triangle 0..500 step 199999 (1.6 s): T - 50 ms', { time_range: 8 },
    { lock_trig_sw: 4, lock_ramp_low_lim: 0, lock_ramp_hig_lim: 500, lock_ramp_step: 199999 },
    { win_s: [0, 1.55], dec: 65536, y: V });
// v2.3.23: just below 1.5 s: one whole period as before (1.4 s = triangle 2*350*(249999+1))
run('4d Scan floor, triangle 0..350 step 249999 (1.4 s): whole period', { time_range: 8 },
    { lock_trig_sw: 2, lock_ramp_low_lim: 0, lock_ramp_hig_lim: 350, lock_ramp_step: 249999 },
    { win_s: [0, 1.4], dec: 65536, y: V });
// longer than the longest memory: clamped to 68.72 s (Dec 524288)
run('5 Scan floor, ramp of 2^31 step (> 68.7 s): clamped', { time_range: 0 },
    { lock_trig_sw: 2, lock_ramp_low_lim: -8000, lock_ramp_hig_lim: 8000, lock_ramp_step: 2147483647 },
    { win_s: [0, 524288 * MEM * (1 - 1e-6)], dec: 524288, y: V });
// ramp period exactly one memory (16384 cycles = Dec 1): stays at Dec 1, does not jump to Dec 8 (float32)
run('6 Scan floor, triangle -4096..4096 step 0 (exactly 131.072 us)', { time_range: 3 },
    { lock_trig_sw: 2, lock_ramp_low_lim: -4096, lock_ramp_hig_lim: 4096, lock_ramp_step: 0 },
    { win_s: [0, MEM], dec: 1, y: V });
// no ramp (high <= low): one memory at the current Dec
run('7 Scan floor, high <= low: one memory (Dec 256)', { time_range: 4 },
    { lock_trig_sw: 2, lock_ramp_low_lim: 100, lock_ramp_hig_lim: 100 },
    { win_s: [0, 256 * MEM], dec: 256, y: V });

console.log('--- harmonic mod.: one period of the modulation (gen_mod_h.v)');
run('8 harmonic mod., hp 0 (20.16 us, 49.6 kHz)', { time_range: 5 },
    { lock_trig_sw: 8, lock_gen_mod_hp: 0 }, { win_s: [0, 20.16e-6], dec: 1, y: V });
run('9 harmonic mod., hp 499 (10.08 ms)', { time_range: 0 },
    { lock_trig_sw: 8, lock_gen_mod_hp: 499 }, { win_s: [0, 10.08e-3], dec: 128, y: V });
run('10 harmonic mod., hp 16383 (330 ms)', { time_range: 1 },
    { lock_trig_sw: 8, lock_gen_mod_hp: 16383 }, { win_s: [0, 2520 * 16384 * 8e-9], dec: 8192, y: V });
run('11 harmonic mod., hp 1 raw mode (40.32 us)', { time_range: 7 },
    { lock_trig_sw: 8, lock_gen_mod_hp: 1, lock_osc_raw_mode: 1 }, { win_s: [0, 40.32e-6], dec: 1, y: RAW });

console.log('--- v2.2.9: Square mod.: one period of the square modulation (gen_mod2.v: 2*(sqp+1), harmonic period with sqp 0)');
run('S1 Square mod., sqp 3 (8 cycles = 64 ns)', { time_range: 4 },
    { lock_trig_sw: 16, lock_gen_mod_sqp: 3 }, { win_s: [0, 64e-9], dec: 1, y: V });
run('S2 Square mod., sqp 62499 (1 ms, 1 kHz)', { time_range: 0 },
    { lock_trig_sw: 16, lock_gen_mod_sqp: 62499 }, { win_s: [0, 1e-3], dec: 8, y: V });
run('S3 Square mod., sqp 0: harmonic period, hp 499 (10.08 ms)', { time_range: 0 },
    { lock_trig_sw: 16, lock_gen_mod_sqp: 0, lock_gen_mod_hp: 499 }, { win_s: [0, 10.08e-3], dec: 128, y: V });
// 2 s: 2 % = 40 ms < 50 ms -> 0 .. T - 50 ms
run('S4 Square mod., sqp 124999999 (2 s, slow): T - 50 ms', { time_range: 2 },
    { lock_trig_sw: 16, lock_gen_mod_sqp: 124999999 }, { win_s: [0, 1.95], dec: 65536, y: V });
// largest sqp: 2*2^32 cycles = 68.72 s -> 0.98 T = 67.35 s (inside the longest memory)
run('S5 Square mod., sqp 4294967295 (68.72 s): 0.98 T', { time_range: 2 },
    { lock_trig_sw: 16, lock_gen_mod_sqp: 4294967295 }, { win_s: [0, 0.98 * 2 * 4294967296 * 8e-9], dec: 524288, y: V });
run('S6 harmonic mod. with sqp 99 set: still the harmonic period (hp 0)', { time_range: 5 },
    { lock_trig_sw: 8, lock_gen_mod_hp: 0, lock_gen_mod_sqp: 99 }, { win_s: [0, 20.16e-6], dec: 1, y: V });
run('S7 waiting capture, saved Square mod. sqp 62499 (1 ms)', { time_range: 1 },
    { lock_gen_mod_sqp: 62499 }, { win_s: [0, 1e-3], dec: 8, y: V },
    { state: 'waiting', saved: { trig_mode: 1, trig_source: 2, lock_trig_sw: 16, xmin_s: 0, xmax_s: 1e-3 } });

console.log('--- other Ext Trig: one whole memory at the current Dec');
run('12 Ext Trig None, Dec 1', { time_range: 0 }, { lock_trig_sw: 0 }, { win_s: [0, MEM], dec: 1, y: V });
run('13 Ext Trig Pin, Dec 8', { time_range: 1 }, { lock_trig_sw: 1 }, { win_s: [0, 8 * MEM], dec: 8, y: V });
run('14 Ext Trig Jump trigger, Dec 64', { time_range: 2 }, { lock_trig_sw: 64 }, { win_s: [0, 64 * MEM], dec: 64, y: V });
run('15 Ext Trig Lock control trig, Dec 1024', { time_range: 6 }, { lock_trig_sw: 128 }, { win_s: [0, 1024 * MEM], dec: 1024, y: V });
run('16 Ext Trig None, Dec 8192', { time_range: 7 }, { lock_trig_sw: 0 }, { win_s: [0, 8192 * MEM], dec: 8192, y: V });
run('17 Ext Trig Out of lock, Dec 524288', { time_range: 9 }, { lock_trig_sw: 32 }, { win_s: [0, 524288 * MEM], dec: 524288, y: V });
run('18 Ext Trig None, Dec 64, Auto trigger', { time_range: 2 }, { lock_trig_sw: 0, trig_mode: 0 }, { win_s: [0, 64 * MEM], dec: 64, y: V });

console.log('--- raw mode: Y -8192..8192');
run('19 raw mode, Ext Trig None, Dec 1', { time_range: 0 }, { lock_trig_sw: 0, lock_osc_raw_mode: 1 }, { win_s: [0, MEM], dec: 1, y: RAW });
run('20 raw mode, Scan floor triangle (12.8 ms)', { time_range: 9 },
    { lock_trig_sw: 2, lock_ramp_low_lim: -4000, lock_ramp_hig_lim: 4000, lock_ramp_step: 99, lock_osc_raw_mode: 1 },
    { win_s: [0, 12.8e-3], dec: 128, y: RAW });

console.log('--- (build 48) Reset zoom during a lock capture: the capture ends, then the restored Ext Trig rules');
run('21 captured, saved Scan floor (triangle 12.8 ms)', { time_range: 0 },
    { lock_ramp_low_lim: -4000, lock_ramp_hig_lim: 4000, lock_ramp_step: 99 },
    { win_s: [0, 12.8e-3], dec: 128, y: V },
    { state: 'captured', saved: { trig_mode: 1, trig_source: 2, lock_trig_sw: 2, xmin_s: -1e-3, xmax_s: 5e-3 } });
run('22 waiting, saved harmonic mod. hp 0, Auto trigger', { time_range: 1 },
    { lock_gen_mod_hp: 0 }, { win_s: [0, 20.16e-6], dec: 1, y: V },
    { state: 'waiting', saved: { trig_mode: 0, trig_source: 0, lock_trig_sw: 8, xmin_s: 0, xmax_s: 1e-3 } });
run('23 captured, saved Single + Ext Trig None, raw mode (one memory, Dec 64)', { time_range: 2 },
    { lock_osc_raw_mode: 1 }, { win_s: [0, 64 * MEM], dec: 64, y: RAW },
    { state: 'captured', saved: { trig_mode: 2, trig_source: 2, lock_trig_sw: 0, xmin_s: 0, xmax_s: 2e-3 } });

console.log('--- (build 48) Raw Mode button: Y rescaled');
for(const raw of [1, 0]) {
  const srv = { time_range: 2, time_units: 1, xmin: 0, xmax: 8, trig_mode: 1, forcex_flag: 0, gui_reset_y_range: 2 };
  const sb = makeSandbox(srv, Object.assign({}, srv, { lock_osc_raw_mode: raw }));
  let err = '';
  try { sb.rawModeRescaleY(); } catch(e) { err = e.message; }
  const o = sb.plotOpts, ey = raw ? RAW : V;
  const ok = !err && o.yaxes[0].min === ey[0] && o.yaxes[0].max === ey[1] && o.yaxes.length === 1 &&
             o.xaxes[0].min === srv.xmin + 1 && o.xaxes[0].max === srv.xmax / 2 && sb.posts.length === 0;
  n++;
  if(!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + `R${raw} Raw Mode ${raw ? 'on' : 'off'}: Y ${o.yaxes[0].min}..${o.yaxes[0].max} (expected ${ey.join('..')}), ` +
              `X unchanged, no POST of its own` + (err ? ' (' + err + ')' : ''));
}

// The margin under one memory is needed: with the float32 xmin/xmax of the server, exactly one memory at Dec 1
// (131.072 us) takes Dec 8 (this checks the server model, not the page)
{
  const a = srvPost({ time_units: 0, time_range: 0 }, { xmin: 0, xmax: 131.072, trig_mode: 1 });
  n++;
  const ok = a.time_range === 1;
  if(!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + 'model: window of exactly 131.072 us -> Dec ' + DEC[a.time_range] + ' (float32: Dec 8 expected)');
}

console.log(`\n${n - fails}/${n} ok` + (OLD ? ' (--old: an older page, failures expected)' : ''));
process.exit(fails ? 1 : 0);
