#!/usr/bin/env node
// Quick trigger buttons "time" / "level" / "time+level" of the Lock Control panel of lock_in+pid (v2.2.13, port of
// lock_in+pid_harmonic v2.3.28):
// between Trigger Lock and Lock Now; a click on one of them sets the lock trigger type (1 Time, 2 Level, 3 Level+time)
// and starts a pending click on the graph (as "Choose from graph", without opening the config section); the click on
// the graph sets the time and / or level and fires Trigger Lock (as "Fire on click", even if it is unchecked), with
// Capture Lock if it is checked.
//
// The UI / C / FPGA model is the one of test/lock_capture_ui_sim.js (its harness, everything before its checks, is
// loaded from that file: Rig, makeEnv(), setup()); the handlers of the quick buttons are taken from index.html.
//
// Usage: node test/lock_quick_trig_sim.js [index.html]     (exit code 1 if a check fails)
'use strict';
const fs = require('fs'), path = require('path'), Module = require('module');

// ---- harness of lock_capture_ui_sim.js (same argv: [index.html]) ------------------------------------------------
const capFile = path.join(__dirname, 'lock_capture_ui_sim.js');
let capSrc = fs.readFileSync(capFile, 'utf8').replace(/^#!.*\n/, '');
const cut = capSrc.indexOf('\nlet fails = 0');
if(cut < 0) throw new Error('lock_capture_ui_sim.js: harness end not found');
capSrc = capSrc.slice(0, cut) + '\nmodule.exports = { setup, js, file, fnSrc, handlerSrc, CYC_MS, P, T_LOCK };\n';
const hm = new Module(capFile, module);
hm.filename = capFile;
hm.paths = Module._nodeModulePaths(__dirname);
hm._compile(capSrc, capFile);
const H = hm.exports;
const html = fs.readFileSync(H.file, 'utf8');

const QUICK_HANDLER = "$('#lock_quick_trig_1,#lock_quick_trig_2,#lock_quick_trig_3').on('click'";
const hasQuick = H.js.includes(QUICK_HANDLER);

let fails = 0, n = 0;
function check(name, cond, E, extra) {
  n++;
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  [' + extra + ']' : ''));
  if(!cond) { fails++; if(E) console.log('   ' + E.log.filter(l => l.kind != 'GET').slice(-8).map(l => l.t.toFixed(2) + ' ' + l.kind + ' ' +
                                                   (l.q ? JSON.stringify(l.q) : l.m)).join('\n   ')); }
}
const has = (q, k, v) => q && (k in q) && (v === undefined || q[k] == v);
const NAMES = ['', 'time', 'level', 'time+level'];

// Environment + the quick button handler of the page (a no-op if the page has none: the checks fail)
function env(o) {
  const E = H.setup(o);
  if(hasQuick) E.get('(__quickClick = ' + H.handlerSrc(QUICK_HANDLER) + ')');
  else         E.get('(__quickClick = function() {})');
  E.quick = k => E.get('__quickClick').call({ id: 'lock_quick_trig_' + k });
  E.gclick = (x, y) => E.get('plotClick')(null, { x, y });
  E.esc = () => E.get('keyDown')({ key: 'Escape' });
  E.cls = (id, c) => !!(E.dom[id] && E.dom[id].cls.has(c));
  E.qmsg = () => (E.dom.lock_quick_trig_msg && E.dom.lock_quick_trig_msg.shown ? E.dom.lock_quick_trig_msg.html : '');
  E.qtype = () => { try { return E.get('lock_quick_type'); } catch(e) { return undefined; } };
  E.activeSet = () => [1, 2, 3].filter(k => E.cls('lock_quick_trig_' + k, 'active'));
  E.requests = t => E.posts(t).filter(p => has(p.q, 'lock_ctrl_aux_launch_lock_trig', 1)).length;
  return E;
}

console.log('=== Quick trigger buttons time / level / time+level (' + H.file + ') ===');

// ---- 0. Page: three small buttons between Trigger Lock and Lock Now, one color each, outside the config section ----
{
  const iT = html.indexOf('id="lock_ctrl_aux_launch_lock_trig"'), iN = html.indexOf('id="lock_ctrl_aux_lock_now"');
  const iQ = [1, 2, 3].map(k => html.indexOf('id="lock_quick_trig_' + k + '"'));
  const iCfg = html.indexOf('<div id="LockConfig"');
  check('0.1 buttons time, level, time+level (in this order) between Trigger Lock and Lock Now, above the config section',
        iT > 0 && iQ.every(i => i > iT && i < iN) && iQ[0] < iQ[1] && iQ[1] < iQ[2] && iCfg > iN, null, iQ.join(','));
  const lbl = [1, 2, 3].map(k => { const m = html.match(new RegExp('id="lock_quick_trig_' + k + '"[^>]*>([^<]*)<')); return m ? m[1] : null; });
  check('0.2 labels "time", "level", "time+level"', lbl.join('|') == 'time|level|time+level', null, lbl.join('|'));
  const css = ['time', 'level', 'both'].map(c => {
    const m = html.match(new RegExp('\\.btn\\.lock-quick-' + c + '\\s*\\{([^}]*)\\}'));
    const b = m && m[1].match(/border-color:\s*(#[0-9a-f]+)/i), f = m && m[1].match(/background-color:\s*(#[0-9a-f]+)/i);
    return { b: b && b[1], f: f && f[1] };
  });
  const lum = h => { const v = parseInt(h.slice(1), 16); return 0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255); };
  check('0.3 one color per button: dark border, light fill, all different',
        css.every(c => c.b && c.f && lum(c.b) < 110 && lum(c.f) > 200) && new Set(css.map(c => c.b)).size == 3 &&
        new Set(css.map(c => c.f)).size == 3, null, JSON.stringify(css));
  check('0.4 class per color on each button (time / level / both)',
        /id="lock_quick_trig_1"[^>]*lock-quick-time/.test(html) && /id="lock_quick_trig_2"[^>]*lock-quick-level/.test(html) &&
        /id="lock_quick_trig_3"[^>]*lock-quick-both/.test(html), null);
}

{
  // the message of a pending click must not move the panel (testAgent 2026-10-20: 2 lines pushed the checkboxes down)
  const box = html.match(/\.lock-quick-msg-box\s*\{([^}]*)\}/), msg = html.match(/\.lock-quick-msg\s*\{([^}]*)\}/);
  check('0.5 message of a pending click: absolute, over the rows below (container of height 0), clicks go through, hidden by default',
        !!box && /position:\s*relative/.test(box[1]) && /height:\s*0/.test(box[1]) && !!msg && /position:\s*absolute/.test(msg[1]) &&
        /pointer-events:\s*none/.test(msg[1]) && /class="lock-quick-msg-box">\s*<div id="lock_quick_trig_msg" class="lock-quick-msg" style="display: none;">/.test(html), null);
}

