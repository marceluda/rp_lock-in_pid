#!/usr/bin/env node
// v2.2.0-rc4: the stale "Force X" of a GET /data answer (bug of testAgent, reportes/lock-in_pid_plus/2026-11-13_1116_v220rc3.md).
//
// After a POST that changes the time units the server answers forcex_flag 1 (xmin/xmax in the new units) in that POST
// answer and in every GET /data until the next POST. A GET in flight when the page sets another window (2nd click of
// Reset Zoom: 0 .. T/2) brought ~70 ms later the window of the 1st click and put the axis back to 0 .. T.
//
// The UI / C / FPGA model is the one of test/lock_capture_ui_sim.js (its harness is loaded from that file, as
// test/lock_quick_trig_sim.js does): the real sendParams(), doGetData(), loadParams() of index.html with an asynchronous
// $.ajax on a simulated clock (GET /data waits up to 200 ms for data, as nginx). Added here: the real resetZoom() and
// its [RESET ZOOM] block, and a model of the time range code of src/main.c (as test/reset_zoom_sim.js): the POST takes
// xmin/xmax in the current units, the smallest Dec whose memory covers it, the units of that Dec, forcex_flag 1 if the
// units changed, and forcex_flag stays as it is until the next POST. The params of a GET answer are those of the server
// when the GET started (a GET in flight does not see a POST made meanwhile, as on the board).
//
//   1. Reset zoom s -> ms (1st click, whole period 20 ms), then the 2nd click (rising half, 10 ms) at 25 different
//      moments of the GET polling: the axis must end at 0 .. 10 ms every time.
//   2. A wheel X zoom right after the forceX (its POST goes 250 ms later): the GETs that repeat the forceX do not undo it.
//   3. A forceX that is not stale (another client changes the window and the units): applied once.
//   4. The forceX of the POST answer (the 1st click, s -> ms) is applied as before.
//
// Usage: node test/forcex_race_sim.js [index.html] [--old]      (exit code 1 if a check fails)
//        --old: an index.html without [FORCEX] (e.g. v2.2.0-rc3): the checks must fail where the bug is.
'use strict';
const fs = require('fs'), path = require('path'), Module = require('module');

