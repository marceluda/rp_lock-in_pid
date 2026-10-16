#!/usr/bin/env node
// lock_in+pid v2.2.9: test/plot_wheel_sim.js of lock_in+pid_harmonic v2.3.22/2.3.23 (versions below are those of that
// App). This App has one Y axis only (no y2axis): the mocked plot has one, and "Y2 = Y" checks that no second axis is
// created (NY below).
// v2.3.22: simulation of the mouse wheel over the scope plot (the [PLOT WHEEL] block of index.html):
//   1. no key: zoom of both axes (X and the two Y axes) by 1.5 per step, centred on the mouse (the value under the
//      mouse stays where it is); the X window goes to the server through the debounced 'plotzoom' handler of
//      initPlot() (one POST after 250 ms, also after a burst of steps);
//   2. SHIFT: X only, cursor ew-resize (class wheel-zoom-x); the step arrives as deltaX (Chrome) or deltaY (Firefox);
//   3. ALT: Y only (both Y axes), cursor ns-resize (class wheel-zoom-y), no POST; keydown of ALT over the plot is
//      prevented (Firefox menu bar);
//   cursor back to normal on keyup, mouseleave, window blur and hidden tab; limits: X 20 ns .. 68.72 s (in the
//   current time units), Y 1/2048 .. 1000 x full scale (2 V; raw mode 16384 counts); during a lock capture the zoom
//   is local (no 'plotzoom', no POST).
//   7. (build 50) the X window sent by the 'plotzoom' handler is not rounded to 2 decimals of the current units: a
//      quick zoom-in burst from s to ms sent xmin = xmax = 0 (server: 0..1 us); xmax > xmin always; the selection
//      zoom of initPlot() does not round either.
// Real code of index.html: the [PLOT WHEEL] block, timeUnitFactor(), lockCaptureActive(), plot_options and the
// 'plotzoom' handler of initPlot() (zoompan_timer debounce). Mocked: jQuery/DOM (#plot_holder, document, window,
// event dispatch with bubbling from the flot overlay canvas), the flot plot (axes, c2p, offset), jquery.mousewheel
// 3.1.13 (event.deltaY = -orig.deltaY, event.deltaX = +orig.deltaX, delta), sendParams() (counts the POSTs),
// timers. With an older page (no [PLOT WHEEL] block, zoom.interactive true) the wheel goes to a model of the
// handler of jquery.flot.navigate 1.3 (zoom of all axes with any key, then 'plotzoom'): checks of 2, 3, the
// cursor, the limits and the capture fail.
//
// Usage:  node test/plot_wheel_sim.js [index.html]      (exit code 1 if a check fails)
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
function blockSrc(tag) {
  const a = js.indexOf('// [' + tag + ' BEGIN]'), b = js.indexOf('// [' + tag + ' END]');
  return (a < 0 || b < 0) ? '' : js.slice(a, b);
}
function plotOptionsSrc() {
  const i = js.indexOf('var plot_options =');
  return i < 0 ? 'var plot_options = {};' : 'var plot_options = ' + braceFrom(i + 'var plot_options ='.length) + ';';
}
function zoomHandlerSrc() {   // plot_holder.on('plotzoom plotpan touchmove touchend', function(event) { ... });
  const i = js.indexOf("plot_holder.on('plotzoom");
  if(i < 0) return '';
  const f = js.indexOf('function', i);
  return "plot_holder.on('plotzoom plotpan touchmove touchend', " + braceFrom(f) + ');';
}

