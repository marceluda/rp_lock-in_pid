#!/usr/bin/env node
// v2.3.18: simulation of small UI fixes (ported from lock_in+pid_harmonic v2.3.18), with functions taken from index.html and a mocked
// jQuery/DOM:
//   1. Mouse wheel on Ramp period / limits (ScrollIncrement()): the tau/f text below the field is updated (it kept the
//      old value: lock_ramp_step_update() only ran on 'input' events). Also the PID / modulation / lock trigger fields.
//   2. X+ of the plot range (updateRanges()): goes up to the longest window of the scope (68.72 s, decimation 524288),
//      it stopped at 10 s.
//   3. Labels of "Signal for trigger" 6-8 (lock_in+pid: sqXo/sqYo/sqFo, real signals; no code text).
// (Config -> load without read-only keys: test/config_load_window_sim.js; Single poll and the console message of
//  Capture Lock: test/lock_capture_ui_sim.js, part 7.)
//
// Usage:  node test/minor_ui_sim.js [index.html]      (exit code 1 if a check fails; an older page fails)
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
function fnSrc(name) { const i = js.indexOf('function ' + name + '('); return i < 0 ? '' : braceFrom(i); }
function varSrc(name) {
  const m = new RegExp('var ' + name + '\\s*=\\s*').exec(js);
  if(!m) return '';
  const j = m.index + m[0].length;
  if(js[j] == '{') return braceFrom(m.index) + ';';
  return js.slice(m.index, js.indexOf(';', j) + 1);
}

// ---- mocked DOM / jQuery ---------------------------------------------------------------------------------
const elems = {};
function attr(id, a) {
  const m = html.match(new RegExp('<input[^>]*id="' + id + '"[^>]*>'));
  if(!m) return undefined;
  const v = m[0].match(new RegExp('\\s' + a + '="([^"]*)"'));
  return v ? v[1] : undefined;
}
function E(id) {
  if(!elems[id]) elems[id] = { id, value: '', html: '', prop: {}, data: {}, tip: { options: { title: '' } } };
  return elems[id];
}
function jq(sel) {
  const id = String(sel).replace(/^#/, '');
  const e = E(id);
  const o = {
    0: e,
    val(v) { if(v === undefined) return e.value; e.value = String(v); return o; },
    html(v) { if(v === undefined) return e.html; e.html = String(v); return o; },
    prop(k, v) { if(v === undefined) return e.prop[k]; e.prop[k] = v; return o; },
    attr(a) { return attr(id, a); },
    data(k) {
      if(k && typeof k == 'object') { Object.assign(e.data, k); return o; }
      if(k == 'bs.tooltip') return e.tip;
      return e.data[k];
    },
    addClass() { return o; }, removeClass() { return o; }, parent() { return o; },
  };
  return o;
}
jq.isNumeric = v => !isNaN(parseFloat(v)) && isFinite(v);

let fails = 0, n = 0;
function check(name, cond, extra) {
  n++;
  console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra ? '  [' + extra + ']' : ''));
  if(!cond) fails++;
}

