
# Devbuild  changes

## v2.2.16 - 2026-11-13 - Ramp Controller of lock_in+pid_plus 2.2.0 (as lock_in+pid_harmonic 2.3.31): tabs period / freq, Ramp period in s / ms, Lock osc. screen, Reset zoom whole / half, no stale Force X (web page only, no FPGA / C change)

Port of the Ramp Controller of `rp_lock-in_pid_plus` v2.2.0, taken from its port to `rp_lock-in_pid_h` v2.3.31
(`git diff v2.3.30 v2.3.31` of `index.html` and `test/`). Only `index.html` (and its tests): the FPGA
(`fpga.bit.bin` `3ba3b00a…`, `red_pitaya.bit` `963dc38d…`) and the sources of the C controller are those of 2.2.15
(`controllerhf.so` only rebuilt).

**This App has the triangle ramp only:** its `gen_ramp.v` is another version of the file (no `ramp_sawtooth` input,
no `lock_ramp_sawtooth` parameter in `src/main.c`), but its triangle is the same logic as the one of lock_in+pid_harmonic
/ pid_plus (`floor ? +1 : ceil ? -1 : slope ? +1 : -1`, one count every `step + 1` cycles of 8 ns), so: one period
N = 2·(hig − low) steps, T = N·(step+1)·8 ns, f = 125 MHz / (N·(step+1)), and the ramp always rises after the scan floor
(whatever *Scan direction*). Checked on the RTL by `test/ramp_mod_period_sim.sh` (PASS, 14 checks: triangle in both
directions, 400 / 1600 / 1140 cycles). `lock_ramp_step` is a float32 parameter of the controller written with `(int)`
(as in the other Apps): steps 0 … 2147483520 ($2^{31}-128$). The JavaScript formulas are the same as in the other
Apps: without `lock_ramp_sawtooth` (undefined) they give the triangle.

- ADDED **tabs *period* / *freq*** in the Ramp Controller (only the active one visible; changing the tab ends the edit
  in progress and reloads the fields from the board; last tab in `localStorage`, key `lockin_ramp_tab_lock_in+pid`;
  *Ramp B factor* outside the tabs). *freq*: **Frequency** (Hz, `2.5 kHz`, `500 mHz`) set to the nearest reachable
  frequency (float32 steps of `lock_ramp_step`), wheel ±1 / 10 / 100 / 1000 Hz (SHIFT / CTRL / both) with at least one
  step of the register; **Amp. p-p** / **Offset** in counts (also `mV` / `V`), text in mVpp / mVdc; changing the
  amplitude keeps the frequency set by the user. The content of the active tab is boxed by the line of the tabs.
- ADDED **Lock osc. screen** (checkbox under *Ramp B factor*, with a separator; off by default, not saved): Ext Trig =
  Scan floor, Source External, Mode Normal, window 0 … T/2 (the rise of the triangle); the time zoom (box,
  SHIFT + wheel, X±) becomes new ramp limits at the same frequency; the window follows any change of the ramp
  (tolerance $10^{-4}$); off: trigger and window kept, full time zoom back; Single, another Source / Ext Trig / Mode,
  AUTO turn it off; suspended during a Capture Lock.
- ADDED **Reset zoom alternates whole period / rising half** with Source External and Ext Trig = Scan floor (without
  Lock osc. screen) while the zoom is not touched; with Lock osc. screen, its window. Scan ceil, harmonic mod.,
  Square mod. and the other Ext Trig: one period / one memory as before.
- CHANGED **Ramp period** (tab *period*) is a text field: a number is steps, `s` / `seg` / `ms` / `us` give the whole
  period T = 2·(hig − low)·(step+1)·8 ns (nearest step; before, `s` / `ms` gave the step of (hig − low) steps, half the
  period); while typing nothing is sent, Enter / blur rewrite it in steps; a text that is not valid (or hig lim = low
  lim) restores the last value. Steps limited to 0 … 2147483520.
- CHANGED the three ramp checkboxes in two columns (Scan reset / Scan enable | Scan direction); no tooltips on
  *Ramp period* / *Frequency* (the help on a click on the *Ramp period* label stays). No Sawtooth checkbox is added.
- FIXED "-0 mV" labels (Ramp low / hig lim, mVpp / mVdc, Vtrg of the lock trigger): `toFixedNz()`.
- FIXED implicit global loop variables (`window.i`, `window.ii`): `var` in the loops.
- FIXED stale **Force X** of `GET /data` (`[FORCEX]` block, `getForceXApply()`): a GET that started before the last
  Reset zoom answer, or before a window set by the page / a POST, does not move the X axis back; the flag the server
  repeats is applied once. The forceX of the POST answer and of another client are applied as before.
- Tests: new `test/ramp_ui_sim.js` (65 checks; its sawtooth cases 1, 2.2, 4.6, 5.6, 6.2, 6.3 and 7.3 run only if the
  page has the `lock_ramp_sawtooth` checkbox: skipped here; 73/73 on the page of lock_in+pid_harmonic 2.3.31) and
  `test/forcex_race_sim.js` (7/7; with `--old` on 2.2.15: 4/6); `test/reset_zoom_sim.js` C1–C15 without the sawtooth
  case C9 (61 checks; the params have no `lock_ramp_sawtooth`, as the server); `test/trig_input_units_sim.js` case 10
  without the sawtooth sub-case (42); `minor_ui_sim.js` takes the new ramp functions; `config_load_window_sim`,
  `lock_capture_ui_sim`, `lock_ctrl_ui_sim`, `osc_presets_sim` take the `[FORCEX]` block. All 15 node sims pass.
- Pending (as in pid_plus 2.2.0): *Ramp hig / low lim* do not take mV / V; the wheel over *Ramp period* does not move
  the step above $2^{24}$ (float32). Board test (testAgent) pending.

### Force X of a retried POST (same tag v2.2.16, moved to the commit with this fix; from lock_in+pid_plus 2.2.1)

