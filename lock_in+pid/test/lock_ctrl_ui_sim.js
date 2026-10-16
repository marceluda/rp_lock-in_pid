#!/usr/bin/env node
// Simulation of the lock control chain of lock_in+pid_harmonic: web UI (functions taken from index.html,
// mocked jQuery/DOM/ajax) <-> C controller (model of src/main.c + src/lock.c) <-> FPGA (model of lock_ctrl.v).
//
// v2.3.13 model (default): lock_control is command + configuration, the FPGA state machine locks by itself and
// publishes lock_status (0x1C); the controller writes lock_control only when the lock_ctrl_aux_* params change
// and refreshes the status in every rp_get_params().
// v2.3.12 model (--old, with the index.html of v2.3.12): lock_feedback (0x1C) must be copied back to lock_control.
//
// Usage:  node test/lock_ctrl_ui_sim.js [index.html]            (v2.3.13, exit code 1 if a check fails)
//         node test/lock_ctrl_ui_sim.js <old index.html> --old  (v2.3.12, prints the observed behaviour)
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');

const args = process.argv.slice(2);
const OLD = args.includes('--old');
const file = args.find(a => !a.startsWith('--')) || path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const js = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

function braceFrom(i) {   // source from index i up to the brace that closes the first '{' after i
  let d = 0;
  for(let k = js.indexOf('{', i); k < js.length; k++) {
    if(js[k] == '{') d++;
    else if(js[k] == '}' && --d == 0) return js.slice(i, k + 1);
  }
  return '';
}
function fnSrc(name) { const i = js.indexOf('function ' + name + '('); return i < 0 ? '' : braceFrom(i); }
function varSrc(name) { const m = js.match(new RegExp('\\n\\s*var ' + name + ' = [\\s\\S]*?;\\s*(//.*)?\\n')); return m ? m[0] : ''; }
function handlerSrc(marker) {   // anonymous click handler that follows marker
  const i = js.indexOf(marker);
  if(i < 0) throw new Error('marker not found: ' + marker);
  return braceFrom(js.indexOf('function', i));
}

// ---------------------------------------------------------------------------------------------------------
// FPGA models
class FpgaNew {                      // lock_ctrl.v of v2.3.13
  constructor() { this.lc = 1148; this.last = this.lc & 0x1f; this.state = 0; this.count = 0; this.writes = 0; }
  write(v) { this.writes++; this.lc = v & 0x7ff; this.clock(false); }
  clock(trig) {
    const lc = this.lc, last = this.last;
    const now_r = (lc & 1) && !(last & 1), launch_r = (lc & 2) && !(last & 2), rel = !(lc & 3);
    const man = ((lc ^ last) >> 2) & 7, ttype = (lc >> 8) & 3;
    let n = this.state;
    if(this.state == 0)      { if(now_r) n = 2; else if(launch_r) n = 1; }
    else if(this.state == 1) { if(rel) n = 0; else if(now_r || (trig && ttype != 0)) n = 2; }
    else                     { if(rel || man) n = 0; }
    if(n == 2 && this.state != 2) this.count = (this.count + 1) & 255;
    this.state = n; this.last = lc & 0x1f;
  }
  trigger() { this.clock(true); }
  eff() { const lc = this.lc; return this.state == 2 ? (lc >> 5) & 7 : (lc >> 2) & 7; }   // [ramp,pidA,pidB]
  status() { return (this.count << 8) | (this.eff() << 2) | ((this.state == 2) << 1) | (this.state == 1); }
  locked() { return this.state == 2; }
}
class FpgaOld {                      // lock_ctrl.v + lock.v of v2.3.12
  constructor() { this.lc = 1148; this.found = 0; this.writes = 0; }
  write(v) { this.writes++; this.lc = v & 0x7ff; this.clock(false); }
  seek() { return (this.lc & 3) != 0; }
  tookReg() { return ((this.lc >> 2) & 7) == ((this.lc >> 5) & 7); }
  clock(trig) {
    if(!this.seek()) { this.found = 0; return; }
    const ttype = (this.lc >> 8) & 3;
    const t = (trig && ttype != 0) || (this.lc & 1);
    this.found = this.found ? (this.tookReg() ? 0 : 1) : (t ? 1 : 0);
  }
  trigger() { this.clock(true); }
  setLock() { return this.seek() && this.found; }
  eff() { return this.setLock() ? (this.lc >> 5) & 7 : (this.lc >> 2) & 7; }
  feedback() { const eff = this.eff(), took = eff == ((this.lc >> 5) & 7);
               return (this.lc & 0x7e0) | (eff << 2) | (took ? 0 : (this.lc & 3)); }
  status() { return this.feedback(); }
  locked() { return this.eff() == ((this.lc >> 5) & 7) && this.eff() != ((this.lc >> 2) & 7) || this.setLock(); }
}