{
  // user review of lock_in+pid_harmonic 2.3.27-68: the block of the three buttons centered in height with Trigger Lock / Lock Now and of a
  // comparable size: one flex row (stretch), the column of the small buttons as tall as the big ones (space-between)
  const row = html.match(/\.lock-req-row\s*\{([^}]*)\}/), col = html.match(/\.lock-quick\s*\{([^}]*)\}/);
  const seq = /<div class="lock-req-row">\s*<button id="lock_ctrl_aux_launch_lock_trig"[^>]*lock-req-btn[^>]*>[\s\S]*?<\/button>\s*<div class="lock-quick"[\s\S]*?id="lock_quick_trig_3"[\s\S]*?<\/div>\s*<button id="lock_ctrl_aux_lock_now"[^>]*lock-req-btn/.test(html);
  check('0.6 Trigger Lock | quick column | Lock Now in one flex row, column stretched to their height and spread (centered)',
        seq && !!row && /display:\s*flex/.test(row[1]) && /align-items:\s*stretch/.test(row[1]) && !!col &&
        /flex-direction:\s*column/.test(col[1]) && /justify-content:\s*space-between/.test(col[1]), null);
}

// ---- 1. Each button: type set, pending click without POST, one click on the graph -> values + ONE lock request -------
for(const k of [1, 2, 3]) {
  // trigger type OFF and Fire on click unchecked: only the quick button can set the type and fire
  const E = env({ phase: 4.2, fire: false, init: { lock_ctrl_aux_trig_type: 0 } });
  E.run(200);
  const t0 = E.clock.t, cnt0 = E.rig.count;
  E.quick(k);
  E.run(300);
  check('1.' + k + 'a [' + NAMES[k] + '] click on the button: pending click, button active, crosshair cursor, nothing sent',
        E.get('set_trigger_val') === true && E.qtype() === k && E.activeSet().join() == String(k) && E.cls('plot_holder', 'trig-pick') &&
        E.posts(t0).length == 0 && E.rig.state == 0, E, 'active=' + E.activeSet() + ' posts=' + E.posts(t0).length);
  const want = k == 1 ? 'time' : k == 2 ? 'level' : 'time + level';
  check('1.' + k + 'b [' + NAMES[k] + '] message shown below the buttons: "Click on the graph: ' + want + ' -> Trigger Lock", border of the button color; config section not opened',
        E.qmsg().includes('Click on the graph: ' + want + ' &rarr; Trigger Lock') && E.cls('lock_quick_trig_msg', 'lock-quick-msg-' + k) &&
        !(E.dom.LockConfig && E.dom.LockConfig.cls.has('in')), E, E.qmsg());
  const t1 = E.clock.t;
  E.gclick(9, 0.1);           // 9 ms after the scan floor (window 0..20 ms, time units ms), 0.1 V = 819 counts
  E.run(600);
  const ps = E.posts(t1), q1 = ps[0] && ps[0].q, q2 = ps[1] && ps[1].q;
  const okT = k == 2 ? !has(q1, 'lock_lock_trig_time_val') : has(q1, 'lock_lock_trig_time_val', 9 * H.CYC_MS);
  const okL = k == 1 ? !has(q1, 'lock_lock_trig_val')      : has(q1, 'lock_lock_trig_val', 819);
  check('1.' + k + 'c [' + NAMES[k] + '] POST 1: trig_type = ' + k + (k != 2 ? ', time 9 ms (1125000)' : '') + (k != 1 ? ', level 819' : '') +
        ', capture settings (Ext Trig 128), no request; POST 2: Single + Trigger Lock',
        ps.length == 2 && has(q1, 'lock_ctrl_aux_trig_type', k) && okT && okL && has(q1, 'lock_trig_sw', 128) &&
        !has(q1, 'lock_ctrl_aux_launch_lock_trig', 1) && has(q2, 'single_btn', 1) && has(q2, 'lock_ctrl_aux_launch_lock_trig', 1),
        E, ps.map(p => JSON.stringify(p.q)).join(' | '));
  check('1.' + k + 'd [' + NAMES[k] + '] a single lock request, LOCKED once (count +1), lock captured',
        E.requests(t1) == 1 && E.rig.state == 2 && E.rig.count == cnt0 + 1 && E.get('lock_cap.state') == 'captured' &&
        E.shownCap() && E.shownCap().has_lock, E, 'requests=' + E.requests(t1) + ' count+' + (E.rig.count - cnt0));
  check('1.' + k + 'e [' + NAMES[k] + '] after the click: no pending click, no active button, normal cursor, page trig type = ' + k,
        !E.get('set_trigger_val') && E.qtype() === 0 && E.activeSet().length == 0 && !E.cls('plot_holder', 'trig-pick') &&
        E.qmsg() == '' && E.get('params.local').lock_ctrl_aux_trig_type == k && E.dom.lock_ctrl_aux_trig_type.val == k, E);
  if(k == 1) check('1.1f [time] Trigger Lock shown pressed; offset of the capture = 9 ms', E.dom.lock_ctrl_aux_launch_lock_trig.cls.has('btn-primary') &&
                   Math.abs(E.get('lock_cap.offset_s') - 0.009) < 1e-12, E);
  E.run(2000);
  check('1.' + k + 'g [' + NAMES[k] + '] 2 s later: no other request', E.requests(t1) == 1, E);
}