Port of the fix of `rp_lock-in_pid_plus` v2.2.1 (`a8d4b0b`; see its CHANGELOG). Only `index.html` and
`test/forcex_race_sim.js`; FPGA and C sources unchanged (`controllerhf.so` only rebuilt). In `index.html` the new code
is marked `v2.2.16 (plus 2.2.1)`. Bug found by testAgent in lock_in+pid 2.2.16 (Force X 19 of 21) and lock_in+pid_harmonic2
2.4.14 (27 of 28): `reportes/lock-in_pid/2026-11-13_1806_v2216.md`.
- **Fixed — the 2nd click of Reset Zoom lost when the POST of the 1st one is retried.** nginx hangs ~2 s every
  ~3 min; if the POST of the 1st click (0 … T) falls in a hang it gets no answer in `post_chunk_timeout` (2 s) and is
  sent again with the same body, while the 2nd click (0 … T/2) waits. The answer of the retry (`forcex_flag` 1 with
  0 … T) put the axis back to 0 … T and the waiting POST sent 0 … T again. Now (`[FORCEX]` block) the answer of a POST
  during which the page set the X window itself (`xwin_gen` moved) does not set the window: `forceXStaleKeep()` keeps
  the window of the page in the units of the answer and `xwin_resend` makes the next POST send it; no forceX of a GET
  /data is applied while a window of the page is not sent yet (`xwin_pending`), and a forceX of a GET that is not
  applied does not change the time units of the page (`forceXUnitsKeep()`). (First round; superseded by the second round below:) the retry kept the same body on purpose
  (the timed-out POST may have been served in other units).
- **Fixed — a parameter changed back to its previous value during a POST in flight was lost** (a GET answered meanwhile
  carried the old server value). `post_sent`: for the keys of the POST in flight a GET answer does not replace
  `params.local` and `unsent_base` keeps the sent value.
- Tests: `test/forcex_race_sim.js` case 5 (timeout + retry + 2nd click during the wait, 12 runs, kp changed during the
  wait): 12/12; with the previous `index.html` (`--old`) 5c and 5e fail.

#### Second round (same tag, moved): the timed-out POST that the server did serve

Board test of testAgent with the first round (`reportes/lock-in_pid/2026-11-13_1848_forcex_retry.md`): it worked when the
timed-out POST never reached the server (32/32), but failed always when it did (hook `__serve = true`, the realistic case:
nginx hangs ~2 s and then serves it; pid 0/6, h2 0/2, also _h and sq). `src/main.c` reads `xmin`/`xmax` in its current
units (`time_units` is read-only) and protects a forced window only for `FORCEX_STALE_MS` (1.5 s): the retry with the same
body (0 … 9984 in µs) was read in ms and sent the server to s, and the window the page sent next was ignored (while
`forcex_state` is 1 a window more than 33× away from the forced one is not taken). No C change; in `index.html`
(marked `v2.2.16 (plus 2.2.1)`):
- `postParamsChunks(.., post_info)`: the retry of a timed-out chunk goes **without `xmin`/`xmax`** (all the other values
  are absolute; a chunk left empty carries `auto_flag` 0, a no-op), and `post_info.window_unsure` makes `sendParams()`
  treat the answer as stale: the window of the page is sent again in the units of that answer (the units of the server).
- Every POST that sends a window checks that the answer has it (`xWindowTaken()`: same window in seconds, tolerance
  $10^{-4}$ of its width). An answer with `forcex_flag` 1 and another window (the server kept its forced one) is also
  stale: the page keeps its window and sends it again after `forcex_hold_ms` = 1.7 s (> `FORCEX_STALE_MS`), up to 3
  times in a row (then it takes the window of the server). While that resend waits, POSTs for other changes go without
  `xmin`/`xmax` and their answers do not set the window either. AUTO cancels a pending resend.
- GET /data: a GET whose forceX is not applied never changes the time units of the page (also with `forcex_flag` 0:
  the server may have ended the forceX while the page still had its window in the old units); the forceX of a GET is
  put on the axis before `loadParams()`.
- Tests: `test/forcex_race_sim.js` with a server model that follows `src/main.c` (forcex_state, ratio 0.03,
  FORCEX_STALE_MS, `GUI_XMIN`/`GUI_XMAX` in float32), new cases 6 (POST served at once with its answer lost, retry; from s
  and from µs; 2nd click before and during the retry, 1 or 2 lost answers; also not served: 16 runs) and 7 (a zoom the
  server ignores in forcex_state, sent again later): 19/19. With the first round (`--old`) 6b, 6c and 7b fail.

## v2.2.15 - 2026-10-24 - AUTO trigger level at the middle of the signal with a calibration offset or a full scale other than 1 V; Raw Mode half counts (C controller; page: version and comments only; no FPGA change; as lock_in+pid_harmonic 2.3.30)

Port of lock_in+pid_harmonic 2.3.30 (same code in this App). Issues of the AUTO found in the review of v2.2.14 (the half
count was seen on RP2 by testAgent, 2026-10-24 21:44; the other two do not show on RP1 / RP2).

