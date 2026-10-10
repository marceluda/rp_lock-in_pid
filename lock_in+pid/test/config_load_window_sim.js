#!/usr/bin/env node
// v2.3.17: simulation of Config -> load of the time window of the scope (bug of 2.3.12: the config lock_mode, saved in
// ms, was applied in the units of the server, -2...33 us).
// Real functions of index.html: config_load_storage(), configWindowSeconds(), lockSetXWindow(), timeUnitFactor().
// Mocked: jQuery, localStorage, the plot, loadParams() (only what matters here: keys missing in the config keep the
// current value, and xmin/xmax are replaced by the plot window when its min and max are not 0, like the real one),
// sendParams() (POST to a model of the time range code of src/main.c, rp_set_params() + forceX answer).
//
// Part 2 (v2.3.17, build 35): the real chain sendParams() -> splitParams() -> postParamsChunks() of index.html against a
// model of rp_set_params() of src/main.c chunk by chunk (forceX handshake, read-only params, params_change only for
// scope params), followed by one GET /data poll. Reproduces the race found by testAgent (2026-10-09 20:38): a stale
// forcex_flag 0 / time_units in a later chunk of the send_all ended the forceX, and the page kept the window in the
// old units (x1000).
//
// Usage:  node test/config_load_window_sim.js [index.html] [--old]   (exit code 1 if a check fails)
//         --old: an index.html of an older version; the checks are the same (they must fail), with more output.
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

// ---- model of the server (src/main.c: time range part of rp_set_params(), constants of src/fpga.c) ----------------
const DEC = [1, 8, 64, 128, 256, 512, 1024, 8192, 65536, 524288];
function rangeToUnit(r) { return r <= 1 ? 0 : (r <= 6 ? 1 : 2); }
function srvPost(srv, p) {
  // xmin/xmax are read in the units the server uses now (time_units is read-only)
  const out = Object.assign({}, srv);
  for(const k in p) if(!['time_units', 'time_range', 'gui_xmin', 'gui_xmax', 'trig_delay', 'forcex_flag'].includes(k)) out[k] = p[k];
  const f = Math.pow(10, 3 * (2 - srv.time_units));
  const xmin = out.xmin / f, xmax = out.xmax / f;
  const rdec = (out.trig_mode == 0 ? xmax : (Math.max(xmax, 0) - xmin)) * 125e6 / 16384;
  let i = 0; while(i < 9 && DEC[i] < rdec) i++;
  const tu = rangeToUnit(i), nf = Math.pow(10, 3 * (2 - tu));
  out.time_range = i; out.time_units = tu; out.xmin = xmin * nf; out.xmax = xmax * nf;
  out.forcex_flag = (tu != srv.time_units) ? 1 : 0;
  return out;
}

