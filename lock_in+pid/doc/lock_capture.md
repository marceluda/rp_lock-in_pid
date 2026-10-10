# Capture Lock and Fire on click — design of v2.3.14

> lock_in+pid v2.2.6: ported from lock_in+pid_harmonic v2.3.14-v2.3.17 (the versions below are those of that App).
> The register addresses quoted here are the same in both Apps (Ext Trig = `trig_sw`, 0x4060000C).

Two checkboxes under the Trigger Lock / Lock Now buttons, both **on** by default:

- **Capture Lock**: every lock request made from the web page (Trigger Lock, Lock Now, Fire on click)
  captures the closing of the loop in the oscilloscope, like a Single acquisition, and the trace stays
  frozen until the user asks for a new one.
- **Fire on click**: a click on the plot with *Choose from graph* writes the time / level of the lock
  trigger and fires *Trigger Lock* at once.

They are UI preferences (nothing is sent to the server): they are kept in the saved state of the tab
(`saveState()` / `restoreState()`, keys `ui_capture_lock`, `ui_fire_on_click`) and in the saved configs
(field `ui` of each config, apart from `data`). States and configs saved by older versions do not have
them: the current values are kept.

## 1. Why the lock was captured only sometimes (v2.3.13)

The usual setup is scope in Normal, source External, Ext Trig = *Scan floor*, window = one ramp period
(t = 0 is the scan floor). The lock trigger of `lock_ctrl.v` fires at `floor + lock_trig_time` (time
trigger, the counter restarts at every floor) or at a level crossing, in the first sweep after the request.
When the loop closes the ramp stops (`set_ramp_enable = 0`), so **there are no more scan floors**: the
scope keeps showing the last trace it acquired. That trace shows the lock only if the scope was armed at
the floor that started the sweep in which the lock happened. Two things made that random:

1. **Normal mode is not always armed.** After each trigger the C worker waits for the whole window
   (`xmax`), reads and decimates the buffer and only then re-arms (plus ~1 ms of polling, the pre-trigger
   history when `xmin < 0`, 5 ms in the long ranges). With a window as long as the ramp period the
   re-arm comes after the next floor: the scope catches about every second sweep.
2. **Race between the lock request and the scope.** The POST of Trigger Lock wrote `lock_control` at once
   in the HTTP thread while the worker re-armed the scope asynchronously (every POST reset the scope, see
   §3.2). If the lock fired before the worker was armed again, the sweep of the lock was lost.

The node model of `test/lock_capture_ui_sim.js` (ramp 20 ms, window 0..20 ms, time trigger at 7 ms,
random floor phase and worker delays) captures the lock in **~60 %** of the requests with the v2.3.13
code (INFO 2.6), which matches the "sometimes yes, sometimes no" of the tests on the board.

## 2. Options and decision

- **(a) Only software, scope triggered by the scan floor.** Put the scope in Single + Scan floor and arm
  it in the same POST as the request. It still depends on *which* floor the scope sees first: if the
  scope is armed before a floor that comes before the lock request, it captures a plain sweep; if it is
  armed after the floor of the lock sweep, it never triggers again (the ramp has stopped). The window
  between the two is small but not zero (with a 1 ms ramp period, a 0.2 ms gap is a 20 % miss), and
  Lock Now and the Level trigger have no floor at all at the lock moment.
- **(b) Scope triggered by the lock event.** The FPGA already has it: `lock.v` routes the pulse
  `lock_ctrl_trig` of `lock_ctrl.v` (one clock when the state enters LOCKED) to the external trigger of
  the scope as Ext Trig option 128, **"Lock control trig"** (`trigger_signals[7]`, through
  `trigger_input`, like Scan floor). A scope armed on it can only trigger on the lock, once, whatever the
  trigger type (time, level, level+time, Lock Now). The only condition is that the scope is armed
  before the lock: that is a matter of ordering, solved in the C controller (§3.1).

**Decision: (b), without any FPGA change** (the trigger source exists since v0.94; `fpga.bit.bin` is
the one of v2.3.13). The model gives 100 % of captures (checks 2.1–2.5: time, level, level+time, Lock
Now, long ranges, an unrelated POST while waiting).

### Window of the capture

t = 0 of the capture is the lock. The width of the window is that of the user (saved before the capture):

- **Time trigger** with the lock time inside the user window: the same window shifted by the lock time
  (`[xmin - t_lock, xmax - t_lock]`), so the trace looks exactly like the sweep from the scan floor; the
  banner shows the offset (`t_lock` after the floor). *Choose from graph* on this trace adds the offset
  back (the time it writes is still counted from the floor).
- Otherwise (Level, Level+time, Lock Now, lock time outside the window): the lock at 30 % of the width
  (`[-0.3 W, 0.7 W]`): before it the end of the scan, after it the error going to 0. The offset from the
  floor is not known: *Choose from graph* can only take the level from this trace (red warning).

