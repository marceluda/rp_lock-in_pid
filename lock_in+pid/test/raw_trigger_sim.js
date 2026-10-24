#!/usr/bin/env node
// v2.2.14: units of the scope trigger level in Raw Mode (ADC counts), port of the fix of rp_dummy2 1.0.1 (CP6.1).
// Before, the page converted the level with the volts scale also in Raw Mode and limited it to +-gui_reset_y_range/2
// (+-1 count), and the controller took the counts as volts (100 counts -> threshold 8191: Normal / Single never
// triggered for a level other than 0; the threshold registers are checked in test/auto_set_c_sim, section 11).
// Real code of index.html: the [RAW TRIGGER] block (trigRaw, trigLevelScale, trigLevelLimits, pageToTrigLevel,
// trigLevelToPage, trigLevelText, rawCountsPerVolt, trigLevelForRaw), the blur handler of the Level field, the click
// handler of the Raw Mode button and config_load_storage() (with mocked jQuery / plot / server); static checks of the
// other places of the page that convert the level and of src/main.c, src/worker.c, src/fpga.c.
//
// Usage:  node test/raw_trigger_sim.js [index.html]   (default ../index.html, sources in ../src; exit code 1 on failure)
//         With the index.html of an older version the checks fail (they do not stop the test).
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--')) || path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const js = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const srcDir = path.join(__dirname, '..', 'src');
const readSrc = n => { try { return fs.readFileSync(path.join(srcDir, n), 'utf8'); } catch(e) { return ''; } };
const mainc = readSrc('main.c'), workerc = readSrc('worker.c'), fpgac = readSrc('fpga.c');

function braceFrom(i) {
  let d = 0;
  for(let k = js.indexOf('{', i); k < js.length; k++) {
    if(js[k] == '{') d++;
    else if(js[k] == '}' && --d == 0) return js.slice(i, k + 1);
  }
  return '';
}
function fnSrc(name) { const i = js.indexOf('function ' + name + '('); return i < 0 ? '' : braceFrom(i); }
function blockSrc(tag) {
  const a = js.indexOf('// [' + tag + ' BEGIN]'), b = js.indexOf('// [' + tag + ' END]');
  return (a < 0 || b < 0) ? '' : js.slice(a, b);
}
function handlerAfter(marker, ev) {   // anonymous handler of .on(ev, function() {...}) after marker
  const i = js.indexOf(marker);
  if(i < 0) return '';
  const j = js.indexOf(".on('" + ev + "', function", i);
  return j < 0 ? '' : braceFrom(js.indexOf('function', j));
}
function varSrc(name) {
  const m = js.match(new RegExp('\\n\\s*var ' + name + ' = [\\s\\S]*?;\\s*(//.*)?\\n'));
  return m ? m[0] : '';
}

let fails = 0, n = 0;
function check(name, ok, info) {
  n++;
  if(!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info !== undefined ? '  [' + info + ']' : ''));
}
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-9);
function guard(f) { try { return f(); } catch(e) { return 'exception: ' + e.message; } }

// ---- pure functions --------------------------------------------------------------------------------------------
const ctx = { console: { log() {}, info() {}, debug() {} }, Math, Number, isFinite };
vm.createContext(ctx);
vm.runInContext(blockSrc('RAW TRIGGER') + '\nthis.__get = function(e){return eval(e)};', ctx);
const F = nm => { try { return ctx.__get(nm); } catch(e) { return () => NaN; } };

// typical server values (scale 1, full scale ~1.08 V)
const V = { trig_source: 0, scale_ch1: 1, scale_ch2: 1, gui_reset_y_range: 2.167, lock_osc_raw_mode: 0 };
const R = Object.assign({}, V, { lock_osc_raw_mode: 1 });
const V10 = Object.assign({}, V, { scale_ch1: 10, scale_ch2: 1, gui_reset_y_range: 21.67 });   // probe x10 on CH1
const fs1 = V.gui_reset_y_range / 2;

