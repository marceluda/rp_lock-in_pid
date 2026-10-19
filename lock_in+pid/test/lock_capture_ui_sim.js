#!/usr/bin/env node
// v2.3.14: simulation of "Capture Lock" / "Fire on click" of lock_in+pid_harmonic, in continuous time.
//
//   web UI   : the real functions / handlers of index.html (sendParams, doGetData, loadParams, the [LOCK CAPTURE]
//              block, Trigger Lock / Choose from graph / trig_mode handlers, singleUpdate, ...), with a mocked
//              jQuery/DOM and asynchronous $.ajax (latency, the GET /data of nginx waits up to 200 ms for data);
//   C        : model of rp_set_params() (scope change detection, Single arming, v2.3.14 wait for the armed scope
//              before writing lock_control), of the scope worker (arming delay, pre-trigger history, its copy of
//              the parameters) and of AUTO (auto-set + copy back; opt autoOld: the C before the fix of 2.3.14-23);
//   FPGA regs: lock registers written by lock_update() and read back into the params by GET (lock_update_main());
//   FPGA     : lock_ctrl.v (time / level trigger counted from the scan floor, Lock Now, release), ramp floors that
//              stop when the lock closes (set_ramp_enable = 0), scope triggers (Ext Trig: scan floor 2 or
//              "Lock control trig" 128) and the captured window.
//
// v2.3.23: the C model is the one of v2.3.23 by default (the POST that arms the capture answers at once and the lock
// request is applied when the worker enables the trigger; an acquisition is not armed again by a POST that does not
// change it; read-only scope_gen / scope_acq_state / scope_acq_gen / sig_gen in the answers), opt c2322 the one of
// v2.3.14-2.3.22 (the POST waits for the armed scope at most 1.5 s, the worker sleeps the pre-trigger history without
// looking at new parameters and arms again after any scope POST). Long windows (>= 1.5 s) are read while they are
// written: partial traces (status AGAIN) every 200 ms after the trigger. A POST answered after post_chunk_timeout
// fails with 'timeout' (the server has applied it) and the page sends it again. Section 8: slow scan of 30 s.
//
// Usage: node test/lock_capture_ui_sim.js [index.html] [--runs N]     (exit code 1 if a check fails)
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--') && !/^\d+$/.test(a)) || path.join(__dirname, '..', 'index.html');
const RUNS = Number((args[args.indexOf('--runs') + 1] || '').match(/^\d+$/) ? args[args.indexOf('--runs') + 1] : 200);
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
function fnSrc(name) { const i = js.indexOf('function ' + name + '('); if(i < 0) throw new Error('no function ' + name); return braceFrom(i); }
function varSrc(name) { const m = js.match(new RegExp('\\n\\s*var ' + name + ' = [\\s\\S]*?;\\s*(//.*)?\\n')); if(!m) throw new Error('no var ' + name); return m[0]; }
function varSrcOpt(name) { try { return varSrc(name); } catch(e) { return ''; } }   // v2.3.18
function handlerSrc(marker) {
  const i = js.indexOf(marker);
  if(i < 0) throw new Error('marker not found: ' + marker);
  return braceFrom(js.indexOf('function', i));
}

// deterministic random numbers
let seed = 12345;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

// ---------------------------------------------------------------------------------------------------------
// Event queue (virtual time in ms)
class Clock {
  constructor() { this.t = 1000; this.q = []; this.n = 0; }
  at(t, fn) { const id = ++this.n; this.q.push({ t: Math.max(t, this.t), fn, id, seq: id }); return id; }
  after(d, fn) { return this.at(this.t + (d || 0), fn); }
  cancel(id) { this.q = this.q.filter(e => e.id !== id); }
  run(until) {
    for(let guard = 0; guard < 2000000; guard++) {
      let bi = -1;
      for(let i = 0; i < this.q.length; i++)
        if(this.q[i].t <= until && (bi < 0 || this.q[i].t < this.q[bi].t || (this.q[i].t == this.q[bi].t && this.q[i].seq < this.q[bi].seq))) bi = i;
      if(bi < 0) break;
      const e = this.q.splice(bi, 1)[0];
      this.t = e.t;
      e.fn();
    }
    this.t = Math.max(this.t, until);
  }
}

// ---------------------------------------------------------------------------------------------------------
// C controller + FPGA + scope model
const AUX = ['lock_ctrl_aux_lock_now', 'lock_ctrl_aux_launch_lock_trig', 'lock_ctrl_aux_pidB_enable_ctrl',
             'lock_ctrl_aux_pidA_enable_ctrl', 'lock_ctrl_aux_ramp_enable_ctrl', 'lock_ctrl_aux_set_pidB_enable',
             'lock_ctrl_aux_set_pidA_enable', 'lock_ctrl_aux_set_ramp_enable', 'lock_ctrl_aux_trig_type',
             'lock_ctrl_aux_lock_trig_rise'];
const AUXW = [1, 2, 4, 8, 16, 32, 64, 128, 256, 1024];
function compose(p) { let v = 0; AUX.forEach((k, i) => v += (p[k] | 0) * AUXW[i]); return v; }
const SCOPE_KEYS = ['xmin', 'xmax', 'trig_mode', 'trig_source', 'trig_edge', 'trig_delay', 'trig_level', 'single_btn',
                    'time_range', 'auto_flag', 'gain_ch1', 'gain_ch2', 'prb_att_ch1', 'prb_att_ch2'];
const CYC_MS = 125000;   // 8 ns cycles per ms
// Parameters the auto-set computes (src/main.c auto_set_params[]) and its result in this model
const AUTO_KEYS = ['xmin', 'xmax', 'trig_mode', 'trig_source', 'trig_delay', 'trig_level', 'time_range', 'time_units', 'auto_flag'];
const AUTO_RESULT = { xmin: 0, xmax: 1.5, trig_mode: 1, trig_source: 0, trig_delay: 0, trig_level: 0.1, time_range: 2, time_units: 1, auto_flag: 0 };
// lock registers mirrored in the params (lock_update() / lock_update_main()); lock_control is modelled apart (lc)
const isLockReg = k => k.startsWith('lock_') && !k.startsWith('lock_ctrl_aux_') && k != 'lock_lock_status' && k != 'lock_lock_control';

