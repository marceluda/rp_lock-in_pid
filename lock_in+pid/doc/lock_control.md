# Lock control (auto-lock) — design of v2.3.13

This note describes how the lock control of `lock_in+pid` works from v2.2.6 on (ported from `lock_in+pid_harmonic` v2.3.13-v2.3.17; the versions
quoted below are those of that App), in the
three layers (FPGA, C controller, web UI), and what changed with respect to v2.3.12.

## 1. The problem in v2.3.12

`lock_ctrl.v` received `lock_control` (0x28) and produced the *effective* enables of the ramp and
the PIDs as

```
enable = set_lock ? set_*  (lock_control[7:5])  : *_enable_ctrl (lock_control[4:2])
```

`set_lock` was only true while the trigger had fired **and** `lock_control` still had
`lock_now`/`launch_lock` set **and** `lock_control[4:2] != lock_control[7:5]`. The FPGA could not
change `lock_control` by itself, so it published in `lock_feedback` (0x2C) the value that
`lock_control` *should* take (`[4:2]` = effective enables, `[1:0]` = 0) and waited for someone to
write it back:

1. the C controller copied `lock_feedback` into the `lock_ctrl_aux_*` parameters
   (`lock_update_main()`, only when a complete scope acquisition was read in `rp_get_signals()`);
2. the web UI replaced `lock_lock_control` with `lock_lock_feedback` in every `loadParams()` and
   sent `lock_lock_control` in every POST (`always_send_params`);
3. the next `lock_update()` (any change of any lock parameter) wrote `lock_control` from the
   `lock_ctrl_aux_*` parameters, i.e. the copy of the feedback, "committing" the lock.

So the state of the lock depended on the round trip FPGA → C → UI → C → FPGA:

- from Python (registers only) a lock could not be "committed": the FPGA stayed in a transient
  state (`set_lock` held by the uncommitted trigger) and any later write of `lock_control` with the
  old bits (e.g. the C controller rewriting every register after an unrelated change) undid it;
- the C copy of the feedback was refreshed only with complete acquisitions: with the scope in
  Normal mode and no triggers (the ramp stops when the lock closes) the UI kept showing
  "Scan enable" and the old command bits, and resent them;
- `lock_lock_control` was always sent and always different from the server value while the lock
  was not committed, so every POST rewrote the FPGA registers.

## 2. New model

**`lock_control` (0x28) is command + configuration. The FPGA never modifies it.**
The lock state lives inside the FPGA (`lock_ctrl.v`), which executes the whole sequence by itself
and publishes it in a **read-only status register `lock_status` (0x2C)**, which replaces
`lock_feedback` at the same address. Nobody has to copy anything back.

### 2.1 `lock_control` (0x28, read/write, 11 bits) — same bit positions as before

| bit | name (C/UI param `lock_ctrl_aux_*`) | meaning in v2.3.13 |
|---|---|---|
| 0 | `lock_now` | **Lock request, immediate.** A 0→1 change locks right away (state LOCKED). |
| 1 | `launch_lock_trig` | **Lock request, on trigger (arm).** A 0→1 change arms (state ARMED) unless already LOCKED; while ARMED, the trigger condition locks. |
| — | bits [1:0] = 00 | **Release.** With neither request set the state goes back to IDLE (from ARMED or LOCKED). |
| 2 | `pidB_enable_ctrl` | Manual (open-loop) enable of PID B: effective in IDLE and ARMED. |
| 3 | `pidA_enable_ctrl` | Manual enable of PID A. |
| 4 | `ramp_enable_ctrl` | Manual enable of the ramp (scan). |
| 5 | `set_pidB_enable` | Enable of PID B while LOCKED. |
| 6 | `set_pidA_enable` | Enable of PID A while LOCKED. |
| 7 | `set_ramp_enable` | Enable of the ramp while LOCKED. |
| 9:8 | `trig_type` | 0 OFF (only `lock_now` locks), 1 time, 2 level, 3 level after time. |
| 10 | `lock_trig_rise` | Level trigger on rising (1) / falling (0) crossing. |