console.log('--- 1. volts mode: unchanged (level shown = trig_level * scale of the trigger channel)');
check('1.1 page 0.25 V -> trig_level 0.25 -> page 0.25', near(F('pageToTrigLevel')(0.25, V), 0.25) && near(F('trigLevelToPage')(0.25, V), 0.25));
check('1.2 probe x10 on CH1: page 2.5 V -> trig_level 0.25', near(F('pageToTrigLevel')(2.5, V10), 0.25), F('pageToTrigLevel')(2.5, V10));
check('1.3 probe x10 on CH1, source CH2: scale of CH2 (1)', near(F('pageToTrigLevel')(2.5, Object.assign({}, V10, { trig_source: 1 })), 2.5));
check('1.4 limits +-gui_reset_y_range/2', JSON.stringify(F('trigLevelLimits')(V)) == JSON.stringify([-1.0835, 1.0835]), F('trigLevelLimits')(V));
check('1.5 the limits of the server values (2nd argument) win', F('trigLevelLimits')(V, V10)[1] == 10.835);
check('1.6 beyond the full scale: limited before sending (5 V -> 1.0835)', near(F('pageToTrigLevel')(5, V, V), 1.0835));
check('1.7 the field shows the value as before (no rounding in volts)', F('trigLevelText')(0.000244140625, V) === 0.000244140625);

console.log('--- 2. Raw Mode: ADC counts as they are');
check('2.1 page 100 counts -> trig_level 100 -> page 100 (before: 100 / scale, limited to +-1)',
      F('pageToTrigLevel')(100, R, V) === 100 && F('trigLevelToPage')(100, R) === 100);
check('2.2 no probe scale (probe x10 on CH1)', F('pageToTrigLevel')(100, Object.assign({}, V10, { lock_osc_raw_mode: 1 })) === 100);
check('2.3 rounded to whole counts', F('pageToTrigLevel')(100.4, R) === 100 && F('pageToTrigLevel')(-3.6, R) === -4);
check('2.4 limits -8192..8191 (before: +-1)', JSON.stringify(F('trigLevelLimits')(R, V)) == JSON.stringify([-8192, 8191]));
check('2.5 beyond the range: limited before sending (9000 -> 8191, -9000 -> -8192)',
      F('pageToTrigLevel')(9000, R, V) === 8191 && F('pageToTrigLevel')(-9000, R, V) === -8192);
check('2.6 the field shows whole counts (AUTO level 12.5 -> 13, as the controller rounds it)', F('trigLevelText')(12.5, R) === 13 && F('trigLevelText')(-3, R) === -3);

console.log('--- 3. switching Raw Mode converts the level: counts = V_norm * 8192 / full scale at gain 1');
const c01 = F('trigLevelForRaw')(0.1, V, true);
check('3.1 volts -> raw: 0.1 V -> ' + c01 + ' counts', c01 === Math.round(0.1 * 8192 / fs1), c01);
check('3.2 raw -> volts: back to ~0.1 V', near(F('trigLevelForRaw')(c01, R, false), 0.1, 1e-4), F('trigLevelForRaw')(c01, R, false));
check('3.3 probe x10: the same counts for the same normalized level', F('trigLevelForRaw')(0.1, V10, true) === c01, F('trigLevelForRaw')(0.1, V10, true));
check('3.4 beyond the full scale: 8191 / -8192', F('trigLevelForRaw')(5, V, true) === 8191 && F('trigLevelForRaw')(-5, V, true) === -8192);
check('3.5 bad values: 0; no server values: 1 V full scale', F('trigLevelForRaw')(NaN, V, true) === 0 && F('trigLevelForRaw')(0.1, {}, true) === 819);