Pre-trigger data need `xmin < 0`: the worker waits `-xmin` after arming before enabling the trigger
(existing code), so the history before the lock is valid.

## 3. Implementation

### 3.1 Web UI (`index.html`, block `[LOCK CAPTURE BEGIN/END]`)

`lockRequest(key)` (Trigger Lock, Lock Now and Fire on click):

1. POST 1: pending values (e.g. the time / level of the click), the release of an active request (a new
   0→1 edge is needed to arm again) and, with Capture Lock, the scope settings of the capture: Single,
   External, Ext Trig 128, window around the lock. The user settings are saved first
   (`lock_cap.saved`, only once: a new capture keeps the original ones). The plot is cleared.
2. When no POST and no GET /data are in flight (`lockWhenIdle()`): POST 2 with the request bit **and**
   `single_btn = 1` (both in `last_send_params`, so they always go in the same, last, POST chunk). No GET
   /data starts between POST 1 and the answer of POST 2 (`lockCaptureBusy()`): nginx answers a GET with
   the first new data within 200 ms, so a GET started before the Single was armed could take the capture
   (short windows, Lock Now) and it would be discarded as old data (check 2.3c of the simulation).
3. GET /data that start after POST 2 are answered with `AGAIN` until the capture is ready (nginx waits up
   to 200 ms per GET); the first `OK` is the capture: it is drawn, the state is *captured* and the banner
   says *"Lock captured (t = 0: lock ...) — press Auto or Single to refresh"*.

While waiting or captured, `doGetData()` does not draw (no stale data, the trace stays frozen); polling
goes on (every 500 ms when frozen) only to keep the lock state (OFF/ARMED/LOCKED label) up to date.
A capture ends — the saved scope settings are restored in the same POST, except the one just changed by
the user — with: trigger mode Auto/Normal (select), source or Ext Trig changed, *Single* (new Single
acquisition with the user's trigger), the *AUTO* button, unchecking Capture Lock, or a release (2nd click on
Trigger Lock / Lock Now) **while still waiting** (the lock will not come). A release after the capture
keeps the trace. Config → load ends it without restoring (the config brings its own scope settings). The
saved state and a config saved during a capture keep the user's scope settings, not those of the capture.

**AUTO is not Autoscale.** The toolbar has two buttons with similar names:

- **Autoscale** (`autoscaleY()`): rescales the Y axis to the data on the screen, in the page only (no
  POST). It does **not** end a capture: it is the way to look at a frozen capture with a better Y range.
- **AUTO** (`serverAutoScale()`): auto-set of the scope in the controller (time range, trigger source /
  level, Y axis). It ends a capture: the saved scope settings (Ext Trig = Scan floor, window...) go in the
  same POST as `auto_flag = 1`, and the auto-set then picks its own window and trigger.

Without Capture Lock the request is the same as in v2.3.13 (one POST), and Fire on click sends the
values first and the request right after.

### 3.2 C controller (`src/main.c`, `src/worker.c`)

- **Request after the scope is armed.** `rp_set_params()` detects a 0→1 of `lock_ctrl_aux_lock_now` /
  `lock_ctrl_aux_launch_lock_trig`; if the same call armed a Single acquisition (`single_btn`), it calls
  `rp_osc_worker_wait_armed()` before `lock_update()`. The worker publishes the parameter generation and
  state of each acquisition it arms (after `osc_fpga_set_trigger()`, i.e. with the trigger enabled and the
  pre-trigger history loaded). Timeout 100 ms + pre-trigger time (+5 ms long ranges), at most 1.5 s; on a
  timeout (e.g. streaming owns the scope) the request is applied anyway and a line goes to stderr.
- **A POST without scope changes no longer resets the scope.** The UI sends `xmin`/`xmax` in every POST
  (`always_send_params`), and after a scope change `MIN/MAX_GUI_PARAM` hold the worker window in seconds,
  so they always looked changed: *every* POST (a PID gain, a lock request...) reset the scope, and in
  Single mode it disarmed and cleared a Single that was waiting for its trigger. Now `xmin`/`xmax` are
  compared with the last GUI values (`GUI_XMIN`/`GUI_XMAX`). The lock params the worker reads
  (`lock_oscA_sw`, `lock_oscB_sw`, `lock_osc_raw_mode`, `lock_osc_lockin_mode`) still count as scope
  changes, as before. When the GUI sends back the forced X range (forceX), the force flag is cleared as
  `transform_acq_params()` did.

  Side effect: in Normal mode a POST no longer restarts the acquisition. The model shows that, with
  Capture Lock **off**, the Normal/Scan floor way captures the lock a bit less often than before (INFO
  2.7, ~45 % vs ~60 %): the old reset happened to re-arm the scope just before the lock. With Capture
  Lock on it does not matter.