// ---------------------------------------------------------------------------------------------------------
// C controller model (rp_set_params / rp_get_params / rp_get_signals)
const AUX = ['lock_ctrl_aux_lock_now', 'lock_ctrl_aux_launch_lock_trig', 'lock_ctrl_aux_pidB_enable_ctrl',
             'lock_ctrl_aux_pidA_enable_ctrl', 'lock_ctrl_aux_ramp_enable_ctrl', 'lock_ctrl_aux_set_pidB_enable',
             'lock_ctrl_aux_set_pidA_enable', 'lock_ctrl_aux_set_ramp_enable', 'lock_ctrl_aux_trig_type',
             'lock_ctrl_aux_lock_trig_rise'];
const AUXW = [1, 2, 4, 8, 16, 32, 64, 128, 256, 1024], AUXM = [1, 1, 1, 1, 1, 1, 1, 1, 3, 1];
function compose(p) { let v = 0; AUX.forEach((k, i) => v += (p[k] | 0) * AUXW[i]); return v; }
function decompose(v, p) { AUX.forEach((k, i) => p[k] = Math.floor(v / AUXW[i]) & AUXM[i]); }

class Server {
  constructor(old, init) {
    this.old = old; this.fpga = old ? new FpgaOld() : new FpgaNew();
    this.p = Object.assign({}, init);
    this.ro = old ? ['lock_lock_feedback'] : ['lock_lock_status', 'lock_lock_control'];
    this.written = 0xffffffff;
    this.scope_triggers = true;      // false: Normal trigger without triggers -> rp_get_signals() has no new data
    this.posts = 0; this.gets = 0;
    this.lockUpdate();
  }
  lockUpdate() {                     // lock_update(), lock_control part
    const lc = compose(this.p);
    if(this.old) this.fpga.write(lc);
    else if(lc != this.written) { this.fpga.write(lc); this.written = lc; }
  }
  updateStatus() {                   // lock_update_status() (v2.3.13)
    const lc = this.fpga.lc;
    this.p.lock_lock_status = this.fpga.status();
    this.p.lock_lock_control = lc;
    if(lc != this.written) { decompose(lc, this.p); this.written = lc; }
  }
  updateMain() {                     // lock_update_main() (complete acquisition only)
    if(this.old) {
      this.p.lock_lock_control = this.fpga.lc;
      this.p.lock_lock_feedback = this.fpga.feedback();
      decompose(this.fpga.feedback(), this.p);
    }
    else this.updateStatus();
  }
  setParams(q) {
    this.posts++;
    let lock_change = false;
    for(const k in q) {
      if(!(k in this.p) || this.ro.includes(k)) continue;
      if(this.p[k] != q[k]) { if(k.startsWith('lock_')) lock_change = true; this.p[k] = q[k]; }
    }
    if(lock_change) this.lockUpdate();
  }
  getParams() { if(!this.old) this.updateStatus(); return Object.assign({}, this.p); }
  getData() { this.gets++; if(this.scope_triggers) this.updateMain(); return this.getParams(); }
  python(v) { this.fpga.write(v); }  // monitor / py/lock_from_registers.py writing lock_control
}