// ---- mocked jQuery / DOM -----------------------------------------------------------------------------------------
function makeEnv() {
  const env = { now: 0, timers: [], posts: 0, logs: [] };
  const node = (name, parent) => ({ name, parent, handlers: {}, classes: new Set() });
  env.window = node('window', null);
  env.document = node('document', env.window);
  env.holder = node('#plot_holder', env.document);
  env.overlay = node('canvas.flot-overlay', env.holder);
  function wrap(n) {
    const o = {
      0: n,
      on(types, fn) { types.split(/\s+/).forEach(t => { (n.handlers[t] = n.handlers[t] || []).push(fn); }); return o; },
      mousewheel(fn) { return o.on('mousewheel', fn); },
      trigger(t, extra) { fire(n, t, mkEvent(t, {}), extra, false); return o; },
      toggleClass(c, on) { if(on === undefined) on = !n.classes.has(c); if(on) n.classes.add(c); else n.classes.delete(c); return o; },
      addClass(c) { n.classes.add(c); return o; }, removeClass(c) { n.classes.delete(c); return o; },
      hasClass(c) { return n.classes.has(c); },
      css() { return o; }, width() { return 600; }, height() { return 400; },
    };
    return o;
  }
  function mkEvent(type, p) {
    const ev = Object.assign({ type, defaultPrevented: false, stopped: false }, p);
    ev.preventDefault = () => { ev.defaultPrevented = true; };
    ev.stopPropagation = () => { ev.stopped = true; };
    return ev;
  }
  // jQuery dispatch: handlers of the target, then of its parents; 'return false' = preventDefault + stopPropagation;
  // mouseenter / mouseleave do not bubble
  function fire(n, type, ev, extra, bubble) {
    for(let cur = n; cur; cur = (bubble ? cur.parent : null)) {
      ev.currentTarget = cur;
      for(const h of (cur.handlers[type] || [])) {
        const r = h.apply(cur, [ev].concat(extra || []));
        if(r === false) { ev.preventDefault(); ev.stopPropagation(); }
      }
      if(ev.stopped) break;
    }
    return ev;
  }
  env.mkEvent = mkEvent;
  env.fire = fire;
  env.$ = function(sel) {
    if(sel === env.document || sel === 'document' || (sel && sel.is_document)) return wrap(env.document);
    if(sel === env.window || sel === 'window') return wrap(env.window);
    if(sel === '#plot_holder') return wrap(env.holder);
    return wrap(node(String(sel), null));
  };
  env.$.extend = function() { return arguments[1]; };
  env.setTimeout = (fn, ms) => { const t = { fn, at: env.now + ms, id: env.timers.length + 1 }; env.timers.push(t); return t.id; };
  env.clearTimeout = (id) => { env.timers = env.timers.filter(t => t.id !== id); };
  env.advance = (ms) => {
    const end = env.now + ms;
    for(;;) {
      env.timers.sort((a, b) => a.at - b.at);
      const t = env.timers[0];
      if(!t || t.at > end) break;
      env.timers.shift(); env.now = t.at; t.fn();
    }
    env.now = end;
  };
  return env;
}

// ---- mocked flot plot: plot area 600 x 400 px at offset (40, 10) of the page -------------------------------------
const W = 600, H = 400, OFF = { left: 40, top: 10 };
const NY = 1;   // v2.2.9: number of Y axes of this App's plot
function makePlot(x, y) {
  const opts = { xaxes: [ { min: x[0], max: x[1] } ], yaxes: [ { min: y[0], max: y[1] }, { min: y[0], max: y[1] } ].slice(0, NY) };
  const axis = (o, dir) => ({
    min: o.min, max: o.max, direction: dir, options: o,
    c2p: dir === 'x' ? (px) => o.min + px / W * (o.max - o.min) : (py) => o.max - py / H * (o.max - o.min),
    p2c: dir === 'x' ? (v) => (v - o.min) / (o.max - o.min) * W : (v) => (o.max - v) / (o.max - o.min) * H,
  });
  const plot = {
    opts, draws: 0,
    getOptions: () => opts,
    getAxes: () => Object.assign({ xaxis: axis(opts.xaxes[0], 'x'), yaxis: axis(opts.yaxes[0], 'y') },
                                 opts.yaxes[1] ? { y2axis: axis(opts.yaxes[1], 'y') } : {}),
    setupGrid() {}, draw() { plot.draws++; },
    offset: () => ({ left: OFF.left, top: OFF.top }),
    width: () => W, height: () => H,
  };
  return plot;
}

// model of jquery.flot.navigate 1.3, onMouseWheel() / plot.zoom() (used only when zoom.interactive is true)
function navigateWheel(sb, ev, delta) {
  ev.preventDefault();
  const plot = sb.plot, amount0 = (sb.plot_options.zoom && sb.plot_options.zoom.amount) || 1.5;
  const amount = (delta < 0 ? 1 / amount0 : amount0);
  const c = { left: ev.pageX - plot.offset().left, top: ev.pageY - plot.offset().top };
  const xf = c.left / W, yf = c.top / H;
  const mm = { x: { min: c.left - xf * W / amount, max: c.left + (1 - xf) * W / amount },
               y: { min: c.top - yf * H / amount, max: c.top + (1 - yf) * H / amount } };
  const axes = plot.getAxes();
  for(const k of ['xaxis', 'yaxis', 'y2axis']) {
    const a = axes[k];
    if(!a) continue;
    let lo = a.c2p(mm[a.direction].min), hi = a.c2p(mm[a.direction].max);
    if(lo > hi) { const t = lo; lo = hi; hi = t; }
    a.options.min = lo; a.options.max = hi;
  }
  sb.$('#plot_holder').trigger('plotzoom');
  return false;
}

