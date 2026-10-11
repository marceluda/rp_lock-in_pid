#!/usr/bin/env node
// Simulation of the "Time trigger" / "Level trigger" fields of lock_in+pid_harmonic (v2.3.16): functions taken
// from index.html (lock_ctrl_update, numberInputBlur/Input/Keydown, ScrollIncrement, parsers), with a mocked
// jQuery/DOM. The browser behaviour of <input type="number"> is modelled: .val() gives '' when the text is not a
// valid number (e.g. a pasted "19 s"); the type of each input is read from the HTML.
//
// Usage:  node test/trig_input_units_sim.js [index.html]          (exit code 1 if a check fails)
//         node test/trig_input_units_sim.js <old index.html> --old  (v2.3.15: prints the observed behaviour)
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
function fnSrc(name) { const i = js.indexOf('function ' + name + '('); return i < 0 ? '' : braceFrom(i); }
function varSrc(name) {   // var name = ...; (also object literals over several lines)
  const m = new RegExp('var ' + name + '\\s*=\\s*').exec(js);
  if(!m) return '';
  const j = m.index + m[0].length;
  if(js[j] == '{') return braceFrom(m.index) + ';';
  return js.slice(m.index, js.indexOf(';', j) + 1);
}
function inputType(id) {
  const m = html.match(new RegExp('<input[^>]*type="([a-z]+)"[^>]*id="' + id + '"'));
  return m ? m[1] : 'text';
}