// ---------------------------------------------------------------------------------------------------------
// Web UI environment
function makeEnv(server) {
  const cls = {}, txt = {}, log = [];
  let clock = 1000000;
  const el = sel => {
    const ids = String(sel).split(',').map(s => s.trim().replace(/^#/, ''));
    const o = {
      val() { return o; }, prop() { return o; }, html() { return o; }, show() { return o; }, hide() { return o; },
      data() { return o; }, focus() { return o; }, blur() { return o; }, trigger() { return o; }, parent() { return o; },
      closest() { return { length: 1 }; }, attr() { return undefined; }, on() { return o; },
      text(v) { if(v === undefined) return txt[ids[0]] || ''; ids.forEach(i => txt[i] = String(v)); return o; },
      addClass(c) { ids.forEach(i => c.split(' ').forEach(x => (cls[i] = cls[i] || new Set()).add(x))); return o; },
      removeClass(c) { ids.forEach(i => c.split(' ').forEach(x => (cls[i] = cls[i] || new Set()).delete(x))); return o; },
      toggleClass(c, st) { ids.forEach(i => c.split(' ').forEach(x => { const s = (cls[i] = cls[i] || new Set());
        const on = (st === undefined ? !s.has(x) : !!st); if(on) s.add(x); else s.delete(x); })); return o; },
      hasClass(c) { return !!(cls[ids[0]] && cls[ids[0]].has(c)); },
      is(c) { return c.startsWith('.') ? o.hasClass(c.slice(1)) : false; },
    };
    return o;
  };
  const $ = sel => (sel && typeof sel == 'object') ? el('#' + sel.id) : el(sel);
  $.inArray = (v, a) => a.indexOf(v);
  $.extend = function () { const t = arguments[0]; for(let i = 1; i < arguments.length; i++) Object.assign(t, arguments[i] || {}); return t; };
  $.isPlainObject = o => o !== null && typeof o == 'object' && !Array.isArray(o);
  $.isEmptyObject = o => Object.keys(o).length == 0;
  $.isNumeric = v => !isNaN(parseFloat(v)) && isFinite(v);
  $.Deferred = function () {
    let st = null, a, dn = [], fl = [], al = [];
    const run = () => { (st == 'r' ? dn : fl).forEach(f => f.apply(null, a)); al.forEach(f => f.apply(null, a)); dn = []; fl = []; al = []; };
    const p = { done(f) { dn.push(f); if(st) run(); return p; }, fail(f) { fl.push(f); if(st) run(); return p; },
                always(f) { al.push(f); if(st) run(); return p; }, promise() { return p; } };
    p.resolve = (...x) => { if(!st) { st = 'r'; a = x; run(); } return p; };
    p.reject = (...x) => { if(!st) { st = 'j'; a = x; run(); } return p; };
    return p;
  };
  $.ajax = o => {          // synchronous server
    const d = $.Deferred();
    if(o.type == 'POST') {
      const q = JSON.parse(o.data).datasets.params;
      log.push('POST ' + JSON.stringify(q));
      server.setParams(q);
      d.resolve({ app: { id: 'x' }, datasets: { params: server.getParams(), g1: [] } });
    }
    else d.resolve({ app: { id: 'x' }, datasets: { params: server.getData(), g1: [] } });
    return d.promise();
  };
  const plot = { getOptions() { return { xaxes: [{ min: 0, max: 131 }], yaxes: [{}, {}] }; }, setupGrid() {}, draw() {} };
  const ctx = { $, console: { log() {}, info() {}, warn() {} }, Object, JSON, Math, Number, isFinite, parseInt, parseFloat, String,
    Array, Date: { now: () => clock }, setTimeout: (f) => { pending.push(f); return pending.length; }, clearTimeout() {},
    document: { activeElement: null }, plot, autorun: 1, refresh_counter: 0, meas_panel_dec: 5, trigger_just_set: false,
    last_unit_mode: 0, downloading: false, user_editing: false, control_lost: false,
    floatToLocalString: x => String(x), shortenFloat: x => x, convertHz: x => x, convertSec: x => x, parseLocalFloat: parseFloat,
    lock_ramp_step_update() {}, lock_modulation_update() {}, lock_ctrl_update() {}, lock_pidA_update() {}, lock_pidB_update() {},
    lpf_update() {}, display_update() {}, updateTriggerSlider() {}, updateGraphData() {}, saveState() {}, redrawPlot() {},
    showModalError: m => log.push('MODAL ' + m), app_id: 'x', post_url: '/data' };
  const pending = [];
  vm.createContext(ctx);
  let code = ['sending', 'send_que', 'send_que_all', 'single_que', 'use_long_timeout', 'readonly_keys', 'display_keep_keys', 'unsent_base',
    'unsent_skip_keys', 'always_send_params', 'last_send_params', 'post_chunk_timeout', 'post_chunk_retries', 'long_timeout',
    'post_min_gap_ms', 'post_max_per_s', 'post_starts', 'post_rate_timer', 'post_rate_args', 'lock_enable_keys',
    'send_all_skip', 'config_load_x_pending', 'server_ro_keys'].map(varSrc).join('\n');
  code += '\nvar params = {original:null, local:null};\nvar post_max_bytes = 600;\nvar post_inflight = 0, last_post_end = 0;\n';
  // v2.3.23: plot_epoch (Reset zoom) of the page, used by sendParams()
  if(js.includes('var plot_epoch = 0')) code += 'var plot_epoch = 0, plot_epoch_post = false;\n';
  code += ['unsentChanges', 'loadParams', 'updateTimeUnits', 'isParamChanged', 'splitParams', 'postParamsChunks', 'sendParams',
           'postEnd', 'sendableValue', 'isSendable', 'hasRealChange', 'lockStatus', 'lockSetBtn', 'lock_status_display']
          .map(fnSrc).join('\n');
  // v2.3.14: lock requests go through the [LOCK CAPTURE] block (lockRequest()/lockRelease()); Capture Lock is
  // tested by test/lock_capture_ui_sim.js, here it is off (plain lock chain, as v2.3.13)
  const cb = js.indexOf('// [LOCK CAPTURE BEGIN]'), ce = js.indexOf('// [LOCK CAPTURE END]');
  if(cb >= 0) {
    code += '\nvar set_trigger_val = false, plot_time_units = null, update_timer = null, datasets = [];\n' +
            ['timeUnitFactor', 'trigFromGraphTargets', 'rampPeriodCycles', 'clickToTrigTime', 'clickToTrigLevel'].map(fnSrc).join('\n') +
            '\n' + js.slice(cb, ce) + '\nui_capture_lock = 0;\n';
  }
  if(OLD) code += '\nvar clickBtn = ' + handlerSrc("$(input_buttons).on('click'") + ';\n';
  else {
    code += '\nvar clickEnable = ' + handlerSrc("$('#lock_ctrl_aux_ramp_enable_ctrl,#lock_ctrl_aux_pidA_enable_ctrl,#lock_ctrl_aux_pidB_enable_ctrl').on('click'") + ';\n';
    code += '\nvar clickRequest = ' + handlerSrc("$('#lock_ctrl_aux_launch_lock_trig,#lock_ctrl_aux_lock_now').on('click'") + ';\n';
  }
  code += '\nthis.__get = function(e){return eval(e)};';
  vm.runInContext(code, ctx);
  const get = e => ctx.__get(e);
  const E = {
    log, cls, txt, get, server,
    posts() { return log.filter(l => l.startsWith('POST')).length; },
    flush() { for(let n = 0; n < 20 && pending.length; n++) pending.shift()(); },
    poll(n) {            // doGetData() every 50 ms: sendParams() + GET /data + loadParams(.., true)
      for(let i = 0; i < n; i++) {
        clock += 50;
        get('sendParams')();
        $.ajax({ url: '/data' }).done(r => { if(!get('user_editing')) get('loadParams')(r.datasets.params, true); });
        E.flush();
      }
    },
    click(id) {
      clock += 20;
      const f = OLD ? get('clickBtn') : (id.match(/enable_ctrl$/) ? get('clickEnable') : get('clickRequest'));
      f.call({ id: id });
      E.flush();
    },
    change(k, v) { clock += 20; get('params.local')[k] = v; get('sendParams')(); E.flush(); },
    btn(id) { return !!(cls[id] && cls[id].has('btn-primary')); },
    // enables shown by the 3 buttons [ramp,pidA,pidB] as a 3-bit number (same order as FPGA eff)
    shown() { return (E.btn('lock_ctrl_aux_ramp_enable_ctrl') << 2) | (E.btn('lock_ctrl_aux_pidA_enable_ctrl') << 1) |
                      E.btn('lock_ctrl_aux_pidB_enable_ctrl'); },
  };
  get('loadParams')(server.getData());
  return E;
}

// ---------------------------------------------------------------------------------------------------------
const base = { xmin: 0, xmax: 131, single_btn: 0, auto_flag: 0, time_units: 0, trig_mode: 1, lock_osc_raw_mode: 0,
  lock_pidA_kp: 100, lock_lock_trig_time_val: 2072599, lock_lock_control: 1148,
  // scan state: Scan on, PIDs off; on lock: PID A + PID B; time trigger
  lock_ctrl_aux_lock_now: 0, lock_ctrl_aux_launch_lock_trig: 0, lock_ctrl_aux_pidB_enable_ctrl: 0,
  lock_ctrl_aux_pidA_enable_ctrl: 0, lock_ctrl_aux_ramp_enable_ctrl: 1, lock_ctrl_aux_set_pidB_enable: 1,
  lock_ctrl_aux_set_pidA_enable: 1, lock_ctrl_aux_set_ramp_enable: 0, lock_ctrl_aux_trig_type: 1, lock_ctrl_aux_lock_trig_rise: 0 };
const init = Object.assign({}, base, OLD ? { lock_lock_feedback: 1148 } : { lock_lock_status: 28 });

let fails = 0, n = 0;
function check(name, cond, E) {
  n++;
  console.log((cond ? 'PASS ' : 'FAIL ') + name);
  if(!cond) { fails++; if(E) console.log('   ' + E.log.slice(-6).join('\n   ')); }
}
function report(name, v) { console.log('INFO ' + name + ': ' + v); }

if(OLD) {
  // ---- v2.3.12: what happens with the old chain (informative, no pass/fail) -------------------------------
  console.log('=== v2.3.12 chain (' + file + ') ===');
  let S = new Server(true, init), E = makeEnv(S);
  E.poll(10);
  E.click('lock_ctrl_aux_launch_lock_trig');
  E.poll(2);
  S.scope_triggers = false;                     // ramp stops when the lock closes: Normal/External gets no triggers
  S.fpga.trigger();
  let p0 = E.posts(), w0 = S.fpga.writes;
  E.poll(100);
  report('A after the time trigger, scope without triggers (5 s): POSTs', E.posts() - p0);
  report('A FPGA effective [ramp,pidA,pidB] / UI buttons', S.fpga.eff().toString(2).padStart(3, '0') + ' / ' + E.shown().toString(2).padStart(3, '0'));
  report('A lock committed in lock_control (bits [1:0]=0, [4:2]=[7:5])', (S.fpga.lc & 3) == 0 && ((S.fpga.lc >> 2) & 7) == ((S.fpga.lc >> 5) & 7));
  S.scope_triggers = true; p0 = E.posts();
  E.poll(100);
  report('A with scope triggers (5 s): POSTs', E.posts() - p0);
  report('A FPGA effective / UI buttons', S.fpga.eff().toString(2).padStart(3, '0') + ' / ' + E.shown().toString(2).padStart(3, '0'));
  report('A lock_control writes after the trigger', S.fpga.writes - w0);
  // Python only: arm by register, trigger, nobody copies the feedback
  S = new Server(true, init); E = makeEnv(S);
  S.python(compose(base) | 2); S.fpga.trigger();
  report('B python arm + trigger: FPGA effective', S.fpga.eff().toString(2).padStart(3, '0') + ' (lock_control ' + S.fpga.lc + ', feedback ' + S.fpga.feedback() + ')');
  E.poll(5);
  E.change('lock_pidA_kp', 101);               // unrelated change from the UI
  report('B after an unrelated UI change: FPGA effective', S.fpga.eff().toString(2).padStart(3, '0') + ' (lock_control ' + S.fpga.lc + ')');
  process.exit(0);
}

console.log('=== v2.3.13 chain (' + file + ') ===');

// ---- 1. Trigger Lock from the UI, time trigger ------------------------------------------------------------
let S = new Server(false, init), E = makeEnv(S);
E.poll(10);
check('1.1 idle: 0 POST in 10 polls', E.posts() == 0, E);
check('1.2 idle: buttons = Scan only, label OFF', E.shown() == 0b100 && E.txt.lock_status_label == 'OFF', E);
E.click('lock_ctrl_aux_launch_lock_trig');
check('1.3 Trigger Lock: 1 POST with launch_lock_trig = 1', E.posts() == 1 && /"lock_ctrl_aux_launch_lock_trig":1/.test(E.log[E.log.length - 1]), E);
check('1.4 FPGA ARMED', S.fpga.state == 1, E);
E.poll(2);
check('1.5 UI: label ARMED, Trigger Lock pressed, buttons still Scan only', E.txt.lock_status_label == 'ARMED' &&
      E.btn('lock_ctrl_aux_launch_lock_trig') && E.shown() == 0b100, E);
S.scope_triggers = false;                       // the ramp stops: scope in Normal/External gets no triggers
let w0 = S.fpga.writes, p0 = E.posts();
S.fpga.trigger();
check('1.6 trigger: FPGA LOCKED by itself, enables = set_* (PID A + PID B)', S.fpga.locked() && S.fpga.eff() == 0b011, E);
E.poll(100);
check('1.7 locked, scope without triggers: 0 POST in 100 polls (5 s)', E.posts() == p0, E);
check('1.8 UI: buttons = PID A + PID B, label LOCKED, count 1', E.shown() == 0b011 && E.txt.lock_status_label == 'LOCKED' &&
      E.txt.lock_status_count == '1', E);
S.scope_triggers = true;
E.poll(100);
check('1.9 locked, scope with triggers: 0 POST in 100 more polls', E.posts() == p0, E);
check('1.10 no write of lock_control after the trigger', S.fpga.writes == w0, E);
E.change('lock_pidA_kp', 120);
check('1.11 unrelated change (kp): 1 POST, lock_control not written, still LOCKED', E.posts() == p0 + 1 && S.fpga.writes == w0 &&
      S.fpga.locked(), E);
E.poll(20);
check('1.12 after it: no more POSTs', E.posts() == p0 + 1, E);
E.click('lock_ctrl_aux_ramp_enable_ctrl');      // locked: release keeping PIDs, Scan on
check('1.13 click Scan while LOCKED: 1 POST, FPGA IDLE, effective = Scan + PID A + PID B', E.posts() == p0 + 2 &&
      S.fpga.state == 0 && S.fpga.eff() == 0b111, E);
E.poll(5);
check('1.14 UI: buttons Scan + PID A + PID B, Trigger Lock released, label OFF', E.shown() == 0b111 &&
      !E.btn('lock_ctrl_aux_launch_lock_trig') && E.txt.lock_status_label == 'OFF' && E.posts() == p0 + 2, E);
E.click('lock_ctrl_aux_pidA_enable_ctrl');      // not locked: plain toggle
E.click('lock_ctrl_aux_pidB_enable_ctrl');
E.poll(3);
check('1.15 IDLE: PID A / PID B buttons toggle the manual enables (back to Scan only)', S.fpga.eff() == 0b100 && E.shown() == 0b100, E);

// ---- 2. release with Trigger Lock ---------------------------------------------------------------------------
E.click('lock_ctrl_aux_launch_lock_trig'); S.fpga.trigger(); E.poll(3);
check('2.1 armed + trigger -> LOCKED, count 2', S.fpga.locked() && E.txt.lock_status_count == '2', E);
p0 = E.posts();
E.click('lock_ctrl_aux_launch_lock_trig');
E.poll(3);
check('2.2 click Trigger Lock again: release, back to the scan state, 1 POST', S.fpga.state == 0 && S.fpga.eff() == 0b100 &&
      E.shown() == 0b100 && E.posts() == p0 + 1, E);

// ---- 3. Lock Now ---------------------------------------------------------------------------------------------
p0 = E.posts();
E.click('lock_ctrl_aux_lock_now');
check('3.1 Lock Now: LOCKED at once', S.fpga.locked() && S.fpga.eff() == 0b011, E);
E.poll(100);
check('3.2 0 POST in 100 polls, UI shows PID A + PID B, Lock Now pressed', E.posts() == p0 + 1 && E.shown() == 0b011 &&
      E.btn('lock_ctrl_aux_lock_now'), E);
E.click('lock_ctrl_aux_lock_now');
E.poll(3);
check('3.3 Lock Now again: release to the scan state', S.fpga.state == 0 && E.shown() == 0b100 && !E.btn('lock_ctrl_aux_lock_now'), E);

// ---- 4. Python writes the registers, the UI only shows ----------------------------------------------------
S = new Server(false, init); E = makeEnv(S); E.poll(3);
const lc_scan = compose(base);
S.python(lc_scan | 2);                          // arm from Python
E.poll(2);
check('4.1 Python arms: UI shows ARMED + Trigger Lock pressed, 0 POST', E.txt.lock_status_label == 'ARMED' &&
      E.btn('lock_ctrl_aux_launch_lock_trig') && E.posts() == 0, E);
S.scope_triggers = false; S.fpga.trigger();
E.poll(50);
check('4.2 trigger: LOCKED without any write, UI shows it (scope without triggers), 0 POST', S.fpga.locked() &&
      E.shown() == 0b011 && E.txt.lock_status_label == 'LOCKED' && E.posts() == 0, E);
w0 = S.fpga.writes;
E.change('lock_pidA_kp', 130);
check('4.3 unrelated UI change: lock_control not rewritten, still LOCKED', S.fpga.writes == w0 && S.fpga.locked(), E);
S.python(lc_scan);                              // release from Python
E.poll(3);
check('4.4 Python release: UI back to Scan only, label OFF, Trigger Lock released', E.shown() == 0b100 &&
      E.txt.lock_status_label == 'OFF' && !E.btn('lock_ctrl_aux_launch_lock_trig'), E);

// ---- 5. "Don't turn on PIDs and Ramp" (Config load / Restart) while locked -------------------------------
S = new Server(false, init); E = makeEnv(S); E.poll(2);
E.click('lock_ctrl_aux_launch_lock_trig'); S.fpga.trigger(); E.poll(2);
const L = E.get('params.local');
['lock_ctrl_aux_ramp_enable_ctrl', 'lock_ctrl_aux_pidA_enable_ctrl', 'lock_ctrl_aux_pidB_enable_ctrl',
 'lock_ctrl_aux_lock_now', 'lock_ctrl_aux_launch_lock_trig'].forEach(k => L[k] = 0);   // as config_load_storage()
E.get('sendParams')(false, false, false, false, true); E.flush();
E.poll(3);
check('5.1 config load with the rule: FPGA IDLE, everything off, UI shows it', S.fpga.state == 0 && S.fpga.eff() == 0 &&
      E.shown() == 0 && E.txt.lock_status_label == 'OFF', E);
p0 = E.posts(); E.poll(50);
check('5.2 no POSTs after it', E.posts() == p0, E);

// ---- 6. v2.3.16: lock_lock_trig_time_val is float32 in the C controller (0xFFFFFFFF -> 4294967296) --------------
S = new Server(false, Object.assign({}, init, { lock_lock_trig_time_val: Math.fround(4294967295) }));
const getP = S.getParams.bind(S);
S.getParams = () => { const p = getP(); p.lock_lock_trig_time_val = Math.fround(p.lock_lock_trig_time_val); return p; };
E = makeEnv(S); E.poll(3);
check('6.1 server echo 4294967296 (float32): params.original/local = 4294967295, 0 POST',
      E.get('params.original').lock_lock_trig_time_val === 4294967295 &&
      E.get('params.local').lock_lock_trig_time_val === 4294967295 && E.posts() == 0, E);
E.change('lock_lock_trig_time_val', 2072500); E.poll(3);
p0 = E.posts();
E.change('lock_lock_trig_time_val', 4294967295); E.poll(20);
check('6.2 "40 s" (4294967295): 1 POST, then 0 POST in 20 polls, local = 4294967295',
      E.posts() == p0 + 1 && E.get('params.local').lock_lock_trig_time_val === 4294967295, E);

console.log('=== ' + n + ' checks, ' + fails + ' failed ===');
process.exit(fails ? 1 : 0);