// ---- the Level field (real blur handler) --------------------------------------------------------------------------
console.log('--- 4. the Level field');
function levelField(local, original, text) {
  const s = { calls: { send: 0, slider: 0 } };
  const input = { v: String(text) };
  const inputW = { val(x) { if(x === undefined) return input.v; input.v = String(x); return inputW; },
                   parent() { return { addClass() {}, removeClass() {} }; } };
  const other = { hide() { return other; }, show() { return other; }, parent() { return { addClass() {}, removeClass() {} }; } };
  const sb = {
    Math, Number, isFinite, isNaN, parseFloat, String, console: { log() {} },
    params: { local: Object.assign({}, local), original: Object.assign({}, original) }, user_editing: true,
    $: x => (x === input ? inputW : other),
    updateTriggerSlider: () => { s.calls.slider++; }, redrawPlot: () => {}, sendParams: () => { s.calls.send++; },
  };
  vm.createContext(sb);
  vm.runInContext(blockSrc('RAW TRIGGER') + '\n' + ['parseLocalFloat', 'floatToLocalString', 'getLocalDecimalSeparator']
    .map(fnSrc).join('\n') + '\nvar onBlur = ' + handlerAfter("$('#trig_level')", 'blur') + ';', sb);
  vm.runInContext('onBlur', sb).call(input);
  return { level: sb.params.local.trig_level, shown: input.v, sent: s.calls.send };
}
{
  let r = guard(() => levelField(R, V, '100'));
  check('4.1 Raw: typing 100 -> trig_level 100, the field shows 100, one send', r.level === 100 && r.shown === '100' && r.sent === 1, JSON.stringify(r));
  r = guard(() => levelField(R, V, '-3000'));
  check('4.2 Raw: typing -3000 -> trig_level -3000', r.level === -3000 && r.shown === '-3000', JSON.stringify(r));
  r = guard(() => levelField(R, V, '9000'));
  check('4.3 Raw: typing 9000 -> 8191 (limited, shown)', r.level === 8191 && r.shown === '8191', JSON.stringify(r));
  r = guard(() => levelField(V, V, '0.25'));
  check('4.4 volts: typing 0.25 -> trig_level 0.25 (as before)', r.level === 0.25 && r.sent === 1, JSON.stringify(r));
  r = guard(() => levelField(V10, V10, '2.5'));
  check('4.5 volts, probe x10: typing 2.5 V -> trig_level 0.25', near(r.level, 0.25), JSON.stringify(r));
  r = guard(() => levelField(Object.assign({}, R, { trig_level: 77 }), V, 'abc'));
  check('4.6 Raw: not a number -> the field shows the level again (77), nothing sent', r.shown === '77' && r.sent === 0, JSON.stringify(r));
}

// ---- the Raw Mode button (real click handler) ---------------------------------------------------------------------
console.log('--- 5. the Raw Mode button');
function rawButton(local, id, clicks) {
  const s = { rescale: 0, sends: [] };
  const btn = { id: id, primary: !!Number(local[id]) };
  const btnW = { toggleClass() { btn.primary = !btn.primary; return btnW; }, is(sel) { return sel === '.btn-primary' ? btn.primary : false; } };
  const sb = {
    Math, Number, isFinite, console: { log() {} },
    params: { local: Object.assign({}, local), original: Object.assign({}, local) },
    $: x => (x === btn ? btnW : {}),
    rawModeRescaleY: () => { s.rescale++; },
    sendParams: () => { s.sends.push(Object.assign({}, sb.params.local)); },
  };
  vm.createContext(sb);
  vm.runInContext(blockSrc('RAW TRIGGER') + '\nvar onClick = ' + handlerAfter("var input_buttons = '#lock_osc_raw_mode", 'click') + ';', sb);
  const h = vm.runInContext('onClick', sb);
  const levels = [];
  for(let i = 0; i < clicks; i++) { h.call(btn); levels.push(sb.params.local.trig_level); }
  return { levels, rescale: s.rescale, sends: s.sends };
}
{
  let r = guard(() => rawButton(Object.assign({}, V, { trig_level: 0.1 }), 'lock_osc_raw_mode', 2));
  check('5.1 V -> Raw: level 0.1 V -> ' + (r.levels && r.levels[0]) + ' counts, sent with lock_osc_raw_mode 1, Y rescaled',
        r.levels && r.levels[0] === c01 && r.sends[0].lock_osc_raw_mode === 1 && r.sends[0].trig_level === c01 && r.rescale >= 1, JSON.stringify(r));
  check('5.2 Raw -> V: back to ~0.1 V', r.levels && near(r.levels[1], 0.1, 1e-4) && r.sends[1].lock_osc_raw_mode === 0, JSON.stringify(r && r.levels));
  r = guard(() => rawButton(Object.assign({}, V, { trig_level: 0.1, lock_osc_lockin_mode: 0 }), 'lock_osc_lockin_mode', 1));
  check('5.3 another button (lock-in mode): the level is not converted', r.levels && r.levels[0] === 0.1 && r.rescale === 0, JSON.stringify(r));
}

