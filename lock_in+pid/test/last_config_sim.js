#!/usr/bin/env node
// Simulation of the [LAST CONFIG] options (lock_in+pid_harmonic 2.3.27, lock_in+pid 2.2.12, _hf 2.3.17, _harmonic2 2.4.10,
// _square 2.0.6) of the Config dialog ([LAST CONFIG] of index.html):
//  - "Load last config on init" (#load_last_on_init): checked by default, kept in localStorage. Checked, each time the
//    App is opened (started by the page) it restores the last state saved automatically by the page (saveState(), now
//    also in localStorage); unchecked, it starts with the defaults (def_params only).
//  - "Load last config" / "Reset to defaults": close the modal and restart the App (reload) with that restore.
//  - Restart (took control and the other Restart buttons) and the automatic restarts still restore the tab's state.
//  - The hold: opened with the defaults, the last state is not overwritten until the user changes something.
//  - Order of the panels of the left column: Lock Control right below Outputs.
//
// Real code of index.html: the [LAST CONFIG] block, the key variables, saveState(), loadSavedState(), restoreState(),
// resumeApp(), isRestorePending()/setRestorePending(), the HTML of the modal and of the left panel.
// Mocked: jQuery, localStorage/sessionStorage, postParamsChunks() (synchronous), startApp(), location.reload().
//
// Usage:  node test/last_config_sim.js [index.html]    (exit code 1 if a check fails; with the index.html of 2.3.26
//         previous version it fails: the block does not exist)
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');

const args = process.argv.slice(2);
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
function fnSrc(name, optional) {
  const i = js.indexOf('function ' + name + '(');
  if(i < 0 && optional) return '';
  if(i < 0) throw new Error('function not found: ' + name);
  return braceFrom(i);
}
function varSrc(name) {
  const m = js.match(new RegExp('\\n\\s*var ' + name + '\\s*=[\\s\\S]*?;[^\\n]*\\n'));
  if(!m) throw new Error('var not found: ' + name);
  return m[0];
}
function blockSrc(tag) {
  const a = js.indexOf('[' + tag + ' BEGIN]'), b = js.indexOf('[' + tag + ' END]');
  if(a < 0 || b < 0) throw new Error('block not found: ' + tag);
  return js.slice(js.indexOf('\n', a), b).replace(/\n[^\n]*$/, '\n');
}

const APP = (js.match(/var app_id = '([^']+)'/) || [])[1];
const STREAM = /function initStreamIp\(/.test(js);     // lock_in+pid has no streaming
let fails = 0, n = 0;
function check(name, ok, info) {
  n++; if(!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + info : ''));
}

// ---- 1. HTML ----------------------------------------------------------------------------------------------------------
const modal = (html.match(/<div id="modal_config"[\s\S]*?id="btn_close_config"/) || [''])[0];
const inp = (modal.match(/<input[^>]*id="load_last_on_init"[^>]*>/) || [''])[0];
check('1.1 checkbox "Load last config on init" in the Config modal', !!inp && /Load last config on init/.test(modal));
check('1.2 checked in the HTML, autocomplete="off"', /\schecked\b/.test(inp) && /autocomplete="off"/.test(inp), inp);
check('1.3 buttons "Load last config" and "Reset to defaults" in the Config modal',
      /id="btn_load_last_config"[^>]*>Load last config</.test(modal) && /id="btn_reset_defaults"[^>]*>Reset to defaults</.test(modal));
check('1.4 "Don\'t turn on PIDs and Ramp on config loading" still there', /id="load_config_block_start"/.test(modal));
const left = html.slice(html.indexOf("id='leftpanel'"), html.indexOf('id="accordion"'));
const order = [...left.matchAll(/data-toggle="collapse" href="#(scope_panel|out_panel|lock-in-module|gen_ramp|lock_pids|lock_ctrl|streaming-module)"/g)].map(m => m[1]);
const want = 'scope_panel,out_panel,lock_ctrl,lock-in-module,gen_ramp,lock_pids' + (/href="#streaming-module"/.test(html) ? ',streaming-module' : '');
check('1.5 left column: Oscilloscope, Outputs, Lock Control, Lock-in, Ramp, PIDs' + (want.includes('streaming') ? ', Streaming' : ''),
      order.join() == want, order.join(' '));