// ---- sandbox -------------------------------------------------------------------------------------------------------
function makeSandbox(srvUnits, plotWin) {
  const ls = {};
  const sb = {
    console: { log() {}, info() {}, warn() {} },
    Math, Number, JSON, isFinite, Object, Array,
    localStorage: ls, Storage: function() {},
    params: { local: null, original: null, storage: [] },
    display_keep_keys: [], state_transient_zero: [], load_config_block_start: 1,
    config_storage_key: 'lockConfig_test', user_editing: false, sending: false, unsent_base: null,
    plotOpts: { xaxes: [ { min: plotWin[0], max: plotWin[1] } ] },
    sent: null, srv: null,
  };
  sb.plot = { getOptions: () => sb.plotOpts, setupGrid() {}, draw() {} };
  sb.$ = { extend: Object.assign, isPlainObject: o => o !== null && typeof o === 'object' };
  sb.config_storage_read = () => ls[sb.config_storage_key] || '';
  sb.lockCaptureEnd = () => false;
  sb.uiPrefsSet = () => {};
  // loadParams(): the parts that matter for the time window (see index.html)
  sb.loadParams = function(orig) {
    for(const k in sb.params.local) if(orig[k] === undefined || orig[k] === null) orig[k] = sb.params.local[k];
    const o = sb.plot.getOptions();
    if(o.xaxes[0].min && o.xaxes[0].max) { orig.xmin = o.xaxes[0].min; orig.xmax = o.xaxes[0].max; }
    sb.params.original = Object.assign({}, orig);
    sb.params.local = Object.assign({}, orig);
  };
  // sendParams(send_all): POST of params.local, answer of the server, forceX into the plot, loadParams(answer)
  sb.sendParams = function() {
    sb.sent = Object.assign({}, sb.params.local);
    const ans = srvPost(sb.srv, sb.sent);
    sb.srv = ans;
    if(ans.forcex_flag == 1) { sb.plotOpts.xaxes[0].min = ans.xmin; sb.plotOpts.xaxes[0].max = ans.xmax; }
    sb.loadParams(Object.assign({}, ans));
  };
  // current state: server in srvUnits with the plot window plotWin (in those units)
  sb.srv = { xmin: plotWin[0], xmax: plotWin[1], time_units: srvUnits, time_range: srvUnits == 0 ? 0 : (srvUnits == 1 ? 5 : 8),
             trig_mode: 1, trig_source: 2, gui_xmin: plotWin[0], gui_xmax: plotWin[1], lock_kp: 0 };
  sb.params.local = Object.assign({}, sb.srv);
  sb.params.original = Object.assign({}, sb.srv);
  vm.createContext(sb);
  const src = ['timeUnitFactor', 'lockSetXWindow', 'configWindowSeconds', 'config_load_storage']
    .map(n => fnSrc(n, n !== 'configWindowSeconds' || !OLD)).join('\n');
  vm.runInContext(src, sb);
  return sb;
}

// ---- cases ---------------------------------------------------------------------------------------------------------
const lockModeFile = path.join(__dirname, '..', '..', '..', 'test_files', 'lock_in+pid_harmonic__lock_mode.json');
const lockMode = fs.existsSync(lockModeFile) ? JSON.parse(fs.readFileSync(lockModeFile, 'utf8')).data
  : { xmin: -2.0696902467115232, xmax: 33.48586530884403, time_units: 1, time_range: 5, gui_xmin: -2.06969, gui_xmax: 33.485867,
      trig_delay: -0.002073, trig_mode: 1 };

const U = ['us', 'ms', 's'];
let fails = 0, n = 0;
function near(a, b) { return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b)); }
function run(name, cfg, srvUnits, plotWin, exp) {
  const sb = makeSandbox(srvUnits, plotWin);
  sb.localStorage[sb.config_storage_key] = JSON.stringify([ { name: 'c', datetime: '', data: cfg } ]);
  sb.config_load_storage('c');
  const s = sb.srv, f = Math.pow(10, 3 * (2 - s.time_units));
  const got = [ s.xmin / f, s.xmax / f ];
  const plot = sb.plotOpts.xaxes[0];
  const txt = `${name}: sent ${sb.sent.xmin.toPrecision(7)}..${sb.sent.xmax.toPrecision(7)} (server in ${U[srvUnits]}) -> ` +
              `server ${s.xmin.toPrecision(7)}..${s.xmax.toPrecision(7)} ${U[s.time_units]} (forceX ${s.forcex_flag}), ` +
              `plot ${Number(plot.min).toPrecision(7)}..${Number(plot.max).toPrecision(7)}, local time_units ${sb.params.local.time_units}`;
  n++;
  let ok = near(got[0], exp[0]) && near(got[1], exp[1]);
  // plot window = server window in the server units, and the page in the server units
  ok = ok && near(plot.min, s.xmin) && near(plot.max, s.xmax) && sb.params.local.time_units === s.time_units;
  console.log((ok ? 'ok   ' : 'FAIL ') + txt);
  if(!ok) fails++;
}