- FIXED (C controller): **AUTO in volts with a calibration offset** (`fe_chX_dc_offs` of the input, from the EEPROM;
  RP2's are 0): the AUTO measures the signal with samples corrected by the offset, but the threshold registers compare
  raw samples. The threshold of its period search added the offset a second time (one offset **above** the middle),
  and the level it left had no offset at all (threshold and page line one offset **below** the middle of the trace).
  Now both are the middle of the signal in raw counts, and the level is the normalized voltage that the acquisition
  path turns into that threshold (`osc_fpga_cnv_cnt_to_trig_v()` with the calibration and user offsets): the *Level*
  shown by the page is the middle of the trace. Its period search compares raw samples with raw limits (a signal
  smaller than the offset gave no period) and its Y range no longer mixes raw and corrected counts.
- FIXED (C controller): **AUTO in volts with a normalized full scale other than 1 V** (`fe_ch1_fs_g_hi` of the EEPROM;
  RP1 / RP2 have exactly 1 V, a typical factory calibration ~1.07 V): the level and the Y range were stored as
  counts / 8192, but a normalized value is counts × full scale / 8192 (the acquisition converts the level with that
  full scale, the page multiplies by chX full scale / that full scale): both were scaled by 1 / full scale (~7 %).
- With offsets 0 and a full scale of 1 V (RP1 / RP2) the volts AUTO gives the same result as before.
- FIXED (C controller): **Raw Mode, half counts**: the AUTO left a level of half a count (e.g. −2.5) that the page
  showed as −2 (`Math.round`) while the controller wrote −3 (`roundf`). Now the AUTO gives a whole count rounded as the
  page, and `osc_fpga_cnv_cnt_to_trig_v()` rounds a level with a fraction (e.g. from a remote client) the same way
  (`floor(x + 0.5)`): the Level field and the threshold register always agree.
- Tests: `test/auto_set_c_sim` section 11, new checks 11.10-11.16 (calibration offset 585 and normalized full scale
  0.6543 V of the harness: volts AUTO threshold of the search and of the acquisitions that follow at the middle, level
  shown by the page = middle of the trace, Y range in V, Raw AUTO with a middle of −2.5 → −2 in level and register,
  half counts from a remote client; with the sources of v2.2.14, 6 fail: 11.13 already passed);
  `test/trig_level_test.c`: levels with a fraction (±0.25, ±0.5, ±0.75) give the count the page shows (with the
  `src/fpga.c` of v2.2.14, 64004 fail); `test/raw_trigger_sim.js`: section 9 (page and controller round half counts
  the same way) and code checks 8.4, 8.6-8.9 (53 checks; with the sources of v2.2.14, 5 fail).

## v2.2.14 - 2026-10-24 - Raw Mode: scope trigger level in ADC counts (C controller + web page, no FPGA change; as lock_in+pid_harmonic 2.3.29)

Port of lock_in+pid_harmonic 2.3.29 (same code in this App). Bug found in `rp_dummy2` (which inherited this code),
present in all earlier versions: with **Raw Mode** on, the *Level* of the scope trigger did not work.
- FIXED (C controller): in Raw Mode the page sends the level in ADC counts, but the controller passed it to
  `osc_fpga_update_params()`, which converts **volts** to counts: 100 counts were taken as 100 V and the threshold
  saturated (8191 minus the calibration offset; −3000 even wrapped to a positive threshold), so Normal / Single never
  triggered for a level other than 0. Now `rp_osc_trig_level_v()` (`src/worker.c`) turns the counts into the voltage
  that `osc_fpga_cnv_v_to_cnt()` maps back to exactly those counts (`osc_fpga_cnv_cnt_to_trig_v()`, `src/fpga.c`, with
  the calibration offset of the input selected by OscA / OscB and the user offset). A level beyond 8191 − calibration
  offset saturates there, as in volts mode.
- FIXED (C controller): AUTO in Raw Mode: the level of its search left the calibration offset out, its result (counts)
  was then applied as volts, and its Y range (counts) was scaled and clipped to ±1000 (`min_y` / `max_y` (`_norm`)
  limits, now ±20000; not scaled in Raw Mode). Volts mode unchanged.
- FIXED (web page): *Level* field, slider (and its drag) and trigger line in counts in Raw Mode (whole counts,
  −8192 … 8191; they used the volts scale and ±1), in V otherwise (± full scale); out-of-range values limited before
  sending; unit `counts` / `V` next to the field. The **Raw Mode** button converts the level (counts = V × 8192 / full
  scale at gain 1). *Config → load* of a config with the other Raw Mode sets Y to the Reset zoom range of its mode
  once (its level is not converted). The page opened in Raw Mode starts with Y ±8192 (it was ±1 count).
- Tests: new `test/raw_trigger_sim.js` (45 checks; the page of 2.2.13 fails 31) and `test/trig_level_test.c` (real
  `src/fpga.c`); `test/auto_set_c_sim` section 11 (thresholds written by the real controller in Raw Mode, AUTO in Raw
  Mode; the sources of 2.2.13 fail 6 of its 10 checks); `lock_capture_ui_sim.js`, `lock_ctrl_ui_sim.js`,
  `osc_presets_sim.js` load the new `[RAW TRIGGER]` block.

## v2.2.13 - 2026-10-20 - Quick trigger buttons time / level / time+level in Lock Control; fixed lost time/level and re-lock with a POST in flight (as lock_in+pid_harmonic 2.3.28)

Port of lock_in+pid_harmonic 2.3.28 (web page only, no FPGA / C change; same code, the lock trigger options and
the Choose from graph / Fire on click code of this App are the same as there). Requested by the user (2026-10-20).
- ADDED: **Lock Control**: three small buttons stacked between **Trigger Lock** and **Lock Now**: **time** (orange),
  **level** (blue), **time+level** (purple). A click on one of them sets the lock trigger type (Time trigger / Level
  Trigger / Level+time Trigger) and waits for a click on the graph, as *Choose from graph* (the *config* section is not
  opened): the button stays filled, the cursor over the scope is a crosshair and a short message
  (`#lock_quick_trig_msg`) is drawn over the rows below (state label, checkboxes) without moving the panel. The click
  on the graph sets the type and the time (from the scan floor) and / or the level and fires **Trigger Lock** at once
  (whatever *Fire on click* says), with **Capture Lock** if it is checked. Nothing is sent while waiting (an ARMED /
  LOCKED lock is kept until the click, then released and armed again). A 2nd click on the same button, Esc or
  *Choose from graph* cancel; another of the three buttons changes the type.
- CHANGED: layout of that row: *Trigger Lock*, the column of the three buttons and *Lock Now* are one centered flex row
  (column as tall as the big buttons, which are a bit larger: 16 px font, 60 px high); a container query makes all of
  them a bit smaller in a narrow left column (row < 235 px, e.g. 1366 px wide windows).
- FIXED: a click with *Choose from graph* + *Fire on click* while another POST was in flight lost the new time / level
  (`loadParams()`, `trigger_just_set`, wrote them as already sent; Trigger Lock fired with the old values). Now only
  the values already sent are protected; pending ones are sent after that POST.
- FIXED: with the lock LOCKED and a POST in flight at the click on the graph, neither the release nor the new request
  was sent (the send queued during a POST runs 100 ms after its answer and `lockWhenIdle()` did not wait for it). Now
  it is kept in `send_que_timer` and `lockWhenIdle()` waits for it: the release goes first, then the request.
- Tests: new `test/lock_quick_trig_sim.js` (57 checks, harness of `lock_capture_ui_sim.js`; the page of 2.2.12 fails 51).
  The other node tests unchanged and passing.

## 2.2.12 - "Load last config on init", Load last config / Reset to defaults; Lock Control below Outputs (as lock_in+pid_harmonic 2.3.27)

Port of lock_in+pid_harmonic 2.3.27 (web page only, no FPGA / C change). Requested by the user (2026-10-20): the App
opened with the parameters of a previous session; the user wants to choose.
- CHANGED: **Lock Control** panel moved right below **Outputs** in the left column (Oscilloscope, Outputs, Lock Control, Lock-in modules, Ramp Controller, PIDs modules).
- CHANGED: the state that the page saves automatically (`saveState()`, every ~2 s and after each POST) is now also kept in
  **localStorage** (`lockin_last_state_lock_in+pid`, shared by the tabs, survives closing the browser): the **last config**.
  The tab state (`sessionStorage`, used by *Restart*) is kept as before.
- ADDED (Config dialog) checkbox **Load last config on init** (`#load_last_on_init`), **checked by default**, saved in
  localStorage (`lockin_load_last_on_init_lock_in+pid`). When the page starts the App (main menu, new tab, F5): checked, the
  last config is restored; unchecked, only `def_params` are sent (defaults of `src/main.c`). Ramp / PIDs of a restored
  config follow *Don't turn on PIDs and Ramp on config loading*; lock requests are never restored.
- ADDED (Config dialog) buttons **Load last config** and **Reset to defaults**: they close the dialog and restart the App
  (reload; stopped and started as when it is opened, FPGA reloaded) with the last config / with the defaults, whatever
  the checkbox says. Reset to defaults = a fresh App (no table of defaults in the page), lock open, no lock request.
- ADDED hold (`lockin_last_hold_lock_in+pid`): opened with the defaults, the last config is kept until the user changes a
  parameter (time window / Y axis alone do not count), so *Load last config* brings it back.
- *Restart* (took control, error dialogs) and the automatic restarts still restore the tab state; an App already running
  when the page opens keeps its state (stopped and started for Load last config / Reset to defaults).
- Tests: new `test/last_config_sim.js` (35 checks; the page of 2.2.11 fails). The other node tests unchanged and passing.

## 2.2.11 - Auto waits for the trigger; "Don't turn on PIDs and Ramp on config loading" unchecked by default (as lock_in+pid_harmonic 2.3.26)

Requested by the user (2026-10-19): loading a config switched the scan off; it should start scanning if it was
scanning when the config was saved. This change is in the web page only.

### Changed (web page)
- The option **Don't turn on PIDs and Ramp on config loading** (Config dialog, `#load_config_block_start`) is kept
  but is now **unchecked by default** (it was checked). Unchecked, *Config → load* (and *Load file*, which goes through
  the same load) and the restore of the tab state after a start / *Restart* (`restoreState()`) set
  `lock_ctrl_aux_ramp_enable_ctrl`, `lock_ctrl_aux_pidA_enable_ctrl`, `lock_ctrl_aux_pidB_enable_ctrl` and
  `lock_ramp_enable` (*Scan enable*) as saved. Checked, they are set to 0 as before. The lock requests
  (`lock_ctrl_aux_lock_now`, `lock_ctrl_aux_launch_lock_trig`) and the other transient commands
  (`state_transient_zero`) are never loaded, with or without the option.
- The option is not saved (configs, tab state, localStorage): every page load starts unchecked. The checkbox has
  `autocomplete="off"` (a browser that restores form fields on reload, e.g. Firefox on F5, could otherwise show a
  state different from the variable)
  and the variable is synced from the checkbox when the handlers are set.
- The `<title>` and page title of the source `index.html` said v2.2.9; now v2.2.11.

### Tests
- New `test/config_load_block_sim.js` (10 checks: default unchecked, Config load and Restart restore ramp / Scan enable
  / PIDs as saved, checked keeps them off, lock requests always 0). With the page of 2.2.10 6 of them fail.
  The other node tests unchanged (they set the option explicitly).

### Changed (controller, `src/worker.c`; web page): Auto waits for the trigger
Reported by testAgent (2026-10-19, lock_in+pid_square 2.0.3/2.0.4 on RP2; `reportes/lock-in_pid_sq.md`): with Ext Trig =
Scan floor the trace sometimes started at the ceiling of the scan. Cause: in **Auto** the scope triggered at once
(`osc_fpga_cnv_trig_source(trig_imm = 1)` = manual trigger source in `src/fpga.c`), so t = 0 fell on any phase of the
scan; the Ext Trig (and the level of a channel) only worked in Normal / Single. The config of the user had Auto.
- Auto now arms the real trigger source (as Normal) and the worker forces the acquisition (manual trigger source)
  only if no trigger came within a time limit counted from the moment the trigger is enabled
  (`rp_osc_auto_timeout_us()`): max(0.25 s, 1.1 x window + 50 ms, 1.1 x period of the Ext Trig + 50 ms), at most 80 s.
  The period is known for Scan floor / Scan ceil when the scan runs (Scan enable on, not in reset, effective ramp
  enable of `lock_ctrl.v` = `lock_status` bit 4; same formula as `rampPeriodCycles()` of the page) and for harmonic mod. (2520 x (hp+1)) and Square mod. (2 x (sqp+1), or the harmonic period with sqp = 0); the ramp is always a triangle in this App (no sawtooth).
  Choice of the values: 0.25 s keeps the free view (no trigger) at ~4 traces per second and is longer than the default
  64 ms scan; 1.1 x window lets a signal whose period fits in the window always trigger in time; 1.1 x period makes a
  slow scan behave as Normal (30 s scan, window 0..29.4 s: limit 33.05 s; the next floor comes ~0.6 s after the
  re-arm, so every scan is acquired from its floor); a stopped scan (or LOCKED with the ramp off) gives no period term,
  so Auto does not wait a whole period for a floor that will not come. 80 s > the longest window (68.7 s).
- Unchanged: Normal and Single (never forced), the Auto window (from the trigger, t = 0 .. xmax, no pre-trigger, as
  `src/main.c` sets it for Auto), the resume of an acquisition across POSTs that do not change it (the limit is
  recomputed and keeps counting from the same moment), the long acquisitions of 2.3.23 (forced or not, the reader
  starts at the trigger), Capture Lock (Single + Ext Trig 128) and AUTO (its own immediate acquisitions).
  `scope_acq_state` is 2 (armed) while Auto waits and 3 after the (real or forced) trigger.
- Page: the trigger *Level* field, its line and slider are enabled in Auto too (they were only for Normal); the
  "Choose from graph" warning no longer asks for Normal/Single (Auto + External + Scan floor gives t = 0 at the floor).

### Tests (Auto)
- `test/auto_set_c_sim/harness.c` section 10 (`SIM_AUTO=1 test/auto_set_c_sim/run.sh` runs only it): 10.1 Auto + Scan floor
  every 3 s, window 0..2.94 s: every trace from a floor, none forced; 10.2 scan stopped, window 0..0.1 s: forced every
  ~0.40 s (0.25 s + the acquisition); 10.3 3 s scan seen in 0..0.1 s: only floors (period term); 10.4 Normal without
  trigger: nothing. With the `src/` of 2.2.10: 10.1-10.3 fail (immediate triggers). 6.1 runs 9 s (Auto without trigger
  waits 2.25 s now) and section 8 waits 0.6 s for an Auto trace in ms. `worker.c` includes `fpga_lock.h` (g_lock_reg).

## 2.2.10 - Scope presets (OscA|OscB) and Ext Trig sets the Trigger panel (port of lock_in+pid_harmonic 2.3.24)
Port of lock_in+pid_harmonic v2.3.24 (web page only: no FPGA, no controller change; comments "v2.2.10" in
`index.html` mark the port). X|Y uses Xo/Yo of the harmonic lock-in (the select labels them "Xo"/"Yo"); sqXo/sqYo of the square lock-in are not in the fixed presets (they can be chosen in `usr`).

- Added (page): **presets of the scope signals**: six small buttons in the *Oscilloscope* panel, below *Ext Trig*
  (row *Presets*, two rows of three, 42x20 px, label in one line, 10 px bold). Blue: `in1|in2`, `in1|ctrl` (in1,
  ctrl_A), `X|Y` (Xo, Yo of the harmonic lock-in, mux 22, 23); green: `in1|err` (in1, error), `ctrl|err` (ctrl_A, error) and `usr`. A click sets OscA/OscB
  (mux values 1, 2, 3, 4, 22, 23, read from the options of the selects) through the same path as the two selects: one POST
  with only `lock_oscA_sw` / `lock_oscB_sw` (plus the usual `single_btn`/`xmin`/`xmax` with their current values);
  the zoom, the trigger (Mode, Source, Edge, Level, Ext Trig) and a Capture Lock are not touched. The title of each
  button names its two signals.
- Added (page): **`usr` preset**, a pair chosen by the user. Double click (or a click while it is not configured,
  dashed border) opens a dialog with two selects (all the options of OscA/OscB; the first time OscA = PID A out (10),
  OscB = error (3)); *Accept* saves the pair in the browser (`localStorage`, key `oscUsrPreset_lock_in+pid`) and shows
  it. It is saved in the configs (*Config* save and download json, in `ui.ui_osc_usr_a` / `ui.ui_osc_usr_b`, never
  sent to the server); a *Config load* of a config that has it takes it, configs without it keep the current pair.
- Changed (page): **Ext Trig sets the Trigger panel**: when the user picks in *Ext Trig* a value different from the
  current one and not *None*, the *Trigger* panel goes to *Source* = External and *Mode* = Normal in the same POST
  (from *Single* the page polls again). *None* changes nothing else. *Config load*, the restore at the end of a
  Capture Lock, *Reset zoom* and *AUTO* do not apply it. During a Capture Lock the change ends it and the restore and
  the new values go in one POST.
- Tests: new `test/osc_presets_sim.js` (37 checks; the page of 2.2.9 fails 32); `test/config_load_window_sim.js`:
  stub of `oscUsrConfigLoad()`.

## 2.2.9 - Reset zoom, mouse wheel on the scope and slow scans (port of lock_in+pid_harmonic 2.3.21-2.3.23)
Port of lock_in+pid_harmonic v2.3.21 (Reset zoom), v2.3.22 (mouse wheel) and v2.3.23 (slow scans, FPGA `lock_ctrl.v`);
see its CHANGELOG for the details and the board tests. New FPGA image. Comments that quote v2.3.2x refer to
lock_in+pid_harmonic. What is specific to this App:
  - FEATURE: **Reset zoom** sets X from t = 0 to one period of the ramp (Ext Trig = Scan floor / Scan ceil, always a
             triangle here: 2·(high−low)·(step+1) clocks), of the **harmonic modulation** (harmonic mod., 2520·(hp+1)
             clocks), of the **square modulation** (Square mod., 2·(sqp+1) clocks; with sqp = 0 the square
             references follow the harmonic oscillator and the trigger comes once per harmonic period) or one whole
             memory at the current Dec (other Ext Trig); periods ≥ 1.5 s: 0.98 × the period (at least 50 ms before
             the next trigger). Y to −1 … 1 V (raw mode −8192 … 8192). During a lock capture it first ends it (as
             AUTO); the Raw Mode button rescales Y. Periods measured on the RTL (`test/ramp_mod_period_sim.sh`).
  - FEATURE: **mouse wheel on the scope**: no key zooms both axes, SHIFT only time (cursor ↔), ALT only Y (cursor ↕,
             no POST); this App has one Y axis. X window 20 ns … 68.7 s; local zoom during a lock capture; xmin/xmax
             sent without rounding to 2 decimals (a fast zoom from s to ms sent 0/0).
  - BUGFIX: **slow scans** (windows ≥ 1.5 s): new long-acquisition reader in `src/worker.c` (`rp_osc_long_rd_*`, never
            a sample of an older lap of the scope memory or from before the history, `adc_we_cnt` register 0x2C of
            the scope, OK only when complete, ends at the window of the user); Capture Lock holds the lock request
            until the scope has enabled its trigger (`lock_request_hold/commit/armed/poll` in `src/lock.c`, the POST
            answers at once, a resumed acquisition publishes its arm); read-only params `scope_gen`,
            `scope_acq_state`, `scope_acq_gen`, `sig_gen` (`PARAMS_NUM` 221 -> 225); page: capture recognised by
            `sig_gen`, partial traces drawn, banners (loading history / acquiring), real "LOCKED but not captured";
            Reset zoom clears stale traces (`plot_epoch`); a change of time units replaces the old trace at once.
  - BUGFIX (FPGA, `lock_ctrl.v`): the time trigger counter is valid (`cnt_ok`) only from a floor of a ramp that has
            been running since then (cleared with the effective ramp enable off or the generator stopped / in reset,
            new input `ramp_run` = `ramp_enable & ~ramp_reset`), and it saturates instead of wrapping every 34.4 s: a
            time (or level+time) request armed after a stop (e.g. right after a release) fires at the next floor +
            time, never mid-scan. Adapted to the registered trigger inputs of this App (v2.2.6): `cnt_ok` is set
            with `ramp_trigger_r` (the clock where the counter is loaded with 1) and delayed once for level+time;
            with the ramp running the lock fires in the same clock as before. `time_eq` is built from `lock_trig_time`−1
            and two flags in registers (cnt == thr−1, or thr == 1 at a floor, or thr == 2^32−1 when saturated): with the
            saturation inside `cnt_next` the comparison was −0.26 ns (first build); same value every clock (checked
            by `lock_ctrl_tb.v` against `cnt_next == lock_trig_time`).
  - TESTS: new `test/reset_zoom_sim.js` (36, incl. Square mod.), `test/plot_wheel_sim.js` (59, one Y axis),
           `test/ramp_mod_period_sim.sh` + `_tb.v` (14: triangle, harmonic and square periods); `lock_capture_ui_sim.js`
           section 8 (79), `auto_set_c_sim` sections 6-9 (44), `lock_ctrl_tb.v` cases 16-19 and the time_eq monitor (46; the old `lock_ctrl.v`
           fails 7).

## 2.2.8 - FPGA timing: pipeline registers (port of lock_in+pid_harmonic 2.3.19)
The FPGA did not meet timing at 125 MHz (WNS -11.721 ns, TNS -12069 ns, 5431 failing endpoints). With the approval of
the user to add latency, the long combinational chains of the loop get registers, as in lock_in+pid_harmonic v2.3.19:
**WNS -1.794 ns, TNS -469 ns, 1234 endpoints** (adc_clk -> dac_clk_1x +3.858 ns). Same behaviour except for the
latencies, checked bit by bit in simulation against 2.2.7. Details: `lock_in+pid/doc/lock_latency.md`.
  - CHANGED (FPGA, added latency, 8 ns per clock): generator outputs +1 (`gen_mod2` wrapper with registered outputs);
  harmonic lock-in outputs `Xo..F3o` +2 (register after the first LPF stage and after the gain / saturation / rounding);
  square lock-in `sqXo..sqFo` +2 (the sign change of `sq_mult` registered, output register); bus `X_28..sqF_28` +1;
  PID outputs +1; `out1`/`out2` +1. LOCK MODE loop (in1 -> Xo -> PID A -> out1) +32 ns.
  - CHANGED (FPGA): the references reach the lock-in 1 clock later than the outputs, so the phase measured through
  DAC -> system -> ADC does not change (lock_in+pid_harmonic 2.3.19 does not have this compensation: -0.14 deg at
  49.6 kHz there; here it matters for the square modulation, up to 31.25 MHz).
  - CHANGED (FPGA, same values): `sat14` without barrel shifter, PID integrator with the ISR shift in parallel,
  `sum_div` of the second LPF stage in a register (LP_filter2/3 `.OREG` / `.DREG`).
  - CHANGED: page title (`h2.page-title`) and `<title>` get the version of `info/info.json` at build time (Makefile).
  - ADDED `test/lock_latency_sim.sh` + `test/lock_latency_tb.sv` (xsim, 418 checks against 2.2.7).

## 2.2.7 - Minor fixes of lock_in+pid_harmonic 2.3.18 (no FPGA change)
Port of the fixes of lock_in+pid_harmonic v2.3.18 that apply to this App (it has no streaming, no `control_finn.py`
/ `example_usage.py`). The FPGA image is the one of 2.2.6 (only comments of `lock.v` changed). Comments that quote
v2.3.18 refer to lock_in+pid_harmonic.
  - BUGFIX: **lock trigger registers written from Python** (`py/lock_from_registers.py --time/--level/--sw`):
            `lock_trig_val` (0x30), `lock_trig_time` (0x34) and `lock_trig_sw` (0x38) follow the rule of `lock_control`:
            the C writes each one only when its parameter changes and copies a value written from outside to the
            parameter, so the page shows it and keeps it (before, it was not shown and the page value was written
            back at the next change of any lock parameter: on the board the lock fired at 18 ms instead of 100 ms).
  - BUGFIX: Config -> load sent read-only parameters of the server (`meas_*`, `lock_X/Y/...`, `lock_lock_status`,
            `lock_lock_control`, `trig_delay`, ...): skipped (`server_ro_keys`).
  - BUGFIX: Single mode made no request at all after its acquisition (a `bazaar?stop` or another client was not
            noticed, the lock label was not refreshed): 1 s polling in Single; an `AGAIN` answer starts the fast
            polling only while a Single click waits for its acquisition.
  - BUGFIX: console "Capture Lock: ended by , scope settings restored" (the reason is given); the mouse wheel on
            Ramp period / limits, PID, modulation and lock trigger fields updates the text below them; X+ of the plot
            range up to 68.72 s (it stopped at 10 s).
  - BUGFIX: `py/lock_from_registers.py`: `--time` clamped to 0..2^32-1 ticks with a message (`40s` gave
            `OverflowError`), `ns`/`us` accepted, `--sw` 0..15, docstring (`--sw` is "Signal for trigger"; here
            6-8 are the real signals sqXo/sqYo/sqFo).
  - BUGFIX: `upload_app.sh`: rw script of the OS as the Makefile, `-w` removed `{index.html,js.css}` (`js,css`),
            `fpga.sh` exec bit.
  - CHANGED: AUTO minimum window 1 us (was 100 ns: with noise only it gave 0...139 ns).
  - CHANGED: texts: `ctrl_B` = pidB_out + ramp_B (`lock.v`, `fpga_lock.h`, `main.c`, `config_tool.py`); `src/fpga.h`
            20-bit decimation; `doc/lock_control.md`, `doc/Remote.md` (trigger registers written from outside).
  - TESTS: `test/minor_ui_sim.js` (new), `lock_capture_ui_sim.js` part 7 (Single polling), `config_load_window_sim.js`
            (no read-only key sent), `auto_set_c_sim` parts 4 and 5.

## Documentation (after 2.2.6, not a new version)
  - FEATURE: `doc/` written for v2.2.6: `App.md` (instruments and technical data), `Usage.md` (web interface and
             procedures, screenshots in `doc/.Usage/`), `Structure.md` (layers and FPGA block diagrams, Mermaid),
             `FPGA.md` (register map checked against the RTL), `Remote.md` (Python scripts on the board and the SSH
             client; there is no HTTP API), `Devel.md` (build, tests, installation). `doc/README.md` is now the
             index of `doc/`. README rewritten (features, documentation, installation, building).

## 2.2.6 - Lock control in the FPGA, Capture Lock, web UI fixes of lock_in+pid_harmonic 2.3.10-2.3.17
Port of the lock / web UI / controller changes of lock_in+pid_harmonic v2.3.10 to v2.3.17 (see its CHANGELOG
for the details of each one). New FPGA image. One step: those changes build on each other (Capture Lock, Fire on
click, the trigger fields and Config -> load all use the lock_status of the FPGA), so they were ported in the order
in which they were made and tested in lock_in+pid_harmonic.
  - CHANGED: **The lock sequence runs entirely in the FPGA** (`lock_ctrl.v`, state machine OFF / ARMED / LOCKED,
             from lock_in+pid_harmonic v2.3.13). `lock_control` (0x28) is command + configuration and is never
             modified by the FPGA nor rewritten from its state: `[0]` lock now and `[1]` launch lock are requests
             (0->1 edge locks / arms, `[1:0] = 00` releases). **0x2C is now `lock_status` (read only)**, replacing
             `lock_feedback`: `[0]` armed, `[1]` locked, `[4:2]` effective ramp / PID A / PID B enables, `[15:8]`
             lock counter. No other register moved. Fixes: after Trigger Lock `lock_control` kept launch_lock = 1
             while the page showed 0 and a second click did not release the lock (testAgent 2026-10-10 01:00); the
             lock was only "committed" after the page copied `lock_feedback` back. See `lock_in+pid/doc/lock_control.md`.
  - CHANGED: C controller: `lock_lock_status` replaces `lock_lock_feedback`, `lock_lock_control` is a read-only
             mirror; `lock_control` is written only when the user changes it, and the status (also of a lock
             started from outside, e.g. Python) is read on every request. Web UI: Scan / PID A / PID B show the
             effective enables, plus an OFF / ARMED / LOCKED label with the lock count; Trigger Lock / Lock Now stay
             pressed while requested and a second click releases the lock. No POST while locked.
  - CHANGED: `lock_ctrl.v` of this App registers its trigger inputs for timing: the ramp floor trigger (the counter
             is loaded with 1 one clock later, so the Time trigger fires in the same clock as before) and the level
             / time comparisons (the Level trigger fires 1 clock = 8 ns later; level+time keeps the time condition
             aligned). Failing endpoints of `i_lock_ctrl` 49 -> 15: the 14 of its input register remain, because
             the long path is upstream, in the lock-in chain (demodulation + LPF bypass), as for the PID and scope.
  - CHANGED: **Lock time trigger: 32 bits end to end** (`lock_ctrl.v` counter/comparator; the controller converts
             the parameter as unsigned, it saturated at 2^31 - 1 = 17.2 s). Up to 2^32 - 1 ticks (34.36 s).
  - FEATURE: **Capture Lock** (each lock request from the page captures the closing of the loop in the scope,
             triggered by Ext Trig = "Lock control trig", and freezes it until Auto / Single) and **Fire on click**
             (a click with Choose from graph sets the value and fires Trigger Lock). See `lock_in+pid/doc/lock_capture.md`.
  - BUGFIX: "Choose from graph" gave a wrong time with some zooms / offsets / time units; a click set both the time
            and the level (now only those of the trigger type). The "Auto-zoom" option was removed (a warning appears
            when the scope trigger is not Normal/Single + External + Scan floor).
  - FEATURE: Time trigger / Level trigger fields accept units (`16.58 ms`, `20 s`, `0.1 V`, `120 mV`...); an emptied
             number field is no longer sent as 0; the Time trigger is bounded to 4294967295 (float32 echo).
  - BUGFIX: Config -> load applied the time window in the units of the server (a config saved in ms loaded with the
            scope in us gave the same numbers in us; testAgent 2026-10-10 01:00): the window is converted from the
            units of the config and applied after the load; `forcex_flag`, `time_units`, `time_range`, `gui_xmin`,
            `gui_xmax` and the read-only params (`meas_*`, `lock_X`..., `lock_lock_status`) are not sent any more.
  - BUGFIX: A Single click made while another POST was in flight was lost. The time scale is restored after a
            Restart (saved in seconds). Transient lock requests (lock now / launch lock) are never saved nor loaded.
  - BUGFIX: Every POST reset the scope (a Single waiting for its trigger was disarmed); AUTO after a lock capture left
            Ext Trig on "Lock control trig" and dropped the other values of the AUTO POST; an aborted auto-set no
            longer restarts itself; a zoom-out of more than 33x right after a change of time units was ignored.
  - FEATURE: Scope time range 6: decimation 524288 (~68.7 s; 20-bit decimation of the FPGA of 2.2.5).
  - CHANGED: PID integrator divider label "6 us" -> "65 us"; descriptions of X / Y (X from cos_ref, in phase;
             Y from sin_ref, quadrature).
  - FEATURE: `py/lock_from_registers.py` (arm / lock now / release / status writing only FPGA registers); `py/hugo.py`
             `lock_status` and `osc.acq_done()`; `py/osc_trig.py` waits for the end of the acquisition with conf bit 4
             (in the 2.0 FPGA `TrgSrc` keeps bit 5 after a trigger and never read 0); `control_hugo.py`:
             `launch_lock()` / `lock_now()` always failed, new `release_lock()` and `lock_status()`.
  - Tests (`lock_in+pid/test/`): xsim `lock_ctrl_sim.sh` (35 checks) and `lock_bus_read_sim.sh` (+ lock_status),
    node `trig_from_graph_sim.js`, `lock_ctrl_ui_sim.js`, `lock_capture_ui_sim.js`, `trig_input_units_sim.js`,
    `config_load_window_sim.js`, and `auto_set_c_sim/run.sh` (the real C controller on the PC).
  - `resources/config_tool.py`: `lock_status`, read-only `lock_lock_control`, block of `lock_control` written only on
    changes, `lock_float_to_u32()` for `lock_trig_time`, "65 us"; its output matches the sources.

## 2.2.5 - FPGA rebuilt with Vivado 2020.1 (Ecosystem 2.0), branch devel2.0
First version of the 2.2.x series (branch `devel2.0`): v0.2.4 with the FPGA design ported to Vivado 2020.1,
as done in lock_in+pid_harmonic v2.3.10-v2.3.17. The 0.2.x series (branch `master`, Vivado 2015.2) stays as
the version for the 0.9x / 1.0 ecosystems.
  - CHANGED: `lock_in+pid/fpga` is now the RedPitaya-FPGA v0.94 project (model Z10) with the lock module of
             this App (`prj/v0.94/rtl/lock.v` + `lock/`, same registers). `make` builds `red_pitaya.bit` and
             `fpga.bit.bin` (bootgen), `make project` opens the Vivado project, `make clean` cleans; Vivado
             2020.1 is loaded inside the Makefile, isolated from the Linaro setup of the C controller. The
             2015.2 design is kept untracked in `fpga_old_2015.2/` (remains in history at v0.2.4).
  - CHANGED: The scope is the Red Pitaya 2.0 one (from lock_in+pid_harmonic): the controller unlocks its
             trigger (0x94) before each acquisition and detects the end of acquisition with conf bit 4;
             decimation register widened to 20 bits (up to 524288); scope read data held for the PS side of
             the bus (CDC fix of `rp_scope_cfg`). Kept from the 2015.2 design: lock at 0x40600000, scope at
             0x40100000 with the lock signals and lock trigger, slow outputs (PWM) driven by the lock, digital
             modulation on `exp_n_io[7]`, ASG / PID regions answer without error.
  - BUGFIX: Bus reads of fast changing signals (in1, oscA, out1, PID in/out...) could return a mix of bits of
            two values: `lock.v` now loads `sys_rdata` only during a read and holds it, and the read-only wires
            are read from registered copies (`*_rd`) frozen during the read, with a multicycle constraint
            (fix of lock_in+pid_harmonic v2.3.17; generator `resources/config_tool.py` updated, now pointing to
            `fpga/prj/v0.94/rtl/lock.v`). Test: `lock_in+pid/test/lock_bus_read_sim.sh` (xsim 2020.1).
  - BUGFIX: Negative scope samples would be shown as -1 V (the 2.0 scope returns 16-bit sign-extended samples):
            the controller and `py/hugo.py` keep the 14 ADC bits; `hugo.py` unlocks the trigger and accepts
            decimation 524288.
  - CHANGED: Only the App is built and packaged: the `_DEBUG` and `_RELOAD` flavours (controllerhf_dbg.so,
             controllerhf_rld.so, target_dbg/, target_rld/, their zip/tar and icons, the RELOAD dock of
             `src/main.c`) were removed. `make upload*` kept, as in lock_in+pid_harmonic v2.3.15 (rw script of
             the OS, `RPIP` required, fpga.sh 755).
  - CHANGED: `settings.sh` loads Vivado 2015.2 only if it is installed (not needed any more).
  - NOTE: FPGA timing does not close (as in the 2015.2 design and in lock_in+pid_harmonic 2.3.x).

## 0.2.4
  - BUGFIX: The second of two quick changes was lost (e.g. two controls changed while a POST
            was in flight): server responses keep the unsent user changes and the queued POST
            sends them. Config -> load during a POST also arrives.
  - BUGFIX: Indicators (X, Y, R, phi...) frozen after editing a number field (the 100 ms timer
            of the field left the edit mode on). Escape restores the field; leaving a select or
            checkbox without changes also ends the edit mode.
  - BUGFIX: Out of range value + Enter sent 2 POSTs (implicit submit + HTML5 validation of the
            form re-focused the field): Enter does preventDefault() and the forms are novalidate.
  - BUGFIX: The mouse wheel over a number field stopped the oscilloscope (it sent single_btn).
            SHIFT + wheel up now increments (Chrome sends it as a horizontal scroll).
  - BUGFIX: Wheel over a focused field sent each step twice.
  - BUGFIX: Restart after "another client took control" restores your settings also when the
            intruder is another tab of this same App (the App stays loaded).
  - FEATURE: Cautious polling on Ecosystem 2.0: a slow or failed /get_client_id (App change in
             progress) stops GET /data until the board answers fast again, and after
             "Application not loaded" no GET /data is done until the probe confirms this App
             (avoids the nginx worker crash).
  - BUGFIX: Cautious mode entered without reason during active use: a single slow/failed
            /get_client_id is retried at once (cautious only if the retry is slow/fails too), a
            slow answer overlapping our own POST /data is not measured, and the checks to leave it
            are 1 s apart (was 3 s).
  - BUGFIX: Endless POST loop (~15 POST/s, it crashed the nginx worker) after Config -> load of a
            config without some keys (e.g. one of lock_in+pid_harmonic): missing keys keep their
            current value, a select without selection never gives NaN, NaN is never a pending
            change, and sendParams() has an anti-loop guard (no POST without changes < 200 ms after
            the previous one, at most 10 POST/s). The display tolerates missing X/Y/F values.
  - BUGFIX: Saved configs use an own localStorage key (lockConfig_lock_in+pid); only the configs
            of this App are copied from the old shared key 'lockConfig'.

## 0.2.3
  - FEATURE: Ecosystem 2.0 support. FPGA is loaded with fpga.sh + fpga.bit.bin (fpgautil).
  - BUGFIX: "Error while sending data (E3)" on Ecosystem 2.0. The web UI now sends only the
            changed parameters, in sequential POSTs of at most 600 B, with retries.
  - BUGFIX: nginx worker segfault on Ecosystem 2.0 (GET /data while another App is loaded).
            The loaded App is probed with an empty POST before polling /data.
  - FEATURE: Detects when another client (e.g. the main menu) takes control of the board,
             stops polling and shows a modal with Restart. User state is restored after restart.
  - BUGFIX: Robust App start on Ecosystem 2.0 (stop previous App, wait, start, verify, retry).
  - BUGFIX: "Don't turn on PIDs and Ramp" now also disables Scan enable and lock triggers.
  - BUGFIX: Only finite numeric values are sent to the controller.
  - BUGFIX: Month value in pretty_now() (string concatenation).
  - BUGFIX: GUI xmin/xmax read by index in main.c; partial parameter updates broke them.

## 0.2.0-0-devbuild
  - FEATURE: better mousewheel behaviour for input number web interface.
             change step size with SHIFT and/or CTRL keys.
  - BUGFIX: Smoother real-time parame change on number inputs for web


## 0.1.1-2-devbuild
  - BUGFIX: Corrected Month value for now() and pretty_now() JS functions
            in index.html

## 0.1.1-1-devbuild
  - BUGFIX: Patch for the Lock control time trigger "Choose from graph" option,
            to set a time between 0 and max Ramp period.
  - FEATURE: Auto-zoom option for Lock control time trigger "Choose from graph" button.
             When enabled, if you click "Choose from graph" button the external trigger
             ans oscilloscope plot is configured for recommended conditions for position choose

## 0.1.0-48-devbuild
  - Started with DEBUG and RELOAG flavour