// ---- 2. Cancel: Esc, 2nd click on the same button, Choose from graph; another button changes the type -------------
{
  const E = env({ fire: false, init: { lock_ctrl_aux_trig_type: 0 } });
  E.quick(2);
  E.esc();
  const t0 = E.clock.t;
  E.gclick(5, 0.3); E.run(400);
  check('2.1 Esc cancels: no pending click, no active button, then a click on the graph sends nothing',
        hasQuick && !E.get('set_trigger_val') && E.activeSet().length == 0 && !E.cls('plot_holder', 'trig-pick') && E.qmsg() == '' &&
        E.posts(t0).length == 0 && E.get('params.local').lock_ctrl_aux_trig_type == 0, E);
  E.quick(1); E.quick(1);
  check('2.2 2nd click on the same button cancels', hasQuick && !E.get('set_trigger_val') && E.activeSet().length == 0, E);
  E.quick(1); E.quick(3);
  check('2.3 another button while pending: changes the type (time+level), only that one active',
        E.get('set_trigger_val') === true && E.qtype() === 3 && E.activeSet().join() == '3' && /time \+ level/.test(E.qmsg()), E, E.qmsg());
  E.get('clickSetTrig')();
  check('2.4 "Choose from graph" (Cancel) while a quick click is pending: cancelled', hasQuick && !E.get('set_trigger_val') &&
        E.activeSet().length == 0 && E.dom.btn_set_trig.text == 'Choose from graph', E);
  E.get('clickSetTrig')();
  check('2.5 then Choose from graph alone: pending with the page type (OFF: nothing) - no quick button active',
        E.activeSet().length == 0 && E.qmsg() == '', E);
  const t1 = E.clock.t;
  E.run(300);
  check('2.6 nothing was sent by any of these clicks', E.posts(t0).length == 0, E, E.posts(t0).length + ' POSTs');
}

