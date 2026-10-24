#!/usr/bin/env node
// v2.2.10 (port of lock_in+pid_harmonic v2.3.24): simulation of the presets of the scope signals (buttons below Ext Trig) and of the Ext Trig rule.
//   X|Y = Xo|Yo of the harmonic lock-in (22, 23); sqXo/sqYo (27, 28) are not in the fixed presets.
//   1. Presets in1|in2, in1|ctrl, X|Y, in1|err, ctrl|err: one click = ONE POST with OscA/OscB (lock_oscA_sw /
//      lock_oscB_sw, values of the options of the selects of the page) and nothing else that changes (only the
//      always_send_params single_btn/xmin/xmax with their current values): no trig_*, no Ext Trig, no zoom.
//   2. "usr": a click while it is not configured opens the modal (no POST); a double click (click, click, dblclick)
//      opens it once and does not send more than one POST; Accept saves the pair in localStorage, in the tooltip and in
//      the configs (Config save, download json: elem.ui, never in elem.data / the POSTs); Config load of a config with
//      the pair takes it (and stores it), an old config without it keeps the current one; page load reads localStorage.
//   3. Ext Trig changed by the user to a value that is not None: Trigger Source = External and Mode = Normal in the
//      same POST (from Auto, from Single: polling again); to None: nothing else changes; Config load of a config with
//      Ext Trig != None and Source/Mode Channel 1/Auto keeps the config values (the rule is only in the select handler).
//   4. HTML / binding checks (6 small buttons below Ext Trig, 3 blue + 3 green, titles, dblclick, static modal).
// Real functions of index.html: the [OSC PRESETS] block, onDropdownChange(), sendParams() -> splitParams() ->
// postParamsChunks(), loadParams(), doGetData(), runStop(), the [LOCK CAPTURE] block, config_save_storage(),
// config_save_file(), config_load_storage(), configWindowSeconds(), configLoadApplyX(). Mocked: jQuery/DOM (the options
// of the OscA select are read from the page), $.ajax (a server that keeps what it gets and answers all the params),
// localStorage, the plot (only its axes).
//
// Usage:  node test/osc_presets_sim.js [index.html]      (exit code 1 if a check fails; the page of 2.2.9 fails)
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
function varSrc(name) { const m = js.match(new RegExp('\\n\\s*var ' + name + ' = [\\s\\S]*?;\\s*(//.*)?\\n')); return m ? m[0] : ''; }
function blockSrc(tag) {
  const a = js.indexOf('// [' + tag + ' BEGIN]'), b = js.indexOf('// [' + tag + ' END]');
  return (a < 0 || b < 0) ? '' : js.slice(a, b);
}

// options of the OscA select of the page: value -> text
const selA = (html.match(/<select id="lock_oscA_sw"[\s\S]*?<\/select>/) || [''])[0];
const OPTS = {};
for(const m of selA.matchAll(/<option\s+value="(\d+)"[^>]*>([^<]*)<\/option>/g)) OPTS[m[1]] = m[2];
const optsHtml = Object.keys(OPTS).map(v => '<option value="' + v + '">' + OPTS[v] + '</option>').join('');
const valOf = name => Number(Object.keys(OPTS).find(v => OPTS[v] === name));

// ---- clock ----------------------------------------------------------------------------------------------------------
class Clock {
  constructor() { this.t = 1000; this.q = []; this.n = 0; }
  at(t, fn) { const id = ++this.n; this.q.push({ t: Math.max(t, this.t), fn, id }); return id; }
  after(d, fn) { return this.at(this.t + (d || 0), fn); }
  cancel(id) { this.q = this.q.filter(e => e.id !== id); }
  run(until) {
    for(let g = 0; g < 1000000; g++) {
      let bi = -1;
      for(let i = 0; i < this.q.length; i++)
        if(this.q[i].t <= until && (bi < 0 || this.q[i].t < this.q[bi].t || (this.q[i].t == this.q[bi].t && this.q[i].id < this.q[bi].id))) bi = i;
      if(bi < 0) break;
      const e = this.q.splice(bi, 1)[0];
      this.t = e.t; e.fn();
    }
    this.t = Math.max(this.t, until);
  }
}

// ---- environment ----------------------------------------------------------------------------------------------------
const BASE = { xmin: 0, xmax: 20, single_btn: 0, auto_flag: 0, forcex_flag: 0, time_units: 1, time_range: 3, trig_mode: 0,
  trig_source: 0, trig_edge: 0, trig_delay: 0, trig_level: 0, lock_trig_sw: 0, lock_oscA_sw: 1, lock_oscB_sw: 2,
  lock_osc_raw_mode: 0, lock_pidA_kp: 100, lock_lock_status: 0, lock_lock_control: 0, gui_xmin: 0, gui_xmax: 20 };