const OLD = process.argv.includes('--old');
// ---- harness of lock_capture_ui_sim.js (same argv: [index.html]) ------------------------------------------------
const capFile = path.join(__dirname, 'lock_capture_ui_sim.js');
let capSrc = fs.readFileSync(capFile, 'utf8').replace(/^#!.*\n/, '');
const cut = capSrc.indexOf('\nlet fails = 0');
if(cut < 0) throw new Error('lock_capture_ui_sim.js: harness end not found');
capSrc = capSrc.slice(0, cut) + '\nmodule.exports = { setup, js, file, fnSrc, handlerSrc };\n';
const hm = new Module(capFile, module);
hm.filename = capFile;
hm.paths = Module._nodeModulePaths(__dirname);
hm._compile(capSrc, capFile);
const H = hm.exports;
const js = H.js;
function blockSrc(tag) {
  const a = js.indexOf('// [' + tag + ' BEGIN]'), b = js.indexOf('// [' + tag + ' END]');
  return (a < 0 || b < 0) ? '' : js.slice(a, b);
}

// ---- server model of the time range (src/main.c transform_acq_params()) ------------------------------------------
const DEC = [1, 8, 64, 128, 256, 512, 1024, 8192, 65536, 524288];
const MEM = 16384 * 8e-9;
function rangeToUnit(r) { return r <= 1 ? 0 : (r <= 6 ? 1 : 2); }
function unitF(tu) { return Math.pow(10, 3 * (2 - tu)); }   // value in units = seconds * unitF

// Environment: lock_capture harness + resetZoom + server time model. init_s: window in seconds, units of the server.
function env(o) {
  o = o || {};
  const tu0 = (o.tu !== undefined ? o.tu : 2), tr0 = (o.tr !== undefined ? o.tr : 8);
  const win = o.win_s || [0, 2];
  const init = { xmin: win[0] * unitF(tu0), xmax: win[1] * unitF(tu0), time_units: tu0, time_range: tr0, forcex_flag: 0,
                 trig_source: 2, lock_trig_sw: 2, trig_mode: 1,
                 lock_ramp_step: 999, lock_ramp_low_lim: -625, lock_ramp_hig_lim: 625, lock_ramp_sawtooth: 0 };   // T = 20 ms
  const E = H.setup({ init, capture: false, fire: false });
  const R = E.rig, ctx = E.get('this');
  // server: the time fields (xmin/xmax/time_units/time_range/forcex_flag) of R.p
  R.p.forcex_flag = 0;
  const post0 = R.post.bind(R);
  R.post = function(q, t) {
    const units = R.p.time_units;
    const tdone = post0(q, t);
    if('xmin' in q || 'xmax' in q) {
      const f = unitF(units);
      const xmin = Math.fround(Number(q.xmin)) / f, xmax = Math.fround(Number(q.xmax)) / f;
      const rdec = (Number(R.p.trig_mode) == 0 ? xmax : (Math.max(xmax, 0) - xmin)) * 125e6 / 16384;
      let i = 0; while(i <= 9 && DEC[i] < rdec) i++;
      if(i > 9) i = 9;
      const tu = rangeToUnit(i), nf = unitF(tu);
      Object.assign(R.p, { time_range: i, time_units: tu, xmin: xmin * nf, xmax: xmax * nf, forcex_flag: (tu != units) ? 1 : 0 });
    } else R.p.forcex_flag = 0;
    return tdone;
  };
  // GET /data: the params of the server when the GET starts (the answer is built from them)
  const $ = ctx.$, ajax0 = $.ajax;
  E.gets = [];
  $.ajax = function(a) {
    if(a.type == 'POST') return ajax0(a);
    const snap = { xmin: R.p.xmin, xmax: R.p.xmax, time_units: R.p.time_units, time_range: R.p.time_range, forcex_flag: R.p.forcex_flag };
    const t0 = E.clock.t, d = $.Deferred();
    ajax0(a).done(function(res) {
      if(res && res.datasets && res.datasets.params) Object.assign(res.datasets.params, snap);
      E.gets.push({ t0, t1: E.clock.t, snap });
      d.resolve.apply(null, arguments);
    }).fail(function() { d.reject.apply(null, arguments); });
    return d.promise();
  };
  // the real resetZoom() of the page (and what it calls that the harness does not have)
  let code = blockSrc('RESET ZOOM') + '\n';
  for(const f of ['resetZoom', 'resetZoomY', 'lockSetXWindow', 'xWindowToParams']) code += H.fnSrc(f) + '\n';
  code += 'var plot_options = { xaxis: {}, yaxis: {}, y2axis: {} };\n';
  require('vm').runInContext(code, ctx);
  E.ms = () => { const f = unitF(Number(E.get('params.local.time_units'))); return [E.axes.min / f * 1e3, E.axes.max / f * 1e3]; };
  // axis in ms, from the units of the page (params.local.time_units = the units of the plot)
  return E;
}

let fails = 0, n = 0;
function check(name, cond, extra) {
  n++;
  console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if(!cond) fails++;
}
const near = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
const fmt = w => w.map(v => +v.toPrecision(7)).join(' .. ') + ' ms';

console.log('=== stale Force X of GET /data (' + H.file + ')' + (OLD ? ' --old' : '') + ' ===');
const hasFx = js.includes('// [FORCEX BEGIN]');
if(!OLD) check('0 [FORCEX] block in the page', hasFx);

// ---- 1. Reset zoom s -> ms, then the 2nd click at 25 moments of the polling ------------------------------------
{
  let bad = [], stale = 0, w4 = null, rx = '';
  for(let k = 0; k < 25; k++) {
    const E = env();
    E.get('resetZoom()');
    E.run(300);                                    // 1st click answered (forceX s -> ms), GETs repeat forcex_flag 1
    const w1 = E.ms();
    if(k === 0) { w4 = w1; rx = String(E.get('params.local.time_units')); }
    E.run(k * 4.1);                                // 2nd click at another moment of the GET polling
    const tc = E.clock.t;
    E.get('resetZoom()');
    E.run(600);
    const w = E.ms();
    // GETs started before the 2nd click and answered after it with the forceX of the 1st one
    stale += E.gets.filter(g => g.t0 < tc && g.t1 > tc && g.snap.forcex_flag == 1).length;
    if(!(near(w[0], 0) && near(w[1], 10))) bad.push(k + ': ' + fmt(w));
  }
  check('4 1st click: forceX of the POST answer applied (s -> ms), axis 0 .. 20 ms, units ms', w4 && near(w4[0], 0) && near(w4[1], 20) && rx === '1',
        fmt(w4) + ', units ' + rx);
  check('1a the race happens: GETs started before the 2nd click, answered after it with forcex_flag 1 of the 1st one', stale > 0, stale + ' GETs in 25 runs');
  check('1b 2nd click (rising half): axis 0 .. 10 ms in all the 25 runs (not 0 .. 20 ms again)', bad.length === 0,
        bad.length ? bad.length + ' bad: ' + bad.slice(0, 3).join('; ') : '25/25');
}

// ---- 2. a wheel X zoom right after the forceX (its POST goes 250 ms later, debounced): the GETs that repeat the
//         forceX do not undo it (25 moments of the polling) ---------------------------------------------------------
{
  let bad = [], stale = 0;
  for(let k = 0; k < 25; k++) {
    const E = env();
    E.get('resetZoom()');
    E.run(300 + k * 4.1);
    // plotWheelZoom(): the axes (current units, ms) + xWindowLocal(); then 'plotzoom' -> 250 ms -> xWindowToParams() + POST
    const tz = E.clock.t;
    E.axes.min = 0; E.axes.max = 6;   // from t = 0: loadParams() keeps the axis only if min is not 0 (`min && max`), so
                                      // a window from 0 is the one a stale forceX can undo
    if(hasFx) E.get('xWindowLocal()');
    E.clock.after(250, () => { E.get('xWindowToParams(plot.getAxes().xaxis.min, plot.getAxes().xaxis.max)'); E.get('sendParams(true)'); });
    E.run(800);
    stale += E.gets.filter(g => g.t0 < tz && g.t1 > tz && g.t1 < tz + 250 && g.snap.forcex_flag == 1).length;
    const w = E.ms();
    if(!(near(w[0], 0) && near(w[1], 6))) bad.push(k + ': ' + fmt(w));
  }
  check('2a the race happens: GETs in flight at the wheel zoom, answered before its POST with forcex_flag 1', stale > 0, stale + ' GETs in 25 runs');
  check('2b wheel X zoom to 0 .. 6 ms right after the forceX: kept in all the 25 runs (server and axis)', bad.length === 0,
        bad.length ? bad.length + ' bad: ' + bad.slice(0, 3).join('; ') : '25/25');
}

// ---- 3. a forceX that is not stale (another client: new window and units) is applied ------------------------------
{
  const E = env();
  E.get('resetZoom()');
  E.run(300);
  const R = E.rig;
  // another client posts 0 .. 3 s: the server goes to s with forcex_flag 1 (this page sends nothing)
  Object.assign(R.p, { time_units: 2, time_range: 8, xmin: 0, xmax: 3, forcex_flag: 1 });
  E.run(600);
  const w = E.ms();
  check('3 forceX of another client (0 .. 3 s, units s): applied by the next GET', near(w[0], 0) && near(w[1], 3000) && E.get('params.local.time_units') == 2, fmt(w));
}

console.log(`\n${n - fails}/${n} ok` + (OLD ? ' (--old: an older page, failures expected)' : ''));
process.exit(fails ? 1 : 0);