// ---- config load (real config_load_storage()): Y in the units of the config, once; the level is not converted --------
console.log('--- 6. Config -> load');
function configLoad(cur, cfg) {
  const s = { rescale: 0, sent: 0 };
  const ls = {};
  const sb = {
    console: { log() {}, info() {}, warn() {}, debug() {} }, Math, Number, JSON, isFinite, Object, Array, String,
    localStorage: ls, Storage: function() {},
    params: { local: Object.assign({}, cur), original: Object.assign({}, cur), storage: [] },
    display_keep_keys: [], state_transient_zero: [], load_config_block_start: 0,
    config_storage_key: 'lockConfig_test', user_editing: false, sending: false, unsent_base: null,
    config_load_x_pending: false,
    $: { extend: Object.assign, isPlainObject: o => o !== null && typeof o === 'object' },
    lockCaptureEnd: () => false, uiPrefsSet: () => {}, oscUsrConfigLoad: () => false,
    lockSetXWindow: () => {},
    rawModeRescaleY: () => { s.rescale++; },
    sendParams: () => { s.sent++; },
  };
  sb.config_storage_read = () => ls[sb.config_storage_key] || '';
  // loadParams(): config values over the current ones (keys missing in the config keep the current value)
  sb.loadParams = function(orig) {
    for(const k in sb.params.local) if(orig[k] === undefined || orig[k] === null) orig[k] = sb.params.local[k];
    sb.params.original = Object.assign({}, orig);
    sb.params.local = Object.assign({}, orig);
  };
  vm.createContext(sb);
  vm.runInContext(['timeUnitFactor', 'configWindowSeconds', 'config_load_storage'].map(fnSrc).join('\n'), sb);
  ls[sb.config_storage_key] = JSON.stringify([ { name: 'c', datetime: '', data: cfg } ]);
  vm.runInContext('config_load_storage("c")', sb);
  return { level: sb.params.local.trig_level, raw: sb.params.local.lock_osc_raw_mode, rescale: s.rescale, sent: s.sent };
}
{
  const cfgR = { trig_level: 100, lock_osc_raw_mode: 1, trig_mode: 1, xmin: 0, xmax: 130, time_units: 0 };
  const cfgV = { trig_level: 0.1, lock_osc_raw_mode: 0, trig_mode: 1, xmin: 0, xmax: 130, time_units: 0 };
  let r = guard(() => configLoad(Object.assign({}, V, { trig_level: 0.2 }), cfgR));
  check('6.1 V + config in Raw: Y rescaled once (to +-8192), level 100 counts as saved (not converted)',
        r.rescale === 1 && r.level === 100 && r.raw === 1 && r.sent === 1, JSON.stringify(r));
  r = guard(() => configLoad(Object.assign({}, R, { trig_level: 50 }), cfgV));
  check('6.2 Raw + config in V: Y rescaled once (to +-1 V), level 0.1 V as saved', r.rescale === 1 && r.level === 0.1 && r.raw === 0, JSON.stringify(r));
  r = guard(() => configLoad(Object.assign({}, R, { trig_level: 50 }), cfgR));
  check('6.3 Raw + config in Raw: Y not touched (keeps the zoom)', r.rescale === 0 && r.level === 100, JSON.stringify(r));
  r = guard(() => configLoad(Object.assign({}, V, { trig_level: 0.2 }), { trig_level: 0.3, trig_mode: 1 }));
  check('6.4 config without lock_osc_raw_mode (older): mode kept, Y not touched', r.rescale === 0 && r.raw === 0 && r.level === 0.3, JSON.stringify(r));
}