class Rig {
  constructor(clock, opt) {
    this.c = clock; this.o = opt;
    this.newC = opt.newC !== false;
    this.c2322 = !!opt.c2322 || !this.newC;   // v2.3.23: C of 2.3.14-2.3.22 (or older): blocking wait, re-arm on POST
    this.autoOld = !!opt.autoOld;
    this.gen = 0;                           // v2.3.23: scope_gen (+1 per scope POST)
    this.acq = { state: 0, gen: -1 };       // v2.3.23: scope_acq_state / scope_acq_gen (armed acquisition)
    this.cur = null;                        // v2.3.23: triggered long acquisition being read (partial traces)
    this.postDelay = opt.postDelay || 0;    // extra ms before a POST is answered (busy nginx)
    this.P = opt.P;                         // ramp period [ms]
    this.phase = clock.t + opt.phase;       // a scan floor
    this.cross = opt.cross;                 // level crossing, ms after the floor
    this.ramp_stop = Infinity;
    this.p = Object.assign({}, opt.init);
    this.w = Object.assign({}, this.p);     // worker copy (rp_osc_worker_update_params())
    this.fpga = {};                         // lock registers
    for(const k in this.p) if(isLockReg(k)) this.fpga[k] = this.p[k];
    this.autos = 0;
    this.gui_xmin = this.p.xmin; this.gui_xmax = this.p.xmax;
    this.lc = compose(this.p); this.lc_written = this.lc; this.last = this.lc & 0x1f;
    this.state = 0; this.lock_at = Infinity; this.count = 0; this.writes = 0; this.lock_write_t = [];
    this.sc = { mode: this.p.trig_mode, armed: null, single: false };   // armed: time it is armed (waiting)
    if(this.p.trig_mode == 1) this.acq = { state: 1, gen: 0 };
    this.cap_id = 0; this.dirty = null; this.served = null; this.captures = [];
    this.posts = []; this.gets = 0;
    if(this.p.trig_mode == 1) this.sc.armed = clock.t;
  }
  // ---- FPGA: ramp floors and lock state
  nextFloor(t) {   // first floor > t while the ramp runs
    const k = Math.floor((t - this.phase) / this.P) + 1;
    const f = this.phase + k * this.P;
    return f < this.ramp_stop ? f : Infinity;
  }
  firstAfter(t, off) {   // first floor_k + off > t (counter of lock_ctrl.v restarts at each floor)
    let k = Math.floor((t - off - this.phase) / this.P);
    for(let n = 0; n < 4; n++, k++) {
      const f = this.phase + k * this.P, e = f + off;
      if(e > t && f < this.ramp_stop) return e;
    }
    return Infinity;
  }
  syncLock(t) { if(this.state == 1 && this.lock_at <= t) this.state = 2; }
  writeLock(v, t) {
    this.syncLock(t);
    this.writes++; this.lock_write_t.push(t);
    const last = this.last, lc = v;
    const now_r = (lc & 1) && !(last & 1), launch_r = (lc & 2) && !(last & 2), rel = !(lc & 3);
    const man = ((lc ^ last) >> 2) & 7, type = (lc >> 8) & 3;
    const was = this.state;
    if(this.state == 0) {
      if(now_r) { this.state = 2; this.lock_at = t; }
      else if(launch_r) {
        this.state = 1;
        this.lock_at = type == 1 ? this.firstAfter(t, this.p.lock_lock_trig_time_val / CYC_MS)
                     : this.cross === null ? Infinity      // level never crossed
                     : type == 2 ? this.firstAfter(t, this.cross)
                     : type == 3 ? this.firstAfter(t, Math.max(this.cross, this.p.lock_lock_trig_time_val / CYC_MS)) : Infinity;
      }
    }
    else if(this.state == 1) {
      if(rel) { this.state = 0; this.lock_at = Infinity; }
      else if(now_r) { this.state = 2; this.lock_at = t; }
    }
    else if(rel || man) {     // release: the ramp starts again (unknown phase)
      this.state = 0; this.lock_at = Infinity; this.ramp_stop = Infinity; this.phase = t + rnd() * this.P;
    }
    if(this.lock_at < Infinity && !((lc >> 7) & 1)) this.ramp_stop = this.lock_at;   // set_ramp_enable = 0
    if(this.lock_at < Infinity && this.state != was) this.count += (this.lock_at <= t || this.state == 1) ? 1 : 0;
    this.lc = lc; this.last = lc & 0x1f;
  }
  status(t) {
    this.syncLock(t);
    const lc = this.lc, eff = this.state == 2 ? (lc >> 5) & 7 : (lc >> 2) & 7;
    return (this.count << 8) | (eff << 2) | ((this.state == 2) << 1) | (this.state == 1);
  }
  // ---- scope
  src() { const sw = this.fpga.lock_trig_sw; return this.p.trig_source == 2 ? (sw == 2 ? 'floor' : sw == 128 ? 'lock' : 'none') : 'none'; }
  xms(v) { return Number(v) * [1e-3, 1, 1e3][this.p.time_units]; }
  isLong() { return this.xms(this.p.xmax) - this.xms(this.p.xmin) >= 1500; }
  advance(t) {     // acquisitions up to time t
    this.syncLock(t);
    for(let g = 0; g < 1000 && this.sc.armed !== null; g++) {
      const ta = this.sc.armed, src = this.src();
      const tr = src == 'floor' ? this.nextFloor(ta) : src == 'lock' ? (this.lock_at > ta ? this.lock_at : Infinity) : Infinity;
      const x0 = this.xms(this.p.xmin), x1 = this.xms(this.p.xmax), long = this.isLong();
      // end of the acquisition: the window after the trigger (+1 ms); long windows (read every 200 ms): v2.3.23 C at
      // the end of the window + 2 ms, older C at the next read after the end of its 1024 points (+0.2 %)
      const ready = !long ? tr + Math.max(0, x1) + 1
                  : this.c2322 ? tr + Math.ceil((Math.max(0, x1 * 1.002) + 1) / 200) * 200
                  : tr + Math.max(0, x1) + 2;
      if(tr <= t && long) {
        if(!this.cur || this.cur.tr !== tr)
          this.cur = { tr, ready, gen: this.acq.gen, next: tr + 200, w: [tr + x0, tr + x1], src,
                       has_lock: this.lock_at >= tr + x0 && this.lock_at <= tr + x1, lock_rel: this.lock_at - tr };
      }
      if(tr <= t && this.acq.state < 3 && this.sc.armed <= t) this.acq.state = 3;
      if(!(ready <= t)) break;
      const cap = { id: ++this.cap_id, trig: tr, src, w: [tr + x0, tr + x1], ready, gen: this.acq.gen,
                    has_lock: this.lock_at >= tr + x0 && this.lock_at <= tr + x1, lock_rel: this.lock_at - tr };
      this.captures.push(cap);
      this.dirty = cap;
      this.cur = null;
      this.acq.state = 4;
      if(this.sc.mode == 1) { this.sc.armed = ready + this.wd(); this.acq = { state: 1, gen: this.gen }; }
      else this.sc.armed = null;
    }
    if(this.sc.armed !== null && this.acq.state == 1 && this.sc.armed <= t) this.acq.state = 2;
  }
  // GET: a partial trace of the long acquisition being read (v2.3.23 C: only from the trigger on, its own points)
  partial(t) {
    const c = this.cur;
    if(!c || t < c.next || t >= c.ready) return null;
    c.next = t + 200;
    return { id: 'p' + c.tr, partial: true, trig: c.tr, src: c.src, w: c.w, gen: c.gen, has_lock: c.has_lock, lock_rel: c.lock_rel };
  }
  wd() {           // worker: notices the change (usleep(1000) polling) + pre-trigger history (t_delay < 0) / 5 ms
    const x0 = this.xms(this.p.xmin);
    return 0.05 + rnd() * 1.2 + (x0 < 0 ? -x0 : 0) + (this.o.slow ? 5 : 0);
  }
  // ---- rp_set_params(): returns the time the POST is answered
  post(q, t) {
    this.advance(t);
    this.posts.push({ t, q });
    let scope = false, lockch = false;
    const old_req = (this.p.lock_ctrl_aux_lock_now ? 1 : 0) | (this.p.lock_ctrl_aux_launch_lock_trig ? 2 : 0);
    for(const k in q) {
      if(k == 'lock_lock_status' || k == 'lock_lock_control') continue;
      const cmp = (this.newC && k == 'xmin') ? this.gui_xmin : (this.newC && k == 'xmax') ? this.gui_xmax : this.p[k];
      const changed = this.newC ? cmp != q[k] : (k == 'xmin' || k == 'xmax' ? true : cmp != q[k]);
      if(changed) {
        if(SCOPE_KEYS.includes(k) || ['lock_oscA_sw', 'lock_oscB_sw', 'lock_osc_raw_mode', 'lock_osc_lockin_mode'].includes(k)) scope = true;
        else if(k.startsWith('lock_')) lockch = true;
      }
      this.p[k] = q[k];
    }
    const rise = ((this.p.lock_ctrl_aux_lock_now ? 1 : 0) | (this.p.lock_ctrl_aux_launch_lock_trig ? 2 : 0)) & ~old_req;
    let armed_at = null;
    let t_auto = 0;
    if(scope && this.p.auto_flag == 1) {
      // AUTO branch of rp_set_params(): auto-set in the worker, copy back, then (new C) the rest of the POST
      this.autos++; t_auto = 50;
      if(!this.autoOld) this.w = Object.assign({}, this.p);       // rp_osc_worker_start_auto_set()
      Object.assign(this.w, AUTO_RESULT);
      if(this.autoOld) this.p = Object.assign({}, this.w);        // whole (older) worker copy back
      else AUTO_KEYS.forEach(k => this.p[k] = this.w[k]);         // only auto_set_params[]
      this.w = Object.assign({}, this.p);                         // rp_set_params() of rp_update_main_params()
      this.gui_xmin = this.p.xmin; this.gui_xmax = this.p.xmax;
      this.sc.mode = this.p.trig_mode; this.sc.armed = t + t_auto + this.wd();
      if(this.autoOld) return t + t_auto + 0.3;                   // returned before lock_update()
      scope = false;                                               // scope done; lock part below
    }
    if(scope) {
      const same = ['xmin', 'xmax', 'trig_mode', 'trig_source', 'trig_edge', 'trig_delay', 'trig_level', 'time_range',
                    'lock_trig_sw'].every(k => this.w[k] == this.p[k]);
      this.w = Object.assign({}, this.p);                         // rp_osc_worker_update_params()
      this.gui_xmin = this.p.xmin; this.gui_xmax = this.p.xmax;
      this.gen++;
      this.sc.mode = this.p.trig_mode;
      const pending = this.sc.armed !== null && this.sc.single;
      if(this.p.trig_mode != 2) this.sc.single = false;
      if(this.p.trig_mode == 1) { this.sc.armed = t + this.wd(); this.acq = { state: 1, gen: this.gen }; this.cur = null; }
      else if(this.p.trig_mode == 2 && this.p.single_btn != 1) { this.sc.armed = null; this.dirty = null; this.cur = null; this.acq.state = 0; }
      if(this.p.single_btn == 1) {
        this.p.single_btn = 0;
        if(!this.c2322 && pending && same) {
          // v2.3.23: the same Single again (e.g. the POST sent again after a timeout): the acquisition goes on
          armed_at = this.sc.armed;
          this.acq.gen = this.gen; if(this.cur) this.cur.gen = this.gen;
        } else {
          this.dirty = null; this.cur = null;
          // v2.3.14-2.3.22: the worker sleeps the pre-trigger history without looking at new parameters: it arms
          // again only after the sleep in progress
          const busy = (this.c2322 && pending && this.sc.armed > t) ? this.sc.armed : t;
          armed_at = busy + this.wd();
          this.sc.armed = armed_at;
          this.acq = { state: 1, gen: this.gen };
        }
        this.sc.single = true;
      }
    }
    let t_done = t + t_auto + 0.3 + this.postDelay;
    if(this.o.slowSingle && q.single_btn == 1 && !this.slowDone) { this.slowDone = true; t_done += this.o.slowSingle; }   // busy nginx once
    if(lockch) {
      for(const k in this.p) if(isLockReg(k)) this.fpga[k] = this.p[k];   // lock_update()
      const lc = compose(this.p);
      if(lc != this.lc_written) {
        // Single armed in this POST + 0->1 request: lock_control written once the scope is armed.
        // v2.3.14-2.3.22: the POST waits for it, at most 100 ms + |xmin| (+5 ms) and 1.5 s; v2.3.23: the POST answers
        // at once and the worker writes it when it enables the trigger
        let tw = t;
        if(this.newC && armed_at !== null && rise) {
          if(this.c2322) {
            const x0 = this.xms(this.p.xmin);
            const wait = Math.min(1500, 100 + (x0 < 0 ? -x0 : 0) + 5);
            tw = Math.min(armed_at + 0.01, t + wait);
            t_done = Math.max(t_done, tw + 0.1 + this.postDelay);
          } else tw = armed_at + 0.01;
        }
        this.lc_written = lc;
        this.c.at(tw, () => { this.advance(this.c.t); this.writeLock(lc, this.c.t); });
      }
    }
    return t_done;
  }
  params(t) {
    this.advance(t);
    for(const k in this.fpga) this.p[k] = this.fpga[k];           // lock_update_main(): registers -> params
    const r = Object.assign({}, this.p);
    r.lock_lock_status = this.status(t); r.lock_lock_control = this.lc; r.single_btn = 0;
    if(!this.c2322) {    // v2.3.23 read-only scope state
      r.scope_gen = this.gen; r.scope_acq_state = this.acq.state; r.scope_acq_gen = this.acq.gen;
      r.sig_gen = this.served ? this.served.gen : -1;
    }
    return r;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Web UI environment
function makeEnv(rig, clock) {
  const dom = {}, log = [];
  const D = id => (dom[id] = dom[id] || { cls: new Set(), val: undefined, text: '', html: '', prop: {}, shown: true });
  const el = sel => {
    const ids = String(sel).split(',').map(s => s.trim().replace(/^#/, '')).filter(s => s);
    const o = {
      val(v) { if(v === undefined) return D(ids[0]).val; ids.forEach(i => D(i).val = v); return o; },
      prop(k, v) { if(v === undefined) return D(ids[0]).prop[k]; ids.forEach(i => D(i).prop[k] = v); return o; },
      html(v) { if(v === undefined) return D(ids[0]).html; ids.forEach(i => { D(i).html = String(v); D(i).text = String(v); }); return o; },
      text(v) { if(v === undefined) return D(ids[0]).text; ids.forEach(i => { D(i).text = String(v); D(i).html = String(v); }); return o; },
      show() { ids.forEach(i => D(i).shown = true); return o; }, hide() { ids.forEach(i => D(i).shown = false); return o; },
      data() { return o; }, focus() { return o; }, blur() { return o; }, trigger() { return o; }, parent() { return o; },
      closest() { return { length: 1 }; }, attr() { return undefined; }, on() { return o; }, find() { return o; }, not() { return o; },
      tooltip() { return o; },
      addClass(c) { ids.forEach(i => c.split(' ').forEach(x => D(i).cls.add(x))); return o; },
      removeClass(c) { ids.forEach(i => c.split(' ').forEach(x => D(i).cls.delete(x))); return o; },
      toggleClass(c, st) { ids.forEach(i => c.split(' ').forEach(x => { const s = D(i).cls;
        const on = (st === undefined ? !s.has(x) : !!st); if(on) s.add(x); else s.delete(x); })); return o; },
      hasClass(c) { return D(ids[0]).cls.has(c); },
      is(c) { return c == ':checked' ? !!D(ids[0]).prop.checked : c.startsWith('.') ? o.hasClass(c.slice(1)) : false; },
      length: 1,
    };
    return o;
  };
  const $ = sel => (sel && typeof sel == 'object') ? el('#' + (sel.id || 'doc')) : el(sel);
  $.inArray = (v, a) => a.indexOf(v);
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
  const LAT = 2;   // ms of network each way
  $.ajax = o => {
    const d = $.Deferred();
    if(o.type == 'POST') {
      const q = JSON.parse(o.data).datasets.params;
      const t0 = clock.t;
      log.push({ t: clock.t, kind: 'POST', q });
      // v2.3.23: answer later than o.timeout: the page gets 'timeout' (the server has applied the POST anyway)
      let settled = false;
      if(o.timeout) clock.at(t0 + o.timeout, () => { if(!settled) { settled = true; log.push({ t: clock.t, kind: 'TIMEOUT', q });
                                                                     d.reject({}, 'timeout'); } });
      clock.after(LAT, () => {
        const tdone = rig.post(q, clock.t);
        clock.at(tdone, () => { const r = rig.params(clock.t); clock.after(LAT, () => { if(settled) return; settled = true;
          d.resolve({ app: { id: 'x' }, status: 'OK', datasets: { params: r, g1: [] } }); }); });
      });
    }
    else {
      rig.gets++;
      log.push({ t: clock.t, kind: 'GET' });
      const t0 = clock.t + LAT;
      const tick = () => {       // nginx rp_data_get_signals(): up to 200 x 1 ms for new signals
        rig.advance(clock.t);
        const part = rig.dirty ? null : rig.partial(clock.t);    // v2.3.23: partial trace (AGAIN, new data)
        if(part) { rig.served = part; rig.partials = (rig.partials || 0) + 1; }
        if(rig.dirty || part || clock.t >= t0 + 200) {
          const cap = rig.dirty, ok = !!cap;
          if(cap) { rig.served = cap; rig.dirty = null; }
          const c = rig.served, r = rig.params(clock.t);
          const g1 = [{ data: [[0, 0]], cap: c }, { data: [[0, 0]], cap: c }];
          clock.after(LAT, () => d.resolve({ app: { id: 'x' }, status: ok ? 'OK' : 'AGAIN', datasets: { params: r, g1 } }));
          return;
        }
        clock.after(1, tick);
      };
      clock.at(t0, tick);
    }
    return d.promise();
  };
  let setdata = 0;
  const axes = { min: rig.p.xmin, max: rig.p.xmax };
  const plot = { getOptions() { return { xaxes: [axes], yaxes: [{}, {}] }; }, setupGrid() {}, draw() {}, width() { return 500; },
                 setData() { setdata++; }, getAxes() { return { xaxis: axes, yaxis: { min: -1, max: 1 } }; } };
  const ctx = { $, console: { log(m) { log.push({ t: clock.t, kind: 'LOG', m: String(m) }); }, info() {}, warn(m) { log.push({ t: clock.t, kind: 'WARN', m: String(m) }); } },
    Object, JSON, Math, Number, isFinite, isNaN, parseInt, parseFloat, String, Array,
    Date: { now: () => clock.t }, setTimeout: (f, d) => clock.after(d, f), clearTimeout: id => clock.cancel(id),
    document: { activeElement: null }, plot, autorun: 0, refresh_counter: 0, meas_panel_dec: 5, trigger_just_set: false,
    last_unit_mode: 0, downloading: false, user_editing: false, control_lost: false, trig_dragging: false, last_get_failed: false,
    floatToLocalString: x => String(x), shortenFloat: x => x, convertHz: x => x, convertSec: x => x, parseLocalFloat: parseFloat,
    format_oom: (n, u) => String(n) + u,
    lock_ramp_step_update() {}, lock_modulation_update() {}, lock_ctrl_update() {}, lock_pidA_update() {}, lock_pidB_update() {},
    lpf_update() {}, display_update() {}, updateTriggerSlider() {}, saveState() {}, redrawPlot() {}, updateRanges() {}, initPlot() {},
    filterData: d => d, showModalError: m => log.push({ t: clock.t, kind: 'MODAL', m }), app_id: 'x', post_url: '/data', get_url: '/data',
    request_timeout: 10000, update_interval: 50, isEscapeKey: e => e.key == 'Escape' };
  vm.createContext(ctx);
  let code = ['sending', 'send_que', 'send_que_all', 'single_que', 'use_long_timeout', 'readonly_keys', 'display_keep_keys', 'unsent_base',
    'unsent_skip_keys', 'always_send_params', 'last_send_params', 'post_chunk_timeout', 'post_chunk_retries', 'long_timeout',
    'post_min_gap_ms', 'post_max_per_s', 'post_starts', 'post_rate_timer', 'post_rate_args', 'lock_enable_keys'].map(varSrc).join('\n');
  // v2.3.18: Single poll and read-only keys of the send_all (absent in older pages)
  code += '\n' + ['server_ro_keys', 'single_poll_ms', 'single_seq', 'single_seq_done'].map(varSrcOpt).join('\n');
  // v2.3.23: plot_epoch (Reset zoom), absent in older pages
  code += '\n' + (js.includes('var plot_epoch = 0') ? 'var plot_epoch = 0, plot_epoch_post = false;' : '') + '\n';
  code += '\nvar params = {original:null, local:null};\nvar post_max_bytes = 600;\nvar post_inflight = 0, last_post_end = 0;\n' +
          'var set_trigger_val = false, plot_time_units = null, update_timer = null, datasets = [];\n';
  if(js.includes('function scheduleSinglePoll(')) code += fnSrc('scheduleSinglePoll') + '\n';
  code += ['unsentChanges', 'loadParams', 'updateTimeUnits', 'isParamChanged', 'splitParams', 'postParamsChunks', 'sendParams',
           'postEnd', 'sendableValue', 'isSendable', 'hasRealChange', 'lockStatus', 'lockSetBtn', 'lock_status_display',
           'doGetData', 'runStop', 'singleUpdate', 'serverAutoScale', 'onDropdownChange', 'timeUnitFactor', 'rampPeriodCycles',
           'clickToTrigTime', 'clickToTrigLevel', 'trigFromGraphTargets'].map(fnSrc).join('\n');
  code += '\n' + js.slice(js.indexOf('// [LOCK CAPTURE BEGIN]'), js.indexOf('// [LOCK CAPTURE END]'));
  // updateGraphData() without the 2.0 claim checks (not part of this test)
  // (v2.3.18: scope_stop = Stop button, as the real one)
  code += '\nvar scope_stop = false;\nfunction updateGraphData() { if(downloading || scope_stop) return; if(update_timer) { clearTimeout(update_timer); update_timer = null; }' +
          ' downloading = true; doGetData(); }\n';
  code += '\nvar clickRequest = ' + handlerSrc("$('#lock_ctrl_aux_launch_lock_trig,#lock_ctrl_aux_lock_now').on('click'") + ';\n';
  code += '\nvar clickSetTrig = ' + handlerSrc("$('#btn_set_trig').on('click'") + ';\n';
  code += '\nvar plotClick = ' + handlerSrc('$("#plot_holder").on("plotclick"') + ';\n';
  code += '\nvar keyDown = ' + handlerSrc("$(document).on('keydown', function(e) {\n      if(set_trigger_val") + ';\n';
  code += '\nvar changeTrigMode = ' + handlerSrc("$('#trig_mode').on('change'") + ';\n';
  code += '\nvar changeCapture = ' + handlerSrc("$('#ui_capture_lock').on('change'") + ';\n';
  code += '\nthis.__get = function(e){return eval(e)};';
  vm.runInContext(code, ctx);
  const get = e => ctx.__get(e);
  const E = {
    log, dom, get, rig, clock, plot, axes,
    setdata: () => setdata,
    posts(from) { return log.filter(l => l.kind == 'POST' && (from === undefined || l.t >= from)); },
    run(ms) { clock.run(clock.t + ms); },
    click(id) { get('clickRequest').call({ id }); },
    select(id, v) {       // user changes a <select>
      D(id).val = v;
      if(id == 'trig_mode') get('changeTrigMode').call({ id });
      else get('onDropdownChange')($('#' + id), id);
    },
    msg() { return D('btn_set_trig_msg').html; },
    banner() { return D('lock_capture_banner').shown ? D('lock_capture_banner').html : ''; },
    shownCap() { const d = get('datasets'); return d.length && d[0].cap ? d[0].cap : null; },
  };
  // first GET, then normal polling
  get('loadParams')(rig.params(clock.t));
  ctx.autorun = (rig.p.trig_mode == 2 ? 0 : 1);
  get('updateGraphData')();
  return E;
}

// ---------------------------------------------------------------------------------------------------------
// Scenario: ramp period 20 ms, scope window 0..20 ms after the scan floor (time units ms), time trigger at 7 ms
const P = 20, T_LOCK = 7, CROSS = 12;
const base = { xmin: 0, xmax: 20, single_btn: 0, auto_flag: 0, time_units: 1, trig_mode: 1, trig_source: 2, trig_edge: 0,
  trig_delay: 0, trig_level: 0, time_range: 3, lock_trig_sw: 2, lock_osc_raw_mode: 0, lock_pidA_kp: 100,
  lock_lock_trig_time_val: T_LOCK * CYC_MS, lock_lock_trig_val: 800, lock_lock_trig_sw: 0,
  lock_ramp_step: 999, lock_ramp_low_lim: -625, lock_ramp_hig_lim: 625, lock_ramp_sawtooth: 0,
  lock_ctrl_aux_lock_now: 0, lock_ctrl_aux_launch_lock_trig: 0, lock_ctrl_aux_pidB_enable_ctrl: 0,
  lock_ctrl_aux_pidA_enable_ctrl: 0, lock_ctrl_aux_ramp_enable_ctrl: 1, lock_ctrl_aux_set_pidB_enable: 1,
  lock_ctrl_aux_set_pidA_enable: 1, lock_ctrl_aux_set_ramp_enable: 0, lock_ctrl_aux_trig_type: 1, lock_ctrl_aux_lock_trig_rise: 0,
  lock_lock_status: 28, lock_lock_control: 0 };

function setup(o) {
  o = o || {};
  const clock = new Clock();
  const init = Object.assign({}, base, o.init || {});
  const rig = new Rig(clock, { P: o.P || P, phase: o.phase !== undefined ? o.phase : rnd() * (o.P || P), cross: o.cross !== undefined ? o.cross : CROSS,
                               init, newC: o.newC, slow: o.slow, autoOld: o.autoOld, c2322: o.c2322, postDelay: o.postDelay,
                               slowSingle: o.slowSingle });
  const E = makeEnv(rig, clock);
  E.get('ui_capture_lock = ' + (o.capture === false ? 0 : 1));
  E.get('ui_fire_on_click = ' + (o.fire === false ? 0 : 1));
  E.run(100 + rnd() * 37);
  return E;
}

let fails = 0, n = 0;
function check(name, cond, E, extra) {
  n++;
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  [' + extra + ']' : ''));
  if(!cond) { fails++; if(E) console.log('   ' + E.log.filter(l => l.kind != 'GET').slice(-8).map(l => l.t.toFixed(2) + ' ' + l.kind + ' ' + (l.q ? JSON.stringify(l.q) : l.m)).join('\n   ')); }
}
function info(name, v) { console.log('INFO ' + name + ': ' + v); }
const has = (q, k, v) => q && (k in q) && (v === undefined || q[k] == v);

console.log('=== Capture Lock / Fire on click (' + file + ') ===');

// ---- 1. POST sequence and capture with the Time trigger ---------------------------------------------------
{
  const E = setup({ phase: 3.3 });
  const t0 = E.clock.t;
  E.click('lock_ctrl_aux_launch_lock_trig');
  E.run(300);
  const ps = E.posts(t0);
  check('1.1 Trigger Lock with Capture Lock: 2 POSTs', ps.length == 2, E, ps.length + ' POSTs');
  const q1 = ps[0] && ps[0].q, q2 = ps[1] && ps[1].q;
  check('1.2 POST 1: Single + Ext Trig 128 (source already External) + window shifted by the lock time (-7..13 ms), no request',
        has(q1, 'trig_mode', 2) && E.rig.p.trig_source == 2 && has(q1, 'lock_trig_sw', 128) && Math.abs(q1.xmin + 7) < 1e-9 &&
        Math.abs(q1.xmax - 13) < 1e-9 && !has(q1, 'lock_ctrl_aux_launch_lock_trig', 1) && !has(q1, 'single_btn', 1), E, JSON.stringify(q1));
  check('1.3 POST 2: single_btn = 1 and launch_lock = 1 in the same POST', has(q2, 'single_btn', 1) &&
        has(q2, 'lock_ctrl_aux_launch_lock_trig', 1), E, JSON.stringify(q2));
  const R = E.rig, armed = R.captures.length ? R.captures[R.captures.length - 1] : null;
  check('1.4 lock_control written after the scope was armed (C waits)', R.lock_write_t.length == 1 && R.posts.length >= 2, E);
  check('1.5 capture: triggered by the lock event, the lock inside the window (t = 0)', armed && armed.src == 'lock' && armed.has_lock &&
        Math.abs(armed.lock_rel) < 1e-9, E, armed ? JSON.stringify(armed) : 'no capture');
  check('1.6 UI: capture drawn, state captured, banner "Lock captured ... press Auto or Single"',
        E.shownCap() && E.shownCap().id == armed.id && E.get('lock_cap.state') == 'captured' && /Lock captured/.test(E.banner()) &&
        /press Auto or Single/.test(E.banner()), E, E.banner());
  check('1.7 UI: label LOCKED, Trigger Lock pressed', E.dom.lock_status_label.text == 'LOCKED' &&
        E.dom.lock_ctrl_aux_launch_lock_trig.cls.has('btn-primary'), E);
  // frozen
  const sd = E.setdata(), g0 = E.rig.gets;
  E.run(5000);
  check('1.8 frozen 5 s: no redraw, same capture shown, slow polling for the lock state', E.setdata() == sd &&
        E.shownCap().id == armed.id && E.rig.gets - g0 >= 5 && E.rig.gets - g0 <= 15, E, (E.rig.gets - g0) + ' GETs');
  E.get('params.local').lock_pidA_kp = 150; E.get('sendParams')(); E.run(500);
  check('1.9 unrelated change (kp) while frozen: still frozen', E.setdata() == sd && E.get('lock_cap.state') == 'captured', E);
  E.click('lock_ctrl_aux_launch_lock_trig'); E.run(500);
  check('1.10 release (2nd click): lock released, capture still frozen', E.rig.state == 0 && E.setdata() == sd &&
        E.get('lock_cap.state') == 'captured', E);
  // Auto: restore
  const t1 = E.clock.t;
  E.select('trig_mode', 0); E.run(300);
  const qa = E.posts(t1)[0] && E.posts(t1)[0].q;
  check('1.11 trig_mode Auto: capture ends, saved scope settings restored in the same POST (source 2, Ext Trig 2, 0..20 ms)',
        E.get('lock_cap.state') == 'off' && has(qa, 'trig_mode', 0) && has(qa, 'lock_trig_sw', 2) && has(qa, 'xmin', 0) && has(qa, 'xmax', 20) &&
        E.banner() == '', E, JSON.stringify(qa));
  check('1.12 after Auto: the plot is refreshed again', E.setdata() > sd, E);
}

// ---- 2. 5/5 captures (Time and Level) and robustness over random phases / worker delays ------------------------
function captureRun(o) {
  const E = setup(o);
  const c0 = E.rig.captures.length;
  if(o.lockNow) E.click('lock_ctrl_aux_lock_now'); else E.click('lock_ctrl_aux_launch_lock_trig');
  if(o.unrelated) { E.run(o.unrelated); E.get('params.local').lock_pidA_kp = 133; E.get('sendParams')(); }
  E.run(600);
  const cap = E.shownCap();
  const ok = E.rig.state == 2 && cap && cap.has_lock && E.rig.captures.length > c0 && cap.id == E.rig.captures[E.rig.captures.length - 1].id &&
             (o.capture === false || (E.get('lock_cap.state') == 'captured' && cap.src == 'lock'));
  return { ok, E, cap };
}
for(const [name, init] of [['Time', {}], ['Level', { lock_ctrl_aux_trig_type: 2 }], ['Level+time', { lock_ctrl_aux_trig_type: 3 }]]) {
  let ok5 = 0;
  for(let i = 0; i < 5; i++) ok5 += captureRun({ init, phase: i * P / 5 + 1.7 }).ok ? 1 : 0;
  check('2.1 ' + name + ' trigger: 5/5 captures with the lock inside', ok5 == 5, null, ok5 + '/5');
  let okn = 0;
  for(let i = 0; i < RUNS; i++) okn += captureRun({ init }).ok ? 1 : 0;
  check('2.2 ' + name + ' trigger: ' + RUNS + ' random phases / worker delays', okn == RUNS, null, okn + '/' + RUNS);
}
{
  let ok = 0;
  for(let i = 0; i < 20; i++) ok += captureRun({ lockNow: true }).ok ? 1 : 0;
  check('2.3 Lock Now with Capture Lock: 20/20 (the scope is armed before lock_now is written)', ok == 20, null, ok + '/20');
  const Q = captureRun({ lockNow: true }).E;
  check('2.3b Lock Now: window with the lock at 30 % (-6..14 ms), no floor offset', Math.abs(Q.get('params.local').xmin + 6) < 1e-9 &&
        Math.abs(Q.get('params.local').xmax - 14) < 1e-9 && Q.get('lock_cap.offset_s') === null, Q);
  // short window (1 ms): the capture is ready < 2 ms after the lock, while GETs may be in flight
  ok = 0;
  // scope without triggers before the request (Ext Trig None): every GET waits 200 ms, one is in flight
  for(let i = 0; i < 50; i++) ok += captureRun({ lockNow: i % 2 == 0, init: { xmin: 0, xmax: 1, lock_trig_sw: i % 4 < 2 ? 2 : 0 } }).ok ? 1 : 0;
  check('2.3c window of 1 ms (Lock Now / Time): 50/50, no GET in flight can take the capture before the UI waits for it',
        ok == 50, null, ok + '/50');
  ok = 0;
  for(let i = 0; i < 50; i++) ok += captureRun({ init: { lock_ctrl_aux_trig_type: 2 }, slow: true }).ok ? 1 : 0;
  check('2.4 long ranges (worker +5 ms before arming): 50/50', ok == 50, null, ok + '/50');
  ok = 0;
  for(let i = 0; i < 50; i++) ok += captureRun({ init: { lock_ctrl_aux_trig_type: 2 }, unrelated: 1 + rnd() * 9 }).ok ? 1 : 0;
  check('2.5 unrelated POST (kp) while waiting for the lock: 50/50 (v2.3.14 C: the scope is not reset)', ok == 50, null, ok + '/50');
}
// before v2.3.14 (informative): Normal + External + Scan floor, Capture Lock off; and the old C model
{
  let ok = 0;
  for(let i = 0; i < RUNS; i++) ok += captureRun({ capture: false, newC: false }).ok ? 1 : 0;
  info('2.6 v2.3.13 way (Normal/Scan floor, Capture off, old C), Time trigger, window = ramp period', ok + '/' + RUNS + ' captures');
  ok = 0;
  for(let i = 0; i < RUNS; i++) ok += captureRun({ capture: false, newC: true }).ok ? 1 : 0;
  info('2.7 same with the v2.3.14 C (POST does not re-arm the scope)', ok + '/' + RUNS + ' captures');
  ok = 0;
  for(let i = 0; i < 50; i++) ok += captureRun({ init: { lock_ctrl_aux_trig_type: 2 }, unrelated: 1 + rnd() * 9, newC: false }).ok ? 1 : 0;
  info('2.8 Capture Lock with the old C and an unrelated POST while waiting', ok + '/50 captures (each POST disarmed the Single)');
}

// ---- 3. Fire on click ---------------------------------------------------------------------------------------
{
  const E = setup({ phase: 5.1 });
  E.run(200);
  const sd0 = E.setdata();
  E.get('clickSetTrig')();
  check('3.1 Choose from graph: pending, message, button "Cancel"', E.get('set_trigger_val') && /Click on the graph/.test(E.msg()) &&
        /fire Trigger Lock/.test(E.msg()) && E.dom.btn_set_trig.text == 'Cancel', E, E.msg());
  const t0 = E.clock.t;
  E.get('plotClick')(null, { x: 9, y: 0.1 });
  E.run(400);
  const ps = E.posts(t0);
  const q1 = ps[0] && ps[0].q, q2 = ps[1] && ps[1].q;
  check('3.2 one click: POST 1 with lock_trig_time = 9 ms (1125000) + capture settings, POST 2 single + Trigger Lock',
        ps.length == 2 && has(q1, 'lock_lock_trig_time_val', 1125000) && has(q1, 'lock_trig_sw', 128) &&
        has(q2, 'single_btn', 1) && has(q2, 'lock_ctrl_aux_launch_lock_trig', 1), E, ps.map(p => JSON.stringify(p.q)).join(' | '));
  const cap = E.shownCap();
  check('3.3 locked at floor + 9 ms and captured (lock at t = 0, offset 9 ms)', E.rig.state == 2 && cap && cap.has_lock &&
        Math.abs(E.get('lock_cap.offset_s') - 0.009) < 1e-12 && E.setdata() > sd0, E);
  check('3.4 pending click consumed (button back to "Choose from graph")', !E.get('set_trigger_val') &&
        E.dom.btn_set_trig.text == 'Choose from graph', E);
  // LOCKED: click on the captured trace at x = -2 ms (lock-relative) -> 7 ms from the floor: release + arm again
  const cnt0 = E.rig.count, id0 = cap.id, t1 = E.clock.t;
  E.get('clickSetTrig')();
  check('3.5 on the frozen capture (Time trigger, known offset): no warning', !/text-danger/.test(E.msg()), E, E.msg());
  E.get('plotClick')(null, { x: -2, y: 0 });
  E.run(500);
  const ps2 = E.posts(t1), r1 = ps2[0] && ps2[0].q, r2 = ps2[1] && ps2[1].q;
  check('3.6 while LOCKED: POST 1 releases (launch 0) with time = 7 ms (875000), POST 2 arms again with Single',
        ps2.length == 2 && has(r1, 'lock_ctrl_aux_launch_lock_trig', 0) && has(r1, 'lock_lock_trig_time_val', 875000) &&
        has(r2, 'lock_ctrl_aux_launch_lock_trig', 1) && has(r2, 'single_btn', 1), E, ps2.map(p => JSON.stringify(p.q)).join(' | '));
  const cap2 = E.shownCap();
  check('3.7 new lock (count +1) at floor + 7 ms, new capture with the lock inside', E.rig.count == cnt0 + 1 && E.rig.state == 2 &&
        cap2 && cap2.id != id0 && cap2.has_lock && Math.abs(E.get('lock_cap.offset_s') - 0.007) < 1e-12, E);
  check('3.8 the window of the new capture is the original one shifted again (-7..13 ms): saved settings kept',
        Math.abs(E.get('params.local').xmin + 7) < 1e-9 && Math.abs(E.get('params.local').xmax - 13) < 1e-9 &&
        E.get('lock_cap.saved').xmax_s == 0.02, E,
        E.get('params.local').xmin + '..' + E.get('params.local').xmax);
  // Single: restore and a normal single acquisition
  const t2 = E.clock.t;
  E.get('singleUpdate')(); E.run(200);
  const qs = E.posts(t2)[0] && E.posts(t2)[0].q;
  check('3.9 Single on the frozen capture: settings restored (Ext Trig 2, 0..20 ms), Single mode, single_btn', E.get('lock_cap.state') == 'off' &&
        has(qs, 'lock_trig_sw', 2) && has(qs, 'xmin', 0) && has(qs, 'single_btn', 1) && E.get('params.local').trig_mode == 2 &&
        !has(qs, 'trig_mode', 1), E, JSON.stringify(qs));
}
{
  // Fire on click off: the click only sets the value
  const E = setup({ fire: false });
  E.get('clickSetTrig')();
  const t0 = E.clock.t;
  E.get('plotClick')(null, { x: 4, y: 0 });
  E.run(300);
  const ps = E.posts(t0);
  check('3.10 Fire on click off: 1 POST with the time only, no request', ps.length == 1 && has(ps[0].q, 'lock_lock_trig_time_val', 500000) &&
        !has(ps[0].q, 'lock_ctrl_aux_launch_lock_trig', 1) && E.rig.state == 0, E);
  // Capture off + Fire on click: values then request, no scope change
  const E2 = setup({ capture: false });
  E2.get('clickSetTrig')();
  const t1 = E2.clock.t;
  E2.get('plotClick')(null, { x: 4, y: 0 });
  E2.run(300);
  const p2 = E2.posts(t1);
  check('3.11 Capture off + Fire on click: POST 1 value, POST 2 Trigger Lock, scope untouched', p2.length == 2 &&
        has(p2[0].q, 'lock_lock_trig_time_val', 500000) && has(p2[1].q, 'lock_ctrl_aux_launch_lock_trig', 1) &&
        !has(p2[0].q, 'trig_mode') && !has(p2[1].q, 'single_btn', 1) && E2.rig.state == 2, E2, p2.map(p => JSON.stringify(p.q)).join(' | '));
}

// ---- 4. "Choose from graph" warning recomputed, cancel ------------------------------------------------------------
{
  const E = setup({ capture: false });
  E.get('clickSetTrig')();
  check('4.1 Normal/External/Scan floor: no warning', !/text-danger/.test(E.msg()), E, E.msg());
  E.select('trig_mode', 0); E.run(100);
  check('4.2 trig_mode -> Auto: no warning (v2.2.11: Auto waits for the scan floor; it was a warning up to the previous version)', !/text-danger/.test(E.msg()), E, E.msg());
  E.select('trig_mode', 1); E.run(100);
  check('4.3 back to Normal: no warning', !/text-danger/.test(E.msg()) && E.get('set_trigger_val'), E);
  E.select('lock_trig_sw', 4); E.run(100);
  check('4.4 Ext Trig -> Scan ceil: warning', /text-danger/.test(E.msg()), E);
  E.select('lock_trig_sw', 2); E.select('trig_source', 0); E.run(100);
  check('4.5 Ext Trig back, source -> Channel 1: warning', /text-danger/.test(E.msg()), E);
  E.select('trig_source', 2); E.run(100);
  E.select('lock_ctrl_aux_trig_type', 2); E.run(100);
  check('4.6 trigger type Level: no time -> no warning, message says level', !/text-danger/.test(E.msg()) && /level trigger/.test(E.msg()), E, E.msg());
  E.get('keyDown')({ key: 'Escape' });
  check('4.7 Escape cancels the pending click', !E.get('set_trigger_val') && E.msg() == '' && E.dom.btn_set_trig.text == 'Choose from graph', E);
  E.get('clickSetTrig')(); E.get('clickSetTrig')();
  check('4.8 the button again cancels', !E.get('set_trigger_val') && E.msg() == '', E);
  const t0 = E.clock.t;
  E.get('plotClick')(null, { x: 4, y: 0.5 }); E.run(200);
  check('4.9 a click after the cancel does nothing', E.posts(t0).length == 0, E);
  E.get('clickSetTrig')();
  E.select('lock_ctrl_aux_trig_type', 0); E.run(100);
  check('4.10 trigger type OFF: the pending click is cancelled', !E.get('set_trigger_val'), E);
  // during a capture with the Level trigger: Level+time can only take the level
  const F = setup({ init: { lock_ctrl_aux_trig_type: 3 } });
  F.click('lock_ctrl_aux_launch_lock_trig'); F.run(600);
  F.get('clickSetTrig')();
  check('4.11 frozen capture, Level+time (unknown offset): warning "time can not be taken"', /can not be taken/.test(F.msg()), F, F.msg());
  const tv = F.get('params.local').lock_lock_trig_time_val, t1 = F.clock.t;
  F.get('plotClick')(null, { x: 3, y: 0.25 }); F.run(500);
  check('4.12 ... and the click sets only the level (2048), time unchanged', F.get('params.local').lock_lock_trig_val == 2048 &&
        F.get('params.local').lock_lock_trig_time_val == tv && F.posts(t1).length >= 1, F);
}

// ---- 5. Capture Lock unchecked / AUTO / release while waiting --------------------------------------------
{
  const E = setup({ init: { lock_ctrl_aux_trig_type: 2 } });
  E.rig.cross = null;   // the level is never crossed: waits forever
  E.click('lock_ctrl_aux_launch_lock_trig'); E.run(400);
  check('5.1 waiting for the lock: banner "waiting", no redraw of old data', E.get('lock_cap.state') == 'waiting' && /waiting/.test(E.banner()), E, E.banner());
  const t0 = E.clock.t;
  E.click('lock_ctrl_aux_launch_lock_trig'); E.run(300);
  const q = E.posts(t0)[0] && E.posts(t0)[0].q;
  check('5.2 release while waiting: capture cancelled, settings restored with the release (Normal, Ext Trig 2)', E.get('lock_cap.state') == 'off' &&
        has(q, 'lock_ctrl_aux_launch_lock_trig', 0) && has(q, 'trig_mode', 1) && has(q, 'lock_trig_sw', 2), E, JSON.stringify(q));
  const G = setup({});
  G.click('lock_ctrl_aux_launch_lock_trig'); G.run(600);
  G.dom.ui_capture_lock = G.dom.ui_capture_lock || { cls: new Set(), prop: {} };
  G.dom.ui_capture_lock.prop.checked = false;
  const t1 = G.clock.t;
  G.get('changeCapture').call({ id: 'ui_capture_lock' }); G.run(300);
  const q2 = G.posts(t1)[0] && G.posts(t1)[0].q;
  check('5.3 Capture Lock unchecked on a frozen capture: restored (Normal, Ext Trig 2, 0..20) and live again',
        G.get('lock_cap.state') == 'off' && has(q2, 'trig_mode', 1) && has(q2, 'lock_trig_sw', 2) && has(q2, 'xmax', 20) && G.get('autorun') == 1, G, JSON.stringify(q2));
  const H = setup({});
  H.click('lock_ctrl_aux_launch_lock_trig'); H.run(600);
  const t2 = H.clock.t;
  H.get('serverAutoScale')(); H.run(100);
  const q3 = H.posts(t2)[0] && H.posts(t2)[0].q;
  check('5.4 AUTO on a frozen capture: restored + auto_flag in the same POST', H.get('lock_cap.state') == 'off' &&
        has(q3, 'auto_flag', 1) && has(q3, 'lock_trig_sw', 2), H, JSON.stringify(q3));
  // 5.5 (2.3.14-23): capture, then kp / AWG changes (not scope: they do not reach the worker), then AUTO. The C before
  // the fix left Ext Trig = 128 (params and FPGA) and reverted the AWG value; then in Normal/External the scope only
  // triggered on a lock.
  function autoAfterCapture(autoOld) {
    const A = setup({ autoOld, phase: 3.3 });
    A.click('lock_ctrl_aux_launch_lock_trig'); A.run(600);
    const cap_ok = A.get('lock_cap.state') == 'captured' && A.rig.fpga.lock_trig_sw == 128;
    A.get('params.local').lock_pidA_kp = 140; A.get('params.local').gen_sig_amp_ch1 = 0.5;
    A.get('sendParams')(); A.run(500);
    const t3 = A.clock.t, a0 = A.rig.autos;
    A.get('serverAutoScale')(); A.run(1000);
    const q = A.posts(t3)[0] && A.posts(t3)[0].q, R = A.rig;
    const res = {
      cap_ok, q, autos: R.autos - a0,
      ext: R.p.lock_trig_sw, ext_fpga: R.fpga.lock_trig_sw, ui_ext: A.get('params.local').lock_trig_sw,
      kp: R.p.lock_pidA_kp, kp_fpga: R.fpga.lock_pidA_kp, amp: R.p.gen_sig_amp_ch1,
      win: [R.p.xmin, R.p.xmax], ui_win: [A.get('params.local').xmin, A.get('params.local').xmax], state: A.get('lock_cap.state'),
      live: A.get('autorun') == 1,
    };
    // then the user releases the lock (the ramp runs again) and selects source External (Normal): the scope
    // must trigger on the scan floor again
    A.click('lock_ctrl_aux_launch_lock_trig'); A.run(300);
    const c0 = R.captures.length;
    A.select('trig_source', 2); A.run(300);
    res.after = R.captures.slice(c0).map(c => c.src);
    res.released = R.state == 0;
    res.A = A;
    return res;
  }
  const r5 = autoAfterCapture(false);
  check('5.5a capture -> AUTO: one auto-set, capture ended, plot live', r5.cap_ok && r5.autos == 1 && r5.state == 'off' && r5.live,
        r5.A, JSON.stringify({ cap_ok: r5.cap_ok, autos: r5.autos, state: r5.state, live: r5.live }));
  check('5.5b capture -> AUTO: Ext Trig back to Scan floor (2) in the params, the FPGA and the UI', r5.ext == 2 && r5.ext_fpga == 2 && r5.ui_ext == 2,
        r5.A, 'params ' + r5.ext + ', FPGA ' + r5.ext_fpga + ', UI ' + r5.ui_ext);
  check('5.5c capture -> AUTO: window of the auto-set (not the capture one) in the server and in the UI',
        r5.win[0] == AUTO_RESULT.xmin && r5.win[1] == AUTO_RESULT.xmax && r5.ui_win[0] == AUTO_RESULT.xmin && r5.ui_win[1] == AUTO_RESULT.xmax,
        r5.A, JSON.stringify({ win: r5.win, ui_win: r5.ui_win }));
  check('5.5d capture -> AUTO: lock / AWG params set after the capture not reverted (kp 140, amp 0.5)',
        r5.kp == 140 && r5.kp_fpga == 140 && r5.amp == 0.5, r5.A, JSON.stringify({ kp: r5.kp, kp_fpga: r5.kp_fpga, amp: r5.amp }));
  check('5.5e after AUTO, release + source External (Normal): triggers on the scan floor again',
        r5.released && r5.after.length > 0 && r5.after.every(s => s == 'floor'), r5.A, r5.after.length + ' acquisitions: ' + JSON.stringify(r5.after.slice(0, 5)));
  const r5o = autoAfterCapture(true);
  const old_bug = r5o.ext == 128 && r5o.ext_fpga == 128 && r5o.amp != 0.5 && r5o.released && !r5o.after.some(s => s == 'floor');
  check('5.5f (model of the C before the fix) reproduces the RP2 failure: Ext Trig 128 in params and FPGA, AWG value reverted, no floor trigger',
        old_bug, null, JSON.stringify({ ext: r5o.ext, ext_fpga: r5o.ext_fpga, amp: String(r5o.amp), released: r5o.released, after: r5o.after.length }));
}

// ---- 6. UI preferences in the state / configs -------------------------------------------------------------------
{
  const E = setup({});
  const g = E.get;
  check('6.1 defaults: Capture Lock and Fire on click on', g('ui_capture_lock') == 1 && g('ui_fire_on_click') == 1 &&
        /id="ui_capture_lock" checked/.test(html) && /id="ui_fire_on_click" checked/.test(html));
  g('uiPrefsSet')({ ui_capture_lock: 0 });
  check('6.2 uiPrefsSet: only the given keys change', g('ui_capture_lock') == 0 && g('ui_fire_on_click') == 1);
  g('uiPrefsSet')({}); g('uiPrefsSet')(undefined);
  check('6.3 old state/config without preferences: unchanged', g('ui_capture_lock') == 0 && g('ui_fire_on_click') == 1);
  g('ui_capture_lock = 1');
  E.click('lock_ctrl_aux_launch_lock_trig'); E.run(600);
  const elem = { data: Object.assign({}, g('params.local')) };
  g('configAddCaptureUi')(elem);
  check('6.4 config saved during a capture: user scope settings (Normal, Ext Trig 2, 0..20 ms) and ui prefs',
        elem.data.trig_mode == 1 && elem.data.lock_trig_sw == 2 && elem.data.xmin == 0 && elem.data.xmax == 20 &&
        elem.ui && elem.ui.ui_capture_lock == 1 && elem.ui.ui_fire_on_click == 1, E, JSON.stringify(elem.ui));
  check('6.5 saveState(): writes ui_* and the saved scope (code check)', /\$\.extend\(s, uiPrefsGet\(\)\)/.test(fnSrc('saveState')) &&
        /lockCaptureSavedScope\(\)/.test(fnSrc('saveState')));
  check('6.6 restoreState(): applies ui_* and does not POST them (code check)', /uiPrefsSet\(saved\)/.test(fnSrc('restoreState')) &&
        /delete p\.ui_capture_lock/.test(fnSrc('restoreState')) && /delete p\.ui_fire_on_click/.test(fnSrc('restoreState')));
  check('6.7 config load: capture ended, ui of the config applied (code check)', /lockCaptureEnd\('none'\)/.test(fnSrc('config_load_storage')) &&
        /uiPrefsSet\(params\.storage\[num\]\.ui\)/.test(fnSrc('config_load_storage')));
}

// ---- 7. v2.3.18: light polling in Single, console reason of the end of a capture ------------------------------
{
  const E = setup({ capture: false });
  E.select('trig_mode', 2); E.run(300);
  const t0 = E.clock.t, g0 = E.rig.gets;
  E.run(5000);
  const g5 = E.rig.gets - g0;
  check('7.1 Single (no click): GET /data keeps polling, about 1 per second (not 0, not fast)', g5 >= 3 && g5 <= 7, E, g5 + ' GET in 5 s');
  const cap0 = E.shownCap() ? E.shownCap().id : 0, t1 = E.clock.t, c0 = E.rig.captures.length;
  E.get('singleUpdate')(); E.run(400);
  const cap1 = E.shownCap() ? E.shownCap().id : 0, newc = E.rig.captures.slice(c0);
  check('7.2 Single click: its acquisition is fetched at once (fast polling while waiting)', newc.length == 1 && cap1 == newc[0].id && cap1 != cap0,
        E, 'captures ' + newc.length + ', shown ' + cap1 + ' (before ' + cap0 + ')');
  const g1 = E.rig.gets; E.run(4000);
  const g4 = E.rig.gets - g1;
  check('7.3 after the acquisition: back to the slow poll', g4 >= 2 && g4 <= 6, E, g4 + ' GET in 4 s');
  E.select('trig_mode', 0); E.run(1000);
  const ga = E.rig.gets; E.run(1000);
  check('7.4 back to Auto: normal polling (one GET after another; 200 ms each without new data in this model)', E.rig.gets - ga >= 4, E, (E.rig.gets - ga) + ' GET in 1 s');
  E.select('trig_mode', 2); E.run(300);
  E.get('scope_stop = true'); E.run(1500);
  const gs = E.rig.gets; E.run(3000);
  check('7.5 Single with the plot stopped (Stop button): the poll chain ends', E.rig.gets - gs == 0, E, (E.rig.gets - gs) + ' GET in 3 s');
  E.get('scope_stop = false');

  const H = setup({});
  H.click('lock_ctrl_aux_launch_lock_trig'); H.run(600);
  H.get('serverAutoScale')(); H.run(100);
  const G = setup({});
  G.click('lock_ctrl_aux_launch_lock_trig'); G.run(600);
  G.dom.ui_capture_lock = G.dom.ui_capture_lock || { cls: new Set(), prop: {} };
  G.dom.ui_capture_lock.prop.checked = false;
  G.get('changeCapture').call({ id: 'ui_capture_lock' }); G.run(300);
  const msgs = H.log.concat(G.log).filter(l => l.kind == 'LOG' && /Capture Lock: ended by/.test(l.m)).map(l => l.m);
  check('7.6 console: "Capture Lock: ended by AUTO" / "... by unchecking Capture Lock", never "ended by ,"',
        msgs.some(m => /ended by AUTO,/.test(m)) && msgs.some(m => /ended by unchecking Capture Lock,/.test(m)) &&
        !msgs.some(m => /ended by ,/.test(m)), null, JSON.stringify(msgs));
}


// ---- 8. v2.3.23: slow scan, ramp period 30 s (testAgent 2026-10-15 on RP2: 2/7 captures) ----------------------------
// Window of Reset zoom on the 30 s scan: 0 .. 29.4 s (0.98 T, units s, Dec 524288); lock at 7.608 s after the floor
// (Time) or level crossing at 7.61 s (Level), Lock Now. Capture window: Time -7.608 .. 21.792 s, Level / Lock Now
// -8.82 .. 20.58 s: the worker needs 7.6-8.8 s of pre-trigger history before the trigger is enabled.
const SLOW = { xmin: 0, xmax: 29.4, time_units: 2, time_range: 9, lock_lock_trig_time_val: 7608 * CYC_MS };
function slowRun(o) {
  const init = Object.assign({}, SLOW, o.init || {});
  const E = setup({ P: 30000, cross: 7610, init, phase: o.phase, c2322: o.c2322, slowSingle: o.slowSingle });
  E.run(500);
  const t0 = E.clock.t, sd0 = E.setdata();
  E.click(o.lockNow ? 'lock_ctrl_aux_lock_now' : 'lock_ctrl_aux_launch_lock_trig');
  const r = { E, late_while_acq: 0, late: 0, partial_draws: 0, t_lock: null, t_cap: null, banners: new Set() };
  let lastSd = E.setdata();
  for(let k = 0; k < 900 && E.get('lock_cap.state') !== 'captured'; k++) {   // up to 90 s
    E.run(100);
    const b = E.banner(), st = E.get('lock_cap.state');
    r.banners.add(b.replace(/\(.*?\)/g, '()'));
    if(E.rig.state == 2 && r.t_lock === null) r.t_lock = E.rig.lock_at;
    const acquiring = E.rig.cur && E.rig.cur.src == 'lock';
    if(/LOCKED but not captured/.test(b)) { r.late++; if(acquiring) r.late_while_acq++; }
    if(st === 'waiting' && E.setdata() > lastSd && r.t_lock !== null) r.partial_draws++;
    lastSd = E.setdata();
  }
  E.run(1000);
  const cap = E.shownCap();
  r.captured = E.get('lock_cap.state') === 'captured' && !!cap && !cap.partial && cap.has_lock && cap.src == 'lock';
  r.t_cap = r.captured ? cap.ready - t0 : null;
  r.timeouts = E.log.filter(l => l.kind == 'TIMEOUT' && l.t >= t0).length;
  r.writes = E.rig.lock_write_t.filter(t => t >= t0);
  return r;
}
function slowSummary(rs) {
  return rs.filter(r => r.captured).length + '/' + rs.length + ' captured, late banner while acquiring ' +
         rs.reduce((a, r) => a + r.late_while_acq, 0) + ' x 100 ms, partial draws ' + rs.map(r => r.partial_draws).join(',') +
         ', POST timeouts ' + rs.reduce((a, r) => a + r.timeouts, 0);
}
{
  const cases = [['Time (7.608 s)', {}], ['Level (7.61 s)', { init: { lock_ctrl_aux_trig_type: 2 } }], ['Lock Now', { lockNow: true }]];
  for(const [name, o] of cases) {
    const rs = [];
    for(let i = 0; i < 8; i++) rs.push(slowRun(Object.assign({ phase: 1000 + i * 3700 }, o)));
    check('8.1 slow scan 30 s, ' + name + ': 8/8 captured with the lock inside, never "LOCKED but not captured" while the capture is acquired',
          rs.every(r => r.captured && r.late_while_acq == 0 && r.timeouts == 0), rs[0].E, slowSummary(rs));
    check('8.2 slow scan 30 s, ' + name + ': partial traces of the capture drawn while it is acquired (after the lock)',
          rs.every(r => r.partial_draws >= 20), null, slowSummary(rs));
  }
  const r = slowRun({ phase: 4100, init: { lock_ctrl_aux_trig_type: 2 } });
  check('8.3 banner while waiting: history being loaded, then waiting / acquiring', [...r.banners].some(b => /loading the scope history/.test(b)) &&
        [...r.banners].some(b => /acquiring the trace/.test(b)), r.E, [...r.banners].join(' | '));
  // the POST of Single + request answered after 2.5 s once (busy nginx): the page sends it again, the C does not arm again
  const rb = [];
  for(let i = 0; i < 6; i++) rb.push(slowRun({ phase: 2000 + i * 4300, slowSingle: 2500, lockNow: i % 2 == 0,
                                                init: i % 2 ? { lock_ctrl_aux_trig_type: 2 } : {} }));
  check('8.4 slow scan, the arming POST answered after 2.5 s (timeout, sent again): 6/6 captured, request written once',
        rb.every(r => r.captured && r.timeouts >= 1 && r.writes.length == 1), rb[0].E,
        slowSummary(rb) + ', lock_control writes ' + rb.map(r => r.writes.length).join(','));
  // a lock that the scope can not see (Ext Trig not on the lock event): the warning must still come
  const M = slowRun({ phase: 3000, init: { lock_ctrl_aux_trig_type: 2 }, c2322: false });
  {
    const F = setup({ P: 30000, cross: null, init: Object.assign({}, SLOW, { lock_ctrl_aux_trig_type: 2 }) });
    F.run(500);
    F.click('lock_ctrl_aux_launch_lock_trig');
    F.run(12000);                                          // armed, waiting (the level is never crossed)
    const armed = F.get('lock_cap.state') == 'waiting' && !/LOCKED but not captured/.test(F.banner());
    F.rig.fpga.lock_trig_sw = 0;                           // the scope does not see the lock event...
    F.rig.state = 2; F.rig.lock_at = F.clock.t;            // ...and the lock closes (e.g. from Python)
    F.run(1500);
    const early = /LOCKED but not captured/.test(F.banner());
    F.run(1500);
    check('8.5 LOCKED and the capture scope still waiting for its trigger: "LOCKED but not captured" after 2 s (not before)',
          armed && !early && /LOCKED but not captured/.test(F.banner()), F, F.banner());
  }
  void M;
  // reproduction: the model of the C of 2.3.14-2.3.22 with this page loses captures of the slow scan (RP2: 2/7)
  const ro = [];
  for(const [name, o] of cases) for(let i = 0; i < 4; i++) ro.push(slowRun(Object.assign({ phase: 1000 + i * 7100, c2322: true }, o)));
  const lost = ro.filter(r => !r.captured).length;
  check('8.6 (model of the C of 2.3.14-2.3.22) reproduces the RP2 failure: captures lost with the slow scan', lost >= 4, null,
        (ro.length - lost) + '/' + ro.length + ' captured');
}

console.log('=== ' + n + ' checks, ' + fails + ' failed ===');
process.exit(fails ? 1 : 0);
