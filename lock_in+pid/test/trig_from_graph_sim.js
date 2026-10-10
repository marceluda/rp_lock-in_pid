#!/usr/bin/env node
// Simulation of "Choose from graph" (Lock control -> Time/Level trigger) of lock_in+pid_harmonic.
//
// Chain modelled for each case:
//   GUI zoom (xmin, xmax in GUI units) -> server (port of transform_acq_params() + rp_set_params() of
//   src/main.c and of the time vector of rp_osc_decimate() in src/worker.c, ideal FPGA: the data point with
//   x = t is the signal at t from the scope trigger = scan floor) -> flot linear x axis (the user clicks the
//   pixel of the feature) -> pos.x -> lock_trig_time.
// The feature is a point of the ramp period at T_FEAT from the scan floor (expected lock_trig_time =
// round(T_FEAT / 8 ns)), drawn once per ramp period: the user clicks the copy that is on screen.
//
// NEW: functions between "[TRIG FROM GRAPH BEGIN]" and "[TRIG FROM GRAPH END]" of ../index.html
// OLD: the plotclick handler of v2.3.11 (copied below)
//
// Usage: node test/trig_from_graph_sim.js      (exit code 1 if a NEW case fails)
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/\/\/ \[TRIG FROM GRAPH BEGIN\][^\n]*\n([\s\S]*?)\/\/ \[TRIG FROM GRAPH END\]/);
if(!m) { console.error('markers not found in index.html'); process.exit(2); }
const NEW = new Function(m[1] + '\nreturn { rampPeriodCycles, clickToTrigTime, clickToTrigLevel, trigFromGraphTargets };')();

// ---- OLD (v2.3.11, index.html plotclick handler) ---------------------------------------------------------
function oldClick(pos, local) {
  var time_raw = pos.x;
  var level_raw = pos.y;
  var time_val  = Math.round(  time_raw  *( Math.pow(10, (local.time_units-2)*3 ) )/8e-9) ;
  var level_val = local.lock_osc_raw_mode==0 ? Math.round(level_raw*8192) : level_raw ;
  var max_time_val = 2*(local.lock_ramp_hig_lim-local.lock_ramp_low_lim)*(local.lock_ramp_step+1) ;
  time_val         = time_val % max_time_val;
  if(time_val<0) time_val = time_val + max_time_val;
  // v2.3.11 always wrote both
  return { time: time_val, level: level_val };
}

// ---- server model ----------------------------------------------------------------------------------------
const SIG_LEN = 16384, SIGNAL_LENGTH = 1024, FS = 125e6, TS = 8e-9;
const DEC = [1, 8, 64, 128, 256, 512, 1024, 8192, 65536, 524288];
const f32 = Math.fround;
function unitOfRange(r) { return (r <= 1) ? 0 : (r <= 6 ? 1 : 2); }
function factor(tu) { return Math.pow(10, 3 * (2 - tu)); }       // seconds -> GUI units

// Window requested by the GUI in units tu_gui (Normal trigger). If the server changes the units it forces the
// new range (forceX) and the GUI sends it again in the new units: the result is the one computed here.
function serverData(xmin, xmax, tu_gui) {
  let xmin_s = xmin / factor(tu_gui), xmax_s = xmax / factor(tu_gui);
  const rdec = (Math.max(xmax_s, 0) - xmin_s) * FS / SIG_LEN;
  let i; for(i = 0; i <= 9; i++) if(DEC[i] >= rdec) break; if(i > 9) i = 9;
  const dec = DEC[i], tu = unitOfRange(i), smpl = f32(TS * dec);
  let tdly = Math.trunc(SIG_LEN + xmin_s * FS / dec); tdly = Math.max(0, tdly);
  let t_delay = (tdly - SIG_LEN) * dec / FS;                       // TRIG_DLY_PARAM [s]
  // rp_set_params()
  const t_max_minus = (SIG_LEN - 6) * smpl;
  if(t_delay < -t_max_minus) t_delay = -t_max_minus; else t_delay = Math.round(t_delay / smpl) * smpl;
  const t_min = t_delay, t_max = (SIG_LEN - 1) * smpl + t_delay;
  let t_start = f32(Math.round(xmin_s / smpl) * smpl), t_stop = f32(Math.round(xmax_s / smpl) * smpl);
  if(t_start < t_min) t_start = t_min;
  if(t_stop > t_max) t_stop = t_max;
  if(t_stop <= t_start) t_stop = t_max;
  const si = Math.round(t_start / smpl), ei = Math.round(t_stop / smpl);
  let step = 1;
  if((ei - si) / (SIGNAL_LENGTH - 1) >= 1) step = Math.min(Math.ceil((ei - si) / (SIGNAL_LENGTH - 1)), SIG_LEN / SIGNAL_LENGTH);
  // rp_osc_decimate(): t[i] = (t_start + i*step*smpl) * unit_factor (float)
  const uf = factor(tu), xs = [];
  for(let k = 0; k < SIGNAL_LENGTH; k++) xs.push(f32(f32(t_start + k * step * smpl) * uf));
  return { tu: tu, dec: dec, step: step, xs: xs, axis: [xmin_s * uf, xmax_s * uf] };
}