check('1.6 handlers: checkbox from/to localStorage, buttons -> lastConfigRestart()',
      /\$\('#load_last_on_init'\)\.prop\('checked', loadOnInitGet\(\)\)\.on\('change'/.test(js) &&
      /#btn_load_last_config'\)\.on\('click', function\(\) \{ lastConfigRestart\('last'\)/.test(js) &&
      /#btn_reset_defaults'\s*\)\.on\('click', function\(\) \{ lastConfigRestart\('defaults'\)/.test(js));
check('1.7 startApp() restores with startRestoreMode()', /restoreState\(startRestoreMode\(\)\)/.test(fnSrc('startApp')));

// ---- page model ---------------------------------------------------------------------------------------------------------
function mkStorage(o) {
  const st = o || {};
  return { st, getItem: k => (k in st ? st[k] : null), setItem: (k, v) => { st[k] = String(v); }, removeItem: k => { delete st[k]; } };
}
const KEYS = ['xmin', 'xmax', 'time_units', 'trig_mode', 'en_avg_at_dec', 'lock_pidA_kp', 'lock_ramp_enable',
              'lock_ctrl_aux_ramp_enable_ctrl', 'lock_ctrl_aux_pidA_enable_ctrl', 'lock_ctrl_aux_pidB_enable_ctrl',
              'lock_ctrl_aux_lock_now', 'lock_ctrl_aux_launch_lock_trig', 'lock_stream_cmd', 'lock_stream_ip', 'trig_delay'];
const DEF = { xmin: 0, xmax: 131, time_units: 0, trig_mode: 0, en_avg_at_dec: 1, lock_pidA_kp: 0, lock_ramp_enable: 0,
              lock_ctrl_aux_ramp_enable_ctrl: 1, lock_ctrl_aux_pidA_enable_ctrl: 1, lock_ctrl_aux_pidB_enable_ctrl: 1,
              lock_ctrl_aux_lock_now: 0, lock_ctrl_aux_launch_lock_trig: 0, lock_stream_cmd: 0, lock_stream_ip: 0, trig_delay: 0 };

// One page load. ls / ss: the storages (ls shared by all the pages, ss of the tab). server: the server params.
function page(ls, ss, server) {
  const sb = {
    console: { log() {}, info() {}, warn() {} }, Math, Number, JSON, isFinite, Object, Array, Date,
    localStorage: ls, sessionStorage: ss, app_id: APP,
    config_params_keys: KEYS.slice(), load_config_block_start: 0, stream_ip_exact: 0, last_state_save: 0,
    post_chunk_timeout: 1, post_chunk_retries: 0, app_started: false, control_lost: false, auto_restarts: 0,
    app_check_pending: true, posted: [], reloads: 0, modal_hidden: 0, started: [], ui: { ip: '' },
  };
  const dom = {
    '#lock_stream_ip': { val(v) { if(v !== undefined) sb.ui.ip = v; return dom['#lock_stream_ip']; } },
    '#modal_config':   { modal(a) { if(a == 'hide') sb.modal_hidden++; } },
  };
  sb.$ = sel => dom[sel] || { val() {}, prop() { return this; }, on() { return this; }, modal() {} };
  sb.$.extend = function() { return Object.assign.apply(null, arguments); };
  sb.$.get = () => ({ fail() {} });
  sb.location = { reload() { sb.reloads++; } };
  const sync = v => ({ then(f) { const r = f(v); return (r && r.then) ? r : sync(r); }, done(f) { f(v); return this; }, fail() { return this; } });
  sb.postParamsChunks = function(chunks) {
    const p = Object.assign({}, ...chunks);
    sb.posted.push(p);
    for(const k in p) if(k in server) server[k] = p[k];
    return sync({ datasets: { params: Object.assign({}, server) } });
  };
  sb.splitParams = p => [p];
  sb.uiPrefsGet = () => ({ ui_capture_lock: 1, ui_fire_on_click: 1 });
  sb.uiPrefsSet = () => {};
  sb.lockCaptureSavedScope = () => null;
  sb.updateGraphData = () => {};
  sb.readStreamIp = () => {};
  sb.showModalError = m => { sb.error = m; };
  sb.probeApp = () => ({ done(f) { f(sb.loaded); } });
  sb.startApp = (a, id, force) => { sb.started.push({ id, force: force === true }); };
  vm.createContext(sb);
  const src = ['def_params', 'state_key', 'state_transient_zero', 'restore_pending_key', 'last_state_key', 'load_on_init_key',
               'start_mode_key', 'last_hold_key', 'last_hold_skip', 'page_start_done'].map(varSrc).join('') +
              blockSrc('LAST CONFIG') +
              ['isRestorePending', 'setRestorePending', 'loadSavedState', 'validStreamIp', 'timeUnitFactor', 'saveState',
               'restoreState', 'resumeApp'].map(f => fnSrc(f, f == 'validStreamIp')).join('\n');
  vm.runInContext(src, sb);
  // page start: the App is not loaded (or it is) -> startApp() -> probe OK -> restoreState(startRestoreMode())
  sb.open = function(loaded) {
    sb.loaded = loaded ? sb.app_id : '';
    sb.resumeApp();
    if(!loaded) sb.restoreState(sb.startRestoreMode());
  };
  sb.get = () => sb.saveState(Object.assign({}, server), true);   // a GET /data answer
  return sb;
}
const fresh = () => Object.assign({}, DEF);
const USER = { xmin: 0, xmax: 64, time_units: 1, trig_mode: 1, lock_pidA_kp: -250, lock_ramp_enable: 1,
               lock_ctrl_aux_pidA_enable_ctrl: 1, lock_ctrl_aux_lock_now: 1 };
const sess = (ss, ls) => JSON.parse(ss.getItem('lockin_state_' + APP) || 'null');
const last = ls => JSON.parse(ls.getItem('lockin_last_state_' + APP) || 'null');

// ---- 2. checkbox default and persistence ------------------------------------------------------------------------------
let ls = mkStorage(), ss = mkStorage(), srv = fresh(), pg = page(ls, ss, srv);
check('2.1 never set: checked', pg.loadOnInitGet() === true);
pg.loadOnInitSet(false);
check('2.2 unchecked: stored as "0" in localStorage, own key', ls.getItem('lockin_load_last_on_init_' + APP) === '0');
check('2.3 another page load reads it unchecked', page(ls, mkStorage(), fresh()).loadOnInitGet() === false);
pg.loadOnInitSet(true);
check('2.4 checked again: "1"', page(ls, mkStorage(), fresh()).loadOnInitGet() === true);

// ---- 3. checked: open restores the last state (also in a new tab) -----------------------------------------------------
ls = mkStorage(); ss = mkStorage(); srv = fresh(); pg = page(ls, ss, srv);
pg.open(false);
// what a start with the defaults posts: def_params + the transient commands at 0
const defPost = pg => { const o = Object.assign({}, pg.def_params); for(const k of pg.state_transient_zero) o[k] = 0; return o; };
const DEFKEYS = Object.keys(defPost(pg)).sort().join();
check('3.1 nothing saved yet: def_params only', JSON.stringify(pg.posted[0]) == JSON.stringify(defPost(pg)), JSON.stringify(pg.posted[0]));
Object.assign(srv, USER); pg.get();
check('3.2 saveState() writes the tab state and the last state (localStorage)', sess(ss) && last(ls) && last(ls).lock_pidA_kp == -250 &&
      last(ls).lock_ctrl_aux_lock_now === undefined);
const ss2 = mkStorage(), srv2 = fresh(), pg2 = page(ls, ss2, srv2);   // new tab, App not loaded (closed / other App)
pg2.open(false);
check('3.3 new tab, checked: last state restored (kp -250, ramp on, PID A on, lock request 0)',
      srv2.lock_pidA_kp == -250 && srv2.lock_ramp_enable == 1 && srv2.lock_ctrl_aux_pidA_enable_ctrl == 1 && srv2.lock_ctrl_aux_lock_now == 0,
      JSON.stringify(pg2.posted[0]));
check('3.4 the restored state is now the state of the new tab', sess(ss2) && sess(ss2).lock_pidA_kp == -250);
const pg3 = page(ls, mkStorage(), srv2); pg3.load_config_block_start = 1; pg3.open(false);
check('3.5 with "Don\'t turn on PIDs and Ramp" checked: ramp and PIDs off', srv2.lock_ramp_enable == 0 &&
      srv2.lock_ctrl_aux_pidA_enable_ctrl == 0 && srv2.lock_ctrl_aux_ramp_enable_ctrl == 0);

// ---- 4. unchecked: open with defaults, the last state is kept ---------------------------------------------------------
pg2.loadOnInitSet(false);
const ss4 = mkStorage({ ['lockin_state_' + APP]: JSON.stringify(Object.assign({}, USER, { state_stream_ip: 167772170 })) });
const srv4 = fresh(), pg4 = page(ls, ss4, srv4);
pg4.stream_ip_exact = 167772170; pg4.ui.ip = '10.0.0.10';     // initStreamIp() of the old tab state
pg4.open(false);
check('4.1 unchecked: only def_params (+ transient 0) posted, server keeps its defaults',
      Object.keys(pg4.posted[0]).sort().join() == DEFKEYS &&
      srv4.lock_pidA_kp == 0 && srv4.lock_ramp_enable == 0, JSON.stringify(pg4.posted[0]));
check('4.2 also with a tab state (F5 / same tab): not restored; tab state = defaults (no IP), IP input cleared',
      sess(ss4) && sess(ss4).lock_pidA_kp == 0 && sess(ss4).state_stream_ip === undefined &&
      (!STREAM || (pg4.stream_ip_exact == 0 && pg4.ui.ip === '')), JSON.stringify(sess(ss4)));
pg4.get(); pg4.get();
check('4.3 hold: saveState() of the defaults does not overwrite the last state', last(ls).lock_pidA_kp == -250,
      'last kp ' + last(ls).lock_pidA_kp);
const pg4b = page(ls, mkStorage(), srv4); pg4b.open(true); pg4b.get();
check('4.4 another tab with the App running (no restore) keeps the hold too', last(ls).lock_pidA_kp == -250);
srv4.xmax = 500; srv4.time_units = 1; srv4.trig_delay = 7; pg4.get();
check('4.5 zoom only (time window / derived values): still held', last(ls).lock_pidA_kp == -250);
srv4.lock_pidA_kp = 12; pg4.get();
check('4.6 a user change releases the hold: it is the last state now', last(ls).lock_pidA_kp == 12 &&
      ls.getItem('lockin_last_hold_' + APP) === null);

// ---- 5. buttons: close the modal, restart the App with the restore --------------------------------------------------
ls = mkStorage(); ss = mkStorage(); srv = fresh(); pg = page(ls, ss, srv);
pg.loadOnInitSet(false); pg.open(false); Object.assign(srv, USER); pg.get();     // last state: USER
const savedLast = JSON.stringify(last(ls));
pg.lastConfigRestart('defaults');
check('5.1 Reset to defaults: modal hidden, page reloaded', pg.modal_hidden == 1 && pg.reloads == 1);
let srv5 = fresh(), pg5 = page(ls, ss, srv5); pg5.loadOnInitSet(true);   // even with the checkbox checked
pg5.open(false);
check('5.2 Reset to defaults: App started with def_params only (ramp/PIDs/kp defaults, no lock request)',
      srv5.lock_pidA_kp == 0 && srv5.lock_ramp_enable == 0 && srv5.lock_ctrl_aux_lock_now == 0 &&
      Object.keys(pg5.posted[0]).sort().join() == DEFKEYS, JSON.stringify(pg5.posted[0]));
pg5.get();
check('5.3 Reset to defaults keeps the last state', JSON.stringify(last(ls)) == savedLast);
pg5.lastConfigRestart('last');
check('5.4 Load last config: modal hidden, page reloaded', pg5.modal_hidden == 1 && pg5.reloads == 1);
pg5.loadOnInitSet(false);                                                  // even with the checkbox unchecked
let srv6 = fresh(), pg6 = page(ls, ss, srv6); pg6.open(false);
check('5.5 Load last config: last state restored', srv6.lock_pidA_kp == -250 && srv6.lock_ramp_enable == 1 &&
      srv6.lock_ctrl_aux_lock_now == 0, JSON.stringify(pg6.posted[0]));
check('5.6 the start mode is used once', ss.getItem('lockin_start_mode_' + APP) === null);
// App still loaded after the reload (no stop on unload): stopped and started again
pg6.lastConfigRestart('defaults');
const pg7 = page(ls, ss, srv6); pg7.open(true);
check('5.7 App still loaded: resumeApp() stops and starts it (force_stop)', pg7.started.length == 1 && pg7.started[0].force);
Object.assign(srv6, fresh());                                             // the stop/start: server with its defaults
pg7.restoreState(pg7.startRestoreMode());
check('5.8 ... and then starts it with the defaults', srv6.lock_pidA_kp == 0 && Object.keys(pg7.posted[0]).sort().join() == DEFKEYS);

// ---- 6. Restart / recoveries restore the tab state ------------------------------------------------------------------
ls = mkStorage(); ss = mkStorage(); srv = fresh(); pg = page(ls, ss, srv);
pg.loadOnInitSet(false); pg.open(false); Object.assign(srv, USER); pg.get();
pg.startModeSet('session');                                               // .btn-app-restart (not took control)
let srv8 = fresh(), pg8 = page(ls, ss, srv8); pg8.open(false);
check('6.1 Restart (error modal), unchecked: tab state restored', srv8.lock_pidA_kp == -250 && srv8.lock_ramp_enable == 1);
pg8.setRestorePending(true);                                               // took control -> Restart
let srv9 = fresh(), pg9 = page(ls, ss, srv9); pg9.open(false);
check('6.2 Restart after "took control", unchecked: tab state restored', srv9.lock_pidA_kp == -250);
pg9.setRestorePending(true);
let srv10 = Object.assign(fresh(), { lock_pidA_kp: 99 }), pg10 = page(ls, ss, srv10); pg10.open(true);
check('6.3 took control by another tab of this App (still loaded): tab state restored, no stop/start',
      srv10.lock_pidA_kp == -250 && pg10.started.length == 0);
let srv11 = Object.assign(fresh(), { lock_pidA_kp: 99 }), pg11 = page(ls, ss, srv11); pg11.open(true);
check('6.4 App already running (another tab / F5 without stop): its state is kept, nothing posted',
      pg11.posted.length == 0 && srv11.lock_pidA_kp == 99 && pg11.started.length == 0);
pg11.restoreState(pg11.startRestoreMode());                               // later: worker died, startApp() from GET /data
check('6.5 automatic restart after the page start: tab state (not the defaults)', srv11.lock_pidA_kp == -250);

console.log('=== ' + n + ' checks, ' + fails + ' failed ===');
process.exit(fails ? 1 : 0);