// ---- 3. Pressed while ARMED / LOCKED: the lock is kept until the click on the graph, then released and armed again --
{
  const E = env({ phase: 2.5 });
  E.click('lock_ctrl_aux_launch_lock_trig'); E.run(600);          // Time trigger 7 ms, LOCKED and captured
  const cnt0 = E.rig.count, t0 = E.clock.t;
  E.quick(1); E.run(300);
  check('3.1 LOCKED: the click on "time" sends nothing, the lock stays LOCKED', hasQuick && E.posts(t0).length == 0 && E.rig.state == 2 &&
        E.get('set_trigger_val') === true, E);
  check('3.2 frozen capture with a known offset (Time trigger): no warning', !/text-danger/.test(E.qmsg()), E, E.qmsg());
  const t1 = E.clock.t;
  E.gclick(-2, 0);            // lock-relative: 7 - 2 = 5 ms after the floor
  E.run(600);
  const ps = E.posts(t1), r1 = ps[0] && ps[0].q, r2 = ps[1] && ps[1].q;
  check('3.3 POST 1 releases (launch 0) with time 5 ms (625000), POST 2 arms again; LOCKED again (count +1)',
        ps.length == 2 && has(r1, 'lock_ctrl_aux_launch_lock_trig', 0) && has(r1, 'lock_lock_trig_time_val', 625000) &&
        has(r2, 'lock_ctrl_aux_launch_lock_trig', 1) && E.rig.state == 2 && E.rig.count == cnt0 + 1 &&
        Math.abs(E.get('lock_cap.offset_s') - 0.005) < 1e-12, E, ps.map(p => JSON.stringify(p.q)).join(' | '));
  // ARMED (level never crossed) -> "level": armed request kept, then released and armed with the new level
  const F = env({ init: { lock_ctrl_aux_trig_type: 2 } });
  F.rig.cross = null;
  F.click('lock_ctrl_aux_launch_lock_trig'); F.run(400);
  const s0 = F.rig.state, u0 = F.clock.t;
  F.quick(2); F.run(300);
  check('3.4 ARMED: the click on "level" sends nothing, still ARMED', hasQuick && s0 == 1 && F.rig.state == 1 && F.posts(u0).length == 0, F);
  F.rig.cross = 12;
  const u1 = F.clock.t;
  F.gclick(3, -0.25); F.run(800);
  const fs2 = F.posts(u1);
  check('3.5 click: level -2048 + release, then one new request; LOCKED and captured', fs2.length == 2 &&
        has(fs2[0].q, 'lock_lock_trig_val', -2048) && has(fs2[0].q, 'lock_ctrl_aux_launch_lock_trig', 0) && F.requests(u1) == 1 &&
        F.rig.state == 2 && F.get('lock_cap.state') == 'captured', F, fs2.map(p => JSON.stringify(p.q)).join(' | '));
}