function makeSandbox(o) {
  o = o || {};
  const env = makeEnv();
  const sb = {
    env, Math, Number, JSON, isFinite, isNaN, Object, Array, String, parseFloat,
    $: env.$, setTimeout: env.setTimeout, clearTimeout: env.clearTimeout,
    document: Object.assign(env.document, { hidden: false, is_document: true }), window: env.window,
    console: { log(m) { env.logs.push(String(m)); }, info() {}, warn() {} },
    xmin: -1000000, xmax: 1000000, secondYaxis: () => '',
    xdecimal_places: 2, zoompan_timer: null,
    lock_cap: { state: o.cap || 'off' },
    params: { local: { time_units: (o.tu === undefined ? 0 : o.tu), lock_osc_raw_mode: o.raw ? 1 : 0, xmin: 0, xmax: 0 } },
    updateRanges() { sb.n_ranges = (sb.n_ranges || 0) + 1; },
    updateTriggerSlider() {},
    sendParams() { env.posts++; sb.sent = { xmin: sb.params.local.xmin, xmax: sb.params.local.xmax }; },
  };
  vm.createContext(sb);
  vm.runInContext(plotOptionsSrc(), sb);
  sb.plot = makePlot(o.x || [0, 120], o.y || (o.raw ? [-8192, 8192] : [-1, 1]));
  const src = [ fnSrc('timeUnitFactor'), fnSrc('lockCaptureActive'), blockSrc('PLOT WHEEL'), fnSrc('xWindowToParams'),
                'var plot_holder = $("#plot_holder");', zoomHandlerSrc() ].join('\n');
  vm.runInContext(src, sb);
  sb.has_block = (typeof sb.plotWheelBind === 'function');
  if(sb.has_block) sb.plotWheelBind();                     // as initPlot() does
  if(sb.plot_options.zoom && sb.plot_options.zoom.interactive) {   // navigate binds its handler on the overlay
    env.overlay.handlers.mousewheel = [ (ev, d) => navigateWheel(sb, ev, d) ];
  }
  return sb;
}

// ---- events ------------------------------------------------------------------------------------------------------
// jquery.mousewheel 3.1.13 from a DOM WheelEvent: deltaY = -orig.deltaY, deltaX = +orig.deltaX,
// delta = deltaY, or -deltaX when deltaY is 0
function wheel(sb, px, py, orig, mods) {
  const dY = -(orig.deltaY || 0), dX = (orig.deltaX || 0);
  const delta = (dY !== 0 ? dY : -dX);
  const ev = sb.env.mkEvent('mousewheel', Object.assign({ deltaY: dY, deltaX: dX, deltaFactor: 1,
                    pageX: OFF.left + px, pageY: OFF.top + py, shiftKey: false, altKey: false, ctrlKey: false }, mods || {}));
  return sb.env.fire(sb.env.overlay, 'mousewheel', ev, [delta], true);
}
function key(sb, type, k, mods) {
  const ev = sb.env.mkEvent(type, Object.assign({ key: k, keyCode: (k === 'Alt' ? 18 : (k === 'Shift' ? 16 : 0)),
                                                  shiftKey: false, altKey: false }, mods || {}));
  return sb.env.fire(sb.env.document, type, ev, [], false);
}
function mouse(sb, type, mods) {
  const ev = sb.env.mkEvent(type, Object.assign({ shiftKey: false, altKey: false, pageX: OFF.left + 300, pageY: OFF.top + 200 }, mods || {}));
  return sb.env.fire(sb.env.holder, type, ev, [], false);
}
function blur(sb) { sb.env.fire(sb.env.window, 'blur', sb.env.mkEvent('blur', {}), [], false); }
function cursor(sb) {
  const c = sb.env.holder.classes;
  return c.has('wheel-zoom-x') ? (c.has('wheel-zoom-y') ? 'both?' : 'ew-resize') : (c.has('wheel-zoom-y') ? 'ns-resize' : 'normal');
}
function ax(sb) {
  const o = sb.plot.opts;
  // v2.2.9: one Y axis: y2 is y itself while no second axis exists (a second one created by the page is a failure)
  return { x: [o.xaxes[0].min, o.xaxes[0].max], y: [o.yaxes[0].min, o.yaxes[0].max],
           y2: (o.yaxes.length > NY ? [NaN, NaN] : (o.yaxes[1] ? [o.yaxes[1].min, o.yaxes[1].max] : [o.yaxes[0].min, o.yaxes[0].max])) };
}

