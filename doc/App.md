# The App: instruments and specifications

`lock_in+pid` ("Oscilloscope+Lock-in+PID") **v2.2.6** for the Red Pitaya STEMlab 125-14, Ecosystem 2.0
(tested on RedPitaya_OS 2.04-35). Branch `devel2.0`.

This page describes what the App contains and its technical data. How to use it from the web page is in
[Usage.md](Usage.md); how the parts are connected in [Structure.md](Structure.md); the registers in
[FPGA.md](FPGA.md). The concepts are also explained, with figures, in the published documentation of this
App: https://marceluda.github.io/rp_lock-in_pid/TheApp/instruments/instruments_01_intro/

- [The instruments](#the-instruments)
- [General data](#general-data)
- [Oscilloscope](#oscilloscope)
- [Inputs and outputs](#inputs-and-outputs)
- [Modulation generators](#modulation-generators)
- [Lock-in amplifiers](#lock-in-amplifiers)
- [Low-pass filters](#low-pass-filters)
- [Ramp generator (scan)](#ramp-generator-scan)
- [Error signal and PIDs](#error-signal-and-pids)
- [Lock control (auto-lock)](#lock-control-auto-lock)
- [Re-lock and step response](#re-lock-and-step-response)
- [Monitor](#monitor)
- [Remote control](#remote-control)

## The instruments

The App is a set of "instruments" built inside the FPGA. They are a logical division of one circuit
(`lock.v`), whose signals are routed to each other with selectors: a measurement or a feedback loop is
configured, not wired.

| Instrument | What it does | Main registers |
|---|---|---|
| **Oscilloscope** | Two channels, any of 30 internal signals, 16384 samples, time spans from 131 µs to 68.7 s, external trigger from internal events | scope block 0x40100000, `oscA_sw`, `oscB_sw`, `trig_sw` |
| **Inputs / outputs** | Routing of 16 signals to each fast output OUT1/OUT2, and of 16 signals to the slow outputs AO2/AO3 | `out1_sw`, `out2_sw`, `slow_out3_sw`, `slow_out4_sw` |
| **Modulation generators** | Harmonic: `sin_ref`, `cos_ref`, `cos_1f`, `cos_2f`, `cos_3f` (3 Hz – 49.6 kHz). Square: `sq_ref`, `sq_quad`, `sq_phas` (up to 31.25 MHz, or locked to the harmonic one) | `gen_mod_hp`, `gen_mod_phase`, `gen_mod_sqp`, `gen_mod_phase_sq` |
| **Slow harmonic lock-in** | Demodulation of one input at 1f (X, Y and F1 at an arbitrary phase), 2f (F2) and 3f (F3), filters of 131 µs .. 4.3 s | `signal_sw`, `lpf_F1..F3`, `sg_amp1..3` |
| **Fast square lock-in** | Demodulation with square references (sqX, sqY, sqF), filters of 512 ns .. 16.8 ms | `lpf_sq`, `sg_amp_sq` |
| **Ramp generator** | Triangle scan on two signals with a fixed ratio (A and B) | `ramp_*` |
| **Two PIDs** | PID A and PID B, wide range of gains and time constants, integrator saturation, freeze and reset | `pidA_*`, `pidB_*`, `error_sw`, `error_offset` |
| **Lock control** | Automatic transition from scan (open loop) to lock (closed loop) at a time, a level or immediately, executed by the FPGA | `lock_control`, `lock_status`, `lock_trig_*` |
| **Re-lock / step response** | Out-of-lock detection; a step added to the control signals to measure the loop response | `rl_*`, `sf_*` |
| **Monitor** | Mean and standard deviation of the error over ~1 s | `error_mean`, `error_std` |

The two control signals of the App are:

```
ctrl_A = PID A out + Ramp A (+ jump A)     → usually sent to OUT1
ctrl_B = PID B out + Ramp B (+ jump B)     → usually sent to OUT2
```

Compared with [lock_in+pid_harmonic](https://github.com/marceluda/rp_lock-in_pid_h) (derived from this
App), this one has the **square lock-in** and the square references, but **does not add the modulation to the
outputs** (no `mod_out1`/`mod_out2`): the modulation reaches the system through an output used for it
(e.g. OUT2 = `cos_ref` or `sq_ref`), through the digital pin DIO7_N, or by external means. It has no
streaming, no HTTP register API and no `c/` tools (see [Remote control](#remote-control)).

## General data

| Item | Value | Source |
|---|---|---|
| Board | STEMlab 125-14 (Zynq 7010, model Z10) | `fpga/README.md` |
| Ecosystem | 2.0 (RedPitaya_OS 2.04-35 tested); FPGA loaded by `fpga.sh` with `fpgautil` | `fpga.sh`, `testAgent.md` |
| FPGA clock | 125 MHz (8 ns) | `red_pitaya_top.sv`, `src/fpga.c` |
| ADC / DAC | 14 bit, 125 MS/s; internal signals are 14-bit signed, 8192 counts = 1 V | `lock.v`, `index.html` |
| FPGA timing | does not close: WNS −11.721 ns, TNS −12069 ns (build 14), in the long combinational paths of the loop (lock-in chain → PID / scope muxes / outputs), as in the 2015.2 design (−14.749 ns); the App works on the board. Bus reads meet timing (+0.264 ns) | `devAgent.md` 2026-10-10 09:14, `reportes/lock-in_pid.md` |

**A confirmar (timing):** the 14 inputs of the lock control state machine (`signal_now_reg` in
`lock_ctrl.v`, the registered copy of the level-trigger signal) still fail timing by −9.8 ns, because the
path before them (reference ROM / `signal_i` → multiplier → two `LP_filter` with combinational bypass →
`<<< sg_amp` → saturation → `lock_trig_sw` mux) is ~16 ns long. This is pre-existing (the same chain ends in the
PIDs and the scope muxes). If the Level trigger behaved erratically on the board, this would be the first
suspect; the proposed fix (registering the output of the low-pass filters) was not applied
(`devAgent.md`, problem 58).

## Oscilloscope

The Red Pitaya 2.0 scope, fed by two internal signals chosen with `oscA_sw`/`oscB_sw` (not directly by the
ADCs). Registers: [FPGA.md](FPGA.md#oscilloscope-0x40100000).

| Item | Value |
|---|---|
| Channels | 2, each any of: 0, in1, in2, error, ctrl_A, ctrl_B, Ramp A/B, pidA/B_in, PID A/B out, sin_ref, cos_ref, cos_1f/2f/3f, sq_ref, sq_quad, sq_phas, square ref (bin), signal_i, Xo, Yo, F1o, F2o, F3o, sqXo, sqYo, sqFo |
| Memory | 16384 samples per channel; the web page gets 1024 points (`SIGNAL_LENGTH`, `src/main.h` l. 299) |
| Time ranges (decimation) | 0: 1 (131 µs), 1: 8 (1.05 ms), 2: 64 (8.4 ms), 3: 1024 (134 ms), 4: 8192 (1.07 s), 5: 65536 (8.6 s), 6: 524288 (68.7 s, new in v2.2.6) — `src/fpga.c` l. 495-526. The range is chosen from the zoom window |
| Trigger | sources Channel 1, Channel 2, External; modes Auto, Normal, Single; rising/falling edge; level |
| External trigger | pin DIO0_P, scan floor, scan ceil, start of the harmonic period, square modulation, out of lock, jump (step response), lock event ("Lock control trig") — `trig_sw` |
| Other | averaging inside the decimation, equalization (anti-aliasing) filter bypass per channel, Raw mode (counts), Measure (min, max, amplitude, mean, frequency, period), AUTO (auto-set), save data as Python / Matlab / CSV |

Range 6 was verified on the board: `Dec` = 524288 and data up to 68.72 s; it is reached with the zoom-out
(magnifier −); the X+ button of the Range panel stops at 10 s (`testAgent.md` 2026-10-10 09:48).

## Inputs and outputs

| Item | Value |
|---|---|
| Fast inputs IN1, IN2 | 14 bit, ±1 V (LV jumper) or ±20 V (HV); the *Gain settings* of the UI only change the scale of the display |
| Fast outputs OUT1, OUT2 | 14 bit, ±1 V; OUT1: 0, in1, in2, in1−in2, sin_ref, cos_1f, cos_2f, cos_3f, sq_ref, sq_quad, sq_phas, PID A out, ctrl_A, ctrl_B, error, aux_A. OUT2: the same with cos_ref instead of sin_ref, PID B out instead of PID A out and aux_B instead of aux_A |
| Slow outputs AO2, AO3 | PWM (250 MHz clock, 156 steps + 16-step dither), 0..1.8 V; `slow = (signal + 8192)·156/1024` (0..2495), so −1 V → 0 V, +1 V → 1.8 V. 16 signals each. **Not measured on the board in v2.2.x (a confirmar)** |
| Slow outputs AO0, AO1 | **not driven** (their selectors exist in the UI and as registers, but the muxers are commented out in `lock.v`) |
| `in1 − in2` | difference saturated to 14 bits |
| `aux_A`, `aux_B` | two constants (−8192..8191) usable as signals |
| Digital I/O | DIO0_P: external trigger input; DIO7_N: digital modulation output (`sq_ref_b`); not measured on 2.0 (a confirmar) |

## Modulation generators

`lock/gen_mod2.v` ([published description](https://marceluda.github.io/rp_lock-in_pid/TheApp/instruments/instruments_05_modulation)).

**Harmonic.** A table of 630 points (a quarter of period) is read forwards and backwards to make a period of
2520 points; each point lasts `gen_mod_hp + 1` ticks.

| Item | Value |
|---|---|
| Frequency | f = 125 MHz / (2520 · (`gen_mod_hp` + 1)): `gen_mod_hp` = 0 → **49.603 kHz**, 16383 → **3.03 Hz**. Example: 50 → 972.611 Hz (UI, and 972.6 Hz measured on OUT1, `testAgent.md` 2026-10-10 01:00) |
| Phase | `gen_mod_phase` 0..2519 → 0..359.86° (step 0.143°), applied to `cos_1f`, `cos_2f`, `cos_3f` |
| Amplitude | ±4094 counts (≈ ±0.5 V on an output) — `data_*_ss.dat`; measured ±0.500 V |
| Signals | `cos_ref` (phase 0), `sin_ref` (quadrature), `cos_1f` (1f with phase), `cos_2f`, `cos_3f` |

**Square.** Three binary signals `sq_ref_b`, `sq_quad_b` (a quarter period later) and `sq_phas_b`, used by the
square lock-in and, as ±4096 (±0.5 V) signals, `sq_ref`, `sq_quad`, `sq_phas`.

| Item | Value |
|---|---|
| `gen_mod_sqp` = 0 | the square references are the signs of the harmonic ones (`cos_ref`, `sin_ref`, `cos_1f`): same frequency and phase as the harmonic generator |
| `gen_mod_sqp` > 0 | independent square: period = 2 · (`gen_mod_sqp` + 1) · 8 ns; `gen_mod_sqp` = 1 → 31.25 MHz (published documentation: the square lock-in works from 30 mHz to 31 MHz) |
| Phase | `gen_mod_phase_sq` delays `sq_phas` by that number of ticks (only with `gen_mod_sqp` > 0) |
| Digital output | `sq_ref_b` on DIO7_N |

## Lock-in amplifiers

`lock.v` l. 787-1052 ([published description](https://marceluda.github.io/rp_lock-in_pid/TheApp/instruments/instruments_04_lock-in)).
Both lock-ins demodulate the same input `signal_i` (`signal_sw`: in1, in2, in1−in2, sin_ref, cos_1f, sq_ref,
sq_phas, Ramp A, square ref (bin), square phas (bin), aux_A, aux_B).

```
                 ┌ × cos_ref ─ LPF(F1) ─ X_28  ─ ×2^sg_amp1 ─ sat ─ Xo
                 ├ × sin_ref ─ LPF(F1) ─ Y_28  ─ ×2^sg_amp1 ─ sat ─ Yo
 slow harmonic   ├ × cos_1f  ─ LPF(F1) ─ F1_28 ─ ×2^sg_amp1 ─ sat ─ F1o
                 ├ × cos_2f  ─ LPF(F2) ─ F2_28 ─ ×2^sg_amp2 ─ sat ─ F2o
signal_i ────────┤ × cos_3f  ─ LPF(F3) ─ F3_28 ─ ×2^sg_amp3 ─ sat ─ F3o
                 ├ ± (sq_ref)  ─ LPF(sq) ─ sqX_28 ─ ×2^sg_amp_sq ─ sat ─ sqXo
 fast square     ├ ± (sq_quad) ─ LPF(sq) ─ sqY_28 ─ ×2^sg_amp_sq ─ sat ─ sqYo
                 └ ± (sq_phas) ─ LPF(sq) ─ sqF_28 ─ ×2^sg_amp_sq ─ sat ─ sqFo
```

| Item | Slow harmonic lock-in | Fast square lock-in |
|---|---|---|
| Multiplication | DSP multiplier, `signal_i` × reference (±4094) | sign change of `signal_i` (`sq_mult`) |
| Outputs | Xo, Yo, F1o (1f), F2o (2f), F3o (3f); 14-bit, saturated | sqXo, sqYo, sqFo |
| Filters | X, Y, F1 share `lpf_F1`; F2 `lpf_F2`; F3 `lpf_F3`. Order 0 / 1 / 2 | one `lpf_sq` for the three. Order 0 / 1 / 2 |
| Time constants | 131 µs .. 4.29 s | 512 ns .. 16.8 ms |
| Gains | `sg_amp1` (X, Y, F1), `sg_amp2`, `sg_amp3`: ×1 .. ×512 in the UI (register up to ×2^15) | `sg_amp_sq`: ×1 .. ×512 |
| Scale (gain ×1) | `Xo ≈ A`, where A = amplitude in counts of the component of the input in phase with `cos_ref` (derived from the RTL) | `sqXo ≈ 2·<±signal_i>`: 2A for a square of amplitude A, 4A/π for a sine (derived from the RTL, **a confirmar**) |
| Frequency range | 3 Hz – 49.6 kHz | 30 mHz – 31 MHz (published documentation) |
| Display (UI) | X, Y, R = √(X²+Y²), φ = atan2(Y, X), F1, F2, F3, from the 28-bit registers (`X_28 / 2^11 / 8192` V, independent of the gain) | sqX, sqY, R, φ, same scale |

The harmonic lock-in is less affected by the odd harmonics of the signal; the square lock-in reaches much
higher frequencies (published documentation). The scale of the harmonic lock-in is consistent with the
loop measured with v0.2.4 (OUT1 = `sin_ref`, ±0.5 V, 49.6 kHz → RP1 used as a repeater → IN1: R = 460-461 mV,
φ = 91.6°; `testAgent.md` 2026-10-04 12:07).

## Low-pass filters

Each line has two cascaded first-order stages (A, B); order 1 uses one, order 2 both. The cut-off of the UI
is shown as `τ | 1/τ` (e.g. "131us | 7.6kHz"); the −3 dB frequency of one stage is 1/(2πτ).

Harmonic (`LP_filter3`, τ = 8 ns · 2^(14+n)):

| n | τ | 1/(2πτ) | n | τ | 1/(2πτ) |
|---|---|---|---|---|---|
| 0 | 131 µs | 1.21 kHz | 8 | 33.6 ms | 4.74 Hz |
| 1 | 262 µs | 607 Hz | 9 | 67.1 ms | 2.37 Hz |
| 2 | 524 µs | 304 Hz | 10 | 134 ms | 1.19 Hz |
| 3 | 1.05 ms | 152 Hz | 11 | 268 ms | 593 mHz |
| 4 | 2.10 ms | 75.9 Hz | 12 | 537 ms | 296 mHz |
| 5 | 4.19 ms | 37.9 Hz | 13 | 1.07 s | 148 mHz |
| 6 | 8.39 ms | 19.0 Hz | 14 | 2.15 s | 74.1 mHz |
| 7 | 16.8 ms | 9.49 Hz | 15 | 4.29 s | 37.1 mHz |

Square (`LP_filter2`, τ = 8 ns · 2^(6+n)):

| n | τ | 1/(2πτ) | n | τ | 1/(2πτ) |
|---|---|---|---|---|---|
| 0 | 512 ns | 311 kHz | 8 | 131 µs | 1.21 kHz |
| 1 | 1.02 µs | 155 kHz | 9 | 262 µs | 607 Hz |
| 2 | 2.05 µs | 77.7 kHz | 10 | 524 µs | 304 Hz |
| 3 | 4.10 µs | 38.9 kHz | 11 | 1.05 ms | 152 Hz |
| 4 | 8.19 µs | 19.4 kHz | 12 | 2.10 ms | 75.9 Hz |
| 5 | 16.4 µs | 9.71 kHz | 13 | 4.19 ms | 37.9 Hz |
| 6 | 32.8 µs | 4.86 kHz | 14 | 8.39 ms | 19.0 Hz |
| 7 | 65.5 µs | 2.43 kHz | 15 | 16.8 ms | 9.49 Hz |

To reject the modulation the cut-off frequency must be well below the modulation frequency (2f is the main
component of the product).

## Ramp generator (scan)

`lock/gen_ramp.v` ([published description](https://marceluda.github.io/rp_lock-in_pid/TheApp/instruments/instruments_06_ramp_gen)).

| Item | Value |
|---|---|
| Shape | triangle (this App has no sawtooth); starting direction with `ramp_direction` |
| Limits | `ramp_low_lim` .. `ramp_hig_lim`, −8192..8191 (±1 V); default ±5000 (±610 mV) |
| Period | T = 2 · (hig − low) · (`ramp_step` + 1) · 8 ns; e.g. ±5000, `ramp_step` = 400 → 64.16 ms (15.59 Hz, seen on the board) |
| Second signal | `ramp_B = ramp_A · ramp_B_factor / 4096` (factor −4096..4096 in the UI, i.e. −1..1) |
| Triggers | "Scan floor" (low limit) and "Scan ceil" (high limit), for the scope and for the time trigger of the lock |
| Enable | runs while `ramp_enable` (Ramp panel, "Scan enable" checkbox) **and** the ramp enable of the lock control ("Scan enable" button) are on; `ramp_reset` holds it at 0 |

## Error signal and PIDs

`lock.v` l. 604-638 and 1138-1236, `lock/lock_pid_block.v` ([published description](https://marceluda.github.io/rp_lock-in_pid/TheApp/instruments/instruments_07_pids)).

The **error** is one of 0, in1, Xo, F1o, F3o, sqXo, sqYo, sqFo, minus `error_offset` (14-bit wrap). `Yo` and
`F2o` are not in the error selector, but each PID can take the error or any of 24 other signals directly
(`pidX_sw`, 5 bits: error, Xo, Yo, F1o, F2o, F3o, sqXo, sqYo, sqFo, signal_i, Ramp A, the references, aux_A/B,
in1, in2, in1−in2).

PID equation, with e = `sp − in` (the sign of the gains selects the sign of the feedback):

```
out = kp·e / 2^P  +  Σ(ki·e) / 2^I  +  kd·(slope of e) / 2^6
```

| Item | Value | Notes |
|---|---|---|
| `kp`, `ki`, `kd`, `sp` | −8192..8191 | 14-bit signed |
| Proportional divider P | /1, /8, /64, /1024, /4096 | default /1024 (`kp` = 1024 → gain 1) |
| Integrator (ISR) | 2^I, I = 0,3,6,10,13,16,20,23,26,30 → UI 8 ns, 64 ns, 512 ns, 8 us, 65 us, 524 us, 8 ms, 67 ms, 537 ms, 9 s ("65 us" said "6 us" before v2.2.6) | τ_i = 8 ns · 2^I / \|ki\| (UI formula, `index.html` l. 1843); default I = 26 (537 ms) |
| Derivative (DSR) | averages of 2^D samples, D = 0,3,6,10,13,16 → UI 7.5 ns .. 491.5 µs | τ_d = 7.5 ns · 2^D · \|kd\| (UI formula) |
| Integrator saturation (SAT) | ±2^SAT counts: ±122 µV (0) .. ±1 V (13) | default 13 |
| Output | saturated to 14 bits (±1 V) | |
| Controls | integrator reset, freeze output, freeze integrator (`pidX_ctrl`) | also frozen during a step (`sf_config`) |
| Enable | output forced to 0 and integrator reset while the PID is disabled by the lock control | `lock.v` l. 1184-1187 |

## Lock control (auto-lock)

The lock sequence runs in the FPGA since v2.2.6 (`lock/lock_ctrl.v`, from lock_in+pid_harmonic v2.3.13).
Design: [`lock_control.md`](../lock_in+pid/doc/lock_control.md); published description of the concept:
[instruments_08_autolock](https://marceluda.github.io/rp_lock-in_pid/TheApp/instruments/instruments_08_autolock).

| Item | Value |
|---|---|
| States | OFF (IDLE) → ARMED → LOCKED |
| In IDLE / ARMED | ramp, PID A, PID B follow the manual enables ("Scan enable", "PID A enable", "PID B enable") |
| In LOCKED | they follow the "config" enables (usually: ramp off, PID A on) |
| Requests | Lock Now (immediate), Trigger Lock (arm, lock on the trigger) |
| Triggers | **Time**: `lock_trig_time` ticks after the scan floor, 0..2³²−1 (up to 34.36 s); **Level**: the signal of `lock_trig_sw` crosses `lock_trig_val` upwards or downwards; **Level+time**: level crossing after the time |
| Latency | time trigger: the ramp stops and the PIDs start in the clock of the trigger; level trigger: 1 clock (8 ns) later (comparisons registered in build 14) |
| Status | `lock_status`: armed, locked, effective enables, lock count |
| Capture | the lock event is a scope trigger source ("Lock control trig"); the page uses it for *Capture Lock* ([`lock_capture.md`](../lock_in+pid/doc/lock_capture.md)) |

Tested on the board (v2.2.6-14, `testAgent.md` 2026-10-10 09:48): states, registers and the web page (Trigger
Lock → LOCKED, second click releases, Lock Now, manual override, ARMED with a 34 s time trigger, 0 POST while
locked or armed, Capture Lock with Time and Level, Fire on click, locking from `py/lock_from_registers.py`).
**A confirmar: a real lock (closed loop on a system) has not been validated with this App on the current
bench** (it has no modulation added to OUT1, so the procedure used for lock_in+pid_harmonic does not apply; the
user will define a setup). The PID gains used in those tests were not a real lock.

## Re-lock and step response

- **Re-lock** (`rl_*`): "out of lock" = `|error| > rl_error_threshold` and/or `signal < rl_signal_threshold`
  (signal: in1, in2, in1−in2, aux_A, aux_B), debounced (`lock/lock_debounce.v`). It is a scope trigger source;
  with re-lock enabled the ramp generator switches to a search around the current point
  (`lock/gen_ramp_relock.v`). `rl_state` always reads 0. Not tested on 2.0: **a confirmar**.
- **Step response** (`sf_*`): "Start Step Responce" adds `sf_jumpA`/`sf_jumpB` to `ctrl_A`/`ctrl_B` 2¹⁶ ticks
  (524 µs) after the start (`jump_control`, N = 16) and can freeze the outputs or integrators of the PIDs
  during the step. "Jump trigger" is a scope trigger source. Not tested on 2.0: **a confirmar**.

## Monitor

`error_mean` and `error_std` are computed in the FPGA over 2²⁷ ticks (1.074 s) and shown in the Monitor panel
in counts (`src/lock.c` `lock_update_main()`).

## Remote control

This App has **no HTTP register API** (its `nginx.conf` only sets `Cache-Control` for `index.html`). The ways
to control it from a program, described in [Remote.md](Remote.md):

- **Scripts on the board** (`lock_in+pid/py/`, through SSH): `hugo.py` (register access by name),
  `lock.py`, `osc.py`, `osc_get_ch.py`, `osc_trig.py`, `data_dump.py`, and `lock_from_registers.py` (close /
  release a lock writing only registers).
- **SSH client** `resources/remote_control/control_hugo.py` (Python on the computer, runs the scripts of `py/`
  through SSH): deprecated, kept for specific cases.
- The `POST /data` interface of the Ecosystem used by the web page (JSON with the controller parameters):
  possible in principle, not provided nor tested for this App.