- **AUTO keeps the rest of the parameters** (fixed after the RP2 test of 2.3.14-22, where AUTO after a
  capture left Ext Trig = 128 "Lock control trig" in the server and in the FPGA, `0x4060000C = 0x80`).
  Two causes: the AUTO branch of `rp_set_params()` returned before `lock_update()` / `pid_update()` /
  `generate_update()`, so the `lock_trig_sw = 2` of the restore (and any other non-scope value of the AUTO
  POST) never reached the FPGA; and at the end of the auto-set `rp_update_main_params()` copied the
  **whole** worker copy of the parameters over the main ones. That copy only changes with scope changes
  (since 2.3.14 `lock_trig_sw` is not one), so it still had the 128 of the capture, and the next GET
  (`lock_update_main()`) read the 128 back from the FPGA. Now:
  1. `rp_osc_worker_start_auto_set()` gives the worker the current parameters and the auto-set state
     under the same lock (the auto-set starts from them);
  2. after the auto-set the AUTO POST goes on with the AWG / PID / lock part (`goto scope_done`);
  3. `rp_update_main_params()` copies back only `auto_set_params[]`: window (`xmin`/`xmax`), trigger
     mode / source / delay / level, time range / units, `auto_flag`, Y range (`min_y`/`max_y`, norm,
     `gui_reset_y_range`). Lock, PID, generator and UI parameters are never written by the auto-set;
  4. an auto-set aborted by another worker state copies nothing back and clears `auto_flag` (before, the
     stale copy went back with `auto_flag = 1` and `rp_set_params()`, called from the worker thread,
     started a new auto-set and waited 10 s for itself). Aborted by new parameters with the auto-set
     state still on, the worker runs it again with them, as before.

  No other path copies the worker parameters back: Single (`single_btn`) and forceX work on
  `rp_main_params` in `rp_set_params()` / `transform_acq_params()`.
- **Zoom-out after a change of time units.** When the units change the server forces the new range
  (forceX) and, until the GUI sends it back, ignored any range more than 33x away from it (taken as a
  POST still in the old units). A real zoom-out of more than 33x right after the change (e.g. 100-400 us
  -> 0-64160 us) was lost: the server answered the forced range again (preexisting). POSTs built before
  the GUI got the forced range arrive within ~1.1 s (rate limit of the UI 1 s + 100 ms queue), so the
  33x rule now only applies for 1.5 s after the forceX (`FORCEX_STALE_MS`).

### 3.3 Fire on click, lock already ARMED or LOCKED

The click always ends in a fresh request with the new value: POST 1 releases the request (`[1:0] = 00`)
together with the new time / level (and the capture settings), POST 2 arms again (and with Capture Lock,
captures). While LOCKED this opens the loop for the few ms between the two POSTs and locks again at the
new point; that is the intention of clicking a new point. While ARMED the new value would also work
without a release, but the re-arm keeps one path for both cases and gives a new capture.

### 3.4 Choose from graph

A second click on the button (now labelled *Cancel*) or Esc cancels the pending click. The message and
the red warning are recomputed on every change of trigger mode / source / Ext Trig / lock trigger type /
capture state (`trigFromGraphMsg()`, called from `onDropdownChange()` and `loadParams()`), not only when
the button is pressed; trigger type OFF cancels it.

## 4. Tests

`node test/lock_capture_ui_sim.js` (UI code of index.html + models of the C controller, the scope worker
and lock_ctrl.v in continuous time): POST sequence, 5/5 and 200/200 captures with Time, Level and
Level+time, Lock Now, frozen trace for 5 s (also with unrelated POSTs and the release), restore with
Auto / Single / AUTO / unchecking, Fire on click (value + Trigger Lock, release + re-arm while
LOCKED), warning and cancel of Choose from graph, UI preferences. Removing the C wait from the model
(mutation) drops the captures to ~50 %; removing the freeze in `doGetData()` fails the frozen checks.
Check 5.5 runs a capture and then AUTO with a model of the worker copy and of the auto-set; the model of
the C before the fix (`autoOld`) fails it.

`test/auto_set_c_sim/run.sh [src dir]` compiles the **real** C controller (`src/*.c`) for the PC, with
`/dev/mem` replaced by memory (`fake_hw.h`) and a thread that plays the scope FPGA (`harness.c`):
Capture Lock + kp change + AUTO POST (restore + ki) → Ext Trig 2 in the params and in the lock register,
kp and ki kept, auto_flag 0, auto-set window; forceX (zoom with a change of units, POST in the old units
right after: ignored; zoom-out of 160x 1.6 s later: applied); a POST during an auto-set (no 10 s wait).
With the sources before the fix it fails 1.1, 1.2, 1.4 and 2.3 (Ext Trig 128 in params and FPGA, ki of
the AUTO POST lost, zoom-out ignored).

## 5. Python scripts on the board

Running `py/*.py` on the board (e.g. `lock_from_registers.py`, which imports `hugo`) makes Python create
`py/__pycache__/` in the App folder. That is fine: it is only a cache, and the Makefile removes
`__pycache__` and `*.pyc` from `target/` and from the packages, so it is never distributed. It can be
deleted at any time.