console.log('--- part 1: window of the config, one POST');
const lmS = [ lockMode.xmin / 1e3, lockMode.xmax / 1e3 ];
run('1 lock_mode (ms) with the scope in us 0..131', lockMode, 0, [0, 131], lmS);
run('2 lock_mode (ms) with the scope in us 10..120', lockMode, 0, [10, 120], lmS);
run('3 lock_mode (ms) with the scope in ms 0..64', lockMode, 1, [0, 64.16], lmS);
run('4 lock_mode (ms) with the scope in s 1..5', lockMode, 2, [1, 5], lmS);
run('5 config in us (-10..100) with the scope in ms', { xmin: -10, xmax: 100, time_units: 0, time_range: 0, trig_mode: 1 }, 1, [0, 64.16], [-10e-6, 100e-6]);
run('6 config in s (0..2) with the scope in us', { xmin: 0, xmax: 2, time_units: 2, time_range: 8, trig_mode: 1 }, 0, [0, 131], [0, 2]);
run('7 config without time_units (5..50) with the scope in ms', { xmin: 5, xmax: 50, trig_mode: 1 }, 1, [1, 30], [5e-3, 50e-3]);
run('8 config without xmin/xmax: window unchanged (ms 1..30)', { trig_mode: 1, time_units: 0 }, 1, [1, 30], [1e-3, 30e-3]);
run('9 config with xmax <= xmin: window unchanged (us 10..120)', { xmin: 50, xmax: 50, time_units: 1, trig_mode: 1 }, 0, [10, 120], [10e-6, 120e-6]);

// configWindowSeconds() alone
if(js.includes('function configWindowSeconds(')) {
  const sb = makeSandbox(0, [0, 131]);
  const cw = (d, t) => sb.configWindowSeconds(d, t);
  const unit = [
    ['ms', cw({ xmin: -2, xmax: 33, time_units: 1 }, 0), [-2e-3, 33e-3]],
    ['string units', cw({ xmin: '1', xmax: '2', time_units: '2' }, 0), [1, 2]],
    ['units 3 -> current', cw({ xmin: 1, xmax: 2, time_units: 3 }, 1), [1e-3, 2e-3]],
    ['NaN', cw({ xmin: NaN, xmax: 2, time_units: 1 }, 1), null],
    ['null', cw({ xmin: null, xmax: 2, time_units: 1 }, 1), null],
    ['no data', cw(null, 1), null],
  ];
  for(const [nm, got, exp] of unit) {
    n++;
    const ok = exp === null ? got === null : (got && near(got[0], exp[0]) && near(got[1], exp[1]));
    console.log((ok ? 'ok   ' : 'FAIL ') + 'configWindowSeconds ' + nm + ': ' + JSON.stringify(got));
    if(!ok) fails++;
  }
}

// =====================================================================================================================
// Part 2: chunked send_all of Config -> load against a model of rp_set_params() (src/main.c)
console.log('--- part 2: chunked send_all + server model (forceX handshake) + GET /data poll');
const SCOPE_KEYS = ['xmin', 'xmax', 'trig_mode', 'trig_source', 'trig_edge', 'trig_level', 'single_btn', 'en_avg_at_dec',
                    'auto_flag', 'min_y', 'max_y', 'forcex_flag', 'lock_oscA_sw', 'lock_oscB_sw', 'lock_osc_raw_mode', 'lock_osc_lockin_mode'];
