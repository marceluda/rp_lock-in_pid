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
//   5. v2.2.1 (bug of testAgent, reportes/lock-in_pid/2026-11-13_1806_v2216.md): the POST of the 1st click of Reset Zoom
//      gets no answer in post_chunk_timeout (nginx hung ~2.5 s: requests are served only when the hang ends), the page
//      sends the same body again, and the 2nd click comes during the wait (before and after the retry is sent). The
//      answer of the retry has forcex_flag 1 and the window of the 1st click: the axis and the server must end at
//      0 .. 10 ms, in ms. Variants: the timed-out POST is lost / served at the end of the hang (then the retry, the same
//      body, gets the forced answer, as src/main.c while forcex_state is 1) / plus a GET with the new units answered
//      before the answer of the retry. Also: a parameter changed during the wait (kp) reaches the server, also when it is
//      changed back to the value the server had before the timed-out POST (that POST carries kp 150, the server had 100:
//      a GET answered during the wait with kp 100 made 100 look already sent, and the answer of the POST put 150 back).
//   6. v2.2.1, 2nd round: the timed-out POST is served at once (only its answer is lost, hook __serve = true of the board
//      test): the retry must not carry xmin/xmax (they were read in the new units), and the window of the page must
//      reach the server although it is in forcex_state. 7. a zoom that the server ignores in forcex_state (< 1.5 s,
//      > 33x): sent again after forcex_hold_ms. The server model follows src/main.c (forcex_state, ratio 0.03,
//      FORCEX_STALE_MS 1500, xmin/xmax compared with GUI_XMIN/GUI_XMAX as float32).
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
  // server: the time fields (xmin/xmax/time_units/time_range/forcex_flag) of R.p, with the forceX logic of src/main.c
  // (v2.2.1, 2nd round): rp_set_params() compares xmin/xmax with GUI_XMIN/GUI_XMAX (float32): no change and forcex_state
  // 1 with both received -> forcex_state 0 (the GUI answered the forceX); a change -> transform_acq_params(): xmin/xmax
  // in the CURRENT units (time_units is read-only), ratio of the forced window to the GUI one (folded to <= 1): if
  // > 0.03 or the forceX is older than FORCEX_STALE_MS (1500 ms) the forceX ends; while forcex_state is 1 the forced
  // window, units and time range are kept; units of the new Dec != units before -> forcex_state 1 (window forced).
  // A POST without xmin/xmax uses GUI_XMIN/GUI_XMAX (no change of the window by itself).
  R.p.forcex_flag = 0;
  const S = { gui_xmin: Math.fround(R.p.xmin), gui_xmax: Math.fround(R.p.xmax), fx: 0, fxmin: 0, fxmax: 0, fxu: tu0, fxr: tr0, mark: -1e9 };
  E.srv = S; E.units_hist = [];
  const SCOPE_K = ['trig_mode', 'trig_source', 'trig_edge', 'trig_level', 'lock_trig_sw', 'lock_osc_raw_mode', 'auto_flag'];
  const post0 = R.post.bind(R);
  R.post = function(q, t) {
    const units = R.p.time_units;
    const keep = { xmin: R.p.xmin, xmax: R.p.xmax, time_units: units, time_range: R.p.time_range };
    const got = ('xmin' in q) && ('xmax' in q);
    let change = SCOPE_K.some(k => (k in q) && Number(q[k]) != Number(R.p[k]));
    if(('xmin' in q) && Math.fround(Number(q.xmin)) != S.gui_xmin) change = true;
    if(('xmax' in q) && Math.fround(Number(q.xmax)) != S.gui_xmax) change = true;
    const tdone = post0(q, t);
    Object.assign(R.p, keep);
    if(!change && S.fx && got) S.fx = 0;
    if(change) {
      const xmin = ('xmin' in q) ? Math.fround(Number(q.xmin)) : S.gui_xmin;
      const xmax = ('xmax' in q) ? Math.fround(Number(q.xmax)) : S.gui_xmax;
      let ratio = (xmax - xmin) != 0 ? Math.abs(S.fxmax - S.fxmin) / Math.abs(xmax - xmin) : 0;
      if(ratio > 1) ratio = 1 / ratio;
      if(ratio > 0.03 || (S.fx && t - S.mark > 1500)) S.fx = 0;
      const f = unitF(units), xs0 = xmin / f, xs1 = xmax / f;
      const rdec = (Number(R.p.trig_mode) == 0 ? xs1 : (Math.max(xs1, 0) - xs0)) * 125e6 / 16384;
      let i = 0; while(i <= 9 && DEC[i] < rdec) i++;
      if(i > 9) i = 9;
      if(!S.fx) R.p.time_range = i;
      const tu = rangeToUnit(R.p.time_range), nf = unitF(tu);
      if(!S.fx) Object.assign(R.p, { xmin: Math.fround(xs0 * nf), xmax: Math.fround(xs1 * nf), time_units: tu });
      else Object.assign(R.p, { xmin: S.fxmin, xmax: S.fxmax, time_units: S.fxu, time_range: S.fxr });
      S.gui_xmin = R.p.xmin; S.gui_xmax = R.p.xmax;
      if(R.p.time_units != units) Object.assign(S, { fx: 1, mark: t, fxmin: R.p.xmin, fxmax: R.p.xmax, fxu: R.p.time_units, fxr: R.p.time_range });
    }
    R.p.forcex_flag = S.fx;
    E.units_hist.push({ t, tu: R.p.time_units });
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
  // v2.2.1: nginx hung from E.hang.from to E.hang.to: requests made meanwhile are served at the end (GET: then its
  // snapshot). E.hang.lost: the 1st hung POST is never served; E.hang.slow: ms more for the answer of the POSTs.
  // E.drop = { n, serve }: the hook of the board test (devAgent.md): the next n POSTs get no answer (the page sees
  // 'timeout' after post_chunk_timeout); serve: they reach the server anyway (served at once, only the answer is lost).
  const ajax1 = $.ajax;
  E.hang = null; E.hung = []; E.drop = null;
  $.ajax = function(a) {
    const h = E.hang, t = E.clock.t;
    if(a.type == 'POST' && E.drop && E.drop.n > 0) {
      E.drop.n--;
      const d = $.Deferred(), q = JSON.parse(a.data).datasets.params;
      E.hung.push({ t, q, dropped: true });
      if(E.drop.serve) ajax1(Object.assign({}, a, { timeout: 0 }));     // served, its answer ignored
      E.clock.at(t + (a.timeout || 2000), () => d.reject({}, 'timeout'));
      return d.promise();
    }
    if(!h || t < h.from || t >= h.to) return ajax1(a);
    const d = $.Deferred();
    if(a.type != 'POST') {
      E.clock.at(h.to + 3, () => ajax1(a).done((...x) => d.resolve(...x)).fail((...x) => d.reject(...x)));
      return d.promise();
    }
    const q = JSON.parse(a.data).datasets.params, first = (E.hung.length === 0);
    let settled = false;
    E.hung.push({ t, q });
    if(a.timeout) E.clock.at(t + a.timeout, () => { if(!settled) { settled = true; d.reject({}, 'timeout'); } });
    E.clock.at(h.to + 2, () => {
      if(first && h.lost) return;
      const tdone = R.post(q, E.clock.t);
      E.clock.at(tdone + (h.slow || 0), () => { const r = R.params(E.clock.t); E.clock.after(2, () => {
        if(settled) return; settled = true; d.resolve({ app: { id: 'x' }, status: 'OK', datasets: { params: r, g1: [] } }); }); });
    });
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
  Object.assign(E.srv, { gui_xmin: 0, gui_xmax: 3, fx: 1, fxmin: 0, fxmax: 3, fxu: 2, fxr: 8, mark: E.clock.t });
  E.run(600);
  const w = E.ms();
  check('3 forceX of another client (0 .. 3 s, units s): applied by the next GET', near(w[0], 0) && near(w[1], 3000) && E.get('params.local.time_units') == 2, fmt(w));
}

// ---- 5. POST of the 1st click with timeout + retry, 2nd click during the wait ---------------------------------------
{
  const variants = [
    { name: 'timed-out POST lost', lost: true },
    { name: 'timed-out POST served at the end of the hang', lost: false },
    { name: 'served + GET with the new units before the answer of the retry', lost: false, slow: 300 },
  ];
  const t2s = [100, 350, 1500, 2200];          // 2nd click, ms after the 1st (the retry goes at 2000 ms)
  let bad = [], retries = 0, stale_fx = 0, kp_bad = [], kp_rev = [], getnu = 0, runs = 0;
  for(const rev of [false, true]) for(const v of variants) for(const d2 of t2s) {
    if(!rev) runs++;
    const E = env();
    E.get('params.local').lock_pidA_kp = 100;
    E.get('sendParams()');
    E.run(150);
    if(rev) E.get('params.local').lock_pidA_kp = 150;   // goes in the POST of the 1st click
    const t1 = E.clock.t;
    E.hang = { from: t1, to: t1 + 2500, lost: v.lost, slow: v.slow };
    E.get('resetZoom()');                       // 1st click: 0 .. 20 ms (s -> ms), its POST hangs
    E.run(d2);
    E.get('resetZoom()');                       // 2nd click: 0 .. 10 ms, its POST waits in send_que
    E.run(50);
    E.get('params.local').lock_pidA_kp = (rev ? 100 : 123);   // another parameter changed during the wait
    E.get('sendParams()');
    E.run(6000 - d2);
    const w = E.ms(), R = E.rig;
    if(rev) { if(R.p.lock_pidA_kp != 100 || E.get('params.local').lock_pidA_kp != 100) kp_rev.push(v.name + ' @' + d2 + ': ' + R.p.lock_pidA_kp); continue; }
    retries += E.log.filter(l => l.kind == 'WARN' && /timed out, retrying/.test(l.m)).length;
    // v2.2.1 (2nd round): the retry goes without xmin/xmax
    stale_fx += E.hung.filter(h => near(Number(h.q.xmax), 0.02)).length === 1 && E.hung.length >= 2 && !('xmax' in E.hung[1].q) ? 1 : 0;
    if(v.slow) getnu += E.gets.filter(g => g.t0 >= t1 + 2500 && g.snap.time_units == 1 && g.snap.forcex_flag == 1 && g.t1 < t1 + 2900).length > 0 ? 1 : 0;
    const srv_ms = [Number(R.p.xmin) / unitF(R.p.time_units) * 1e3, Number(R.p.xmax) / unitF(R.p.time_units) * 1e3];
    if(!(near(w[0], 0) && near(w[1], 10) && E.get('params.local.time_units') == 1 && near(srv_ms[0], 0) && near(srv_ms[1], 10) &&
         R.p.time_units == 1))
      bad.push(v.name + ' @' + d2 + ': axis ' + fmt(w) + ' (units ' + E.get('params.local.time_units') + '), server ' + fmt(srv_ms) +
               ' (units ' + R.p.time_units + ')');
    if(R.p.lock_pidA_kp != 123) kp_bad.push(v.name + ' @' + d2 + ': ' + R.p.lock_pidA_kp);
  }
  check('5a the race happens: the POST of the 1st click times out and is sent again', retries >= runs, retries + ' retries in ' + runs + ' runs');
  if(!OLD) check('5a2 the retry goes without xmin/xmax', stale_fx === runs, stale_fx + '/' + runs);
  check('5b variant with a GET in the new units (forcex_flag 1) answered before the answer of the retry happens', getnu > 0, getnu + ' runs');
  check('5c 2nd click during the wait: axis and server at 0 .. 10 ms in ms in all the ' + runs + ' runs', bad.length === 0,
        bad.length ? bad.length + ' bad: ' + bad.slice(0, 3).join('; ') : runs + '/' + runs);
  check('5d kp changed during the wait reaches the server (the retry with the old body does not overwrite it)', kp_bad.length === 0,
        kp_bad.length ? kp_bad.join('; ') : runs + '/' + runs);
  check('5e kp 150 in the timed-out POST, changed back to 100 during the wait: 100 on the server and on the page', kp_rev.length === 0,
        kp_rev.length ? kp_rev.length + ' bad: ' + kp_rev.slice(0, 3).join('; ') : runs + '/' + runs);
}

// ---- 6. v2.2.1 (2nd round, testAgent reportes/lock-in_pid/2026-11-13_1848_forcex_retry.md): the POST of the 1st click
//         is SERVED at once but its answer is lost (hook __serve = true of the board test), the page retries after
//         post_chunk_timeout. With the same body the server read 0 .. 20 ms-in-the-old-units in the new ones (s -> ms
//         -> us, or us -> ms -> s) and then kept that forced window against the page (forcex_state, < 1.5 s).
//         From s (0 .. 2 s) and from us (0 .. 100 us); 2nd click before the retry (1 dropped answer) and while the
//         retry waits too (2 dropped answers); also not served (__serve = false). Final: axis and server 0 .. 10 ms
//         in ms, the server never in the units on the other side of ms, few POSTs. -----------------------------------
{
  const starts = [{ name: 'from s', o: {}, wrong: 0 }, { name: 'from us', o: { tu: 0, tr: 0, win_s: [0, 100e-6] }, wrong: 2 }];
  const vars = [];
  for(const d2 of [100, 350, 1000, 1900]) vars.push({ n: 1, serve: true, d2 });
  for(const d2 of [2300, 3000]) vars.push({ n: 2, serve: true, d2 });
  for(const d2 of [350, 1900]) vars.push({ n: 1, serve: false, d2 });
  let bad = [], wrongu = [], many = [], retries = 0, runs = 0;
  for(const st of starts) for(const v of vars) {
    runs++;
    const E = env(st.o);
    E.run(150);
    const t1 = E.clock.t;
    E.drop = { n: v.n, serve: v.serve };
    E.get('resetZoom()');                       // 1st click: 0 .. 20 ms
    E.run(v.d2);
    E.get('resetZoom()');                       // 2nd click: 0 .. 10 ms
    E.run(8000 - v.d2);
    const w = E.ms(), R = E.rig, tag = st.name + ' n' + v.n + (v.serve ? ' served' : ' lost') + ' @' + v.d2;
    retries += E.log.filter(l => l.kind == 'WARN' && /timed out, retrying/.test(l.m)).length;
    const srv_ms = [Number(R.p.xmin) / unitF(R.p.time_units) * 1e3, Number(R.p.xmax) / unitF(R.p.time_units) * 1e3];
    if(!(near(w[0], 0) && near(w[1], 10) && E.get('params.local.time_units') == 1 && near(srv_ms[0], 0) && near(srv_ms[1], 10) && R.p.time_units == 1))
      bad.push(tag + ': axis ' + fmt(w) + ' (units ' + E.get('params.local.time_units') + '), server ' + fmt(srv_ms) + ' (units ' + R.p.time_units + ')');
    if(E.units_hist.some(u => u.t >= t1 && u.tu == st.wrong)) wrongu.push(tag);
    const np = E.log.filter(l => l.kind == 'POST' && l.t >= t1).length + E.hung.length;
    if(np > 12) many.push(tag + ': ' + np);
  }
  check('6a the race happens: the POST times out and is retried', retries >= runs, retries + ' retries in ' + runs + ' runs');
  check('6b served POST + retry, 2nd click during the wait: axis and server at 0 .. 10 ms in ms in all the ' + runs + ' runs', bad.length === 0,
        bad.length ? bad.length + ' bad: ' + bad.slice(0, 3).join('; ') : runs + '/' + runs);
  check('6c the server never goes to the units on the other side of ms (retry read in the new units)', wrongu.length === 0,
        wrongu.length ? wrongu.length + ' bad: ' + wrongu.slice(0, 4).join('; ') : runs + '/' + runs);
  check('6d at most 12 POSTs per run (no loop)', many.length === 0, many.length ? many.join('; ') : runs + '/' + runs);
}

// ---- 7. v2.2.1 (2nd round): a window the server ignores because it is in forcex_state (< 1.5 s, > 33x away from the
//         forced one): the 2nd click of the report (step 3) and a zoom right after a units change. The page keeps its
//         window and sends it again after forcex_hold_ms: Reset zoom s -> ms (0 .. 20 ms), 200 ms later the page sets
//         0 .. 0.2 ms (100x smaller) and sends it. Final: axis and server 0 .. 0.2 ms (in us). ---------------------------
{
  let bad = [], frozen = 0;
  for(const d of [50, 200, 600, 1200]) {
    const E = env();
    E.get('resetZoom()');
    E.run(d);
    const tz = E.clock.t;
    E.get('lockSetXWindow(0, 0.0002)');
    E.get('sendParams(true, true)');
    E.run(5000);
    const w = E.ms(), R = E.rig;
    // the server answered its forced window to the zoom at least once (the case happens)
    if(E.units_hist.some(u => u.t >= tz && u.t < tz + 1500 && u.tu == 1)) frozen++;
    const srv_ms = [Number(R.p.xmin) / unitF(R.p.time_units) * 1e3, Number(R.p.xmax) / unitF(R.p.time_units) * 1e3];
    if(!(near(w[0], 0) && near(w[1], 0.2) && near(srv_ms[0], 0) && near(srv_ms[1], 0.2) && R.p.time_units == 0 && E.get('params.local.time_units') == 0))
      bad.push('zoom ' + d + ' ms after: axis ' + fmt(w) + ' (units ' + E.get('params.local.time_units') + '), server ' + fmt(srv_ms) + ' (units ' + R.p.time_units + ')');
  }
  check('7a the case happens: the server keeps its forced window against the zoom', frozen > 0, frozen + '/4');
  check('7b zoom to 0 .. 0.2 ms right after a forceX: kept and on the server (us) in 4/4', bad.length === 0, bad.length ? bad.join('; ') : '4/4');
}

console.log(`\n${n - fails}/${n} ok` + (OLD ? ' (--old: an older page, failures expected)' : ''));
process.exit(fails ? 1 : 0);