// ---- 4. Capture Lock unchecked: values + Trigger Lock, the scope is not touched ---------------------------------------
{
  const E = env({ capture: false, fire: false, init: { lock_ctrl_aux_trig_type: 0 } });
  E.quick(3);
  const t0 = E.clock.t;
  E.gclick(4, 0.05); E.run(500);
  const ps = E.posts(t0);
  check('4.1 Capture Lock off: POST 1 trig_type 3 + time 4 ms + level 410, POST 2 Trigger Lock; no Single / Ext Trig change; LOCKED',
        ps.length == 2 && has(ps[0].q, 'lock_ctrl_aux_trig_type', 3) && has(ps[0].q, 'lock_lock_trig_time_val', 500000) &&
        has(ps[0].q, 'lock_lock_trig_val', 410) && has(ps[1].q, 'lock_ctrl_aux_launch_lock_trig', 1) && !has(ps[0].q, 'trig_mode') &&
        !has(ps[0].q, 'lock_trig_sw') && !has(ps[1].q, 'single_btn', 1) && E.rig.state == 2 && E.get('lock_cap.state') == 'off',
        E, ps.map(p => JSON.stringify(p.q)).join(' | '));
}

// ---- 5. Frozen capture with unknown offset (Level trigger): "time" keeps waiting, "time+level" sets only the level --
{
  const E = env({ init: { lock_ctrl_aux_trig_type: 2 } });
  E.click('lock_ctrl_aux_launch_lock_trig'); E.run(600);
  E.quick(1);
  check('5.1 "time" on a capture locked by level: warning "time can not be taken"', /can not be taken/.test(E.qmsg()), E, E.qmsg());
  const t0 = E.clock.t;
  E.gclick(3, 0.2); E.run(400);
  check('5.2 ... the click sets nothing and keeps waiting', hasQuick && E.posts(t0).length == 0 && E.get('set_trigger_val') === true, E);
  E.esc();
  check('5.3 Esc: cancelled', !E.get('set_trigger_val') && E.activeSet().length == 0, E);
}

// ---- 6. "Choose from graph" + Fire on click unchanged ------------------------------------------------------------------
{
  const E = env({ fire: false });
  E.get('clickSetTrig')();
  const t0 = E.clock.t;
  E.gclick(4, 0); E.run(300);
  check('6.1 Choose from graph with Fire on click off: only the value, no request (as before)', E.posts(t0).length == 1 &&
        has(E.posts(t0)[0].q, 'lock_lock_trig_time_val', 500000) && E.requests(t0) == 0 && E.rig.state == 0, E);
  check('6.2 the page trig type is not changed by Choose from graph', !has(E.posts(t0)[0].q, 'lock_ctrl_aux_trig_type'), E);
}

// ---- 7. A POST in flight (busy server) when the graph is clicked: the trigger type is not lost ------------------------
for(const k of [1, 2, 3]) {
  const E = env({ postDelay: 120, fire: false, init: { lock_ctrl_aux_trig_type: 0 } });
  E.quick(k);
  E.get('params.local').lock_pidA_kp = 140; E.get('sendParams')();          // unrelated POST, answered 120 ms later
  const t0 = E.clock.t;
  E.run(5);
  E.gclick(9, 0.1); E.run(1500);
  check('7.' + k + ' [' + NAMES[k] + '] click while a POST is in flight: trig_type ' + k + ' sent, one request, LOCKED',
        E.posts(t0).some(p => has(p.q, 'lock_ctrl_aux_trig_type', k)) && E.requests(t0) == 1 && E.rig.state == 2 &&
        E.rig.p.lock_ctrl_aux_trig_type == k, E);
}