function makeEnv(init, ls) {
  const clock = new Clock(), dom = {}, log = [];
  const D = id => (dom[id] = dom[id] || { cls: new Set(), val: undefined, text: '', html: '', prop: {}, attr: {}, modal: [] });
  const el = sel => {
    sel = String(sel);
    const om = sel.match(/^#lock_osc[AB]_sw option\[value="(\d+)"\]$/);   // option of the OscA/OscB select
    if(om) { const t = OPTS[om[1]]; return { text() { return t === undefined ? '' : t; }, length: t === undefined ? 0 : 1 }; }
    const ids = sel.split(',').map(s => s.trim().replace(/^#/, '')).filter(s => s);
    const o = {
      val(v) { if(v === undefined) return D(ids[0]).val; ids.forEach(i => D(i).val = String(v)); return o; },
      prop(k, v) { if(v === undefined) return D(ids[0]).prop[k]; ids.forEach(i => D(i).prop[k] = v); return o; },
      attr(k, v) { if(v === undefined) return D(ids[0]).attr[k]; ids.forEach(i => D(i).attr[k] = v); return o; },
      html(v) { if(v === undefined) return (ids[0] === 'lock_oscA_sw' ? optsHtml : D(ids[0]).html); ids.forEach(i => D(i).html = String(v)); return o; },
      text(v) { if(v === undefined) return D(ids[0]).text; ids.forEach(i => D(i).text = String(v)); return o; },
      show() { return o; }, hide() { return o; }, data() { return o; }, focus() { return o; }, blur() { return o; },
      trigger() { return o; }, parent() { return o; }, closest() { return { length: 1 }; }, on() { return o; },
      find() { return o; }, not() { return o; }, tooltip() { return o; },
      modal(a) { ids.forEach(i => { D(i).modal.push(a); D(i).shown = (a === 'hide' ? false : (typeof a === 'object' ? a.show !== false : a === 'show' ? true : D(i).shown)); }); return o; },
      addClass(c) { ids.forEach(i => c.split(' ').forEach(x => D(i).cls.add(x))); return o; },
      removeClass(c) { ids.forEach(i => c.split(' ').forEach(x => D(i).cls.delete(x))); return o; },
      toggleClass() { return o; }, hasClass(c) { return D(ids[0]).cls.has(c); }, is() { return false; },
      length: 1, 0: (D(ids[0]).node = D(ids[0]).node || { download: '', href: '' }),
    };
    return o;
  };
  const $ = sel => (sel && typeof sel == 'object') ? el('#' + (sel.id || 'doc')) : el(sel);
  $.inArray = (v, a) => a.indexOf(v);
  $.trim = s => String(s).trim();
  $.extend = function () { let a = Array.from(arguments); if(a[0] === true) a = a.slice(1);
    const t = a[0]; for(let i = 1; i < a.length; i++) Object.assign(t, a[i] || {}); return t; };
  $.isPlainObject = o => o !== null && typeof o == 'object' && !Array.isArray(o);
  $.isEmptyObject = o => Object.keys(o).length == 0;
  $.isNumeric = v => !isNaN(parseFloat(v)) && isFinite(v);
  $.Deferred = function () {
    let st = null, a, dn = [], fl = [], al = [];
    const run = () => { (st == 'r' ? dn : fl).forEach(f => f.apply(null, a)); al.forEach(f => f.apply(null, a)); dn = []; fl = []; al = []; };
    const p = { done(f) { dn.push(f); if(st) run(); return p; }, fail(f) { fl.push(f); if(st) run(); return p; },
                always(f) { al.push(f); if(st) run(); return p; }, promise() { return p; },
                then(f) { const d2 = $.Deferred(); p.done((...x) => { const r = f(...x); if(r && r.done) r.done((...y) => d2.resolve(...y)); else d2.resolve(r); }); return d2.promise(); } };
    p.resolve = (...x) => { if(!st) { st = 'r'; a = x; run(); } return p; };
    p.reject = (...x) => { if(!st) { st = 'j'; a = x; run(); } return p; };
    return p;
  };
  const srv = Object.assign({}, BASE, init || {});
  let gets = 0;
  $.ajax = o => {
    const d = $.Deferred();
    if(o.type == 'POST') {
      const q = JSON.parse(o.data).datasets.params;
      log.push({ t: clock.t, kind: 'POST', q });
      clock.after(5, () => {
        for(const k in q) if(!['single_btn', 'time_units', 'time_range', 'forcex_flag', 'gui_xmin', 'gui_xmax'].includes(k)) srv[k] = q[k];
        const r = Object.assign({}, srv, { single_btn: 0 });
        d.resolve({ app: { id: 'lock_in+pid' }, status: 'OK', datasets: { params: r, g1: [] } });
      });
    }
    else {
      gets++;
      log.push({ t: clock.t, kind: 'GET' });
      clock.after(20, () => d.resolve({ app: { id: 'lock_in+pid' }, status: 'OK',
        datasets: { params: Object.assign({}, srv), g1: [{ data: [[0, 0]] }, { data: [[0, 0]] }] } }));
    }
    return d.promise();
  };
  const axes = { min: srv.xmin, max: srv.xmax }, yax = [{ min: -1, max: 1 }, { min: -1, max: 1 }];
  const plot = { getOptions() { return { xaxes: [axes], yaxes: yax }; }, setupGrid() {}, draw() {}, width() { return 500; },
                 setData() {}, getAxes() { return { xaxis: axes, yaxis: yax[0] }; } };
  const store = ls || {};
  if(!store.getItem) Object.defineProperties(store, {
    getItem:    { value(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; } },
    setItem:    { value(k, v) { store[k] = String(v); } },
    removeItem: { value(k) { delete store[k]; } } });
  const ctx = { $, console: { log(m) { log.push({ t: clock.t, kind: 'LOG', m: String(m) }); }, info() {}, warn() {} },
    Object, JSON, Math, Number, isFinite, isNaN, parseInt, parseFloat, String, Array, Date: Object.assign(function() { return new Date(); },
    { now: () => clock.t }), encodeURIComponent, alert() {}, Storage: function() {}, localStorage: store,
    setTimeout: (f, d) => clock.after(d, f), clearTimeout: id => clock.cancel(id),
    document: { activeElement: null }, plot, autorun: 1, refresh_counter: 0, meas_panel_dec: 5, trigger_just_set: false,
    last_unit_mode: 0, downloading: false, user_editing: false, control_lost: false, trig_dragging: false, last_get_failed: false,
    floatToLocalString: x => String(x), shortenFloat: x => x, convertHz: x => x, convertSec: x => x, parseLocalFloat: parseFloat,
    format_oom: (n, u) => String(n) + u,
    lock_ramp_step_update() {}, lock_modulation_update() {}, lock_ctrl_update() {}, lock_pidA_update() {}, lock_pidB_update() {},
    lpf_update() {}, display_update() {}, updateTriggerSlider() {}, saveState() {}, redrawPlot() {}, updateRanges() {}, initPlot() {},
    filterData: d => d, showModalError: m => log.push({ t: clock.t, kind: 'MODAL', m }), app_id: 'lock_in+pid',
    post_url: '/data', get_url: '/data', request_timeout: 10000, update_interval: 50, isEscapeKey: e => e.key == 'Escape',
    trigFromGraphMsg() {}, lockCaptureBanner() {}, lockCaptureClearPlot() {}, load_config_block_start: 1 };
  vm.createContext(ctx);
  let code = ['sending', 'send_que', 'send_que_all', 'single_que', 'use_long_timeout', 'readonly_keys', 'display_keep_keys', 'unsent_base',
    'unsent_skip_keys', 'always_send_params', 'last_send_params', 'post_chunk_timeout', 'post_chunk_retries', 'long_timeout',
    'post_min_gap_ms', 'post_max_per_s', 'post_starts', 'post_rate_timer', 'post_rate_args', 'lock_enable_keys', 'server_ro_keys',
    'single_poll_ms', 'single_seq', 'single_seq_done', 'send_all_skip', 'state_transient_zero', 'config_load_x_pending',
    'config_storage_key', 'config_storage_old_key'].map(varSrc).join('\n');
  code += '\nvar plot_epoch = 0, plot_epoch_post = false, server_scope_gen = null;\n';
  code += 'var params = {original:null, local:null, storage: []};\nvar post_max_bytes = 600;\nvar post_inflight = 0, last_post_end = 0;\n' +
          'var set_trigger_val = false, plot_time_units = null, update_timer = null, datasets = [];\n';
  const ct = (js.match(/config_params_txts = [\s\S]*?;\n/) || [''])[0];
  code += 'var ' + ct + 'var config_params_keys = config_params_txts.split(",");\n';
  code += ['scheduleSinglePoll', 'unsentChanges', 'loadParams', 'updateTimeUnits', 'isParamChanged', 'splitParams', 'postParamsChunks',
           'sendParams', 'postEnd', 'sendableValue', 'isSendable', 'hasRealChange', 'lockStatus', 'lockSetBtn', 'lock_status_display',
           'doGetData', 'runStop', 'singleUpdate', 'onDropdownChange', 'timeUnitFactor', 'config_storage_read', 'config_save_storage',
           'config_save_file', 'config_load_storage', 'configWindowSeconds', 'configLoadApplyX'].map(fnSrc).join('\n');
  // lock_in+pid_harmonic2: loadParams() calls warnNaSwitches() (console warning of the "(n/a)" options, DOM only)
  if(code.indexOf('function warnNaSwitches(') < 0) code += '\nfunction warnNaSwitches() {}\n';
  code += '\n' + blockSrc('LOCK CAPTURE') + '\n' + blockSrc('OSC PRESETS') + '\n';
  // v2.2.14: [RAW TRIGGER] block of the page (trigLevelText() etc., used by loadParams()); absent in older pages
  { const rb = js.indexOf('// [RAW TRIGGER BEGIN]'), re = js.indexOf('// [RAW TRIGGER END]');
    if(rb >= 0 && re > rb) code += '\n' + js.slice(rb, re) + '\n'; }
  code += '\nvar scope_stop = false;\nfunction updateGraphData() { if(downloading || scope_stop) return; if(update_timer) { clearTimeout(update_timer); update_timer = null; }' +
          ' downloading = true; doGetData(); }\n';
  code += '\nthis.__get = function(e){return eval(e)};';
  vm.runInContext(code, ctx);
  const get = e => ctx.__get(e);
  const E = {
    log, dom, D, get, clock, srv, axes, yax, ls: store, gets: () => gets,
    posts(from) { return log.filter(l => l.kind == 'POST' && (from === undefined || l.t >= from)).map(l => l.q); },
    run(ms) { clock.run(clock.t + ms); },
    select(id, v) { D(id).val = String(v); get('onDropdownChange')($('#' + id), id); },
    has(name) { return typeof ctx[name] === 'function' || js.includes('function ' + name + '('); },
  };
  D('lock_oscA_sw').val = String(srv.lock_oscA_sw); D('lock_oscB_sw').val = String(srv.lock_oscB_sw);
  get('loadParams')(Object.assign({}, srv));
  get('autorun = ' + (srv.trig_mode == 2 ? 0 : 1));
  if(fnSrc('oscUsrLoad')) get('oscUsrLoad')();
  get('updateGraphData')();
  E.run(300);
  return E;
}

let fails = 0, n = 0;
function check(name, fn, extra) {
  n++;
  let ok = false, x = '';
  try { ok = !!fn(); } catch(e) { x = 'exception: ' + e.message; }
  let ex = '';
  try { ex = extra ? extra() : ''; } catch(e) { ex = ''; }
  console.log((ok ? 'ok   ' : 'FAIL ') + name + ((x || ex) ? '  [' + (x || ex) + ']' : ''));
  if(!ok) fails++;
}
const ALLOWED = ['lock_oscA_sw', 'lock_oscB_sw', 'single_btn', 'xmin', 'xmax'];
const onlyOsc = q => Object.keys(q).every(k => ALLOWED.includes(k));
const J = o => JSON.stringify(o);

console.log('=== scope presets / Ext Trig (' + file + ') ===');

// ---- 1. the five fixed presets --------------------------------------------------------------------------------------
{
  check('1.0 values of the mux (options of the page): in1 1, in2 2, error 3, ctrl_A 4, Xo 22, Yo 23',
        () => valOf('in1') == 1 && valOf('in2') == 2 && valOf('error') == 3 && valOf('ctrl_A') == 4 && valOf('Xo') == 22 && valOf('Yo') == 23);
  const want = [['in1', 'in2'], ['in1', 'ctrl_A'], ['Xo', 'Yo'], ['in1', 'error'], ['ctrl_A', 'error']];
  check('1.1 osc_presets of the page = in1|in2, in1|ctrl_A, Xo|Yo, in1|error, ctrl_A|error', () => {
    const E = makeEnv({});
    const p = E.get('osc_presets');
    return p.length == 5 && want.every((w, i) => p[i].a == valOf(w[0]) && p[i].b == valOf(w[1]));
  });
  const lastTwo = Object.keys(OPTS).map(Number).slice(-2);
  const start = { lock_oscA_sw: lastTwo[0], lock_oscB_sw: lastTwo[1], trig_mode: 1, trig_source: 2, lock_trig_sw: 2, trig_level: 0.1, xmin: -3, xmax: 17 };
  want.forEach((w, i) => {
    let E, ps, extra = '';
    check('1.' + (i + 2) + ' preset ' + i + ' (' + w.join('|') + '): one POST, OscA/OscB only, no trig_*/Ext Trig/zoom change', () => {
      E = makeEnv(start);
      const t0 = E.clock.t;
      E.yax[0].min = -0.3; E.yax[0].max = 0.7;
      E.get('oscPresetClick')(i);
      E.run(400);
      ps = E.posts(t0);
      extra = J(ps);
      const q = ps[0] || {};
      const l = E.get('params.local');
      return ps.length == 1 && onlyOsc(q) && q.lock_oscA_sw == valOf(w[0]) && q.lock_oscB_sw == valOf(w[1]) &&
             (!('xmin' in q) || q.xmin == -3) && (!('xmax' in q) || q.xmax == 17) &&
             E.srv.lock_oscA_sw == valOf(w[0]) && E.srv.lock_oscB_sw == valOf(w[1]) &&
             l.trig_mode == 1 && l.trig_source == 2 && l.lock_trig_sw == 2 && l.trig_level == 0.1 && l.xmin == -3 && l.xmax == 17 &&
             E.axes.min == -3 && E.axes.max == 17 && E.yax[0].min == -0.3 && E.yax[0].max == 0.7 &&
             E.D('lock_oscA_sw').val == String(valOf(w[0])) && E.D('lock_oscB_sw').val == String(valOf(w[1]));
    }, () => extra);
  });
  let extra = '';
  check('1.7 preset of the pair already shown: no POST', () => {
    const E = makeEnv({ lock_oscA_sw: 1, lock_oscB_sw: 2 });
    const t0 = E.clock.t;
    E.get('oscPresetClick')(0); E.run(400);
    extra = J(E.posts(t0));
    return E.posts(t0).length == 0;
  }, () => extra);
  check('1.8 two presets in a row while the 1st POST is in flight: the last pair wins, at most 2 POSTs, OscA/OscB only', () => {
    const E = makeEnv({});
    const t0 = E.clock.t;
    E.get('oscPresetClick')(2); E.get('oscPresetClick')(4); E.run(600);
    const ps = E.posts(t0);
    extra = J(ps);
    return ps.length >= 1 && ps.length <= 2 && ps.every(onlyOsc) && E.srv.lock_oscA_sw == 4 && E.srv.lock_oscB_sw == 3;
  }, () => extra);
}

// ---- 2. "usr" -------------------------------------------------------------------------------------------------------
{
  const KEY = 'oscUsrPreset_lock_in+pid';
  let E, extra = '';
  check('2.1 not configured: title says so, dashed (osc-preset-unset)', () => {
    E = makeEnv({});
    return E.get('osc_usr') === null && /not configured/.test(E.D('osc_preset_usr').attr.title) && E.D('osc_preset_usr').cls.has('osc-preset-unset');
  });
  check('2.2 click while not configured: the modal opens (selects with the options of the page, default pidA_out|error), no POST', () => {
    const t0 = E.clock.t;
    E.get('oscUsrClick')(); E.run(300);
    extra = J(E.D('modal_osc_usr').modal);
    return E.posts(t0).length == 0 && E.D('modal_osc_usr').shown === true && E.D('modal_osc_usr').modal.length == 1 &&
           E.D('modal_osc_usr').modal[0].backdrop === 'static' && E.D('osc_usr_a').html == optsHtml && E.D('osc_usr_a').val == '10' &&
           E.D('osc_usr_b').val == '3' && valOf('PID A out') == 10 && valOf('error') == 3;
  }, () => extra);
  check('2.3 Cancel: closed, still not configured, nothing stored', () => {
    E.get('oscUsrClose')();
    return E.D('modal_osc_usr').shown === false && E.get('osc_usr') === null && !(KEY in E.ls) && E.get('osc_usr_modal_open') === false;
  });
  check('2.4 double click while not configured (click, click, dblclick): modal opened once, no POST', () => {
    const t0 = E.clock.t, n0 = E.D('modal_osc_usr').modal.length;
    E.get('oscUsrClick')(); E.get('oscUsrClick')(); E.get('oscUsrOpen')(); E.run(300);
    extra = E.D('modal_osc_usr').modal.length - n0 + ' modal calls';
    return E.posts(t0).length == 0 && E.D('modal_osc_usr').modal.length - n0 == 1 && E.D('modal_osc_usr').shown;
  }, () => extra);
  check('2.5 Accept (signal_i | error): localStorage, tooltip with the two names, applied in one POST (OscA/OscB only)', () => {
    E.D('osc_usr_a').val = String(valOf('signal_i')); E.D('osc_usr_b').val = String(valOf('error'));
    const t0 = E.clock.t;
    E.get('oscUsrAccept')(); E.run(400);
    const ps = E.posts(t0), st = JSON.parse(E.ls[KEY] || 'null'), t = E.D('osc_preset_usr').attr.title;
    extra = J(ps) + ' ' + t;
    return st && st.a == valOf('signal_i') && st.b == valOf('error') && /signal_i/.test(t) && /error/.test(t) &&
           !E.D('osc_preset_usr').cls.has('osc-preset-unset') && E.D('modal_osc_usr').shown === false &&
           ps.length == 1 && onlyOsc(ps[0]) && ps[0].lock_oscA_sw == valOf('signal_i') && ps[0].lock_oscB_sw == valOf('error');
  }, () => extra);
  check('2.6 configured, click: its pair in one POST (from in1|in2), modal not opened', () => {
    E.get('oscPresetClick')(0); E.run(400);
    const t0 = E.clock.t, n0 = E.D('modal_osc_usr').modal.length;
    E.get('oscUsrClick')(); E.run(400);
    const ps = E.posts(t0);
    extra = J(ps);
    return ps.length == 1 && onlyOsc(ps[0]) && ps[0].lock_oscA_sw == valOf('signal_i') && E.D('modal_osc_usr').modal.length == n0;
  }, () => extra);
  check('2.7 configured, double click (click, click, dblclick): at most one POST, the modal opens once with the usr pair', () => {
    E.get('oscPresetClick')(0); E.run(400);
    const t0 = E.clock.t, n0 = E.D('modal_osc_usr').modal.length;
    E.get('oscUsrClick')(); E.get('oscUsrClick')(); E.get('oscUsrOpen')(); E.run(400);
    const ps = E.posts(t0);
    extra = J(ps) + ' modal calls ' + (E.D('modal_osc_usr').modal.length - n0);
    return ps.length <= 1 && ps.every(onlyOsc) && E.D('modal_osc_usr').modal.length - n0 == 1 &&
           E.D('osc_usr_a').val == String(valOf('signal_i')) && E.D('osc_usr_b').val == String(valOf('error'));
  }, () => extra);
  check('2.8 Esc / hidden: the modal can be opened again (flag back to false via hidden.bs.modal binding)', () => {
    E.get('osc_usr_modal_open = false');
    return /\$\('#modal_osc_usr'\)\.on\('hidden\.bs\.modal'/.test(js) && E.get('oscUsrOpen')() === true;
  });
  try { E.get('oscUsrClose')(); } catch(e) {}
  let cfg;
  check('2.9 Config save: elem.ui.ui_osc_usr_a/b (not in elem.data)', () => {
    E.get('config_save_storage')('c1');
    const st = JSON.parse(E.ls[E.get('config_storage_key')]);
    cfg = st[0];
    extra = J(cfg.ui);
    return cfg.ui && cfg.ui.ui_osc_usr_a == valOf('signal_i') && cfg.ui.ui_osc_usr_b == valOf('error') &&
           !('ui_osc_usr_a' in cfg.data) && !('ui_osc_usr_b' in cfg.data);
  }, () => extra);
  check('2.10 Config download (json): the usr pair in its ui', () => {
    E.get('$("#config_name_input").val("f1")');
    E.get('config_save_file')();
    const node = E.D('btn_config_save_file').node || {};
    const j = JSON.parse(decodeURIComponent(String(node.href).replace(/^data:text\/text;charset=utf-8,/, '')));
    extra = node.download + ' ' + J(j.ui);
    return node.download == 'f1.json' && j.ui && j.ui.ui_osc_usr_a == valOf('signal_i') && j.ui.ui_osc_usr_b == valOf('error') &&
           !('ui_osc_usr_a' in j.data);
  }, () => extra);
  check('2.11 config_save_file / config_save_storage call oscUsrConfigAdd() (code check)',
        () => /oscUsrConfigAdd\(tmp_storage_elem\)/.test(fnSrc('config_save_file')) && /oscUsrConfigAdd\(tmp_storage_elem\)/.test(fnSrc('config_save_storage')));
  check('2.12 Config load of a config with another usr (Xo|F1o): taken and stored, never POSTed; old config without it keeps it', () => {
    const st = JSON.parse(E.ls[E.get('config_storage_key')]);
    const c2 = JSON.parse(JSON.stringify(st[0])); c2.name = 'c2'; c2.ui.ui_osc_usr_a = valOf('Xo'); c2.ui.ui_osc_usr_b = valOf('F1o');
    const c3 = JSON.parse(JSON.stringify(st[0])); c3.name = 'c3'; delete c3.ui;                         // before v2.3.14
    const c4 = JSON.parse(JSON.stringify(st[0])); c4.name = 'c4'; delete c4.ui.ui_osc_usr_a; delete c4.ui.ui_osc_usr_b;  // 2.3.14..23
    st.push(c2, c3, c4);
    E.ls[E.get('config_storage_key')] = JSON.stringify(st);
    const t0 = E.clock.t;
    E.get('config_load_storage')('c2'); E.run(1500);
    const u2 = E.get('osc_usr'), s2 = JSON.parse(E.ls[KEY]);
    E.get('config_load_storage')('c3'); E.run(1500);
    E.get('config_load_storage')('c4'); E.run(1500);
    const u4 = E.get('osc_usr');
    const ps = E.posts(t0);
    extra = ps.length + ' POSTs, usr ' + J(u2) + ' -> ' + J(u4);
    return u2.a == valOf('Xo') && u2.b == valOf('F1o') && s2.a == valOf('Xo') && u4.a == valOf('Xo') && u4.b == valOf('F1o') &&
           ps.length > 0 && ps.every(q => !Object.keys(q).some(k => /^ui_/.test(k))) && /F1o/.test(E.D('osc_preset_usr').attr.title);
  }, () => extra);
  check('2.13 page load with a stored pair: configured, tooltip with the names', () => {
    const ls = {}; ls[KEY] = JSON.stringify({ a: valOf('Yo'), b: valOf('ctrl_B') });
    const F = makeEnv({}, ls);
    const u = F.get('osc_usr'), t = F.D('osc_preset_usr').attr.title;
    extra = t;
    return u && u.a == valOf('Yo') && u.b == valOf('ctrl_B') && /Yo/.test(t) && /ctrl_B/.test(t);
  }, () => extra);
  check('2.14 page load with a broken / invalid stored value: not configured, no exception', () => {
    const l1 = {}; l1[KEY] = '{bad'; const l2 = {}; l2[KEY] = JSON.stringify({ a: 99, b: 1 });
    return makeEnv({}, l1).get('osc_usr') === null && makeEnv({}, l2).get('osc_usr') === null;
  });
}

// ---- 3. Ext Trig rule -------------------------------------------------------------------------------------------------
{
  let extra = '';
  check('3.1 Auto/Channel 1/None -> Ext Trig Scan floor: ONE POST with lock_trig_sw 2 + trig_source 2 + trig_mode 1; selects updated', () => {
    const E = makeEnv({ trig_mode: 0, trig_source: 0, lock_trig_sw: 0 });
    const t0 = E.clock.t;
    E.select('lock_trig_sw', 2); E.run(400);
    const ps = E.posts(t0), q = ps[0] || {};
    extra = J(ps);
    return ps.length == 1 && q.lock_trig_sw == 2 && q.trig_source == 2 && q.trig_mode == 1 &&
           E.srv.trig_mode == 1 && E.srv.trig_source == 2 && E.D('trig_source').val == '2' && E.D('trig_mode').val == '1' &&
           E.get('autorun') == 1 && (!('xmin' in q) || q.xmin == 0) && (!('xmax' in q) || q.xmax == 20);
  }, () => extra);
  check('3.2 Single -> Ext Trig harmonic mod. (8): Normal + External in one POST, polling again (GET /data)', () => {
    const E = makeEnv({ trig_mode: 2, trig_source: 1, lock_trig_sw: 2 });
    const t0 = E.clock.t, g0 = E.gets();
    E.select('lock_trig_sw', 8); E.run(1000);
    const ps = E.posts(t0), q = ps[0] || {};
    extra = J(ps) + ' GETs ' + (E.gets() - g0);
    return ps.length == 1 && q.lock_trig_sw == 8 && q.trig_source == 2 && q.trig_mode == 1 && E.get('autorun') == 1 &&
           E.gets() - g0 >= 5 && E.D('btn_single').prop.disabled === true;
  }, () => extra);
  check('3.3 Ext Trig -> None: only lock_trig_sw (Source/Mode unchanged)', () => {
    const E = makeEnv({ trig_mode: 0, trig_source: 0, lock_trig_sw: 2 });
    const t0 = E.clock.t;
    E.select('lock_trig_sw', 0); E.run(400);
    const ps = E.posts(t0), q = ps[0] || {};
    extra = J(ps);
    return ps.length == 1 && q.lock_trig_sw == 0 && !('trig_source' in q) && !('trig_mode' in q) && E.srv.trig_mode == 0 && E.srv.trig_source == 0;
  }, () => extra);
  check('3.4 already Normal + External: only lock_trig_sw', () => {
    const E = makeEnv({ trig_mode: 1, trig_source: 2, lock_trig_sw: 2 });
    const t0 = E.clock.t;
    E.select('lock_trig_sw', 4); E.run(400);
    const ps = E.posts(t0), q = ps[0] || {};
    extra = J(ps);
    return ps.length == 1 && q.lock_trig_sw == 4 && !('trig_source' in q) && !('trig_mode' in q);
  }, () => extra);
  check('3.5 other selects (OscA, Source) do not apply the rule', () => {
    const E = makeEnv({ trig_mode: 0, trig_source: 0, lock_trig_sw: 2 });
    const t0 = E.clock.t;
    E.select('lock_oscA_sw', 3); E.run(400); E.select('trig_source', 1); E.run(400);
    const ps = E.posts(t0);
    extra = J(ps);
    return ps.length == 2 && E.srv.trig_mode == 0 && E.srv.trig_source == 1;
  }, () => extra);
  check('3.6 Config load (Ext Trig Scan ceil, Channel 1, Auto): the config values stay (rule not applied)', () => {
    const E = makeEnv({ trig_mode: 1, trig_source: 2, lock_trig_sw: 2 });
    const data = Object.assign({}, BASE, { trig_mode: 0, trig_source: 0, lock_trig_sw: 4 });
    E.ls[E.get('config_storage_key')] = JSON.stringify([{ name: 'k', datetime: '', data }]);
    E.get('config_load_storage')('k'); E.run(1500);
    extra = 'server ' + J({ trig_mode: E.srv.trig_mode, trig_source: E.srv.trig_source, lock_trig_sw: E.srv.lock_trig_sw });
    return E.srv.lock_trig_sw == 4 && E.srv.trig_mode == 0 && E.srv.trig_source == 0;
  }, () => extra);
  check('3.7 during a Capture Lock: Ext Trig changed by the user ends it and then External + Normal (one POST)', () => {
    const E = makeEnv({ trig_mode: 0, trig_source: 0, lock_trig_sw: 0 });
    // capture as lockRequest() leaves it: saved user settings, scope on Single/External/Lock control trig
    E.get('lock_cap.saved = { trig_mode: 0, trig_source: 0, lock_trig_sw: 0, xmin_s: 0, xmax_s: 0.02 }; lock_cap.state = "captured"; ' +
          'params.local.trig_mode = 2; params.local.trig_source = 2; params.local.lock_trig_sw = 128; autorun = 0;');
    E.get('sendParams')(); E.run(400);
    const t0 = E.clock.t;
    E.select('lock_trig_sw', 2); E.run(400);
    const ps = E.posts(t0), q = ps[0] || {};
    extra = J(ps);
    return E.get('lock_cap.state') == 'off' && ps.length == 1 && q.lock_trig_sw == 2 && q.trig_mode == 1 && E.srv.trig_source == 2 &&
           E.get('autorun') == 1;
  }, () => extra);
  check('3.8 the rule is only in onDropdownChange (code check: not in lockCaptureEnd, config_load_storage, loadParams)', () =>
    /dv != 0/.test(fnSrc('onDropdownChange')) && !/trig_source\s*=\s*2/.test(fnSrc('config_load_storage')) &&
    !/trig_source\s*=\s*2/.test(fnSrc('loadParams')) && !/trig_mode\s*=\s*1/.test(fnSrc('lockCaptureEnd')));
}

// ---- 4. HTML and bindings ---------------------------------------------------------------------------------------------
{
  const iExt = html.indexOf('<select id="lock_trig_sw"'), iMore = html.indexOf('href="#scope_more_options"');
  const iP = html.indexOf('id="osc_preset_0"'), iU = html.indexOf('id="osc_preset_usr"');
  const btn = id => (html.match(new RegExp('<button[^>]*id="' + id + '"[^>]*>([\\s\\S]*?)</button>')) || ['', ''])[0];
  const lab = id => btn(id).replace(/<[^>]+>/g, '').replace(/^.*?>/, '');
  check('4.1 six buttons below Ext Trig, before "More options"', () => iExt > 0 && iP > iExt && iU > iP && iU < iMore);
  check('4.2 labels in1|in2, in1|ctrl, X|Y, in1|err, ctrl|err, usr', () => {
    const t = ['osc_preset_0', 'osc_preset_1', 'osc_preset_2', 'osc_preset_3', 'osc_preset_4', 'osc_preset_usr'].map(id => btn(id).replace(/<wbr>/g, '').replace(/^<button[^>]*>/, '').replace('</button>', ''));
    return J(t) == J(['in1|in2', 'in1|ctrl', 'X|Y', 'in1|err', 'ctrl|err', 'usr']);
  });
  check('4.3 first three blue, last three green; class btn (enabled with the other buttons); titles', () =>
    [0, 1, 2].every(i => /osc-preset-blue/.test(btn('osc_preset_' + i))) && [3, 4].every(i => /osc-preset-green/.test(btn('osc_preset_' + i))) &&
    /osc-preset-green/.test(btn('osc_preset_usr')) && [0, 1, 2, 3, 4].every(i => /class="btn osc-preset/.test(btn('osc_preset_' + i)) && /title="OscA = /.test(btn('osc_preset_' + i))) &&
    /title="usr: /.test(btn('osc_preset_usr')));
  check('4.4 small low buttons (CSS width <= 44 px, height 18..22 px (~40 % less than 34), font 10 px, one line)', () => {
    const m = html.match(/\.btn\.osc-preset \{[^}]*\}/);
    if(!m) return false;
    const w = +(m[0].match(/width:\s*(\d+)px/) || [])[1], h = +(m[0].match(/height:\s*(\d+)px/) || [])[1], f = +(m[0].match(/font-size:\s*(\d+)px/) || [])[1];
    const lh = +(m[0].match(/line-height:\s*(\d+)px/) || [])[1];
    return w <= 44 && h >= 18 && h <= 22 && f == 10 && lh >= 12 && lh <= h - 2 && /white-space:\s*nowrap/.test(m[0]);
  });
  check('4.5 bindings: presets click, usr click + dblclick, Accept/Cancel, oscUsrLoad() at page load', () =>
    /\$\('\.osc-preset\[data-preset\]'\)\.on\('click'/.test(js) && /\$\('#osc_preset_usr'\)\.on\('click'[\s\S]{0,120}\.on\('dblclick', function\(\) \{ oscUsrOpen\(\); \}\)/.test(js) &&
    /\$\('#btn_osc_usr_accept'\)\.on\('click'/.test(js) && /\$\('#btn_osc_usr_cancel'\)\.on\('click'/.test(js) && /\n\s*oscUsrLoad\(\);/.test(js));
  check('4.6 modal with OscA/OscB selects and Accept/Cancel', () =>
    /id="modal_osc_usr"/.test(html) && /<select id="osc_usr_a"/.test(html) && /<select id="osc_usr_b"/.test(html) &&
    /id="btn_osc_usr_accept"/.test(html) && /id="btn_osc_usr_cancel"/.test(html));
}

console.log(`=== ${n} checks, ${fails} failed ===`);
process.exit(fails ? 1 : 0);