const READ_ONLY = ['trig_delay', 'time_range', 'time_units', 'gui_xmin', 'gui_xmax'];
class Server {                      // rp_set_params() + transform_acq_params() (time range part) of src/main.c
  constructor(p) { this.P = Object.assign({}, p); this.fstate = 0; this.forced = null; this.posts = []; }
  set(chunk) {
    const P = this.P; let change = false, gx = false, gX = false;
    this.posts.push(Object.assign({}, chunk));
    for(const k in chunk) {
      if(READ_ONLY.includes(k)) continue;
      if(k == 'xmin') gx = true;
      if(k == 'xmax') gX = true;
      const cmp = k == 'xmin' ? P.gui_xmin : (k == 'xmax' ? P.gui_xmax : P[k]);
      if(cmp != chunk[k] && SCOPE_KEYS.includes(k)) change = true;
      P[k] = chunk[k];
    }
    if(!change && this.fstate && gx && gX) { this.fstate = 0; P.forcex_flag = 0; }
    if(change) {
      if(!gx) P.xmin = P.gui_xmin;
      if(!gX) P.xmax = P.gui_xmax;
      P.gui_xmin = P.xmin; P.gui_xmax = P.xmax;
      this.transform();
    }
    return { app: { id: 'lock_in+pid_harmonic' }, datasets: { params: Object.assign({}, P) } };
  }
  transform() {
    const P = this.P;
    let xmin = P.xmin, xmax = P.xmax;
    const tu_gui = P.time_units, f = Math.pow(10, 3 * (2 - tu_gui));
    P.forcex_flag = this.fstate;
    let ratio = (xmax - xmin) != 0 && this.forced ? Math.abs(this.forced.xmax - this.forced.xmin) / Math.abs(xmax - xmin) : 0;
    if(ratio > 1) ratio = 1 / ratio;
    if(ratio > 0.03) { P.forcex_flag = 0; this.fstate = 0; }
    xmin /= f; xmax /= f;
    const rdec = (P.trig_mode == 0 ? xmax : (Math.max(xmax, 0) - xmin)) * 125e6 / 16384;
    let i = 0; while(i < 9 && DEC[i] < rdec) i++;
    if(this.fstate == 0) P.time_range = i;
    const tu = rangeToUnit(P.time_range), nf = Math.pow(10, 3 * (2 - tu));
    if(this.fstate == 0) { P.xmin = xmin * nf; P.xmax = xmax * nf; P.gui_xmin = P.xmin; P.gui_xmax = P.xmax; P.time_units = tu; }
    else { Object.assign(P, { xmin: this.forced.xmin, xmax: this.forced.xmax, gui_xmin: this.forced.xmin, gui_xmax: this.forced.xmax,
                              time_units: this.forced.tu }); }
    if(tu != tu_gui) { P.forcex_flag = 1; this.fstate = 1; this.forced = { xmin: P.xmin, xmax: P.xmax, tu: P.time_units }; }
  }
}
function syncDeferred() {             // minimal synchronous jQuery Deferred
  let st = 0, val, dn = [], fl = [], al = [];
  const d = {
    resolve(v) { if(st) return d; st = 1; val = v; dn.forEach(f => f(v)); al.forEach(f => f(v)); return d; },
    reject(v) { if(st) return d; st = 2; val = v; fl.forEach(f => f(v)); al.forEach(f => f(v)); return d; },
    done(f) { if(st == 1) f(val); else if(!st) dn.push(f); return d; },
    fail(f) { if(st == 2) f(val); else if(!st) fl.push(f); return d; },
    always(f) { if(st) f(val); else al.push(f); return d; },
    promise() { return d; },
  };
  return d;
}
function varSrc(name) { const m = js.match(new RegExp('\\n\\s*var ' + name + ' = [\\s\\S]*?;[^\\n]*\\n')); return m ? m[0] : ''; }