// flot linear axis: the user clicks the pixel of the data point of the feature (integer pixel)
const PLOT_W = 1000;
function clickAt(xdata, axis) {
  const scale = PLOT_W / (axis[1] - axis[0]);
  const px = Math.round((xdata - axis[0]) * scale);              // p2c
  return axis[0] + px / scale;                                   // c2p -> pos.x
}

// ---- cases -----------------------------------------------------------------------------------------------
const T_FEAT_MS = 16.581;                                        // e.g. the zero crossing of the error in MODO LOCK
const ramp_tri = { lock_ramp_low_lim: -5000, lock_ramp_hig_lim: 5000, lock_ramp_step: 400, lock_ramp_sawtooth: 0 };
const ramp_saw = Object.assign({}, ramp_tri, { lock_ramp_sawtooth: 1 });

function periodTrue(r) {   // gen_ramp.v counted by hand (independent of rampPeriodCycles)
  const steps = r.lock_ramp_sawtooth ? (r.lock_ramp_hig_lim - r.lock_ramp_low_lim + 1) : 2 * (r.lock_ramp_hig_lim - r.lock_ramp_low_lim);
  return steps * (r.lock_ramp_step + 1);
}

const cases = [
  // name, ramp, xmin, xmax, units of xmin/xmax, local units override (stale) or null
  ['tri  auto-zoom window (-10%..110% of the period)', ramp_tri, -6.416, 70.576, 1, null],
  ['tri  lock_mode.json window, t=0 on screen',          ramp_tri, -2.0697, 33.4859, 1, null],
  ['tri  t=0 at the left edge',                          ramp_tri, 0, 20, 1, null],
  ['tri  [10, 25] ms, t=0 off screen',                   ramp_tri, 10, 25, 1, null],
  ['tri  [15, 18] ms, t=0 off screen',                   ramp_tri, 15, 18, 1, null],
  ['tri  [16.4, 16.9] ms -> us units, t=0 off',          ramp_tri, 16.4, 16.9, 1, null],
  ['tri  [16500, 16650] us, t=0 off',                    ramp_tri, 16500, 16650, 0, null],
  ['tri  [-50, -40] ms (previous period), t=0 off',      ramp_tri, -50, -40, 1, null],
  ['tri  [70, 90] ms (next period), t=0 off',            ramp_tri, 70, 90, 1, null],
  ['tri  [0.13, 0.16] s (3rd period, s units), t=0 off', ramp_tri, 0.13, 0.16, 2, null],
  ['tri  [-1, 1] s (s units, wide), t=0 on screen',      ramp_tri, -1, 1, 2, null],
  ['saw  [0, 30] ms, t=0 on screen',                     ramp_saw, 0, 30, 1, null],
  ['saw  [-20, -5] ms (previous period), t=0 off',       ramp_saw, -20, -5, 1, null],
  ['saw  [40, 60] ms (next period), t=0 off',            ramp_saw, 40, 60, 1, null],
  ['tri  [16.4, 16.9] ms, data in us, params.local.time_units still ms (forceX race), t=0 off', ramp_tri, 16.4, 16.9, 1, 1],
];