Bits [1:0] are now *levels* that stay set while the lock is requested (they are no longer cleared
by anyone), and the FPGA reacts to their **0→1 edges**. Writing the same value again has no
effect, so the C controller (which rewrites every lock register after any change) cannot disturb
the state.

A change of any manual bit [4:2] **while LOCKED** releases the lock (manual override, e.g.
`control_hugo.py` switching a PID off): the state goes to IDLE with the new manual enables, even
if [1:0] are still set. To lock again clear [1:0] and set the wanted request bit (new 0→1 edge).

### 2.2 State machine in `lock_ctrl.v`

```
            launch 0->1                        trigger (time/level/level+time)
   IDLE  ----------------->  ARMED  ------------------------------------------>  LOCKED
    ^  \___________________________________ lock_now 0->1 _______________________^ |
    |                                                                               |
    +------- [1:0] == 00 (release)  or  manual bits [4:2] changed while LOCKED -----+
    (ARMED -> IDLE when [1:0] == 00)
```

Effective enables (to the ramp generator and to the PIDs):

```
IDLE, ARMED : ramp/pidA/pidB = lock_control[4] / [3] / [2]   (manual)
LOCKED      : ramp/pidA/pidB = lock_control[7] / [6] / [5]   (set_*)
```

Everything happens in the FPGA, in the same clock tick as the trigger (8 ns): the ramp stops and
the PIDs start without any write from the PS. Trigger conditions are those of v2.3.12:

- time: counter reset by the ramp floor trigger (`ramp_floor_trig`), fires when it equals
  `lock_trig_time` (0x34). v2.2.9 (as lock_in+pid_harmonic v2.3.23): only while the counter is valid (`cnt_ok`): from a floor of a ramp that has
  been running since then. It is cleared while the ramp is stopped (effective ramp enable = status bit 4, or the
  generator off / in reset) and set at the next floor, so a request armed after a stop (e.g. right after releasing a
  lock: the ramp goes on from where it stopped) fires at the next floor + time, never mid-scan. The counter
  saturates at 2^32-1 instead of wrapping every 34.4 s.
  In this App the counter is loaded with 1 one clock after the floor (registered `ramp_trigger_r`, v2.2.6) and
  `cnt_ok` is set in that same clock, so the time trigger fires at the same clock as before for any time ≥ 1 tick
  (`time_eq` is compared with `lock_trig_time`−1 kept in a register, for timing: same value);
- level: signal selected by `lock_trig_sw` (0x38) crosses `lock_trig_val` (0x30) in the direction
  of bit 10;
- level+time: level crossing once the counter is ≥ `lock_trig_time` (and valid, v2.2.9).

The pulse `lock_ctrl_trig` (oscilloscope trigger source "lock control") is emitted when the state
enters LOCKED, as before. From v2.3.14 the web UI uses it to capture the lock ("Capture Lock", see
`doc/lock_capture.md`).

### 2.3 `lock_status` (0x2C, read-only, 16 bits) — replaces `lock_feedback`

| bits | meaning |
|---|---|
| 0 | `armed`: waiting for the trigger (state ARMED) |
| 1 | `locked`: state LOCKED |
| 2 | effective PID B enable |
| 3 | effective PID A enable |
| 4 | effective ramp enable of the lock control (the ramp also needs `ramp_enable`, 0xC0) |
| 7:5 | 0 (reserved) |
| 15:8 | `lock_count`: number of entries into LOCKED, modulo 256 (lets a reader detect a lock even if it was released in between) |

Bits [4:2] keep the positions they had in `lock_feedback` (the effective enables), so monitors
that only looked at the enables still work. Writes to 0x2C are ignored. No other register moved.

## 3. C controller (`controllerhf.so`)

- `lock_reg_t.lock_feedback` → `lock_status` (`fpga_lock.h`), parameter `lock_lock_feedback` →
  `lock_lock_status` (read-only).
- `lock_lock_control` is now a **read-only mirror** of the register: the register is composed
  from the `lock_ctrl_aux_*` parameters (as before), never from `lock_lock_control`.
