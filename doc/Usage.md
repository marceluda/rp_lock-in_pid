# Using the App from the web interface

How to use `lock_in+pid` **v2.2.6** from the browser, panel by panel, and the usual procedures: scan, see a
peak, get an error signal, close a lock and check it. Technical data of each instrument is in
[App.md](App.md); registers in [FPGA.md](FPGA.md). The published documentation of this App has a longer,
illustrated description of the interface: https://marceluda.github.io/rp_lock-in_pid/

- [Opening the App](#opening-the-app)
- [Layout of the page](#layout-of-the-page)
- [Panels](#panels)
  - [Toolbar](#toolbar) · [Oscilloscope](#oscilloscope) · [Outputs](#outputs) ·
    [Lock-in modules](#lock-in-modules) · [Ramp Controller](#ramp-controller) · [PIDs modules](#pids-modules) ·
    [Lock Control](#lock-control) · [Right panels and displays](#right-panels-and-displays)
- [Typing values with units](#typing-values-with-units)
- [Procedures](#procedures)
  1. [Scan and see the response of the system](#1-scan-and-see-the-response-of-the-system)
  2. [Get an error signal](#2-get-an-error-signal)
  3. [Close the lock](#3-close-the-lock)
  4. [Check the lock and release it](#4-check-the-lock-and-release-it)
- [Saving and loading configurations](#saving-and-loading-configurations)
- [Saving data](#saving-data)
- [Several clients and Restart](#several-clients-and-restart)
- [Known limitations of the interface](#known-limitations-of-the-interface)

Screenshots: RP2 (RedPitaya_OS 2.04-35) with v2.2.6-14, taken by testAgent during the tests of
`reportes/lock-in_pid.md` (2026-10-10; the system scanned is a simulated peak made by `dummy_simulator` on a
second board, OUT1 → IN1 of the other board and back) and by docAgent while writing this page (only opening
panels; the values seen are those left on the board).

## Opening the App

Install the App (see the [README](../README.md#installation)) and open `http://rp-XXXXXX.local/lock_in+pid/`
(or choose "Oscilloscope+Lock-in+PID" in the main menu). The page starts the App (loads the FPGA and the C
controller) if it is not already loaded, and restores the state of the previous session of the same browser tab.
Use a single tab per board (see [Several clients and Restart](#several-clients-and-restart)).

## Layout of the page

![Scan of a peak: ramp in OUT1, Normal trigger on Scan floor (v2.2.6)](.Usage/scan_normal_scan_floor_ramp_panel.jpg)

- **Top toolbar**: zoom and acquisition buttons.
- **Left column**: the instruments (Oscilloscope, Outputs, Lock-in modules, Ramp Controller, PIDs modules,
  Lock Control). Each title opens or closes its panel.
- **Centre**: the plot (Channel 1 blue, Channel 2 red), the mouse position and the displays *Harmonic
  Lock-in* (X, Y, R, φ, F1, F2, F3) and *Square Lock-in* (X, Y, R, φ).
- **Right column**: the scope controls (Trigger, Range, Measure, Gain settings) and the Monitor.

Every change is sent to the board when the field loses focus or Enter is pressed (Escape cancels the edit).
Only changed values are sent. A field left empty or with an invalid text is not sent; the last value comes back.
The mouse wheel over a number field changes it by 1 (SHIFT ×10, CTRL ×100); **the wheel over the plot zooms the
time axis** (it changes the acquisition window).

## Panels

### Toolbar

| Button | Action |
|---|---|
| Autoscale | Rescales the **Y axis** to the data on screen, only in the page. Does not end a lock capture. |
| Reset zoom, zoom in/out, pan | Plot navigation. A zoom selects the time window of the acquisition; the decimation (time range 0..6, up to 68.7 s) is chosen from it. |
| Channel 1 / Channel 2 | Show or hide each channel. |
| Stop | Stops the acquisition. |
| Save Data | Plot data as Python/Numpy, Matlab/Octave or CSV ([Saving data](#saving-data)). |
| Config | Save / load configurations ([below](#saving-and-loading-configurations)). |
| Raw Mode | Values in counts instead of volts (also in the lock-in displays). |
| Averaging | Average inside the decimation. |
| **AUTO** | Auto-set of the scope in the controller (time range, trigger, Y range). Ends a lock capture. Not the same as *Autoscale*. |

![AUTO: auto-set of the scope (v2.2.5)](.Usage/autoset.jpg)

### Oscilloscope

![Oscilloscope and Outputs panels (v2.2.6)](.Usage/panel_oscilloscope_outputs.jpg)

- **OscA / OscB**: signal shown on Channel 1 / Channel 2: 0, in1, in2, error, ctrl_A, ctrl_B, Ramp A/B,
  pidA/B_in, PID A/B out, the references (sin_ref, cos_ref, cos_1f/2f/3f, sq_ref, sq_quad, sq_phas, square ref
  (bin)), signal_i, Xo, Yo, F1o, F2o, F3o, sqXo, sqYo, sqFo. The fast inputs are seen with `in1`/`in2`.
- **Ext Trig**: event used when the scope trigger *Source* is *External*: None, Pin (DIO0_P), Scan floor, Scan
  ceil, harmonic mod. (start of each period of the harmonic modulation), Square mod., Out of lock, Jump trigger,
  Lock control trig (the lock event; used by Capture Lock).
- **More options**: *R|Phase Mode* (button disabled in this version) and *Disable anti-aliasing filter* for each
  channel (on by default).

### Outputs

![More options of the Oscilloscope and Slow outputs (v2.2.6)](.Usage/panel_oscilloscope_more_slow_outputs.jpg)

- **Out1 / Out2**: signal sent to each fast output (±1 V): 0, in1, in2, in1−in2, sin_ref (Out1) / cos_ref
  (Out2), cos_1f, cos_2f, cos_3f, sq_ref, sq_quad, sq_phas, PID A out (Out1) / PID B out (Out2), ctrl_A, ctrl_B,
  error, aux_A (Out1) / aux_B (Out2). For a lock, Out1 = ctrl_A (ramp + PID A) is the usual choice. **No
  modulation is added to the outputs**: to modulate the system use the other output (e.g. Out2 = cos_ref), the
  digital pin DIO7_N, or external means.
- **Slow outputs**: four selectors. *Slow out3* and *Slow out4* drive AO2 and AO3 (0..1.8 V, −1 V of the signal →
  0 V); **Slow out1 and Slow out2 have no effect** in this version ([App.md](App.md#inputs-and-outputs)). The slow
  outputs were not measured on 2.0 (a confirmar).

Example of a reference on an output: Out1 = cos_1f with Period 50 (972.6 Hz), seen on IN1 after the simulated
peak (2f components):

![cos_1f on OUT1 and IN1 after the dummy system (v2.2.6)](.Usage/cos1f_out1_in1.jpg)

### Lock-in modules

![Lock-in modules: input and slow harmonic lock-in (v2.2.6)](.Usage/panel_lockin_harmonic.jpg)

- **Lock-in input**: signal to demodulate, common to both lock-ins (in1, in2, in1−in2, sin_ref, cos_1f, sq_ref,
  sq_phas, Ramp A, square ref (bin), square phas (bin), aux_A, aux_B).
- **Slow harmonic lock-in**:
  - *Harmonic oscillator*: **Period** (`gen_mod_hp`; τ and f below: 0 → 49.603 kHz, 50 → 972.611 Hz) and
    **Phase** of the F1/F2/F3 references (0..2519 = 0..360°, shown in degrees and π rad).
  - *Demodulation*: tabs **X, Y & F1** (one filter and one gain for the three), **F2**, **F3**, each with its low-pass
    filter (*cut* = τ \| 1/τ, *order* OFF/1/2) and *Amplification* (×1 .. ×512).
- **Fast square lock-in**:
  - *Square oscillator*: **Period** (`gen_mod_sqp`; 0 = follow the harmonic oscillator, then τ and f below are
    those of the harmonic period; > 0: period 2·(value+1)·8 ns) and **Phase** (`gen_mod_phase_sq`, ticks).
  - *Demodulation*: one low-pass filter (512 ns .. 17 ms) and *Amplification* for sqX, sqY, sqF.
- **Auxiliar**: *Aux A*, *Aux B* constants (−8192..8191), usable as signals in several selectors.

![Square lock-in section and Harmonic Lock-in display (v2.2.6)](.Usage/panel_lockin_square_and_harmonic_display.jpg)

### Ramp Controller

Visible on the left of the [layout screenshot](#layout-of-the-page).

- **Ramp period** (`ramp_step`: ticks per step − 1; below, the resulting period τ and frequency f of the
  triangle), **Ramp hig lim**, **Ramp low lim** (counts, with the value in mV below), **Ramp B factor** (4096 = 1:
  ratio of Ramp B to Ramp A). The amplitude (mVpp) and centre (mVdc) are shown below.
- **Scan reset** (hold at 0), **Scan enable** (the ramp runs; the *Scan enable* button of Lock Control must also be
  on), **Scan direction**.

In the screenshot: ±5000 counts (±610 mV), period 400 → τ = 64.16 ms, f = 15.59 Hz.

### PIDs modules

![PIDs modules with the More Options of PID A (v2.2.6)](.Usage/panel_pids_pidA_more_options.jpg)

- **Error signal selector**: *Error signal* (0, in1, Xo, F1o, F3o, sqXo, sqYo, sqFo) and its *offset*.
- **PID A / PID B**: *input* (error, signal_i, in1, in2, in1−in2; with *More Options* also Xo, Yo, F1o..F3o,
  sqXo..sqFo, Ramp A, the references, aux_A/B), *reset integral*, *freeze out*, *freeze integral*, and the gains
  *kp*, *ki*, *kd* with the effective value below (kp as a factor, ki and kd as τ and f, and the sign of the
  feedback).
- **More Options** shows the set point *sp* (with mV below), the scale of kp (/1 .. /4096), ki (8 ns .. 9 s; option 4
  is "65 us" since v2.2.6) and kd (7.5 ns .. 491.5 µs), and *SAT lim* (saturation of the integral term, ±122 µV .. ±1 V).

In the screenshot kp = 100 with /1024 gives 0.098.

### Lock Control

![Lock Control and Monitor (v2.2.6)](.Usage/panel_lock_control_monitor.jpg)

From top to bottom:

- **Re-lock system** and **Step Responce Measurement** (open them with their titles, see below).
- **Scan enable / PID A enable / PID B enable**: buttons with the **effective** state of the ramp and the PIDs
  (dark = on). When nothing is locked a click toggles the manual enable; while LOCKED a click releases the lock
  keeping the other enables.
- **Trigger Lock**: arms the lock; it closes when the trigger of the *config* section happens. **Lock Now**: locks
  at once. Both stay pressed while requested; a second click releases the lock.
- **State label**: OFF / ARMED / LOCKED and the number of locks since the FPGA was loaded.
- **Capture Lock** (on by default): every lock request from the page captures the closing of the loop in the scope
  and freezes the trace. **Fire on click** (on by default): with *Choose from graph*, a click on the plot sets the
  trigger value and fires *Trigger Lock*. Design: [`lock_capture.md`](../lock_in+pid/doc/lock_capture.md).
- **config**:

![Lock Control config with a Level trigger (v2.2.6)](.Usage/panel_lock_control_config.jpg)

  - *Scan enable*, *PID A enable*, *PID B enable*: what is on **while LOCKED** (usually: scan off, PID A on).
  - *Trigger type*: OFF (only Lock Now), Time trigger, Level Trigger, Level+time Trigger.
  - *Time trigger*: delay after the scan floor, in ticks of 8 ns or with units (`16.58 ms`, `20 s`); shown as T
    below. Up to 4294967295 = 34.36 s (32 bits since v2.2.6).
  - *Signal for trigger* (error, Xo, Yo, F1o..F3o, sqXo..sqFo, signal_i, Ramp A, aux_A, in1, in2, in1−in2, PID A
    out), *Level trigger* (counts or `V`/`mV`, shown in mV below) and *trig upward?*: for the level trigger.
  - **Choose from graph**: the next click on the plot sets the time (Time trigger) or the level (Level trigger). A
    second click on the button (*Cancel*) or Esc cancels it. A red warning appears if the scope is not in
    Normal/Single + External + Scan floor (the only setup where t = 0 of the plot is the scan floor).

![Re-lock system and Step Responce Measurement (v2.2.6)](.Usage/panel_relock_step_response.jpg)

- Re-lock: *Error Enable* with `|error| >` threshold, *Signal Enable* with a signal `<` threshold, *RL reset*.
- Step response: *Jump ctrl_A*, *Jump ctrl_B*, *Freeze during step* (A/B out, A/B int), *Start Step Responce*.
- Neither was tested on 2.0 ([App.md](App.md#re-lock-and-step-response)).

How the lock control works inside: [`lock_control.md`](../lock_in+pid/doc/lock_control.md) and
[Structure.md](Structure.md#lock-control).

### Right panels and displays

- **Trigger**: *Source* (Channel 1, Channel 2, External), *Mode* (Auto, Normal, Single), *Edge*, *Level*, and the
  *Single* button. External uses the *Ext Trig* of the Oscilloscope panel.
- **Range**: buttons for the X and Y scales and offsets (the X+ button stops at 10 s; the 68.7 s range is reached
  with the zoom-out of the toolbar).
- **Measure**: min, max, amplitude, average, frequency and period of each channel.

![Measure panel (v2.2.5)](.Usage/measure_panel.jpg)

- **Gain settings**: probe attenuation and LV/HV jumper of each input (scale of the display).
- **Monitor**: mean and standard deviation of the error over ~1 s, in counts.
- **Harmonic Lock-in** / **Square Lock-in** (below the plot): X, Y, R, φ (and F1, F2, F3) in volts, computed from
  the 28-bit demodulated values (before the *Amplification*):

![Square Lock-in display (v2.2.6)](.Usage/panel_square_lockin_display.jpg)

Range 6 of the time axis (68.7 s):

![Time range 6, 68.7 s (v2.2.6)](.Usage/time_range_68s.jpg)

## Typing values with units

The **Time trigger** and **Level trigger** fields of *Lock Control → config* are text fields that accept a number
with a unit (v2.2.6, from lock_in+pid_harmonic v2.3.16; `parseTrigTime()`, `parseTrigLevel()` in `index.html`):

| Field | Without unit | Units | Range | Examples (tested on the board, v2.2.6) |
|---|---|---|---|---|
| Time trigger | ticks of 8 ns | `s`, `ms`, `us` (`µs`), `ns`, `tick(s)` | 0 .. 4294967295 (34.36 s); larger values are clamped | `16.58 ms` → 2072500, `20 s` → 2500000000, `40 s` → 4294967295 |
| Level trigger | counts | `V`, `mV`, `count(s)` | −8192 .. 8191 | `0.1 V` → 819, `120 mV` → 983, `5085` → 5085 |

An empty or invalid text (`abc`) is not sent: a red hint appears and the last value comes back. Values above 2²⁴
ticks (134 ms) go through the float parameters of the controller and are rounded to the float32 grid (≤ 1 µs).

The other number fields (Period, Phase, Ramp limits, sp, …) are `<input type="number">`: the browser does not let
letters be typed, so the unit conversions that the JavaScript has for them (`ms`, `V`, `deg`, …) cannot be used
from the page ("1 ms" in Period stays 1; `reportes/lock-in_pid.md`, 2.2.5).

## Procedures

These procedures follow the concepts of the published documentation and the tests of `reportes/lock-in_pid.md`.
The example values are those used on the test bench: a system with a resonance (a peak) whose control input is
OUT1 and whose response is measured on IN1.

**A confirmar:** a real lock with this App (closed loop on a system) was not validated on the current bench;
the steps 3 and 4 below were checked only as states, registers and captures of the page, not as a stable lock.

### 1. Scan and see the response of the system

1. **Outputs**: Out1 = `ctrl_A`.
2. **Ramp Controller**: limits ±5000 (±610 mV), period 400 (64.16 ms), *Scan enable* checked.
3. **Lock Control**: *Scan enable* button on, *PID A enable* off.
4. **Oscilloscope**: OscA = `in1`, OscB = `Ramp A` (or `ctrl_A`); Ext Trig = *Scan floor*.
5. **Trigger**: Source *External*, Mode *Normal*. Zoom to one period of the ramp: t = 0 is the scan floor.

The response of the system appears at the same position in every sweep (in the screenshot of the
[layout](#layout-of-the-page), two peaks per period, on the way up and down of the triangle).

### 2. Get an error signal

The PID needs a signal that crosses zero at the point where the system has to stay:

- **With a lock-in** (derivative of the response): modulate the system with a reference (this App does **not** add
  it to OUT1: use e.g. Out2 = `cos_ref` or `sq_ref` summed to the control input of the system outside the board,
  or the digital modulation on DIO7_N), set **Lock-in input** = `in1`, choose the modulation Period, a filter
  well below the modulation frequency, and look at `Xo`/`Yo` (harmonic) or `sqXo`/`sqYo` (square) during the scan.
  Change the *Phase* (or choose X / Y) until one component is a clean dispersive curve with a zero crossing at the
  peak. Then select it as *Error signal* (`Xo`, `F1o`, `F3o`, `sqXo`, `sqYo`, `sqFo`) or directly as PID input
  (`Yo`, `F2o` are only available as PID input).
- **Without modulation** (side of fringe): *Error signal* = `in1` with *offset* = the level of the flank where the
  system has to stay (or PID input `in1` with set point `sp`).

### 3. Close the lock

1. **PID A**: input = error (or the chosen signal), kp and ki with the sign that gives negative feedback around the
   zero crossing (try the other sign if the lock runs away).
2. **Lock Control → config**: while locked, *PID A enable* on and *Scan enable* off.
3. Choose the trigger:
   - **Time trigger**: press *Choose from graph* and click on the point of the scan where the lock must close. With
     *Fire on click* on, the click also fires *Trigger Lock*.
   - **Level trigger**: Signal for trigger = error (or in1), Level = the value just before the crossing, *trig
     upward?* according to the slope. *Choose from graph* takes the level from the click.
   - **Lock Now**: locks immediately wherever the ramp is.
4. Press **Trigger Lock**. The state goes OFF → ARMED → LOCKED in the next sweep; with *Capture Lock* the scope shows
   the closing of the loop (t = 0 is the lock) and keeps it frozen:

![Lock captured with the time trigger, Fire on click (v2.2.6)](.Usage/capture_lock_time_trigger_fire_on_click.jpg)

With the level trigger the lock is placed at 30 % of the window:

![Lock captured with the level trigger (v2.2.6)](.Usage/capture_lock_level_trigger.jpg)

While ARMED (here with a time trigger of 34 s) the page waits for the capture:

![ARMED, waiting for the lock (v2.2.6)](.Usage/armed_waiting_capture.jpg)

Choose from graph, Trigger Lock, Lock Now and release (GIF):

![Choose from graph, Trigger Lock, Lock Now and release](.Usage/choose_trigger_locknow_release.gif)

Capture Lock and Fire on click on a frozen capture (GIF):

![Capture Lock and Fire on click](.Usage/capture_lock_fire_on_click.gif)

The frozen capture ends (and the scope settings saved before the capture are restored) with trigger mode
Auto/Normal, *Single*, **AUTO**, a change of source or Ext Trig, or unchecking *Capture Lock*. *Autoscale* keeps it.

### 4. Check the lock and release it

1. Set the trigger Mode to **Auto**: the ramp has stopped; OscA = `ctrl_A`, OscB = `error` (the error should stay
   around 0), or OscA = `in1` (the signal should stay at the lock point).
2. The **Monitor** panel shows the mean (≈ 0 when locked) and the std of the error.
3. **Release**: a second click on *Trigger Lock* (or *Lock Now*), or a click on *Scan enable* (restarts the scan
   with the PIDs as they were). The page sends no POST while the lock is held (verified: 0 POST in 30 s LOCKED).

A lock can also be closed and checked without the web page, with `py/lock_from_registers.py` on the board (see
[Remote.md](Remote.md)); the page follows the state (OFF / ARMED / LOCKED) without sending anything.

## Saving and loading configurations

**Config** opens the configuration dialog (the same as in lock_in+pid_harmonic):

- *Save in browser* stores all the parameters (and the Capture Lock / Fire on click preferences) under the *Config
  Name* in the browser (`localStorage`, key `lockConfig_lock_in+pid`). *Save as file* downloads a JSON.
- The list shows the saved configs with *del*, *download* and *load*. *Load file* adds a JSON file to the list.
- **Don't turn on PIDs and Ramp on config loading**: when checked, a loaded config never turns on the ramp, the
  PIDs or a lock request (safe default when the outputs are connected to an experiment).
- Configs are per browser, not stored on the board. Configs of lock_in+pid_harmonic are not shown (own key since
  v0.2.4).
- **Time window** (v2.2.6): *load* applies the window of the config in the units it was saved with (a config saved
  in ms loaded with the scope in µs keeps its window in ms; up to v2.2.5 it was applied in the units of the
  server). The scale values derived by the server and the read-only values are not sent.

![Config → load with the window in ms (v2.2.6)](.Usage/config_load_window_ms.jpg)

## Saving data

*Save Data* gives the data of the plot as Python/Numpy vectors, Matlab/Octave vectors or CSV (save as a file, copy
or show).

## Several clients and Restart

Only one browser tab should control the board. When another client (another tab, the main menu, another App) takes
the board, the page stops polling and shows a dialog; *Restart* restarts the App and restores the state of the tab:

![Another client took control (v2.2.5)](.Usage/restart_modal.jpg)

If the App was stopped from outside (e.g. `bazaar?stop=`), the open page starts it again and restores its state.
On Ecosystem 2.0 the page enters a "cautious mode" when the board answers slowly, and waits until it answers fast
again.

## Known limitations of the interface

- **Slow out1 / Slow out2** have no effect; the **R|Phase Mode** button is disabled.
- *Time trigger* values above 2²⁴ ticks (134 ms) set from the page are rounded to the float32 grid (≤ 1 µs).
- Time / Level written from Python (`lock_from_registers.py`) do not appear in the page, and the next change of a
  lock parameter in the page rewrites them with the values of the page (a confirmar, see
  [Structure.md](Structure.md#lock-control)).
- AUTO with the lock closed (no ramp, only noise) chooses a window of 0…139 ns; with the ramp running it works
  (`reportes/lock-in_pid.md`).
- The τ/f text of *Ramp period* is not refreshed when the value is changed with the wheel (the value and the POST
  are).
- The X+ button of *Range* stops at 10 s.
- Each change made in the page is a `POST /data`, and on Ecosystem 2.0 each one leaves an open connection in the
  nginx of the board ([Remote.md](Remote.md#the-post-data-interface-of-the-ecosystem)).

These items are listed for devAgent in `docAgent.md`.