// ---- mocked DOM / jQuery ---------------------------------------------------------------------------------
const elems = {};
function el(id) {
  if(!elems[id]) elems[id] = { id: id, type: inputType(id), raw: '0', html: '', cls: new Set(),
                               attrs: { max: '4294967295', min: '-8192' } };
  return elems[id];
}
el('lock_lock_trig_time_val').attrs = { min: '0', max: '4294967295' };
el('lock_lock_trig_val').attrs      = { min: '-8192', max: '8191' };
el('lock_pidA_kp').attrs            = { min: '-8192', max: '8191' };
el('lock_ctrl_aux_trig_type').raw = '1';
function browserVal(e) {     // value seen by the page (.val())
  if(e.type != 'number') return e.raw;
  const s = e.raw.trim();
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s) ? s : '';
}
function $(sel) {
  if(sel && sel.nodeType === 'mock') sel = '#' + sel.id;
  const ids = String(sel).split(',').map(s => s.trim().replace(/^#/, ''));
  const es = ids.map(el);
  const o = {
    0: es[0],
    val(v) { if(v === undefined) return browserVal(es[0]); es.forEach(e => e.raw = String(v)); return o; },
    html(v) { if(v === undefined) return es[0].html; es.forEach(e => e.html = String(v)); return o; },
    addClass(c) { es.forEach(e => e.cls.add(c)); return o; },
    removeClass(c) { es.forEach(e => String(c).split(' ').forEach(x => e.cls.delete(x))); return o; },
    attr(a) { return es[0].attrs[a]; },
    parent() { return o; },
    blur() { return o; },
  };
  return o;
}
$.isNumeric = function(v) { return !isNaN(parseFloat(v)) && isFinite(v); };
$.inArray = function(v, a) { return a.indexOf(v); };
const nodes = {};
function node(id) { return nodes[id] || (nodes[id] = { id: id, nodeType: 'mock' }); }   // same object per id (activeElement)

// ---- context ---------------------------------------------------------------------------------------------
let timers = [], now = 0, sent = [];
const ctx = {
  $: $, console: console, Math: Math, Number: Number, String: String, Object: Object, isNaN: isNaN, isFinite: isFinite,
  parseInt: parseInt, parseFloat: parseFloat,
  document: { activeElement: null },
  setTimeout(f, ms) { timers.push({ t: now + ms, f: f }); return timers.length; },
  clearTimeout(h) { if(timers[h - 1]) timers[h - 1].f = null; },
  sendParams() { sent.push(Object.assign({}, ctx.params.local)); },
  params: { local: { lock_lock_trig_time_val: 2072622, lock_lock_trig_val: 5085, lock_pidA_kp: -500 } },
  user_editing: false, text_param_editor: '', update_interval: 50,
};
vm.createContext(ctx);
const need = ['getLocalDecimalSeparator', 'parseLocalFloat', 'lock_ctrl_update', 'editTimerCancel', 'isEscapeKey',
              'editRefocusCheck', 'numberInputBlur', 'numberInputInput', 'numberInputKeydown'];
const needNew = ['parseUnitValue', 'parseTrigTime', 'parseTrigLevel', 'numberInputValue'];
let src = 'var edit_timers = {};\n' + varSrc('units') + '\n';
if(!OLD) src += varSrc('lock_trig_time_units') + '\n' + varSrc('lock_trig_level_units') + '\n';
for(const n of need.concat(OLD ? [] : needNew)) { const s = fnSrc(n); if(!s) throw new Error('not found: ' + n); src += s + '\n'; }
if(!OLD) src += varSrc('input_unit_parsers') + '\n';
src += 'var trig_time, trig_val, aux_trig_type;\n';
// v2.3.18: wheel_text_update (assigned in the page load handler): the real assignment, other updaters as stubs
src += 'var wheel_text_update = {};\nfunction lock_modulation_update() {}\nfunction lock_pidA_update() {}\n' +
       'function lock_pidB_update() {}\nfunction lock_ramp_step_update() {}\n';
{ const wi = js.indexOf('    wheel_text_update = {'); if(wi >= 0) src += braceFrom(wi) + ';\n'; }
const si = js.indexOf('var ScrollIncrement = function');
src += braceFrom(si) + ';\n';
// lock_ctrl_update() ends with the switch of the containers (the original code uses the globals of the page)
vm.runInContext(src, ctx);

function runTimers(ms) {
  now += ms;
  for(;;) {
    const due = timers.filter(t => t.f && t.t <= now).sort((a, b) => a.t - b.t)[0];
    if(!due) break;
    const f = due.f; due.f = null; f();
  }
}

// ---- user actions ----------------------------------------------------------------------------------------
function focus(id) { ctx.document.activeElement = node(id); ctx.text_param_editor = ''; }
function blur(id) { ctx.document.activeElement = null; vm.runInContext('numberInputBlur', ctx)(node(id), {}); }
function onInput(id) {   // 'input' handlers in the order of the page (lock_ctrl_update + numberInputInput)
  vm.runInContext('numberInputInput', ctx)(node(id));
  if(id == 'lock_lock_trig_time_val' || id == 'lock_lock_trig_val') ctx.lock_ctrl_update();
}
function type(id, text) {  // key by key (keydown + browser filtering of type=number + input event)
  for(const ch of text) {
    vm.runInContext('numberInputKeydown', ctx)(node(id), { key: ch, keyCode: 0, stopPropagation() {} });
    const e = el(id);
    if(e.type == 'number' && !/[0-9eE.,+-]/.test(ch)) continue;      // Chrome: letters / space not typed
    e.raw += ch; onInput(id);
  }
}
function clear(id) { el(id).raw = ''; vm.runInContext('numberInputKeydown', ctx)(node(id), { key: 'Backspace', keyCode: 8 }); onInput(id); }
function paste(id, text) { el(id).raw = text; onInput(id); }
function enter(id) { blur(id); }
function wheel(id, up) {
  vm.runInContext('ScrollIncrement', ctx)({ currentTarget: node(id), deltaY: up ? 1 : -1, deltaFactor: 1,
    shiftKey: false, ctrlKey: false, preventDefault() {}, stopPropagation() {} }, up ? 1 : -1);
}
function setField(id, v) { el(id).raw = String(v); ctx.params.local[id] = v; }

let fails = 0, n = 0;
function check(cond, msg) { n++; if(!cond) fails++; console.log((cond ? '  ok   ' : '  FAIL ') + msg); }
function obs(msg) { console.log('  ...  ' + msg); }
const T = 'lock_lock_trig_time_val', L = 'lock_lock_trig_val';
const lastSent = () => sent.length ? sent[sent.length - 1] : null;

console.log(`== ${path.basename(file)} ${OLD ? '(old, observed)' : ''}: Time trigger <input type="${inputType(T)}">, ` +
            `Level trigger <input type="${inputType(L)}">`);

// Case 1: type "20 s" + Enter
function caseTyped(text, expect, label) {
  setField(T, 2072622); sent = []; focus(T); el(T).raw = ''; type(T, text); runTimers(200); enter(T);
  const v = lastSent() ? lastSent()[T] : undefined;
  if(OLD) obs(`${label}: typed "${text}" -> sent ${JSON.stringify(sent.map(s => s[T]))}, field "${el(T).raw}", text "${el(T + '_text').html}"`);
  else check(v === expect && sent.length >= 1 && el(T).raw === String(expect),
             `${label}: typed "${text}" + Enter -> sent ${v} (expected ${expect}), field "${el(T).raw}", ${sent.length} send(s), "${el(T + '_text').html}"`);
}
caseTyped('20 s', 2500000000, 'time');
caseTyped('16.58 ms', 2072500, 'time');
caseTyped('16,58ms', 2072500, 'time comma, no space');
caseTyped('100 us', 12500, 'time us');
caseTyped('125 ns', 16, 'time ns (15.625 ticks -> 16)');
caseTyped('2500000000 ticks', 2500000000, 'time ticks');
caseTyped('3 ns', 1, 'time below one tick -> 1 (not 0 = OFF)');
caseTyped('100 \u00b5s', 12500, 'time micro sign');
caseTyped('2072622', 2072622, 'time plain ticks');
caseTyped('40 s', 4294967295, 'time above 2^32-1 -> clamped');
caseTyped('4294967296', 4294967295, 'time 2^32 -> clamped');

// Case 2: paste "19 s" (no key typed: numberInputInput sends after 100 ms)
setField(T, 2072622); sent = []; focus(T); paste(T, '19 s'); runTimers(150);
if(OLD) obs(`paste "19 s": sent ${JSON.stringify(sent.map(s => s[T]))}, field "${browserVal(el(T))}"`);
else check(sent.length == 1 && sent[0][T] === 2375000000, `paste "19 s" -> 1 send after 100 ms: ${JSON.stringify(sent.map(s => s[T]))}`);
blur(T);
if(OLD) obs(`  blur: sent ${JSON.stringify(sent.map(s => s[T]))}, params.local ${ctx.params.local[T]}`);
else check(ctx.params.local[T] === 2375000000 && el(T).raw === '2375000000', `  blur -> field "${el(T).raw}", params.local ${ctx.params.local[T]}`);

// Case 3: empty / invalid -> nothing sent, last value restored
for(const bad of ['', '   ', 'abc', '20 parsecs', '-5 ms', '1.2.3', '20 s s']) {
  setField(T, 2072622); sent = []; focus(T); if(bad === '') clear(T); else paste(T, bad); runTimers(150); blur(T);
  const zero = sent.some(s => s[T] === 0);
  if(OLD) obs(`"${bad}": sent ${JSON.stringify(sent.map(s => s[T]))}, field "${el(T).raw}"`);
  else check(sent.length == 0 && !zero && el(T).raw === '2072622' && ctx.params.local[T] === 2072622,
             `time "${bad}" -> ${sent.length} sends, field restored "${el(T).raw}"`);
}
// while typing: an incomplete or not valid text shows a hint, the field is not rewritten
setField(T, 2072622); focus(T); el(T).raw = ''; type(T, '20 m');
if(!OLD) check(el(T).raw === '20 m' && /text-danger/.test(el(T + '_text').html), `while typing "20 m": field kept, hint shown`);
type(T, 's');
if(!OLD) check(el(T).raw === '20 ms' && /20\.000&nbsp;ms/.test(el(T + '_text').html), `then "20 ms": T = 20.000 ms shown before Enter`);
enter(T);
if(!OLD) check(ctx.params.local[T] === 2500000, `  Enter -> 2500000`);

// Case 4: explicit 0 is still allowed (OFF)
setField(T, 2072622); sent = []; focus(T); el(T).raw = ''; type(T, '0'); enter(T);
if(!OLD) check(lastSent() && lastSent()[T] === 0 && / OFF /.test(el(T + '_text').html), `explicit "0" -> sends 0, "OFF"`);

// Case 5: comparison after the conversion (trig_time cached = 20 ticks, then "20 s")
setField(T, 20); ctx.lock_ctrl_update();
el(T).raw = '20 s'; ctx.lock_ctrl_update();
if(OLD) obs(`trig_time 20, field "20 s" -> text "${el(T + '_text').html}", field "${el(T).raw}"`);
else check(/20\.000(&nbsp;)+s</.test(el(T + '_text').html), `cached 20 ticks, field "20 s" -> "${el(T + '_text').html}"`);

// Case 6: level
function caseLevel(text, expect) {
  setField(L, 5085); sent = []; focus(L); el(L).raw = ''; type(L, text); runTimers(200); enter(L);
  const v = lastSent() ? lastSent()[L] : undefined;
  if(OLD) obs(`level "${text}" -> sent ${JSON.stringify(sent.map(s => s[L]))}, field "${el(L).raw}"`);
  else if(expect === null)
    check(sent.length == 0 && el(L).raw === '5085', `level "${text}" -> not sent, restored "${el(L).raw}"`);
  else check(v === expect && el(L).raw === String(expect), `level "${text}" -> ${v} (expected ${expect}), "${el(L + '_text').html}"`);
}
caseLevel('0.1 V', 819);
caseLevel('-50 mV', -410);
caseLevel('5085', 5085);
caseLevel('-8192', -8192);
caseLevel('2 V', 8191);
caseLevel('0,5V', 4096);
caseLevel('1 A', null);
setField(L, 5085); sent = []; focus(L); clear(L); runTimers(150); blur(L);
if(OLD) obs(`level emptied -> sent ${JSON.stringify(sent.map(s => s[L]))}`);
else check(sent.length == 0 && el(L).raw === '5085', `level emptied -> not sent, restored`);

// Case 7: mouse wheel on a field with units
setField(T, 2072500); el(T).raw = '16.58 ms'; sent = []; wheel(T, true);
if(!OLD) check(lastSent() && lastSent()[T] === 2072501 && el(T).raw === '2072501', `wheel up on "16.58 ms" -> ${lastSent() && lastSent()[T]}`);
setField(T, 2072500); el(T).raw = 'xx'; sent = []; wheel(T, false);
if(!OLD) check(lastSent() && lastSent()[T] === 2072499, `wheel down on a not valid text -> from the last value: ${lastSent() && lastSent()[T]}`);

// Case 8: Escape restores
setField(T, 2072622); focus(T); el(T).raw = '';  type(T, '19 s');
vm.runInContext('numberInputKeydown', ctx)(node(T), { key: 'Escape', keyCode: 27 }); blur(T);
if(!OLD) check(el(T).raw === '2072622' && ctx.params.local[T] === 2072622, `Escape -> restored "${el(T).raw}"`);

// Case 9: another number input (type=number), emptied with Backspace: no 0 sent any more
setField('lock_pidA_kp', -500); sent = []; focus('lock_pidA_kp'); clear('lock_pidA_kp'); runTimers(150); blur('lock_pidA_kp');
if(OLD) obs(`kp emptied with Backspace -> sent ${JSON.stringify(sent.map(s => s.lock_pidA_kp))}`);
else check(sent.length == 0 && el('lock_pidA_kp').raw === '-500', `kp emptied -> not sent, restored "${el('lock_pidA_kp').raw}"`);
setField('lock_pidA_kp', -500); sent = []; focus('lock_pidA_kp'); el('lock_pidA_kp').raw = ''; type('lock_pidA_kp', '-450'); enter('lock_pidA_kp');
if(!OLD) check(lastSent() && lastSent().lock_pidA_kp === -450, `kp typed -450 + Enter -> sent -450`);

console.log(OLD ? `== observed (old version)` : `== ${n - fails}/${n} ok`);
process.exit(fails ? 1 : 0);