let fail_new = 0, fail_old = 0;
const rows = [];
for(const [name, ramp, xmin, xmax, tu_gui, stale_tu] of cases) {
  const d = serverData(xmin, xmax, tu_gui);
  const P = periodTrue(ramp);
  const expected = Math.round(T_FEAT_MS * 1e-3 / TS);
  // copy of the feature on screen: T_FEAT + k*P inside the axis
  const uf = factor(d.tu);
  let tfeat = null;
  for(let k = -40; k <= 40; k++) {
    const t = (T_FEAT_MS * 1e-3 + k * P * TS) * uf;
    if(t >= d.axis[0] && t <= d.axis[1] && t >= d.xs[0] && t <= d.xs[d.xs.length - 1]) { tfeat = t; break; }
  }
  if(tfeat === null) { rows.push([name, 'feature not on screen', '', '', '']); continue; }
  // nearest data point to the feature (what is drawn), and the click on its pixel
  let best = 0; for(let k = 1; k < d.xs.length; k++) if(Math.abs(d.xs[k] - tfeat) < Math.abs(d.xs[best] - tfeat)) best = k;
  const posx = clickAt(d.xs[best], d.axis);
  const pos = { x: posx, y: 0.6207 };
  const sample_cyc = d.step * d.dec;                                       // 1 data point
  const pixel_cyc  = (d.axis[1] - d.axis[0]) / uf / TS / PLOT_W;           // 1 pixel
  const tol = Math.ceil(sample_cyc / 2 + pixel_cyc / 2) + 2;              // +-(1/2 point + 1/2 pixel) + float rounding
  const local = Object.assign({ time_units: (stale_tu !== null ? stale_tu : d.tu), lock_osc_raw_mode: 0 }, ramp);
  const vnew = NEW.clickToTrigTime(pos.x, d.tu, NEW.rampPeriodCycles(ramp));
  const vold = oldClick(pos, local).time;
  const okn = Math.abs(vnew - expected) <= tol, oko = Math.abs(vold - expected) <= tol;
  if(!okn) fail_new++; if(!oko) fail_old++;
  rows.push([name, 'units=' + ['us','ms','s'][d.tu] + ' dec=' + d.dec + ' tol=' + tol, expected,
             vnew + (okn ? ' OK' : ' FAIL') + ' (' + (vnew - expected) + ')',
             vold + (oko ? ' OK' : ' FAIL') + ' (' + (vold - expected) + ')']);
}
console.log('T_FEAT = ' + T_FEAT_MS + ' ms -> expected lock_trig_time = ' + Math.round(T_FEAT_MS * 1e-3 / TS) +
            '; triangle period ' + periodTrue(ramp_tri) + ', sawtooth period ' + periodTrue(ramp_saw) + ' cycles\n');
for(const r of rows) {
  console.log('- ' + r[0] + '\n    ' + r[1] + '\n    expected ' + r[2] + ' | NEW ' + r[3] + ' | OLD ' + r[4]);
}

// period function vs the hand count, level and targets
let fail_misc = 0;
function check(c, msg) { if(!c) { fail_misc++; console.log('FAIL ' + msg); } }
check(NEW.rampPeriodCycles(ramp_tri) === 8020000, 'triangle period 2*10000*401');
check(NEW.rampPeriodCycles(ramp_saw) === 10001 * 401, 'sawtooth period 10001*401');
check(NEW.rampPeriodCycles({ lock_ramp_low_lim: 100, lock_ramp_hig_lim: 100, lock_ramp_step: 3 }) === 0, 'period 0 if high <= low');
check(NEW.clickToTrigTime(-1, 1, 0) === 0, 'no period: t < 0 -> 0');
check(NEW.clickToTrigTime(1, 0, 0) === 125, '1 us = 125 cycles');
check(NEW.clickToTrigTime(1, 1, 0) === 125000, '1 ms = 125000 cycles');
check(NEW.clickToTrigTime(1, 2, 0) === 125000000, '1 s = 125e6 cycles');
check(NEW.clickToTrigTime(NaN, 1, 100) === null, 'NaN -> null');
check(NEW.clickToTrigLevel(0.6207, 0) === 5085, 'level 0.6207 V -> 5085');
check(NEW.clickToTrigLevel(2, 0) === 8191 && NEW.clickToTrigLevel(-2, 0) === -8192, 'level clamp');
check(NEW.clickToTrigLevel(1234.4, 1) === 1234, 'raw mode level (counts)');
const T = NEW.trigFromGraphTargets;
check(!T(0).time && !T(0).level, 'OFF: nothing');
check(T(1).time && !T(1).level, 'Time trigger: only time');
check(!T(2).time && T(2).level, 'Level trigger: only level');
check(T(3).time && T(3).level, 'Level+time: both');
const o = oldClick({ x: 16.581, y: 0.0049 }, Object.assign({ time_units: 1, lock_osc_raw_mode: 0 }, ramp_tri));
console.log('\nOLD, Time trigger click at (16.581 ms, 4.9 mV): time ' + o.time + ', level overwritten with ' + o.level +
            ' (NEW with Time trigger: level untouched)');

console.log('\nNEW: ' + fail_new + ' failed, OLD: ' + fail_old + ' failed of ' + rows.length + ' cases; misc checks failed: ' + fail_misc);
process.exit(fail_new || fail_misc ? 1 : 0);