// ---- checks ------------------------------------------------------------------------------------------------------
let n = 0, fails = 0;
function check(name, ok, info) {
  n++;
  if(!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  [' + info + ']' : ''));
}
const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const same = (a, b) => near(a[0], b[0]) && near(a[1], b[1]);
const fmt = (r) => r.map(v => +v.toPrecision(6)).join('..');
// value under the mouse pixel (px, py) before and after: kept
function anchored(before, after, px, py, axis) {
  if(axis === 'x') return near(before.x[0] + px / W * (before.x[1] - before.x[0]), after.x[0] + px / W * (after.x[1] - after.x[0]));
  return near(before.y[1] - py / H * (before.y[1] - before.y[0]), after.y[1] - py / H * (after.y[1] - after.y[0]));
}

console.log('--- page: ' + file);
{
  const sb = makeSandbox();
  check('0 plot_options.zoom.interactive false (the wheel handler of jquery.flot.navigate is not bound)',
        !!sb.plot_options.zoom && sb.plot_options.zoom.interactive === false);
  const style = (html.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1];
  check('0 CSS: #plot_holder.wheel-zoom-x -> ew-resize, .wheel-zoom-y -> ns-resize',
        /#plot_holder\.wheel-zoom-x[^{]*\{[^}]*cursor:\s*ew-resize/.test(style) && /#plot_holder\.wheel-zoom-y[^{]*\{[^}]*cursor:\s*ns-resize/.test(style));
}

console.log('--- 1. no key: both axes, centred on the mouse, X to the server once (debounce)');
{
  const sb = makeSandbox();
  const b = ax(sb);
  mouse(sb, 'mouseenter');
  const ev = wheel(sb, 450, 100, { deltaY: -100 });            // wheel up: zoom in
  const a = ax(sb);
  check('1a zoom in: X / 1.5 ' + fmt(a.x) + ', Y / 1.5 ' + fmt(a.y),
        near(a.x[1] - a.x[0], 120 / 1.5) && near(a.y[1] - a.y[0], 2 / 1.5));
  check('1b the value under the mouse stays (X and Y)', anchored(b, a, 450, 100, 'x') && anchored(b, a, 450, 100, 'y'));
  check('1c Y2 = Y', same(a.y2, a.y));
  check('1d preventDefault (no page scroll)', ev.defaultPrevented);
  check('1e no POST before 250 ms', sb.env.posts === 0, 'posts ' + sb.env.posts);
  sb.env.advance(300);
  check('1f one POST after the debounce with the new X window', sb.env.posts === 1 && near(sb.sent.xmin, a.x[0]) &&
        near(sb.sent.xmax, a.x[1]), 'posts ' + sb.env.posts + (sb.sent ? ', xmin/xmax ' + sb.sent.xmin + '/' + sb.sent.xmax : ''));
  wheel(sb, 450, 100, { deltaY: 100 });                       // wheel down: zoom out, back
  check('1g zoom out returns to the start ' + fmt(ax(sb).x) + ' / ' + fmt(ax(sb).y), same(ax(sb).x, b.x) && same(ax(sb).y, b.y));
  sb.env.advance(300);
  const p0 = sb.env.posts;
  for(let i = 0; i < 20; i++) { wheel(sb, 300, 200, { deltaY: (i % 2 ? 100 : -100) }); sb.env.advance(30); }
  sb.env.advance(300);
  check('1h a burst of 20 steps 30 ms apart: one POST', sb.env.posts === p0 + 1, 'posts ' + (sb.env.posts - p0));
  const sbc = makeSandbox();
  wheel(sbc, 200, 300, { deltaY: -100 }, { ctrlKey: true });
  check('1i CTRL (touchpad pinch) is not a mode: both axes', !same(ax(sbc).x, [0, 120]) && !same(ax(sbc).y, [-1, 1]));
}

console.log('--- 2. SHIFT: X only, cursor ew-resize');
{
  const sb = makeSandbox();
  mouse(sb, 'mouseenter');
  check('2a over the plot without keys: normal cursor', cursor(sb) === 'normal', cursor(sb));
  key(sb, 'keydown', 'Shift', { shiftKey: true });
  check('2b keydown SHIFT over the plot: ew-resize', cursor(sb) === 'ew-resize', cursor(sb));
  const b = ax(sb);
  const ev = wheel(sb, 150, 300, { deltaX: 100 }, { shiftKey: true });   // Chrome: SHIFT + wheel down -> deltaX > 0
  let a = ax(sb);
  check('2c Chrome deltaX > 0 (wheel down): X zoom out x1.5 ' + fmt(a.x) + ', Y unchanged ' + fmt(a.y),
        near(a.x[1] - a.x[0], 180) && same(a.y, b.y) && same(a.y2, b.y2) && anchored(b, a, 150, 300, 'x'));
  check('2d preventDefault', ev.defaultPrevented);
  wheel(sb, 150, 300, { deltaX: -100 }, { shiftKey: true });
  a = ax(sb);
  check('2e Chrome deltaX < 0 (wheel up): X back ' + fmt(a.x), same(a.x, b.x) && same(a.y, b.y));
  wheel(sb, 150, 300, { deltaY: -100 }, { shiftKey: true });              // Firefox: deltaY
  a = ax(sb);
  check('2f Firefox deltaY < 0: X zoom in, Y unchanged ' + fmt(a.x), near(a.x[1] - a.x[0], 80) && same(a.y, b.y));
  sb.env.advance(300);
  check('2g X window sent (one POST)', sb.env.posts === 1, 'posts ' + sb.env.posts);
  key(sb, 'keyup', 'Shift', { shiftKey: false });
  check('2h keyup SHIFT: normal cursor', cursor(sb) === 'normal', cursor(sb));
  const b2 = ax(sb);
  wheel(sb, 150, 300, { deltaY: -100 });
  check('2i after SHIFT is released: both axes again', !same(ax(sb).x, b2.x) && !same(ax(sb).y, b2.y));
}

console.log('--- 3. ALT: Y only (both Y axes), cursor ns-resize, no POST');
{
  const sb = makeSandbox();
  mouse(sb, 'mouseenter');
  const kd = key(sb, 'keydown', 'Alt', { altKey: true });
  check('3a keydown ALT over the plot: ns-resize', cursor(sb) === 'ns-resize', cursor(sb));
  check('3b keydown ALT over the plot prevented (Firefox menu bar)', kd.defaultPrevented);
  const b = ax(sb);
  const ev = wheel(sb, 100, 50, { deltaY: -100 }, { altKey: true });
  let a = ax(sb);
  check('3c zoom in: Y / 1.5 ' + fmt(a.y) + ', Y2 = Y, X unchanged ' + fmt(a.x),
        near(a.y[1] - a.y[0], 2 / 1.5) && same(a.y2, a.y) && same(a.x, b.x) && anchored(b, a, 100, 50, 'y'));
  check('3d preventDefault (Firefox: ALT + wheel = history back/forward)', ev.defaultPrevented);
  wheel(sb, 100, 50, { deltaX: 100 }, { altKey: true });                  // a horizontal delta also counts
  a = ax(sb);
  check('3e deltaX > 0 with ALT: Y back ' + fmt(a.y), same(a.y, b.y) && same(a.x, b.x));
  sb.env.advance(300);
  check('3f no POST (Y is local)', sb.env.posts === 0, 'posts ' + sb.env.posts);
  const ku = key(sb, 'keyup', 'Alt', { altKey: false });
  check('3g keyup ALT: normal cursor (keyup prevented too)', cursor(sb) === 'normal' && ku.defaultPrevented, cursor(sb));
  const kx = key(sb, 'keydown', 'ArrowLeft', { altKey: true });
  check('3h ALT + another key (shortcut, e.g. ALT+Left) not prevented', !kx.defaultPrevented);
  key(sb, 'keyup', 'ArrowLeft', { altKey: true }); key(sb, 'keyup', 'Alt', {});
  const sbo = makeSandbox();
  const ko = key(sbo, 'keydown', 'Alt', { altKey: true });
  check('3i ALT with the mouse outside the plot: not prevented, normal cursor', !ko.defaultPrevented && cursor(sbo) === 'normal');
  // raw mode: counts
  const sr = makeSandbox({ raw: true });
  mouse(sr, 'mouseenter');
  wheel(sr, 300, 200, { deltaY: -100 }, { altKey: true });
  check('3j raw mode: Y in counts, -8192..8192 / 1.5 around the centre ' + fmt(ax(sr).y),
        near(ax(sr).y[0], -8192 / 1.5) && near(ax(sr).y[1], 8192 / 1.5) && same(ax(sr).y2, ax(sr).y));
}

console.log('--- cursor: blur, hidden tab, mouse leaving / entering with the key down');
{
  const sb = makeSandbox();
  mouse(sb, 'mouseenter');
  key(sb, 'keydown', 'Alt', { altKey: true });
  blur(sb);
  check('4a ALT down and window blur (ALT+Tab): normal cursor', cursor(sb) === 'normal', cursor(sb));
  key(sb, 'keydown', 'Shift', { shiftKey: true });
  sb.document.hidden = true;
  sb.env.fire(sb.env.document, 'visibilitychange', sb.env.mkEvent('visibilitychange', {}), [], false);
  check('4b SHIFT down and tab hidden: normal cursor', cursor(sb) === 'normal', cursor(sb));
  sb.document.hidden = false;
  key(sb, 'keydown', 'Shift', { shiftKey: true });
  mouse(sb, 'mouseleave');
  check('4c SHIFT down, mouse leaves the plot: normal cursor', cursor(sb) === 'normal', cursor(sb));
  mouse(sb, 'mouseenter', { shiftKey: true });
  check('4d mouse enters with SHIFT down: ew-resize', cursor(sb) === 'ew-resize', cursor(sb));
  key(sb, 'keyup', 'Shift', {});
  mouse(sb, 'mousemove', { altKey: true });     // ALT pressed while the page had no focus: seen on the next move
  check('4e mousemove with ALT down (no keydown seen): ns-resize', cursor(sb) === 'ns-resize', cursor(sb));
  mouse(sb, 'mousemove', {});
  check('4f mousemove without keys: normal', cursor(sb) === 'normal', cursor(sb));
  const sw = makeSandbox();
  wheel(sw, 300, 200, { deltaX: 100 }, { shiftKey: true });   // no keydown / mouseenter seen before the wheel
  check('4g a SHIFT + wheel event alone sets the cursor (ew-resize)', cursor(sw) === 'ew-resize', cursor(sw));
}

console.log('--- limits: X 20 ns .. 68.72 s (current units), Y 1/2048 .. 1000 x full scale');
{
  const XMAX = 16384 * 524288 * 8e-9;
  for(const tu of [0, 1, 2]) {
    const f = Math.pow(10, 3 * (2 - tu)), u = ['us', 'ms', 's'][tu];
    const sb = makeSandbox({ tu, x: [0, 100e-6 * f] });
    for(let i = 0; i < 80; i++) wheel(sb, 300, 200, { deltaX: 100 }, { shiftKey: true });
    const w = ax(sb).x[1] - ax(sb).x[0];
    check('5a X zoom out (' + u + '): window ' + (w / f).toPrecision(6) + ' s = 68.72 s, not more', near(w, XMAX * f));
    sb.env.advance(300);
    check('5b ... one POST with that window', sb.env.posts === 1, 'posts ' + sb.env.posts);
    const sz = makeSandbox({ tu, x: [0, 100e-6 * f] });
    for(let i = 0; i < 80; i++) wheel(sz, 300, 200, { deltaX: -100 }, { shiftKey: true });
    const wz = ax(sz).x[1] - ax(sz).x[0];
    check('5c X zoom in (' + u + '): window ' + (wz / f * 1e9).toPrecision(6) + ' ns = 20 ns, not less', near(wz, 20e-9 * f));
  }
  for(const raw of [false, true]) {
    const full = raw ? 16384 : 2, un = raw ? 'counts' : 'V';
    const sb = makeSandbox({ raw });
    for(let i = 0; i < 80; i++) wheel(sb, 300, 100, { deltaY: -100 }, { altKey: true });
    const r = ax(sb).y[1] - ax(sb).y[0];
    check('5d Y zoom in (' + un + '): range ' + r.toPrecision(6) + ' = full/2048', near(r, full / 2048) && same(ax(sb).y2, ax(sb).y));
    for(let i = 0; i < 80; i++) wheel(sb, 300, 100, { deltaY: 100 }, { altKey: true });
    const r2 = ax(sb).y[1] - ax(sb).y[0];
    check('5e Y zoom out (' + un + '): range ' + r2.toPrecision(6) + ' = 1000 x full', near(r2, full * 1000));
  }
  const so = makeSandbox({ x: [0, 1e9] });                      // a window already over the limit (us units)
  wheel(so, 300, 200, { deltaY: 100 }, { shiftKey: true });
  const keep = same(ax(so).x, [0, 1e9]);
  wheel(so, 300, 200, { deltaY: -100 }, { shiftKey: true });
  check('5f window already over 68.72 s: zoom out leaves it, zoom in works', keep && near(ax(so).x[1] - ax(so).x[0], 1e9 / 1.5));
  const sl = makeSandbox();
  wheel(sl, -30, 200, { deltaY: -100 });                         // over the Y axis labels, left of the plot area
  check('5g mouse left of the plot area (axis labels): zoom anchored at the left edge ' + fmt(ax(sl).x),
        near(ax(sl).x[0], 0) && near(ax(sl).x[1], 80));
}

console.log('--- Capture Lock: the zoom is local (no plotzoom, no POST)');
{
  for(const st of ['captured', 'waiting']) {
    const sb = makeSandbox({ cap: st });
    let zooms = 0;
    sb.$('#plot_holder').on('plotzoom', () => { zooms++; });
    const b = ax(sb);
    wheel(sb, 300, 200, { deltaY: -100 });
    wheel(sb, 100, 200, { deltaX: -100 }, { shiftKey: true });
    sb.env.advance(300);
    check('6 capture ' + st + ': axes zoomed locally, no plotzoom, no POST',
          !same(ax(sb).y, b.y) && !same(ax(sb).x, b.x) && zooms === 0 && sb.env.posts === 0, 'plotzoom ' + zooms + ', posts ' + sb.env.posts);
  }
}


console.log('--- 7. (build 50) X window sent with enough digits (no toFixed(2) in the current units)');
{
  // testAgent 2026-10-15 14:32: units s, window -1.5 .. 8.5 s; a quick SHIFT zoom-in burst (one POST at the end)
  // to about -0.50 .. 0.98 ms: the page sent xmin = xmax = 0
  const sb = makeSandbox({ tu: 2, x: [-1.5, 8.5] });
  const px = 600 * 1.5 / 10;                                   // the mouse on t = 0
  for(let i = 0; i < 22; i++) { wheel(sb, px, 200, { deltaX: -100 }, { shiftKey: true }); sb.env.advance(20); }
  sb.env.advance(300);
  const a = ax(sb).x;
  check('7a burst s -> ms: one POST', sb.env.posts === 1, 'posts ' + sb.env.posts + ', window ' + fmt(a) + ' s');
  check('7b sent xmin/xmax = plot window ' + fmt(a) + ' s (sent ' + (sb.sent ? sb.sent.xmin + ' .. ' + sb.sent.xmax : '-') + ')',
        !!sb.sent && Math.abs(sb.sent.xmin - a[0]) <= 1e-9 * (a[1] - a[0]) && Math.abs(sb.sent.xmax - a[1]) <= 1e-9 * (a[1] - a[0]));
  check('7c sent xmax > xmin', !!sb.sent && sb.sent.xmax > sb.sent.xmin);
  // pan / touch take the same handler; a window far from 0 in s units, 20 ns wide (float limits)
  const sp = makeSandbox({ tu: 2, x: [68.71, 68.71 + 20e-9] });
  sp.$('#plot_holder').trigger('plotpan');
  sp.env.advance(300);
  check('7d plotpan, window 68.71 s + 20 ns: xmax > xmin sent', !!sp.sent && sp.sent.xmax > sp.sent.xmin,
        sp.sent ? sp.sent.xmin + ' .. ' + sp.sent.xmax : '-');
  // selection zoom (plotselected handler of initPlot()): no toFixed(xdecimal_places) on xmin/xmax
  const i0 = js.indexOf("on('plotselected'");
  const sel = i0 < 0 ? '' : braceFrom(js.indexOf('function', i0));
  check('7e selection zoom: xmin/xmax not rounded with toFixed(xdecimal_places)', sel !== '' && !/xmin\s*=\s*parseFloat\([^;]*toFixed/.test(sel));
}

console.log((fails ? 'FAILED ' + fails : 'ALL OK') + ' (' + (n - fails) + '/' + n + ')');
process.exit(fails ? 1 : 0);