// ---- 1. wheel -> text ------------------------------------------------------------------------------------
{
  const sent = [];
  const ctx = {
    $: jq, console, Math, Number, parseFloat, parseInt, isNaN, isFinite, String,
    params: { local: { lock_ramp_step: 400, lock_ramp_low_lim: -5000, lock_ramp_hig_lim: 5000, lock_ramp_B_factor: 4096,
                       lock_ramp_sawtooth: 0, lock_pidA_kp: -500 } },
    input_unit_parsers: {}, editTimerCancel() {}, numberInputValue: (id, v) => Number(v),
    sendParams() { sent.push(Object.assign({}, ctx.params.local)); },
    parseLocalFloat: v => parseFloat(String(v).replace(',', '.')),
  };
  vm.createContext(ctx);
  let src = varSrc('units') + '\nvar wheel_text_update = {};\n';
  src += 'var ramp_step, lock_ramp_low_lim, lock_ramp_hig_lim, lock_ramp_B_factor, lock_ramp_sawtooth, period, oom, val, txt;\n';
  src += fnSrc('lock_ramp_step_update') + '\n';
  // the other updaters are counted (their own texts are not checked here)
  src += 'var calls = {};\n';
  for(const f of ['lock_ctrl_update', 'lock_modulation_update', 'lock_pidA_update', 'lock_pidB_update'])
    src += 'function ' + f + '() { calls.' + f + ' = (calls.' + f + ' || 0) + 1; }\n';
  const wi = js.indexOf('    wheel_text_update = {');
  if(wi >= 0) src += braceFrom(wi) + ';\n';
  src += 'var ScrollIncrement = ' + braceFrom(js.indexOf('function(event, delta)', js.indexOf('var ScrollIncrement = function'))) + ';\n';
  src += 'this.__get = function(e) { return eval(e); };';
  vm.runInContext(src, ctx);
  const get = e => ctx.__get(e);
  const set = (id, v) => E(id).value = String(v);
  set('lock_ramp_step', 400); set('lock_ramp_low_lim', -5000); set('lock_ramp_hig_lim', 5000); set('lock_ramp_B_factor', 4096);
  set('lock_ramp_sawtooth', 0); set('lock_pidA_kp', -500);
  get('lock_ramp_step_update')();
  const t0 = E('lock_ramp_step_text').html;
  const wheel = (id, up, shift) => get('ScrollIncrement')({ currentTarget: { id }, deltaY: up ? 1 : -1, deltaFactor: 1,
    shiftKey: !!shift, ctrlKey: false, preventDefault() {}, stopPropagation() {} }, up ? 1 : -1);
  wheel('lock_ramp_step', true, true);   // SHIFT: +10 -> 410
  const t1 = E('lock_ramp_step_text').html;
  // period = (hig - low) * (step + 1) * 8 ns * 2 = 10000 * 411 * 16 ns = 65.76 ms
  check('1.1 wheel on Ramp period (400 -> 410): value sent and tau/f text updated',
        sent.length == 1 && sent[0].lock_ramp_step == 410 && t1 !== t0 && /65\.76/.test(t1), t0.replace(/<[^>]+>|&nbsp;/g, ' ') + ' -> ' + t1.replace(/<[^>]+>|&nbsp;/g, ' '));
  wheel('lock_ramp_hig_lim', false, true);  // 5000 -> 4990
  const t2 = E('lock_ramp_step_text').html;
  check('1.2 wheel on the high limit: tau/f updated too', E('lock_ramp_hig_lim').value == '4990' && t2 !== t1 && /65\.69/.test(t2),
        t2.replace(/<[^>]+>|&nbsp;/g, ' '));
  wheel('lock_pidA_kp', true);
  wheel('lock_lock_trig_time_val', true);
  wheel('lock_gen_mod_hp', true);
  const c = get('calls');
  check('1.3 wheel on kp / Time trigger / modulation period: their text updaters run',
        c.lock_pidA_update == 1 && c.lock_ctrl_update == 1 && c.lock_modulation_update == 1, JSON.stringify(c));
}

// ---- 2. X+ range ------------------------------------------------------------------------------------------
{
  const ctx = { $: jq, Math, Number, parseFloat, params: { local: { time_units: 2 }, original: { gui_reset_y_range: 2 } } };
  let axes = { min: 0, max: 10 };
  ctx.plot = { getAxes: () => ({ xaxis: axes, yaxis: { min: -1, max: 1 } }) };
  vm.createContext(ctx);
  vm.runInContext(varSrc('range_steps') + '\n' + fnSrc('updateRanges') + '\n' + fnSrc('getNearestRanges'), ctx);
  const plus = (lo, hi) => { axes = { min: lo, max: hi }; ctx.updateRanges(); return { dis: !!E('range_x_plus').prop.disabled, next: E('range_x_plus').data.nearest }; };
  const r10 = plus(0, 10), r20 = plus(-5, 15), r50 = plus(-15, 35);
  check('2.1 X+ at 10 s: enabled, next 20 s', !r10.dis && r10.next == 20, JSON.stringify(r10));
  check('2.2 X+ at 20 s: enabled, next 50 s', !r20.dis && r20.next == 50, JSON.stringify(r20));
  check('2.3 X+ at 50 s: disabled (100 s > 68.72 s, the longest window)', r50.dis && r50.next === null, JSON.stringify(r50));
}

// ---- 3. labels -------------------------------------------------------------------------------------------
{
  const sel = (html.match(/<select id="lock_lock_trig_sw"[\s\S]*?<\/select>/) || [''])[0];
  // lock_in+pid: options 6-8 are real signals (sqXo/sqYo/sqFo of the square lock-in): the labels stay
  check('3.1 "Signal for trigger" 6-8: sqXo, sqYo, sqFo (real signals in this App); no code text in the page',
        /value="6">sqXo</.test(sel) && /value="7">sqYo</.test(sel) && /value="8">sqFo</.test(sel) && !/14'b0/.test(html));
}

console.log(`${n - fails}/${n} ok`);
process.exit(fails ? 1 : 0);
