# Red Pitaya Lock-in+PID Application

## Lock-in and PID application for RedPitaya enviroment

This is an application for the [Red Pitaya STEMlab 125-14](https://www.redpitaya.com/) board (RP): a set of
instruments built in the FPGA (oscilloscope, harmonic and square lock-in amplifiers, two PIDs, ramp generator and
automatic lock control) to measure a system with modulation techniques and stabilize it with a feedback loop,
controlled from a web page. The board is closed-hardware and open-software.

The project is hosted in: https://marceluda.github.io/rp_lock-in_pid — there you can find documentation about
the use of the App, its instruments and some suggested applications.

![The App (v2.2.6): a ramp in OUT1 scans a system and the peaks of its response are seen in IN1](.README/scan_normal_scan_floor_v2.2.6.jpg)

## Version 2.2.x (Ecosystem 2.0)

Current version: **2.2.11** (branch `master`).

This version is **based on the 0.2.x series (v0.2.4), but with the FPGA design built in Vivado 2020.1**,
using the project structure of [RedPitaya-FPGA](https://github.com/RedPitaya/RedPitaya-FPGA)
(project `v0.94`, model `Z10`, the same port done in
[rp_lock-in_pid_h](https://github.com/marceluda/rp_lock-in_pid_h) v2.3.x).
It is intended for the Red Pitaya **Ecosystem 2.0** (e.g. `RedPitaya_OS_2.04`; tested on 2.04-35).
Since 2026-10-15 the branch `master` holds the 2.x series; the 0.2.x series (FPGA with Vivado 2015.2), for the
0.9x / 1.0 ecosystems, stays in the tags `v0.2.1` .. `v0.2.4`.

- 2.2.5: FPGA in `lock_in+pid/fpga/` (Vivado 2020.1, see [lock_in+pid/fpga/README.md](lock_in+pid/fpga/README.md)).
  Oscilloscope of the Ecosystem 2.0 (trigger lock, decimation widened to 20 bits), exact bus reads of the lock
  module. Only the App itself is packaged (the `_DEBUG` and `_RELOAD` flavours were removed).
- 2.2.6: lock control entirely in the FPGA (`lock_status` at 0x2C replaces `lock_feedback`, see
  [lock_in+pid/doc/lock_control.md](lock_in+pid/doc/lock_control.md)), **Capture Lock** and **Fire on click**
  ([lock_in+pid/doc/lock_capture.md](lock_in+pid/doc/lock_capture.md)), 32-bit lock time trigger (up to 34.36 s),
  trigger fields with units, Config → load time window, scope time range up to 68.7 s, `py/lock_from_registers.py`,
  and the other web UI fixes of lock_in+pid_harmonic 2.3.10-2.3.17.
- 2.2.7: the minor fixes of lock_in+pid_harmonic 2.3.18 (same FPGA): lock trigger registers written from Python
  shown and kept by the page, Single mode keeps a slow poll, Config → load without read-only keys, X+ up to 68.7 s,
  `lock_from_registers.py --time` clamped.
- 2.2.8: pipeline registers in the FPGA to close timing (WNS −11.7 → −1.8 ns), references delayed 1 clock to keep the
  measured phase ([lock_in+pid/doc/lock_latency.md](lock_in+pid/doc/lock_latency.md)).
- 2.2.9 (from lock_in+pid_harmonic 2.3.21–2.3.23): **Reset zoom** sets the scope to one period of the ramp (Ext Trig =
  Scan floor / Scan ceil), of the harmonic modulation (harmonic mod.), of the square modulation (Square mod.) or one
  whole memory at the current Dec, and Y to −1 … 1 V (raw mode −8192 … 8192); it ends a lock capture first, and Raw
  Mode rescales Y. **Mouse wheel on the scope**: no key zooms both axes, **SHIFT** only time (cursor ↔), **ALT** only
  Y (cursor ↕). **Slow scans** (windows ≥ 1.5 s, e.g. a 30 s ramp): no samples of an older lap of the scope memory,
  Capture Lock with long histories (the lock request waits for the scope), Reset zoom at 0.98 × the period; (FPGA) a
  time trigger armed after the ramp was stopped waits for the next scan floor.
- 2.2.10 (from lock_in+pid_harmonic 2.3.24): **scope presets** below Ext Trig: `in1|in2`, `in1|ctrl`,
  `X|Y` (Xo, Yo), `in1|err`, `ctrl|err` and `usr` (a pair of the user: double click to choose it; saved in the browser
  and in the configs). They change only OscA/OscB (not the zoom nor the trigger). Picking an **Ext Trig** other than
  None sets the Trigger panel to External + Normal.
- 2.2.11: **Auto** waits for the trigger (Ext Trig or the level of a channel) and forces an acquisition only if none
  comes within max(0.25 s, 1.1 × window, 1.1 × period of the Ext Trig when known) + 50 ms: with Ext Trig = Scan floor
  t = 0 is the scan floor in Auto too (before, Auto triggered at once, at any phase of the scan). Also: the option **Don't turn on PIDs and Ramp on config loading** (Config dialog) is now unchecked by
  default: *Config → load* / *Load file* (and the restore after a Restart) bring back the ramp (Scan enable) and the
  PIDs as saved, so a config saved while scanning loads scanning. Checking it keeps the previous protection.
- See the [CHANGELOG](CHANGELOG.md).

## Features

- Two lock-in amplifiers on the same input:
  - slow **harmonic** lock-in (3 Hz – 49.6 kHz): in-phase and quadrature demodulation (X, Y), demodulation at an
    arbitrary phase (F1) and at double and triple frequency (F2, F3);
  - fast **square** lock-in (square references up to 31.25 MHz): sqX, sqY, sqF.
- Internal harmonic and square modulation generators (references available on the outputs and on a digital pin).
- Two PID filters, for loop back stabilization.
- Ramp/Scan controller for response analysis.
- Lock control for automatic scan-stop / PID start (time, level or immediate trigger, run by the FPGA).
- Two-channel oscilloscope on any of 30 internal signals, triggered by internal events (scan floor, lock, ...),
  time ranges from 131 µs to 68.7 s.
- Remote control with Python scripts on the board (`lock_in+pid/py/`); this App has no HTTP API.

## Documentation

| Document | Contents |
|---|---|
| [doc/App.md](doc/App.md) | Instruments and technical data |
| [doc/Usage.md](doc/Usage.md) | Web interface and procedures (scan, lock-in, lock), with screenshots |
| [doc/Structure.md](doc/Structure.md) | Web page ↔ server ↔ FPGA, block diagrams |
| [doc/FPGA.md](doc/FPGA.md) | Register map |
| [doc/Remote.md](doc/Remote.md) | Control from Python (scripts on the board, SSH client) |
| [doc/Devel.md](doc/Devel.md) | Building, modifying and testing |
| [CHANGELOG.md](CHANGELOG.md) | Changes by version |

## Installation

If you have a RP board you can install the **Lock-in+PID** application by copying the `lock_in+pid` folder (that
comes with the tar/zip package) to the `/opt/redpitaya/www/apps` folder (inside the RP).

The packages are built in `archive/` (`lock_in+pid-<version>-<build>-devbuild.{zip,tar.gz}`). UnZip / UnTar the
package and execute from a terminal:

```bash
./upload_app.sh rp-XXXXXX.local
```

Replace `rp-XXXXXX.local` by your RP local name or IP address. Also, you can use your own SSH client and upload the
`lock_in+pid` folder to the RedPitaya folder `/opt/redpitaya/www/apps` (file system in read-write mode, `fpga.sh`
executable). Then open `http://rp-XXXXXX.local/lock_in+pid/`.

For more information about the installing procedure, refer to:
https://marceluda.github.io/rp_lock-in_pid/TheApp/install/ and [doc/Devel.md](doc/Devel.md#installing-on-the-board).

## Building

The App was based on code from project:
https://github.com/RedPitaya/RedPitaya/tree/release-v0.95/apps-free/scope

To build or modify the App you need a linux development environment with:
  - the Linaro toolchain `gcc-linaro-4.9-2015.02-3` or `2014.11` (`arm-linux-gnueabihf`), in `/opt/linaro/`,
    for the C controller;
  - Vivado 2020.1 (for the FPGA design, since version 2.2.5), in `/tools/Xilinx/Vivado/2020.1` (or set
    `VIVADO_SETTINGS=.../settings64.sh`); `lock_in+pid/fpga/Makefile` loads it by itself in a clean environment.
    Vivado 2015.2 is not needed any more (`settings.sh` loads it only if installed).

```bash
source settings.sh
LANG=C make          # controller, FPGA (if changed) and packages in archive/
```

Parts (from the root folder):

```bash
make -C lock_in+pid app        # C controller (cross compiled)
make -C lock_in+pid fpga       # FPGA with Vivado 2020.1 (red_pitaya.bit, fpga.bit.bin)
make clean                     # clean all (also: clean_app, clean_fpga in lock_in+pid)
make -C lock_in+pid upload RPIP=rp-XXXXXX.local   # also upload_html, upload_bit, upload_py
```

Requirements, all the targets, tests and details: [doc/Devel.md](doc/Devel.md).

## Derivated works

- An improved version with another PID added was developed by [stefanputz](https://github.com/stefanputz) in
  https://github.com/stefanputz/rp_lock-in_pid
- A version without square lock-in and with modulation added on output signals can be found in
  [rp_lock-in_pid_h](https://github.com/marceluda/rp_lock-in_pid_h). The App and description is available on
  [the project web page](https://marceluda.github.io/rp_lock-in_pid/Derivated/).

## License and citation

GPL-3.0 (see [LICENSE](LICENSE)). If you use this software, please cite it (see [CITATION.cff](CITATION.cff)):
M. A. Luda, doi [10.1063/1.5080345](https://doi.org/10.1063/1.5080345).