// ---- static checks of the page ------------------------------------------------------------------------------------
console.log('--- 7. other places of the page (code checks)');
check('7.1 no "trig_level * scale" / "/ scale" conversion of the level left', !/trig_level\s*\*\s*scale|tlev\s*\/\s*scale|\)\s*\/\s*scale;/.test(js));
check('7.2 updateTriggerSlider(): limits from trigLevelLimits(), level from trigLevelToPage(), whole counts in the field',
      /trigLevelLimits\(params\.local, params\.original\)/.test(fnSrc('updateTriggerSlider')) && /trigLevelToPage\(/.test(fnSrc('updateTriggerSlider')) &&
      /trigRaw\(params\.local\) \? Math\.round\(tlev\)/.test(fnSrc('updateTriggerSlider')));
check('7.3 trigger line of the plot (addTriggerDataSet) in page units', /trigLevelToPage\(params\.local\.trig_level, params\.local\)/.test(fnSrc('addTriggerDataSet')));
check('7.4 end of the slider drag (mouseUpOut) through pageToTrigLevel() with the server limits', /pageToTrigLevel\([\s\S]*params\.original\)/.test(fnSrc('mouseUpOut')));
check('7.5 drag tooltip in whole counts in Raw Mode', /trigRaw\(params\.local\)/.test(fnSrc('mouseDownMove')));
check('7.6 loadParams(): the field through trigLevelText()', /trigLevelText\(params\.original\.trig_level, params\.original\)/.test(fnSrc('loadParams')));
check('7.7 the unit of the Level field follows Raw Mode (counts / V)', /#trig_lev_units'\)\.text\([^)]*lock_osc_raw_mode[^)]*\? 'counts' : 'V'\)/.test(fnSrc('updateTimeUnits')));
check('7.8 initPlot(): Y +-8192 when the App starts in Raw Mode', /lock_osc_raw_mode\)\) ymax = 8192/.test(fnSrc('initPlot')));
check('7.9 the Raw Mode button converts the level (trigLevelForRaw) before rawModeRescaleY()', /lock_osc_raw_mode'\) \{[\s\S]{0,300}trigLevelForRaw\([\s\S]{0,120}rawModeRescaleY\(\)/.test(js));

// ---- static checks of the controller --------------------------------------------------------------------------------
console.log('--- 8. controller (code checks; the behaviour: test/auto_set_c_sim section 11, the conversion: test/trig_level_test.c)');
const lim = name => (mainc.match(new RegExp('"' + name + '",\\s*\\d+,\\s*\\d+,\\s*\\d+,\\s*(-?\\d+),\\s*\\+?(-?\\d+)')) || []).slice(1).map(Number);
check('8.1 src/main.c: min_y/max_y(_norm) limits +-20000 (AUTO in Raw: +-8192 * 1.2 was clipped to +-1000)',
      ['min_y', 'max_y', 'min_y_norm', 'max_y_norm'].every(k => lim(k)[0] <= -9831 && lim(k)[1] >= 9831), ['min_y', 'max_y_norm'].map(lim));
check('8.2 src/main.c: Y range of the auto-set not scaled in Raw Mode', /LOCK_OSC_RAW_MODE\][\s\S]{0,40}scale = 1/.test(mainc));
check('8.3 src/worker.c: the acquisition path passes rp_osc_trig_level_v() to osc_fpga_update_params()',
      /curr_params\[MIN_GUI_PARAM\]\.value,\s*rp_osc_trig_level_v\(curr_params,/.test(workerc) && !/curr_params\[TRIG_LEVEL_PARAM\]\.value,\s*curr_params\[TIME_RANGE_PARAM\]/.test(workerc));
check('8.4 src/worker.c: AUTO with the calibration offset in both modes', /trig_level_v = osc_fpga_cnv_cnt_to_trig_v\(trig_level, max_adc_v, calib_dc_off, 0\)/.test(workerc) &&
      !/trig_level_v = \(\(\(trig_level\) \* max_adc_v\)/.test(workerc));
check('8.5 src/fpga.c: osc_fpga_cnv_cnt_to_trig_v()', /float osc_fpga_cnv_cnt_to_trig_v\(/.test(fpgac));

console.log(fails ? 'FAILED ' + fails + ' (' + (n - fails) + '/' + n + ')' : 'ALL OK (' + n + '/' + n + ')');
process.exit(fails ? 1 : 0);
