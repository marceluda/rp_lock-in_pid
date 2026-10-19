#!/usr/bin/env node
// Simulation of the option "Don't turn on PIDs and Ramp on config loading" (#load_config_block_start).
// Since lock_in+pid_harmonic 2.3.26 (lock_in+pid 2.2.11, _hf 2.3.16, _harmonic2 2.4.9, _square 2.0.5) it is unchecked by
// default: Config -> load (and Load file, which goes through the same load) and the restore after a (Re)start bring back
// the ramp, Scan enable and the PIDs as they are in the config / saved state. Checked, they stay off as before.
// The lock requests (lock_now / launch_lock_trig) and the other transient commands are always 0.
//
// Real code of index.html: the initial value of load_config_block_start, the <input> of the checkbox,
// config_load_storage() (+ timeUnitFactor, lockSetXWindow, configWindowSeconds) and restoreState().
// Mocked: jQuery, localStorage/sessionStorage, the plot, loadParams(), sendParams(), postParamsChunks().
//
// Usage:  node test/config_load_block_sim.js [index.html]    (exit code 1 if a check fails; with the index.html of the
//         previous version checks 1.x and 2.1 / 3.1 fail: the option was checked by default)
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
function fnSrc(name, required) {
  const i = js.indexOf('function ' + name + '(');
  if(i < 0 && required) throw new Error('function not found: ' + name);
  return i < 0 ? '' : braceFrom(i);
}
function varSrc(name) { const m = js.match(new RegExp('\\n\\s*var ' + name + ' = [\\s\\S]*?;[^\\n]*\\n')); return m ? m[0] : ''; }

let fails = 0, n = 0;
function check(name, ok, info) {
  n++; if(!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + info : ''));
}

const ENABLES = ['lock_ctrl_aux_ramp_enable_ctrl', 'lock_ctrl_aux_pidA_enable_ctrl', 'lock_ctrl_aux_pidB_enable_ctrl', 'lock_ramp_enable'];
const REQUESTS = ['lock_ctrl_aux_lock_now', 'lock_ctrl_aux_launch_lock_trig'];
const show = o => [...ENABLES, ...REQUESTS].map(k => k.replace('lock_ctrl_aux_', '').replace('_enable_ctrl', '') + '=' + o[k]).join(' ');