{
  // the same with "Choose from graph" + Fire on click (up to v2.2.12 the value was written as already sent by loadParams()
  // (trigger_just_set) and never sent: the lock fired with the old time / level)
  const E = env({ postDelay: 120, init: { lock_ctrl_aux_trig_type: 1 } });
  E.get('clickSetTrig')();
  E.get('params.local').lock_pidA_kp = 140; E.get('sendParams')();
  const t0 = E.clock.t;
  E.run(5);
  E.gclick(9, 0.1); E.run(1500);
  check('7.4 Choose from graph + Fire on click while a POST is in flight: time 9 ms reaches the server, one request, LOCKED',
        E.rig.p.lock_lock_trig_time_val == 9 * H.CYC_MS && E.requests(t0) == 1 && E.rig.state == 2, E, 'server time ' + E.rig.p.lock_lock_trig_time_val);
}

// ---- 8. LOCKED + a POST in flight when the graph is clicked: release (0) and new request (1) must both be sent ----------
// (testAgent 2026-10-20 on RP2, POST delayed 1.7 s: the new time reached the register but neither the release nor the
// request was sent, the lock stayed at the old point. The queued send of the POST in flight is delayed 100 ms after its
// answer; lockWhenIdle() did not see it, wrote the request 1 (= the server value) and the 0 was never sent.)
function lockedInflight(o) {
  const E = env({ phase: 2.5, fire: o.fire !== false, capture: o.capture !== false, init: { lock_ctrl_aux_trig_type: o.type || 1 } });
  E.click('lock_ctrl_aux_launch_lock_trig'); E.run(800);            // LOCKED at floor + 7 ms
  const locked = E.rig.state == 2, cnt0 = E.rig.count;
  if(o.quick) E.quick(o.quick); else E.get('clickSetTrig')();
  E.rig.postDelay = o.delay;
  E.get('params.local').lock_pidA_kp = 141; E.get('sendParams')();   // POST answered o.delay ms later
  const t0 = E.clock.t;
  E.run(o.at || 5);
  E.gclick(o.x, o.y); E.run(3 * o.delay + 3000);         // the POST in flight, the release and the request: each one o.delay
  E.rig.postDelay = 0; E.run(500);
  const ps = E.posts(t0);
  const iRel = ps.findIndex(p => has(p.q, 'lock_ctrl_aux_launch_lock_trig', 0));
  const iReq = ps.findIndex((p, i) => i > iRel && has(p.q, 'lock_ctrl_aux_launch_lock_trig', 1));
  return { E, ok: locked && iRel >= 0 && iReq > iRel && E.rig.count == cnt0 + 1 && E.rig.state == 2, ps, cnt0 };
}
for(const [name, o] of [['time button', { quick: 1, x: -2, y: 0 }], ['time+level button', { quick: 3, x: -2, y: 0.1 }],
                        ['Choose from graph + Fire on click', { x: -2, y: 0 }], ['time button, Capture Lock off', { quick: 1, x: 5, y: 0, capture: false }],
                        ['Choose from graph + Fire on click, Capture Lock off', { x: 5, y: 0, capture: false }]]) {
  for(const delay of [150, 1700]) {
    const r = lockedInflight(Object.assign({ delay }, o));
    check('8 LOCKED + POST in flight ' + delay + ' ms, ' + name + ': release (0) then request (1) sent, locked again (count +1)', r.ok, r.E,
          r.ps.map(p => JSON.stringify(p.q)).join(' | ') + ' count+' + (r.E.rig.count - r.cnt0));
  }
}
{
  // random moments of the click relative to the answer of the POST in flight (in the 100 ms gap included)
  let ok = 0, N = 60;
  for(let i = 0; i < N; i++) ok += lockedInflight({ quick: 1 + (i % 3), x: -2, y: 0.1, delay: 120, at: 1 + (i * 2.3) % 230 }).ok ? 1 : 0;
  check('8.r LOCKED, click at random moments around the answer of a POST in flight: re-locked ' + N + '/' + N, ok == N, null, ok + '/' + N);
}

console.log('=== ' + n + ' checks, ' + fails + ' failed ===');
process.exit(fails ? 1 : 0);
