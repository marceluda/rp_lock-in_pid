# Pipeline registers of v2.2.8 (FPGA timing) — added latencies

Port of the timing work of `lock_in+pid_harmonic` v2.3.19 (its `doc/lock_latency.md` explains the method; the user
allowed adding latency on 2026-10-12). Up to v2.2.7 the FPGA did not meet timing at 125 MHz because of long
combinational chains of the loop (generator ROM → product → LPF / bypass → gain → saturation → PID / scope / lock
control; PID sum → ctrl → out mux → DAC). v2.2.8 registers those chains. **The behaviour is the one of v2.2.7 except
for the latencies below** (checked bit by bit in simulation, `test/lock_latency_sim.sh`).

## Latency of each signal with respect to v2.2.7

| Signal | Added | ns |
|---|---|---|
| Generator outputs (`sin_ref`, `cos_ref`, `cos_1f..3f`, `sq_ref/sq_quad/sq_phas`, `harmonic_trig`, `square_trig`) | +1 | 8 |
| References into the lock-in (harmonic multipliers and `sq_mult`) | +2 (generator + 1) | 16 |
| `Xo`, `Yo`, `F1o..F3o` from the product (register after the first LPF stage + output register) | +2 | 16 |
| `sqXo`, `sqYo`, `sqFo` from `signal_i` (product register + output register) | +2 | 16 |
| `X_28..F3_28`, `sqX_28..sqF_28` (bus) | +1 | 8 |
| PID outputs (`pidA_out`, `pidB_out`), from the PID input | +1 | 8 |
| `out1`, `out2` (DAC), for everything that goes out | +1 | 8 |
| LOCK MODE loop `in1` → Xo → PID A → `ctrl_A` → `out1` | +4 | 32 |

**Phase of the lock-in.** Unlike `lock_in+pid_harmonic` v2.3.19, the references reach the lock-in 1 clock later than
the outputs: the generator and the DAC outputs got 1 register each, so the modulation that goes out and comes back
(DAC → system → ADC) is 2 clocks later and the reference too: **the measured phase does not change** (in
`lock_in+pid_harmonic` 2.3.19 it changes by −360° · f · 8 ns). In the simulation this is the case "in1 delayed 2
clocks": every lock-in signal is then exactly the old one delayed 2 + its latency.

Blocks rewritten without latency (same values): `sat14` (mask instead of barrel shifter), integrator of the PID
(ISR shift in parallel with the saturation), `sum_div` of the second LPF stage in a register (a change of `lpf_*`
reaches it 1 clock later). The PID derivative with `DSR` > 0 samples a delayed input at other points (same behaviour,
other sampling phase).

## Verification

`test/lock_latency_sim.sh` (xsim, the `lock.v` of the working tree side by side with the one of v2.2.7): all checks
bit exact; `test/lock_bus_read_sim.sh` and `test/lock_ctrl_sim.sh` pass.

## Timing (Vivado 2020.1, post-route)

| | v2.2.7 | v2.2.8 |
|---|---|---|
| WNS | -11.721 ns | -1.794 ns |
| TNS | -12068.793 ns | -469.258 ns |
| Failing endpoints | 5431 | 1234 |

Worst slack per group (ns):

| Group | v2.2.7 | v2.2.8 |
|---|---|---|
| scope muxes | -11.519 | -0.556 |
| DAC registers | -9.507 | > 0 |
| adc_dat (digital loop / scope input) | -9.942 | -0.980 |
| bus copies *_rd | -10.122 | -0.376 |
| PID A | -11.721 | -1.031 |
| PID B | -11.628 | -1.080 |
| lock_ctrl | -9.833 | -0.092 |
| rest of the lock module | -9.677 | -1.085 |
| LPF | -6.561 | -0.925 |
| ramp | -3.609 | -0.442 |
| generator | -4.903 | -1.794 |
| slow outputs | -9.437 | -0.185 |
| oscilloscope | -3.174 | -0.107 |
| bus read (sys_rdata) | -3.613 | -0.237 |
| other | -1.623 | -0.378 |

What still fails is small: the recursive loops of the LPF and of the PID integrator (they cannot be pipelined
without changing the filter), the input path `in1` → PID mux → set point subtraction → multiplier, quasi-static
configuration registers, and paths of the oscilloscope outside the lock module.
