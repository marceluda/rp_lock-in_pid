# FPGA register map

Register map of the FPGA design of `lock_in+pid` **v2.2.6** (branch `devel2.0`, Vivado 2020.1,
RedPitaya-FPGA project `v0.94`, model Z10 / STEMlab 125-14).

All registers are 32-bit words on the AXI general purpose bus of the Zynq, accessed from Linux through
`/dev/mem` (the C controller `controllerhf.so` and the Python scripts of `lock_in+pid/py/`). Every block is
acknowledged on the bus; unused addresses of the lock module read 0.

- [Memory map of the blocks](#memory-map-of-the-blocks)
- [Number formats](#number-formats)
- [Lock module (0x40600000)](#lock-module-0x40600000)
  - [Scope, trigger and outputs](#scope-trigger-and-outputs)
  - [Lock control (auto-lock), re-lock and step response](#lock-control-auto-lock-re-lock-and-step-response)
  - [Lock-in amplifiers](#lock-in-amplifiers)
  - [Modulation generator](#modulation-generator)
  - [Ramp (scan)](#ramp-scan)
  - [References, inputs, outputs and monitor values](#references-inputs-outputs-and-monitor-values)
  - [PID A and PID B](#pid-a-and-pid-b)
  - [Bit fields](#bit-fields)
  - [Selector values](#selector-values)
- [Oscilloscope (0x40100000)](#oscilloscope-0x40100000)
- [Other blocks and pins](#other-blocks-and-pins)
- [Differences found between the files and the RTL](#differences-found-between-the-files-and-the-rtl)

Related documents: [App.md](App.md) (what each instrument does, in physical units),
[Structure.md](Structure.md) (how the registers are connected inside the FPGA), [Remote.md](Remote.md)
(how to read and write them from a program), and the design notes kept with the sources:
[`lock_control.md`](../lock_in+pid/doc/lock_control.md) (lock state machine) and
[`lock_capture.md`](../lock_in+pid/doc/lock_capture.md) (Capture Lock).

## Memory map of the blocks

Source: `lock_in+pid/fpga/README.md` and `fpga/prj/v0.94/rtl/red_pitaya_top.sv` (`sys[0..7]`; the lock module
is instantiated at l. 791-816 on `sys[6]`).

| Base address | Block | Notes |
|---|---|---|
| `0x40000000` | Housekeeping (`red_pitaya_hk`, 2.0 version) | ID, LEDs, expansion connector GPIO, CAN enable. Not used by the App. |
| `0x40100000` | **Oscilloscope** (`rp_scope_com`, Red Pitaya 2.0 scope with changes of the lock-in Apps) | Inputs = lock `osc1`/`osc2`; external trigger = lock `trigger`. Sample buffers at `+0x10000` (ch A) and `+0x20000` (ch B), 16384 words each. |
| `0x40200000` | (ASG removed) | `sys_bus_stub_ok`: acknowledged, no error, reads 0 (`red_pitaya_top.sv` l. 672) |
| `0x40300000` | (PID removed) | `sys_bus_stub_ok` (l. 698) |
| `0x40400000` | AMS / XADC | The slow analog outputs are **not** driven from here: they are driven by the lock module (l. 416-428) |
| `0x40500000` | Daisy chain | Not used by the App |
| `0x40600000` | **Lock module** (`lock.v`) | This App: 111 words, `0x000`..`0x1B8` |

## Number formats

- The fast ADCs and DACs are 14-bit. Inside the lock module almost every signal is a **14-bit two's
  complement integer**: `-8192 .. 8191`, where **8192 counts = 1 V** at the fast outputs and at the inputs with
  the LV (±1 V) jumpers (`index.html` uses `value/8192` V).
- Signed registers are **sign-extended to 32 bits on read** (`{ {18{x[13]}}, x }`), so they read as normal
  `int32`. On write only the low `N` bits are taken (`sys_wdata[N-1:0]`), so writing a negative `int32` gives
  the right two's complement value. Unsigned registers read with zero padding.
- Clock: 125 MHz (`adc_clk`, 8 ns per tick). All times below are in ticks of 8 ns.

## Lock module (0x40600000)

Sources: the bus decoder of `fpga/prj/v0.94/rtl/lock.v` (block `[FPGA MEMORY DOCK]`, l. 1243-1567: reset
values l. 1250-1317, writes l. 1319-1431, reads l. 1442-1566) and the declarations (`[WIREREG DOCK]`,
l. 57-127); checked against `src/fpga_lock.h` (same order, 111 contiguous words), the parameter table of
`src/main.c` (l. 306-445) and the table of `py/hugo.py` (`[REGSET DOCK]`, indices 0..110).
Absolute address = `0x40600000 + offset`; index = `offset / 4` (the index used by `py/hugo.py`).

Legend: **RW** read/write, **R** read only (writes ignored). **Bits** = width of the FPGA register.
**s/u** = signed / unsigned. **Range** = meaningful values. **Reset** = value after the FPGA is loaded.
"Frozen by `read_ctrl[0]`" = the value read is a copy that stops updating while `read_ctrl[0] = 1` (to read
several registers at the same instant).

**Bus reads (v2.2.5, fix of lock_in+pid_harmonic v2.3.17).** `sys_rdata` is loaded only while a read is
requested (`sys_ren`) and then held (l. 1442-1566). The read-only signals that are wires (`in1`, `in2`, `out1`,
`out2`, `oscA`, `oscB`, `signal_i`, `pidX_in/out`, `ramp_A/B`, references, `sq_*`, `error_mean/std`,
`slow_out1..4`, `lock_status`, `rl_state`) are read from registered copies `*_rd` (l. 966-1006), updated on
every clock except while `sys_ren = 1`; `X_28`..`sqF_28`, `error`, `ctrl_A/B`, `cnt_clk*` are read from the
`*_reg` copies of `read_ctrl[0]`, which are also held during a read (`freeze = read_ctrl[0] | sys_ren`, l. 961).
So every input of `sys_rdata` is stable for the 2 clocks of the read, as required by the multicycle constraint
of `prj/v0.94/sdc/red_pitaya.xdc` (l. 76-83). Simulation `test/lock_bus_read_sim.sh`: 0/4000 unstable reads
with this `lock.v`, 4000/4000 with the one of v0.2.4 (`devAgent.md`, 2026-10-10 00:24). On the board (v2.2.5):
0 bad reads of in1, oscA, out1, pidA_in/out, ctrl_A, ramp_A in 2000 `monitor` reads + 200000 mmap reads each
(`testAgent.md`, 2026-10-10 01:00).

### Scope, trigger and outputs

| Offset | Idx | Name | R/W | Bits | s/u | Range | Reset | Function |
|---|---|---|---|---|---|---|---|---|
| `0x000` | 0 | `oscA_sw` | RW | 5 | u | 0..29 (30, 31 → 0) | 1 (in1) | Signal sent to scope channel A (1). [Values](#oscilloscope-channels-osca_sw-oscb_sw). |
| `0x004` | 1 | `oscB_sw` | RW | 5 | u | 0..29 | 2 (in2) | Signal sent to scope channel B (2). |
| `0x008` | 2 | `osc_ctrl` | RW | 2 | u | 0..3 | 3 | `[0]` bypass the equalization ("anti-aliasing") filter of scope ch 1, `[1]` the same for ch 2. Output port `osc_ctrl` → scope `osc_ctrl_i`; bits `[31:2]` are always 0 (no streaming in this App). |
| `0x00C` | 3 | `trig_sw` | RW | 8 | u | 0..255 (mask) | 0 | Signals that make the **external trigger** of the scope. [Bits](#trig_sw-0x00c). |
| `0x010` | 4 | `out1_sw` | RW | 4 | u | 0..15 | 0 | Signal sent to fast output OUT1. [Values](#fast-outputs-out1_sw-out2_sw). |
| `0x014` | 5 | `out2_sw` | RW | 4 | u | 0..15 | 0 | Signal sent to fast output OUT2. |
| `0x018` | 6 | `slow_out1_sw` | RW | 4 | u | 0..15 | 0 | Selector of slow output 1 (AO0). **No effect**: its muxer is commented out in `lock.v` (l. 453-499). |
| `0x01C` | 7 | `slow_out2_sw` | RW | 4 | u | 0..15 | 0 | Selector of slow output 2 (AO1). **No effect** (same). |
| `0x020` | 8 | `slow_out3_sw` | RW | 4 | u | 0..15 | 0 | Signal sent to slow output 3 (AO2). [Values](#slow-outputs-slow_out3_sw-slow_out4_sw). |
| `0x024` | 9 | `slow_out4_sw` | RW | 4 | u | 0..15 | 0 | Signal sent to slow output 4 (AO3). |

### Lock control (auto-lock), re-lock and step response

| Offset | Idx | Name | R/W | Bits | s/u | Range | Reset | Function |
|---|---|---|---|---|---|---|---|---|
| `0x028` | 10 | `lock_control` | RW | 11 | u | 0..2047 | 1148 (`0x47C`) | Command + configuration of the lock state machine; never modified by the FPGA (v2.2.6). [Bits](#lock_control-0x028). |
| `0x02C` | 11 | `lock_status` | R | 16 | u | 0..65535 | 28 (`0x1C`, from the reset value of `lock_control`) | State of the lock (v2.2.6, replaced `lock_feedback`). [Bits](#lock_status-0x02c). |
| `0x030` | 12 | `lock_trig_val` | RW | 14 | s | -8192..8191 | 0 | Threshold of the **level** trigger, compared with the signal selected by `lock_trig_sw`. |
| `0x034` | 13 | `lock_trig_time` | RW | 32 | u | 0..2³²−1 (34.36 s) | 0 | Delay of the **time** trigger in ticks, counted from the last scan floor. See the note below. |
| `0x038` | 14 | `lock_trig_sw` | RW | 4 | u | 0..15 | 0 | Signal of the level trigger. [Values](#lock-trigger-signal-lock_trig_sw). |
| `0x03C` | 15 | `rl_error_threshold` | RW | 13 | u | 0..8191 | 0 | Re-lock: out of lock when `|error| > rl_error_threshold`. |
| `0x040` | 16 | `rl_signal_sw` | RW | 3 | u | 0..7 | 0 | Re-lock: signal compared with `rl_signal_threshold` (0 in1, 1 in2, 2 in1−in2, 3 aux_A, 4 aux_B, 5..7 → 0; l. 755-768). |
| `0x044` | 17 | `rl_signal_threshold` | RW | 14 | s | -8192..8191 | 0 | Re-lock: out of lock when `signal < rl_signal_threshold`. |
| `0x048` | 18 | `rl_config` | RW | 3 | u | 0..7 | 0 | `[0]` enable error threshold, `[1]` enable signal threshold, `[2]` relock reset. |
| `0x04C` | 19 | `rl_state` | R | 5 | u | 0..0 | — | **Always reads 0** (`assign rl_state = 5'b0`, l. 129). `main.c` declares it 0..31. |
| `0x050` | 20 | `sf_jumpA` | RW | 14 | s | -8192..8191 | 0 | Step response: value added to `ctrl_A` during the step. |
| `0x054` | 21 | `sf_jumpB` | RW | 14 | s | -8192..8191 | 0 | Same for `ctrl_B`. |
| `0x058` | 22 | `sf_config` | RW | 5 | u | 0..31 | 0 | `[0]` start, `[1]` freeze PID A output, `[2]` freeze PID A integrator, `[3]` freeze PID B output, `[4]` freeze PID B integrator (during the step; l. 1160-1162, 1209-1211). |

Note on `lock_trig_time`: the counter and the comparator of `lock/lock_ctrl.v` are 32 bits (v2.2.6, from
lock_in+pid_harmonic v2.3.15); the controller converts the float parameter with `lock_float_to_u32()`
(`src/lock.c` l. 36-41, 145) with saturation. The C parameters are `float` (`src/main.h` l. 28-35): a value
written from the web page above 2²⁴ ticks (134 ms) is rounded to the float32 grid (≤ 128 ticks ≈ 1 µs at 34 s),
and the read-back is also a float. In this App the time-trigger counter is reloaded with 1, one clock after a
registered copy of the scan-floor pulse (`ramp_trigger_r`, `lock_ctrl.v` l. 95-109), so the time trigger fires
in the same clock as in lock_in+pid_harmonic; the level-trigger comparisons are registered and the level trigger
fires 1 clock (8 ns) later (l. 128-157; `devAgent.md` 2026-10-10 09:14).

### Lock-in amplifiers

| Offset | Idx | Name | R/W | Bits | s/u | Range | Reset | Function |
|---|---|---|---|---|---|---|---|---|
| `0x05C` | 23 | `signal_sw` | RW | 4 | u | 0..11 (12..15 → 0) | 0 (in1) | Input of both lock-ins (`signal_i`). [Values](#lock-in-input-signal_sw). |
| `0x060` | 24 | `signal_i` | R | 14 | s | -8192..8191 | — | Lock-in input (read from `signal_i_rd`: **not** frozen by `read_ctrl[0]`). |
| `0x064` | 25 | `sg_amp1` | RW | 4 | u | 0..15 (UI 0..9) | 0 | Gain of `Xo`, `Yo` **and** `F1o`: ×2^`sg_amp1` (l. 887-889). |
| `0x068` | 26 | `sg_amp2` | RW | 4 | u | 0..15 (UI 0..9) | 0 | Gain of `F2o`. |
| `0x06C` | 27 | `sg_amp3` | RW | 4 | u | 0..15 (UI 0..9) | 0 | Gain of `F3o`. |
| `0x070` | 28 | `sg_amp_sq` | RW | 4 | u | 0..15 (UI 0..9) | 0 | Gain of `sqXo`, `sqYo`, `sqFo`. |
| `0x074` | 29 | `lpf_F1` | RW | 6 | u | 0..47 | 32 | Low-pass filter of X, Y **and** F1 (harmonic). [Bits](#lpf_f1-lpf_f2-lpf_f3-lpf_sq-0x074-0x080). |
| `0x078` | 30 | `lpf_F2` | RW | 6 | u | 0..47 | 32 | Low-pass filter of F2. |
| `0x07C` | 31 | `lpf_F3` | RW | 6 | u | 0..47 | 32 | Low-pass filter of F3. |
| `0x080` | 32 | `lpf_sq` | RW | 6 | u | 0..47 | 32 | Low-pass filter of the square lock-in (sqX, sqY, sqF; `LP_filter2`, faster time constants). |
| `0x084` | 33 | `error_sw` | RW | 3 | u | 0..7 | 0 | Signal used as `error`. [Values](#error-signal-error_sw). |
| `0x088` | 34 | `error_offset` | RW | 14 | s | -8192..8191 | 0 | `error = sel − error_offset`, 14-bit wrap, no saturation (l. 621-624). |
| `0x08C` | 35 | `error` | R | 14 | s | -8192..8191 | — | Error signal. Frozen by `read_ctrl[0]`. |
| `0x090` | 36 | `error_mean` | R | 32 | s | int32 | — | Sum of `error` over 2²⁷ ticks (1.074 s) / 2⁹ (l. 631-633). Mean in counts = `error_mean / 2^18` (`src/lock.c` `lock_update_main()`). |
| `0x094` | 37 | `error_std` | R | 32 | s | int32 | — | Sum of `|error|²` over 2²⁷ ticks / 2²² (l. 634). Mean square = `error_std / 32`; std = √(mean square − mean²) (`src/lock.c`). |
| `0x120` | 72 | `X_28` | R | 28 | s | ±2²⁷ | — | Demodulated with `cos_ref` (in phase), before `sg_amp1` (l. 877). Frozen. |
| `0x124` | 73 | `Y_28` | R | 28 | s | ±2²⁷ | — | Demodulated with `sin_ref` (quadrature) (l. 878). Frozen. |
| `0x128` | 74 | `F1_28` | R | 28 | s | ±2²⁷ | — | Demodulated with `cos_1f`. Frozen. |
| `0x12C` | 75 | `F2_28` | R | 28 | s | ±2²⁷ | — | Demodulated with `cos_2f`. Frozen. |
| `0x130` | 76 | `F3_28` | R | 28 | s | ±2²⁷ | — | Demodulated with `cos_3f`. Frozen. |
| `0x134` | 77 | `sqX_28` | R | 28 | s | ±2²⁷ | — | Demodulated with `sq_ref` (square, in phase). Frozen. |
| `0x138` | 78 | `sqY_28` | R | 28 | s | ±2²⁷ | — | Demodulated with `sq_quad` (square, quadrature). Frozen. |
| `0x13C` | 79 | `sqF_28` | R | 28 | s | ±2²⁷ | — | Demodulated with `sq_phas` (square with phase). Frozen. |

Scale of the 28-bit outputs (derived from the RTL, l. 829-847 and 1035-1052; the web page uses the same factor,
`index.html` l. 2308-2313: V = value / 2047 / 8191):

- **Harmonic**: the product `signal_i · ref` (references ±4094, `mult_dsp_14` full 28-bit product) is filtered
  with DC gain 1, so for an input `A·cos_ref/4094` (amplitude `A` counts in phase with `cos_ref`)
  `X_28 ≈ A · 2^11`, and `Xo = sat14(X_28 · 2^sg_amp1 / 2^11) ≈ A · 2^sg_amp1`.
- **Square**: the product is `±signal_i` (`sq_mult`) shifted 12 bits (`· 2^12`), so `sqX_28 = <±signal_i> · 2^12`
  and `sqXo ≈ 2 · <±signal_i> · 2^sg_amp_sq`: a square input of amplitude `A` in phase gives `2A`, a sine of
  amplitude `A` gives `4A/π`. **A confirmar on the board** (not measured in v2.2.x).

### Modulation generator

| Offset | Idx | Name | R/W | Bits | s/u | Range | Reset | Function |
|---|---|---|---|---|---|---|---|---|
| `0x098` | 38 | `gen_mod_phase` | RW | 12 | u | 0..2519 | 0 | Phase of `cos_1f`, `cos_2f`, `cos_3f` with respect to `cos_ref`, in units of 360°/2520 = 0.143°. |
| `0x09C` | 39 | `gen_mod_phase_sq` | RW | 32 | u | 0..2·(`gen_mod_sqp`+1)−1 | 0 | Delay of `sq_phas` with respect to `sq_ref`, in ticks (only with `gen_mod_sqp > 0`). |
| `0x0A0` | 40 | `gen_mod_hp` | RW | 14 | u | 0..16383 | 0 | Harmonic period: each of the 2520 points lasts `gen_mod_hp + 1` ticks: f = 125 MHz / (2520 · (`gen_mod_hp` + 1)) → 49.603 kHz .. 3.03 Hz. |
| `0x0A4` | 41 | `gen_mod_sqp` | RW | 32 | u | 0..2³²−1 | 0 | Square half period − 1: period = 2 · (`gen_mod_sqp` + 1) ticks (`gen_mod2.v` notes, l. 425-430; `index.html` l. 2089). **0 = the square references are the signs of the harmonic ones** (`sq_ref = cos_ref ≥ 0`, `sq_quad = sin_ref ≥ 0`, `sq_phas = cos_1f ≥ 0`; `gen_mod2.v` l. 368-370). |

### Ramp (scan)

| Offset | Idx | Name | R/W | Bits | s/u | Range | Reset | Function |
|---|---|---|---|---|---|---|---|---|
| `0x0A8` | 42 | `ramp_A` | R | 14 | s | -8192..8191 | — | Ramp output A. |
| `0x0AC` | 43 | `ramp_B` | R | 14 | s | -8192..8191 | — | Ramp output B = `ramp_A · ramp_B_factor / 4096` (`gen_ramp.v` l. 167-169). |
| `0x0B0` | 44 | `ramp_step` | RW | 32 | u | 0..2³²−1 | 0 | Each value of the ramp lasts `ramp_step + 1` ticks. |
| `0x0B4` | 45 | `ramp_low_lim` | RW | 14 | s | -8192..8191 | −5000 | Lower limit ("scan floor"). |
| `0x0B8` | 46 | `ramp_hig_lim` | RW | 14 | s | -8192..8191 | 5000 | Upper limit ("scan ceil"). |
| `0x0BC` | 47 | `ramp_reset` | RW | 1 | u | 0..1 | 0 | 1 = hold the ramp at 0 (written as `|sys_wdata`: any non-zero value is 1). |
| `0x0C0` | 48 | `ramp_enable` | RW | 1 | u | 0..1 | 0 | Ramp enable; the ramp runs only if this **and** the effective ramp enable of the lock control are 1 (l. 685). |
| `0x0C4` | 49 | `ramp_direction` | RW | 1 | u | 0..1 | 0 | Starting direction. |
| `0x0C8` | 50 | `ramp_B_factor` | RW | 14 | s | -4096..4096 (RTL -8192..8191) | 4096 | Ratio `ramp_B / ramp_A`, 4096 = 1. |

Triangle only (no sawtooth in this App). Period: `T = 2 · (ramp_hig_lim − ramp_low_lim) · (ramp_step + 1) · 8 ns`
(`index.html` l. 1743, `rampPeriodCycles()` l. 2880-2885). Example: ±5000, `ramp_step` = 400 → 64.16 ms (seen
on the board, `testAgent.md` 2026-10-10 09:48).

### References, inputs, outputs and monitor values

| Offset | Idx | Name | R/W | Bits | s/u | Range | Function |
|---|---|---|---|---|---|---|---|
| `0x0CC` | 51 | `sin_ref` | R | 14 | s | ±4094 | Sine reference (quadrature). |
| `0x0D0` | 52 | `cos_ref` | R | 14 | s | ±4094 | Cosine reference (phase 0). |
| `0x0D4` | 53 | `cos_1f` | R | 14 | s | ±4094 | Cosine at 1f with phase `gen_mod_phase`. |
| `0x0D8` | 54 | `cos_2f` | R | 14 | s | ±4094 | Cosine at 2f with phase. |
| `0x0DC` | 55 | `cos_3f` | R | 14 | s | ±4094 | Cosine at 3f with phase. |
| `0x0E0` | 56 | `sq_ref_b` | R | 1 | u | 0..1 | Binary square reference. |
| `0x0E4` | 57 | `sq_quad_b` | R | 1 | u | 0..1 | Binary square in quadrature. |
| `0x0E8` | 58 | `sq_phas_b` | R | 1 | u | 0..1 | Binary square with phase. |
| `0x0EC` | 59 | `sq_ref` | R | 14 | s | ±4096 | `sq_ref_b` as a signal: 1 → +4096, 0 → −4096 (±0.5 V; l. 667). |
| `0x0F0` | 60 | `sq_quad` | R | 14 | s | ±4096 | Same for `sq_quad_b`. |
| `0x0F4` | 61 | `sq_phas` | R | 14 | s | ±4096 | Same for `sq_phas_b`. |
| `0x0F8` | 62 | `in1` | R | 14 | s | -8192..8191 | Fast input IN1. |
| `0x0FC` | 63 | `in2` | R | 14 | s | -8192..8191 | Fast input IN2. |
| `0x100` | 64 | `out1` | R | 14 | s | -8192..8191 | Fast output OUT1. |
| `0x104` | 65 | `out2` | R | 14 | s | -8192..8191 | Fast output OUT2. |
| `0x108` | 66 | `slow_out1` | R | 12 | u | — | Slow output 1: wire never assigned in `lock.v` (l. 440, commented out); value read **a confirmar** (presumably 0). |
| `0x10C` | 67 | `slow_out2` | R | 12 | u | — | Same for slow output 2. |
| `0x110` | 68 | `slow_out3` | R | 12 | u | 0..2495 | Slow output 3: `(sel + 8192) · 156 / 1024` (l. 429-443). |
| `0x114` | 69 | `slow_out4` | R | 12 | u | 0..2495 | Slow output 4. |
| `0x118` | 70 | `oscA` | R | 14 | s | -8192..8191 | Signal sent to scope channel A. |
| `0x11C` | 71 | `oscB` | R | 14 | s | -8192..8191 | Signal sent to scope channel B. |
| `0x140` | 80 | `cnt_clk` | R | 32 | u | — | Low 32 bits of a 50-bit tick counter (frozen by `read_ctrl[0]`; counts only while `read_ctrl[1] = 1`, otherwise 0; l. 962-964). |
| `0x144` | 81 | `cnt_clk2` | R | 32 | u | 0..2¹⁸−1 | High 18 bits of the same counter. |
| `0x148` | 82 | `read_ctrl` | RW | 3 | u | 0..7 | `[0]` freeze `error`, `X_28`..`sqF_28`, `ctrl_A`, `ctrl_B`, `cnt_clk*`; `[1]` run the tick counter; `[2]` unused. Reset 0. |
| `0x1B4` | 109 | `aux_A` | RW | 14 | s | -8192..8191 | Constant usable as a signal in several selectors. Reset 0. |
| `0x1B8` | 110 | `aux_B` | RW | 14 | s | -8192..8191 | Same. Reset 0. |

### PID A and PID B

PID B is identical to PID A at offset `+0x34` (indices +13). `lock_pid_block.v` is the same file as in
lock_in+pid_harmonic.

| Offset A / B | Idx A / B | Name | R/W | Bits | s/u | Range | Reset | Function |
|---|---|---|---|---|---|---|---|---|
| `0x14C` / `0x180` | 83 / 96 | `pidX_sw` | RW | **5** | u | 0..24 (25..31 → 0) | 0 (error) | PID input, 25 signals (`muxer5`, l. 1140-1158). [Values](#pid-inputs-pida_sw-pidb_sw). |
| `0x150` / `0x184` | 84 / 97 | `pidX_PSR` | RW | 3 | u | 0..4 | 3 | Proportional divider: 0 /1, 1 /8, 2 /64, 3 /1024, 4 /4096. |
| `0x154` / `0x188` | 85 / 98 | `pidX_ISR` | RW | 4 | u | 0..9 | 8 | Integrator divider 2^n, n = 0,3,6,10,13,16,20,23,26,30. |
| `0x158` / `0x18C` | 86 / 99 | `pidX_DSR` | RW | 3 | u | 0..5 | 0 | Derivative: averages of 2^n samples, n = 0,3,6,10,13,16. |
| `0x15C` / `0x190` | 87 / 100 | `pidX_SAT` | RW | 14 | u | 0..13 | 13 | Saturation of the integral term at ±2^`SAT` counts (13 → ±1 V). |
| `0x160` / `0x194` | 88 / 101 | `pidX_sp` | RW | 14 | s | -8192..8191 | 0 | Set point. |
| `0x164` / `0x198` | 89 / 102 | `pidX_kp` | RW | 14 | s | -8192..8191 | 0 | Proportional gain. |
| `0x168` / `0x19C` | 90 / 103 | `pidX_ki` | RW | 14 | s | -8192..8191 | 0 | Integral gain. |
| `0x16C` / `0x1A0` | 91 / 104 | `pidX_kd` | RW | 14 | s | -8192..8191 | 0 | Derivative gain. |
| `0x170` / `0x1A4` | 92 / 105 | `pidX_in` | R | 14 | s | -8192..8191 | — | PID input (output of the selector). |
| `0x174` / `0x1A8` | 93 / 106 | `pidX_out` | R | 14 | s | -8192..8191 | — | PID output **after** the lock enable (0 while disabled; l. 1187, 1236). |
| `0x178` / `0x1AC` | 94 / 107 | `pidX_ctrl` | RW | 3 | u | 0..7 | 0 | `[0]` integrator reset, `[1]` freeze output, `[2]` freeze integrator. |
| `0x17C` / `0x1B0` | 95 / 108 | `ctrl_A` / `ctrl_B` | R | 14 | s | -8192..8191 | — | `pidX_out + ramp_X + sf_jumpX`, saturated to 14 bits (l. 249-253). Frozen by `read_ctrl[0]`. |

### Bit fields

#### `lock_control` (0x028)

Design: [`lock_control.md`](../lock_in+pid/doc/lock_control.md) §2.1-2.2 (`lock/lock_ctrl.v` l. 45-60).

| Bit | Parameter of the C controller | Meaning |
|---|---|---|
| 0 | `lock_ctrl_aux_lock_now` | Lock request, immediate: a 0→1 edge goes to LOCKED. |
| 1 | `lock_ctrl_aux_launch_lock_trig` | Lock request on trigger: a 0→1 edge arms (ARMED); the trigger locks. |
| 1:0 = 00 | — | Release: back to IDLE. |
| 2 | `lock_ctrl_aux_pidB_enable_ctrl` | Manual enable of PID B (IDLE, ARMED). |
| 3 | `lock_ctrl_aux_pidA_enable_ctrl` | Manual enable of PID A. |
| 4 | `lock_ctrl_aux_ramp_enable_ctrl` | Manual enable of the ramp. |
| 5 | `lock_ctrl_aux_set_pidB_enable` | PID B enable while LOCKED. |
| 6 | `lock_ctrl_aux_set_pidA_enable` | PID A enable while LOCKED. |
| 7 | `lock_ctrl_aux_set_ramp_enable` | Ramp enable while LOCKED. |
| 9:8 | `lock_ctrl_aux_trig_type` | 0 off (only Lock Now), 1 time, 2 level, 3 level after time. |
| 10 | `lock_ctrl_aux_lock_trig_rise` | Level trigger on rising (1) / falling (0) crossing. |

A change of bits `[4:2]` while LOCKED releases the lock. Reset 1148 = `0x47C`: the three manual enables and
`set_pidA`/`set_pidB` on, trigger type 0, rising level. The C controller writes this register only when the
value composed from the `lock_ctrl_aux_*` parameters changes (`src/lock.c` l. 125-142).

#### `lock_status` (0x02C)

| Bits | Meaning |
|---|---|
| 0 | armed (state ARMED) |
| 1 | locked (state LOCKED) |
| 2 | effective PID B enable |
| 3 | effective PID A enable |
| 4 | effective ramp enable of the lock control (the ramp also needs `ramp_enable`, 0x0C0) |
| 7:5 | 0 |
| 15:8 | number of entries into LOCKED, modulo 256 |

Examples from the board (v2.2.6): reset `0x1C`; LOCKED after one lock with PID A and B on `0x10E`; ARMED
waiting for a 34 s time trigger `0xB1D` (`testAgent.md` 2026-10-10 09:48).

#### `trig_sw` (0x00C)

`trigger_signals` in `lock.v` l. 321-329. The scope external trigger is a pulse of 8 ticks
(`lock/trigger_input.v`, N = 3) on each rising edge of `|(trigger_signals & trig_sw)`. The UI selects one bit
("Ext Trig").

| Bit | Value | UI label | Signal |
|---|---|---|---|
| — | 0 | None | — |
| 0 | 1 | Pin | Digital input DIO0_P (`exp_p_io[0]`, `red_pitaya_top.sv` l. 390, 796) |
| 1 | 2 | Scan floor | Ramp reaches `ramp_low_lim` |
| 2 | 4 | Scan ceil | Ramp reaches `ramp_hig_lim` |
| 3 | 8 | harmonic mod. | Start of each period of the harmonic modulation (`gen_mod2.v` l. 185) |
| 4 | 16 | Square mod. | Middle of the high half of the square period (`gen_mod2.v` l. 373). With `gen_mod_sqp = 0` its timing **a confirmar** |
| 5 | 32 | Out of lock | Re-lock condition (debounced, `lock_debounce`) |
| 6 | 64 | Jump trigger | Start of the step of the step response |
| 7 | 128 | Lock control trig | One-tick pulse when the lock state machine enters LOCKED (used by *Capture Lock*) |

#### `lpf_F1`, `lpf_F2`, `lpf_F3`, `lpf_sq` (0x074-0x080)

From `lock.v` l. 789-805, `lock/LP_filter3.v` (harmonic) and `lock/LP_filter2.v` (square). Each line has two
cascaded first-order filters A and B; a filter is bypassed when bits `[5:4]` of its own 6-bit `tau` input are not 00.

| `[5:4]` | Filter A | Filter B | Order (UI) |
|---|---|---|---|
| 00 | bypass | bypass | 0 = OFF |
| 01 | bypass | active | 1 |
| 10 | active | active | 2 |
| 11 | active | bypass | 1 (not offered by the UI) |

`[3:0]` = n. Harmonic (`LP_filter3`): τ = 8 ns · 2^(14+n), 131 µs .. 4.29 s. Square (`LP_filter2`):
τ = 8 ns · 2^(6+n), 512 ns .. 16.8 ms. The controller writes `order << 4 | tau` (`src/lock.c`); reset 32 = order 2,
n = 0. Tables in [App.md](App.md#low-pass-filters).

### Selector values

The labels are those of the UI (`index.html` l. 5615-6700, 7194-7640); the signals come from the muxers of `lock.v`.

#### Oscilloscope channels (`oscA_sw`, `oscB_sw`)

`muxer_reg5` (registered), `lock.v` l. 262-308. 30, 31 → 0.

| Value | Signal | Value | Signal | Value | Signal |
|---|---|---|---|---|---|
| 0 | 0 | 10 | PID A out (before the lock enable) | 20 | square ref (bin): 0 or +4096 |
| 1 | in1 | 11 | PID B out (before the lock enable) | 21 | signal_i |
| 2 | in2 | 12 | sin_ref | 22 | Xo |
| 3 | error | 13 | cos_ref | 23 | Yo |
| 4 | ctrl_A | 14 | cos_1f | 24 | F1o |
| 5 | ctrl_B | 15 | cos_2f | 25 | F2o |
| 6 | Ramp A | 16 | cos_3f | 26 | F3o |
| 7 | Ramp B | 17 | sq_ref | 27 | sqXo |
| 8 | pidA_in | 18 | sq_quad | 28 | sqYo |
| 9 | pidB_in | 19 | sq_phas | 29 | sqFo |

#### Fast outputs (`out1_sw`, `out2_sw`)

`muxer4`, `lock.v` l. 346-392. The two outputs differ in values 4, 11 and 15.

| Value | OUT1 | OUT2 | Value | OUT1 | OUT2 |
|---|---|---|---|---|---|
| 0 | 0 | 0 | 8 | sq_ref | sq_ref |
| 1 | in1 | in1 | 9 | sq_quad | sq_quad |
| 2 | in2 | in2 | 10 | sq_phas | sq_phas |
| 3 | in1 − in2 | in1 − in2 | 11 | PID A out | PID B out |
| 4 | **sin_ref** | **cos_ref** | 12 | ctrl_A | ctrl_A |
| 5 | cos_1f | cos_1f | 13 | ctrl_B | ctrl_B |
| 6 | cos_2f | cos_2f | 14 | error | error |
| 7 | cos_3f | cos_3f | 15 | aux_A | aux_B |

No modulation is added to the outputs in this App (there is no `mod_out1`/`mod_out2`): to modulate a system,
send a reference to one output (e.g. OUT2 = cos_ref) or use the digital modulation pin ([below](#other-blocks-and-pins)).

#### Slow outputs (`slow_out3_sw`, `slow_out4_sw`)

`muxer_reg4`, `lock.v` l. 504-551. Value 0 = −8192 → 0 V.

| Value | Slow out3 (AO2) | Slow out4 (AO3) | Value | Slow out3 (AO2) | Slow out4 (AO3) |
|---|---|---|---|---|---|
| 0 | 0 V | 0 V | 8 | sq_ref | sq_quad |
| 1 | in1 | in1 | 9 | sq_phas | sq_phas |
| 2 | in2 | in2 | 10 | Ramp A | Ramp B |
| 3 | in1 − in2 | in1 − in2 | 11 | PID A out | PID A out |
| 4 | sin_ref | cos_ref | 12 | ctrl_A | ctrl_A |
| 5 | cos_1f | cos_1f | 13 | ctrl_B | ctrl_B |
| 6 | cos_2f | cos_2f | 14 | error | error |
| 7 | cos_3f | cos_3f | 15 | aux_A | aux_B |

#### Lock-in input (`signal_sw`)

`muxer4`, `lock.v` l. 558-579: 0 in1, 1 in2, 2 in1 − in2, 3 sin_ref, 4 cos_1f, 5 sq_ref, 6 sq_phas, 7 Ramp A,
8 square ref (bin), 9 square phas (bin), 10 aux_A, 11 aux_B, 12-15 → 0.

#### Error signal (`error_sw`)

`muxer_reg3`, `lock.v` l. 604-618: 0 → 0, 1 in1, 2 Xo, 3 F1o, 4 F3o, 5 sqXo, 6 sqYo, 7 sqFo.
`Yo` and `F2o` are not available as error; they can be taken directly as PID input (`pidX_sw`).

#### PID inputs (`pidA_sw`, `pidB_sw`)

`muxer5`, `lock.v` l. 1140-1207 (the same for both): 0 error, 1 Xo, 2 Yo, 3 F1o, 4 F2o, 5 F3o, 6 sqXo, 7 sqYo,
8 sqFo, 9 signal_i, 10 Ramp A, 11 sin_ref, 12 cos_ref, 13 cos_1f, 14 cos_2f, 15 cos_3f, 16 sq_ref, 17 sq_quad,
18 sq_phas, 19 aux_A, 20 aux_B, 21 test14 (constant 0), 22 in1, 23 in2, 24 in1 − in2, 25-31 → 0.
The UI hides 1-8, 10-21 until *More Options* is pressed (`data-tag="pidA_more"`).

#### Lock trigger signal (`lock_trig_sw`)

`muxer4`, `lock.v` l. 706-727: 0 error, 1 Xo, 2 Yo, 3 F1o, 4 F2o, 5 F3o, 6 sqXo, 7 sqYo, 8 sqFo, 9 signal_i,
10 Ramp A, 11 aux_A, 12 in1, 13 in2, 14 in1 − in2, 15 PID A out (before the enable).

`in1 − in2` is saturated to 14 bits (`sat14`, l. 555-556).

## Oscilloscope (0x40100000)

The Red Pitaya 2.0 scope (`fpga/rtl/rtl/classic/rp_scope_com.v`, `rp_scope_cfg.v`, `rp_decim.v`), the same files
as in lock_in+pid_harmonic v2.3.17: decimation widened to 20 bits, `osc_ctrl_i` input from the lock module
(here only the filter bypass bits), `sys_rdata` held for the PS side of the bus. Names are those of `py/hugo.py`
(`osc` object, indices 0..19); the C controller uses `src/fpga.h`.

| Offset | Idx | Name | R/W | Bits | Function |
|---|---|---|---|---|---|
| `0x00` | 0 | `conf` | RW | — | Write: `[0]` arm, `[1]` reset the write state machine, `[3]` arm keep, `[5]` independent mode. Read: `[2]` trigger received (sticky until arm/reset), `[4]` acquisition done (2.0). |
| `0x04` | 1 | `TrgSrc` | RW | 5 | Trigger source: 1 now, 2/3 ch A rising/falling, 4/5 ch B rising/falling, **6/7 external rising/falling** (= lock trigger, `trig_sw`), 8/9 ASG (unused). **2.0: bit 5 reads the trigger lock** (see 0x94). |
| `0x08` | 2 | `ChAth` | RW | 14 | Trigger level of ch A (signed). |
| `0x0C` | 3 | `ChBth` | RW | 14 | Trigger level of ch B (signed). |
| `0x10` | 4 | `TrgDelay` | RW | 32 | Decimated samples written after the trigger. |
| `0x14` | 5 | `Dec` | RW | **20** | Decimation, 1..1048575. The controller uses 1, 8, 64, 1024, 8192, 65536, 524288 (`src/fpga.c` l. 495-526). |
| `0x18` | 6 | `CurWpt` | R | 14 | Current write pointer. |
| `0x1C` | 7 | `TrgWpt` | R | 14 | Write pointer at the trigger. |
| `0x20` | 8 | `ChAHys` | RW | 14 | Trigger hysteresis of ch A. |
| `0x24` | 9 | `ChBHys` | RW | 14 | Trigger hysteresis of ch B. |
| `0x28` | 10 | `AvgEn` | RW | 1(+1) | `[0]` average inside the decimation; 2.0 adds `[1]` high resolution and per-channel copies. |
| `0x2C` | 11 | `PreTrgCnt` | R | 32 | 2.0: samples written since the arm. |
| `0x30`..`0x3C` | 12..15 | `ChAEqFil1..4` | RW | 18/25 | Equalization filter of ch A (AA, BB, KK, PP). |
| `0x40`..`0x4C` | 16..19 | `ChBEqFil1..4` | RW | 18/25 | Equalization filter of ch B. |
| `0x94` | — | trigger unlock | W | 1 | **2.0 only.** After each trigger the scope locks its trigger (`TrgSrc` bit 5 = 1); writing 1 unlocks it. The C controller does it before each acquisition (`src/fpga.c` `osc_fpga_set_trigger()`, `src/fpga.h` `trigger_lock_ctr`); `py/hugo.py` `osc.start_trigger()` too. Not in the `osc` table of `hugo.py` (so `py/osc.py` cannot write it by name). |
| `0x98` | — | filter bypass | RW | 4 | Bypass of the equalization filters (OR-ed with `osc_ctrl[1:0]` of the lock). |
| `0x10000` | — | ch A buffer | R | 16 × 16384 | Samples of ch A, 16-bit sign-extended in 2.0 (14 valid bits). |
| `0x20000` | — | ch B buffer | R | 16 × 16384 | Samples of ch B. |

Maximum time span of an acquisition: 16384 · 8 ns · Dec (0.131 ms at Dec 1, 68.7 s at Dec 524288; the
68.72 s span was seen on the board, `testAgent.md` 2026-10-10 09:48).

## Other blocks and pins

- **Slow analog outputs (AO0-AO3):** the classic 250 MHz PWM (`red_pitaya_pwm`, `red_pitaya_top.sv` l. 416-428)
  is driven by `pwm_cfg_a..d` of the lock module (`aDACdecoder`: 8-bit value + 16-bit dither,
  `lock.v` l. 236-239). AO2 and AO3 follow `slow_out3_sw`/`slow_out4_sw`, mapped as
  `(signal + 8192) · 156 / 1024` (0..2495), i.e. −1 V → 0 V and +1 V → ≈ 1.8 V (published documentation,
  *Inputs and outputs*). AO0 and AO1 are not driven (`slow_out1`/`slow_out2` never assigned). The slow outputs were
  not measured on the board in v2.2.x: **a confirmar**.
- **Extension connector:** DIO0_P = external trigger input (bit 0 of `trig_sw`); DIO7_N (`exp_n_io[7]`) = digital
  modulation output = `sq_ref_b` (`lock.v` l. 671, `red_pitaya_top.sv` l. 545); DIO6_N is a normal GPIO of the
  housekeeping. With CAN enabled in the housekeeping, DIO6_N/DIO7_N go to CAN TX (l. 539-546). The digital
  modulation was not measured on 2.0: **a confirmar**.

## Differences found between the files and the RTL

Checked against `lock.v`, `lock/*.v`, `red_pitaya_top.sv`, `src/fpga_lock.h`, `src/main.c`, `py/hugo.py`,
`index.html`. The tables above follow the RTL. Listed for devAgent in `docAgent.md`.

| # | File | Item | File says | RTL does |
|---|---|---|---|---|
| 1 | `src/main.c` l. 330 | `lock_rl_state` | 0..31 | constant 0 (`lock.v` l. 129) |
| 2 | `index.html` | Slow out1 / Slow out2 selectors | offered | no effect: their muxers are commented out (`lock.v` l. 453-499), `slow_out1/2` undriven |
| 3 | `lock.v` / `fpga_lock.h` / `main.c` comments | `ctrl_B` | "pidA_out + ramp_B" (`lock.v` l. 1428, 1560; `main.c` l. 431) | `pidB_out + ramp_B + sf_jumpB` (l. 252) |
| 4 | `lock.v` comments | `out1_sw`/`out2_sw` `in2` | `// in1-in2` on the `in2` input (l. 351, 376) | input 2 is `in2` |
| 5 | `src/main.c` l. 306-307, 402, 417 | `oscX_sw`, `pidX_sw` max | 31 | 0..29 and 0..24 used, the rest read 0 |
| 6 | `src/fpga.c` l. 166 comment | `time_range` | "0..5" | 0..6 since v2.2.6 (l. 495-526) |