// ---- 1. default of the option --------------------------------------------------------------------------------------
const mInit = js.match(/\n\s*load_config_block_start\s*=\s*([01])\s*;/);
const initVal = mInit ? Number(mInit[1]) : NaN;
const mInput = html.match(/<input[^>]*id="load_config_block_start"[^>]*>/);
const input = mInput ? mInput[0] : '';
check('1.1 load_config_block_start starts at 0', initVal === 0, 'initial value ' + initVal);
check('1.2 the checkbox is not checked in the HTML', !!input && !/\schecked\b/.test(input), input);
check('1.3 autocomplete="off" (the browser does not restore an old checked state on reload)', /autocomplete="off"/.test(input));
check('1.4 variable synced from the checkbox when the handlers are set',
      /load_config_block_start\s*=\s*\(\$\('#load_config_block_start'\)\.is\(':checked'\)\s*\?\s*1\s*:\s*0\)\s*;\s*\/\//.test(js));

// ---- 2. Config -> load ---------------------------------------------------------------------------------------------
const transient = (() => { const s = varSrc('state_transient_zero'); const c = {}; vm.createContext(c); vm.runInContext(s, c);
                          return c.state_transient_zero || []; })();
function configLoad(block, cfg) {
  const ls = {};
  const sb = {
    console: { log() {}, info() {}, warn() {} }, Math, Number, JSON, isFinite, Object, Array,
    localStorage: ls, Storage: function() {},
    params: { local: null, original: null, storage: [] },
    display_keep_keys: [], state_transient_zero: transient, load_config_block_start: block,
    config_storage_key: 'lockConfig_test', user_editing: false, sending: false, unsent_base: null,
    plotOpts: { xaxes: [ { min: 0, max: 64 } ] }, sent: null,
  };
  sb.plot = { getOptions: () => sb.plotOpts, setupGrid() {}, draw() {} };
  sb.$ = { extend: Object.assign, isPlainObject: o => o !== null && typeof o === 'object' };
  sb.config_storage_read = () => ls[sb.config_storage_key] || '';
  sb.lockCaptureEnd = () => false;
  sb.uiPrefsSet = () => {};
  sb.oscUsrConfigLoad = () => false;
  sb.loadParams = function(orig) {
    for(const k in sb.params.local) if(orig[k] === undefined || orig[k] === null) orig[k] = sb.params.local[k];
    sb.params.original = Object.assign({}, orig);
    sb.params.local = Object.assign({}, orig);
  };
  sb.sendParams = function() { sb.sent = Object.assign({}, sb.params.local); };
  // current state of the page: everything off
  const cur = { xmin: 0, xmax: 64, time_units: 1, trig_mode: 1, lock_stream_cmd: 0 };
  for(const k of [...ENABLES, ...REQUESTS]) cur[k] = 0;
  sb.params.local = Object.assign({}, cur);
  sb.params.original = Object.assign({}, cur);
  vm.createContext(sb);
  vm.runInContext(['timeUnitFactor', 'lockSetXWindow', 'configWindowSeconds', 'config_load_storage']
    .map(f => fnSrc(f, f == 'config_load_storage')).join('\n'), sb);
  ls[sb.config_storage_key] = JSON.stringify([ { name: 'c', datetime: '', data: cfg } ]);
  sb.config_load_storage('c');
  return sb.sent || {};
}
// a config saved while scanning with PID A on (and, from an old page, lock requests set)
const cfgScan = { xmin: 0, xmax: 64, time_units: 1, trig_mode: 1, lock_kp: 3,
                  lock_ctrl_aux_ramp_enable_ctrl: 1, lock_ctrl_aux_pidA_enable_ctrl: 1, lock_ctrl_aux_pidB_enable_ctrl: 0,
                  lock_ramp_enable: 1, lock_ctrl_aux_lock_now: 1, lock_ctrl_aux_launch_lock_trig: 1, lock_stream_cmd: 1 };
let s = configLoad(isNaN(initVal) ? 1 : initVal, Object.assign({}, cfgScan));
check('2.1 default: Config load restores ramp, Scan enable, PID A as saved (PID B stays off as saved)',
      s.lock_ctrl_aux_ramp_enable_ctrl == 1 && s.lock_ramp_enable == 1 && s.lock_ctrl_aux_pidA_enable_ctrl == 1 &&
      s.lock_ctrl_aux_pidB_enable_ctrl == 0, show(s));
check('2.2 default: lock requests and stream_cmd are never loaded', REQUESTS.every(k => s[k] == 0) &&
      (!transient.includes('lock_stream_cmd') || s.lock_stream_cmd == 0), show(s));
s = configLoad(1, Object.assign({}, cfgScan));
check('2.3 checked: Config load keeps ramp, Scan enable and PIDs off', [...ENABLES, ...REQUESTS].every(k => s[k] == 0), show(s));
s = configLoad(isNaN(initVal) ? 1 : initVal, Object.assign({}, cfgScan, { lock_ctrl_aux_ramp_enable_ctrl: 0, lock_ramp_enable: 0,
               lock_ctrl_aux_pidA_enable_ctrl: 0 }));
check('2.4 default: a config saved with everything off loads with everything off', [...ENABLES, ...REQUESTS].every(k => s[k] == 0), show(s));

// ---- 3. restore after a (Re)start (restoreState()) ------------------------------------------------------------------
function restore(block, saved) {
  let posted = null;
  const stub = { then() { return stub; }, done() { return stub; }, fail() { return stub; } };
  const sb = {
    console: { log() {}, info() {}, warn() {} }, Math, Number, JSON, isFinite, Object, Array,
    def_params: { lock_kp: 0, lock_ctrl_aux_ramp_enable_ctrl: 0, lock_ramp_enable: 0 },
    state_transient_zero: transient, load_config_block_start: block, post_chunk_timeout: 1, post_chunk_retries: 0,
  };
  sb.$ = { extend: Object.assign, get() { return stub; } };
  sb.loadSavedState = () => Object.assign({}, saved);
  sb.uiPrefsSet = () => {};
  sb.validStreamIp = () => 0;
  sb.setRestorePending = () => {};
  sb.splitParams = p => [p];
  sb.postParamsChunks = chunks => { posted = Object.assign({}, chunks[0]); return stub; };
  vm.createContext(sb);
  vm.runInContext(fnSrc('restoreState', true), sb);
  sb.restoreState();
  return posted || {};
}
s = restore(isNaN(initVal) ? 1 : initVal, Object.assign({}, cfgScan));
check('3.1 default: Restart restores ramp, Scan enable, PID A as saved; lock requests 0',
      s.lock_ctrl_aux_ramp_enable_ctrl == 1 && s.lock_ramp_enable == 1 && s.lock_ctrl_aux_pidA_enable_ctrl == 1 &&
      REQUESTS.every(k => s[k] == 0), show(s));
s = restore(1, Object.assign({}, cfgScan));
check('3.2 checked: Restart keeps ramp, Scan enable and PIDs off', [...ENABLES, ...REQUESTS].every(k => s[k] == 0), show(s));

console.log('=== ' + n + ' checks, ' + fails + ' failed ===');
process.exit(fails ? 1 : 0);