function race(name, page, cfg, exp_s) {
  // page: { tu, win: [xmin, xmax] (in tu), stale: {forcex_flag, ...} }   cfg: config data
  const P0 = Object.assign({}, cfg);                     // same keys as a full server answer
  for(const k of ['forcex_flag', 'auto_flag', 'single_btn', 'min_y', 'max_y']) P0[k] = 0;
  for(const k in P0) if(k.startsWith('lock_') && typeof P0[k] === 'number') P0[k] = P0[k] + 1;   // different values
  Object.assign(P0, { xmin: page.win[0], xmax: page.win[1], gui_xmin: page.win[0], gui_xmax: page.win[1], time_units: page.tu,
                      time_range: page.tu == 0 ? 0 : (page.tu == 1 ? 5 : 8), trig_mode: 1, trig_delay: 0 });
  // server order: xmin, xmax, scope params first, then the rest (as rp_main_params)
  const order = ['xmin', 'xmax', 'trig_mode', 'trig_source', 'trig_edge', 'trig_delay', 'trig_level', 'single_btn', 'time_range',
                 'time_units', 'en_avg_at_dec', 'auto_flag', 'min_y', 'max_y', 'forcex_flag'];
  const srvP = {};
  for(const k of order) if(k in P0) srvP[k] = P0[k];
  for(const k in P0) if(!(k in srvP)) srvP[k] = P0[k];
  const srv = new Server(srvP);
  const local = Object.assign({}, srvP, page.stale || {});   // params.local of the page (may hold stale values)

  const ls = {}, errors = [], timers = [];
  const el = { data: () => true, removeClass() { return el; }, addClass() { return el; }, prop() { return el; }, val() { return el; },
               text() { return el; }, length: 0, closest() { return el; } };
  const units = Array.from({ length: 8 }, () => ({ innerText: '' }));
  const sb = {
    console: { log() {}, info() {}, warn() {}, error() {} }, Math, Number, JSON, isFinite, isNaN, Object, Array, Date, String,
    localStorage: ls, Storage: function() {},
    params: { local: Object.assign({}, local), original: Object.assign({}, srvP), storage: [] },
    display_keep_keys: [], state_transient_zero: [], load_config_block_start: 1, config_storage_key: 'k',
    user_editing: false, sending: false, send_que: false, single_que: false, send_que_all: false, control_lost: false,
    post_min_gap_ms: 200, last_post_end: 0, post_starts: [], post_max_per_s: 10, post_rate_timer: null, post_rate_args: null,
    use_long_timeout: false, long_timeout: 10000, post_chunk_timeout: 2000, post_chunk_retries: 2, unsent_base: null,
    downloading: false, post_inflight: 0, post_url: '/data', post_max_bytes: 600, last_unit_mode: 0, app_id: 'lock_in+pid_harmonic',
    plotOpts: { xaxes: [ { min: page.win[0], max: page.win[1] } ], yaxes: [ {}, {} ] },
    setTimeout: (f, ms) => { timers.push(f); return 1; },
  };
  sb.params.local.lock_osc_raw_mode = 0;
  sb.plot = { getOptions: () => sb.plotOpts, setupGrid() {}, draw() {} };
  sb.$ = function(sel) { return sel === '#measure >>>> span.unit' ? units : el; };
  Object.assign(sb.$, { extend: Object.assign, isPlainObject: o => o !== null && typeof o === 'object', isEmptyObject: o => !Object.keys(o).length,
    Deferred: syncDeferred,
    ajax(o) { const d = syncDeferred(); const body = JSON.parse(o.data); d.resolve(srv.set(body.datasets.params)); return d; } });
  sb.config_storage_read = () => ls[sb.config_storage_key] || '';
  sb.lockCaptureEnd = () => false;
  sb.uiPrefsSet = () => {};
  sb.postEnd = () => {};
  sb.saveState = () => {};
  sb.updateTriggerSlider = () => {};
  sb.updateGraphData = () => {};
  sb.editFocusActive = () => false;
  sb.showModalError = (m) => errors.push(m);
  sb.loadParams = function(orig) {              // the parts of loadParams() that matter here (see part 1)
    for(const k in sb.params.local) if(orig[k] === undefined || orig[k] === null) orig[k] = sb.params.local[k];
    const o = sb.plot.getOptions();
    if(o.xaxes[0].min && o.xaxes[0].max) { orig.xmin = o.xaxes[0].min; orig.xmax = o.xaxes[0].max; }
    sb.params.original = Object.assign({}, orig);
    sb.params.local = Object.assign({}, orig);
  };
  vm.createContext(sb);
  const fns = ['timeUnitFactor', 'lockSetXWindow', 'configWindowSeconds', 'config_load_storage', 'sendParams', 'splitParams',
               'postParamsChunks', 'isParamChanged', 'hasRealChange', 'sendableValue', 'isSendable', 'updateTimeUnits', 'configLoadApplyX'];
  const opt = ['configWindowSeconds', 'configLoadApplyX', 'hasRealChange', 'sendableValue', 'isSendable'];
  let src = ['always_send_params', 'last_send_params', 'send_all_skip', 'config_load_x_pending'].map(varSrc).join('\n');
  src += fns.map(f => fnSrc(f, !opt.includes(f))).join('\n');
  vm.runInContext(src, sb);

  sb.localStorage[sb.config_storage_key] = JSON.stringify([ { name: 'c', datetime: '', data: Object.assign({}, cfg) } ]);
  sb.config_load_storage('c');
  for(let t = 0; t < 5 && timers.length; t++) timers.shift()();
  // one GET /data poll (doGetData(): loadParams() if not editing, forceX into the axes)
  const ans = Object.assign({}, srv.P);
  if(!sb.user_editing) sb.loadParams(Object.assign({}, ans), true);
  else sb.updateTimeUnits(ans);
  if(ans.forcex_flag == 1) { sb.plotOpts.xaxes[0].min = ans.xmin; sb.plotOpts.xaxes[0].max = ans.xmax; }

  const S = srv.P, fS = Math.pow(10, 3 * (2 - S.time_units));
  const L = sb.params.local, fL = Math.pow(10, 3 * (2 - L.time_units));
  const ax = sb.plotOpts.xaxes[0];
  const sent_bad = srv.posts.some(c => ['forcex_flag', 'time_units', 'time_range', 'gui_xmin', 'gui_xmax'].some(k => k in c));
  const chunks = srv.posts.length;
  const fxk = srv.posts.findIndex(c => 'forcex_flag' in c);
  const checks = [
    [near(S.xmin / fS, exp_s[0]) && near(S.xmax / fS, exp_s[1]), `server ${S.xmin.toPrecision(7)}..${S.xmax.toPrecision(7)} ${U[S.time_units]}`],
    [L.time_units === S.time_units && near(L.xmin / fL, exp_s[0]) && near(L.xmax / fL, exp_s[1]),
     `page ${Number(L.xmin).toPrecision(7)}..${Number(L.xmax).toPrecision(7)} ${U[L.time_units]}`],
    [near(ax.min, L.xmin) && near(ax.max, L.xmax), `axes ${Number(ax.min).toPrecision(7)}..${Number(ax.max).toPrecision(7)}`],
    [!sent_bad, `${chunks} chunks, forcex_flag in chunk ${fxk < 0 ? '-' : fxk + 1}`],
    [!errors.length, `errors ${errors.length}`],
  ];
  const ok = checks.every(c => c[0]);
  n++; if(!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name + ': ' + checks.map(c => (c[0] ? '' : '!') + c[1]).join(', '));
}