- `lock_update()` writes `lock_control` **only when the value composed from the
  `lock_ctrl_aux_*` parameters changes** (it remembers the last value it wrote). An unrelated
  change (e.g. a PID gain) no longer rewrites `lock_control`, so it does not undo a value written
  directly to the register (Python, `c/lock`, `monitor`).
- `lock_update_status()` (new) refreshes `lock_lock_status` and, if `lock_control` was changed
  from outside the controller, the `lock_ctrl_aux_*` parameters and `lock_lock_control`. It runs
  in **every `rp_get_params()`** (every GET/POST of the UI, under the parameter mutex) and after
  `lock_update_main()`, so the UI sees the state also when the scope gets no triggers.
- The `lock_ctrl_aux_*` parameters are no longer overwritten from the feedback in
  `lock_update_main()`.
- 2.2.7 (from lock_in+pid_harmonic v2.3.18): the same rule for the trigger registers `lock_trig_val` (0x30), `lock_trig_time` (0x34)
  and `lock_trig_sw` (0x38): `lock_update()` writes each one only when the value derived from its
  parameter (`lock_lock_trig_val`, `lock_lock_trig_time_val`, `lock_lock_trig_sw`) changes, and
  `lock_update_status()` copies a value written from outside (e.g. `py/lock_from_registers.py
  --time/--level/--sw`) to its parameter, so the page shows it and a later change of another lock
  parameter does not write the page value back. `lock_init()` resets this memory (and the one of
  `lock_control`): after a start the first `lock_update()` writes all of them.

## 4. Web UI (`index.html`)

What it **writes** (only on a user action, one POST):

- the configuration (`set_*` checkboxes, trigger type, time, level, signal, direction);
- the manual enables (Scan / PID A / PID B buttons) and the requests (Trigger Lock, Lock Now).

What it **reads** and shows (never written back):

- `lock_lock_status`: the three enable buttons show the **effective** state (blue = enabled);
  a label next to the buttons shows `OFF` / `ARMED` / `LOCKED` and the lock count;
- `lock_ctrl_aux_launch_lock_trig` / `lock_ctrl_aux_lock_now` (the request bits) for the
  Trigger Lock / Lock Now buttons.

Buttons:

- **Scan / PID A / PID B** when not LOCKED: toggle the manual enable (as before).
  When LOCKED: release the lock and keep the effective enables with the clicked one toggled
  (manual := effective ± click, [1:0] := 0), so e.g. clicking "Scan enable" after a lock restarts
  the scan with the PIDs as they were.
- **Trigger Lock**: off → arm (bit 1 = 1). On → release (bits [1:0] = 0, back to the manual enables).
- **Lock Now**: off → lock now (bit 0 = 1). On → release (bits [1:0] = 0).

Removed: `lock_lock_control` from `always_send_params`, and the copy
`lock_lock_control = lock_lock_feedback` in `loadParams()`. Status values are read-only display
values (`display_keep_keys`, `unsent_skip_keys`): they are never part of a POST, so a lock reached
at the peak does not produce any POST.

"Don't turn on PIDs and Ramp" (Config → load, Restart) and `state_transient_zero` keep working:
they set the manual enables and both request bits to 0, which in the new model is also a release
(state IDLE with everything off). Configs and saved states keep the same keys.

## 5. Locking from Python with registers only

`py/lock_from_registers.py` (runs on the Red Pitaya, uses `hugo.py`/mmap as the other scripts):

```
python3 lock_from_registers.py --trig time --time 2072599 --set pidA,pidB   # arm, wait, report
python3 lock_from_registers.py --trig level --level 5085 --sw 0 --rise --set pidA
python3 lock_from_registers.py --now                                       # lock now
python3 lock_from_registers.py --status                                    # decode lock_status
python3 lock_from_registers.py --release                                   # back to manual enables
```

Sequence written by the script (no read-modify-write of any feedback):

1. `lock_trig_time` (0x34), `lock_trig_val` (0x30), `lock_trig_sw` (0x38);
2. `lock_control` with [1:0] = 00, the manual enables (scan state) and the `set_*`/trigger bits;
3. `lock_control` with bit 1 = 1 (arm) — or bit 0 for lock now;
4. poll `lock_status` until `locked` (bit 1) or timeout.