const lmCfg = Object.assign({}, lockMode);
const cfgUs = Object.assign({}, lockMode, { xmin: 0, xmax: 131, time_units: 0, time_range: 0, gui_xmin: 0, gui_xmax: 131 });
race('R1 testAgent: page in us 10..120 (forcex_flag 0) -> load lock_mode (ms)', { tu: 0, win: [10, 120] }, lmCfg, lmS);
race('R2 page in us 0..131 -> load lock_mode (ms)', { tu: 0, win: [0, 131] }, lmCfg, lmS);
race('R3 page in us 10..120 with forcex_flag 1 left in params.local -> lock_mode', { tu: 0, win: [10, 120], stale: { forcex_flag: 1 } }, lmCfg, lmS);
race('R4 page in ms 1..30 -> load a config in us (0..131)', { tu: 1, win: [1, 30] }, cfgUs, [0, 131e-6]);
race('R5 page in s 1..5 -> load lock_mode (ms)', { tu: 2, win: [1, 5] }, lmCfg, lmS);
race('R6 page in ms 1..30 -> load lock_mode (ms, no unit change)', { tu: 1, win: [1, 30] }, lmCfg, lmS);

console.log(`${n - fails}/${n} ok` + (OLD ? ' (--old)' : ''));
process.exit(fails ? 1 : 0);
