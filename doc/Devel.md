# Development: building and modifying the App

How to build, modify, test and install `lock_in+pid` v2.2.10 (branch `master`). The internal structure is
explained in [Structure.md](Structure.md) and the registers in [FPGA.md](FPGA.md).

- [Source tree](#source-tree)
- [Software requirements](#software-requirements)
- [Building everything](#building-everything)
- [Makefiles and targets](#makefiles-and-targets)
- [C controller (`controllerhf.so`)](#c-controller-controllerhfso)
- [FPGA (Vivado 2020.1)](#fpga-vivado-20201)
- [Web interface (`index.html`)](#web-interface-indexhtml)
- [Python scripts (`py/`)](#python-scripts-py)
- [Registers and `config_tool.py`](#registers-and-config_toolpy)
- [Simulations and tests (`test/`)](#simulations-and-tests-test)
- [Installing on the board](#installing-on-the-board)
- [Versioning and packages](#versioning-and-packages)

## Source tree

```
rp_lock-in_pid/
├── Makefile                 # all = App build + zip + tar into archive/
├── settings.sh              # environment for the C build (Linaro; Vivado 2015.2 only if installed)
├── _build_number            # BUILD_NUMBER=N (incremented by make clean_*), not versioned
├── _settings.env            # optional, not versioned: RPIP, RPOPTS, RPSCP for make upload*
├── README.md  CHANGELOG.md  CITATION.cff  LICENSE (GPL-3.0)  TODO.md
├── doc/                     # this documentation
├── archive/                 # built packages (*.zip, *.tar.gz), not versioned
├── resources/
│   ├── config_tool.py       # register table -> code generator (see below)
│   ├── doc_tool.py
│   ├── remote_control/      # control_hugo.py (SSH client, deprecated), examples, read_dump.py
│   ├── code_helpers/        # muxer_generator.py, gen_sin_cos.py (tables of gen_mod2)
│   └── rp_cmds/nginx.sh
└── lock_in+pid/             # the App (this folder is what is installed on the board)
    ├── Makefile             # controller, FPGA, target/, zip, tar, upload*
    ├── index.html           # web interface (HTML + JS in one file)
    ├── css/  js/            # styles, jquery.mousewheel, js.cookie
    ├── info/info.json       # name and version shown by the Ecosystem; icon.png
    ├── nginx.conf           # only: index.html served with Cache-Control no-cache
    ├── fpga.sh              # Ecosystem 2.0: loads fpga.bit.bin with fpgautil when the App starts
    ├── fpga.conf            # path of red_pitaya.bit (Ecosystem 0.9x)
    ├── fpga.bit.bin, red_pitaya.bit   # FPGA images (built, versioned)
    ├── controllerhf.so      # C controller (built, versioned)
    ├── src/                 # C controller sources
    │   ├── main.c / main.h  # parameter table, rp_set_params / rp_get_params / rp_get_signals
    │   ├── worker.c / .h    # scope worker thread, auto-set, measurements
    │   ├── fpga.c / fpga.h  # scope registers (0x40100000)
    │   ├── lock.c / .h, fpga_lock.c / .h   # lock registers (0x40600000)
    │   ├── calib.c, generate.c, fpga_awg.c, pid.c, fpga_pid.c, version.h   # from the original scope App
    │   └── Makefile
    ├── py/                  # Python scripts run on the board (hugo.py, lock_from_registers.py, ...)
    ├── fpga/                # FPGA project (Vivado 2020.1, RedPitaya-FPGA structure)
    │   ├── Makefile  README.md  red_pitaya_vivado_Z10.tcl  synCheck.sh  LICENSE
    │   ├── rtl/rtl/         # common Red Pitaya RTL (classic/rp_scope_*.v, rp_decim.v modified)
    │   ├── prj/v0.94/rtl/   # red_pitaya_top.sv, red_pitaya_ps.sv, sys_bus_stub_ok.sv, lock.v, lock/*.v
    │   ├── prj/v0.94/{ip,sdc}, prj/barebones/ip, sdc/, brd/
    │   └── prj/v0.94/out/   # build products (not versioned)
    ├── doc/                 # design notes: lock_control.md, lock_capture.md (+ Doxygen setup)
    ├── test/                # simulations (xsim, node, native C)
    ├── upload_app.sh        # upload a package to a board through SSH
    └── target/              # staging folder for the packages (built, not versioned)
```

Compared with lock_in+pid_harmonic 2.3.x there is no `c/` folder (no `lock`, `osc`, streaming tools), no
`resources/streaming/` nor `resources/remote_control/http_version/`, and no Lua endpoints in `nginx.conf`.

## Software requirements

| Tool | Version | Used for | Path on the development PC |
|---|---|---|---|
| Xilinx Vivado | **2020.1** | FPGA (synthesis, implementation, `bootgen`, xsim) | `/tools/Xilinx/Vivado/2020.1` (`VIVADO_SETTINGS`) |
| Linaro ARM toolchain | gcc-linaro-4.9-2015.02-3 (or 2014.11) `arm-linux-gnueabihf` | cross compiling the controller | `/opt/linaro/` |
| Xilinx Vivado 2015.2 | optional | sourced by `settings.sh` only if `/opt/Xilinx/Vivado/2015.2/settings64.sh` exists (not needed since v2.2.5) | `/opt/Xilinx/Vivado/2015.2` |
| GNU make, zip, tar, sed | — | build and packaging | — |
| node.js | any recent | UI simulations in `test/` | — |
| gcc (PC) | — | `test/auto_set_c_sim` | — |
| Python 3 + numpy | — | `resources/config_tool.py`; `control_hugo.py` also needs paramiko, requests, bs4 | — |

Installation notes for the toolchain (from the README of the 0.2.x series, tested on Ubuntu 16.04 at the time):

```bash
sudo apt-get install make u-boot-tools curl xz-utils nano zip
TOOLCHAIN="http://releases.linaro.org/14.11/components/toolchain/binaries/arm-linux-gnueabihf/gcc-linaro-4.9-2014.11-x86_64_arm-linux-gnueabihf.tar.xz"
#TOOLCHAIN="http://releases.linaro.org/15.02/components/toolchain/binaries/arm-linux-gnueabihf/gcc-linaro-4.9-2015.02-3-x86_64_arm-linux-gnueabihf.tar.xz"
curl -O $TOOLCHAIN
sudo mkdir -p /opt/linaro && sudo chown $USER:$USER /opt/linaro
tar -xpf *linaro*.tar.xz -C /opt/linaro
sudo ln -s /usr/bin/make /usr/bin/gmake          # Vivado needs gmake
sudo apt-get install libc6-dev-i386              # 32-bit libraries for old toolchains
```

Load the C environment:

```bash
cd rp_lock-in_pid
source settings.sh     # Vivado 2015.2 if installed, Linaro in PATH, TOOLCHAIN_PATH, CROSS_COMPILE=arm-linux-gnueabihf-
```

The FPGA Makefile loads Vivado 2020.1 by itself in a clean environment (`env -i`), so it does not matter whether
`settings.sh` was sourced: both environments never mix.

## Building everything

```bash
cd rp_lock-in_pid
source settings.sh
LANG=C make
```

This builds the controller and, if any FPGA source changed, the FPGA (about 30 min: 29-30 min in the builds of
v2.2.5 and v2.2.6, `devAgent.md`), then `target/` and the packages
`archive/lock_in+pid-<version>-<build>-devbuild.{zip,tar.gz}`. A full rebuild (as devAgent does for a release):
`make clean && LANG=C make` from the root. After changing only C or the web page:

```bash
source settings.sh
make -C lock_in+pid clean_app && LANG=C make
```

`clean_app` and `clean_fpga` increment the build number in `_build_number`.

## Makefiles and targets

Root `Makefile`:

| Target | Action |
|---|---|
| `make` / `make all` | `make -C lock_in+pid all zip tar` (packages in `archive/`) |
| `make clean` | `make -C lock_in+pid clean` |
| `make upload` | `make -C lock_in+pid upload` |

`lock_in+pid/Makefile`:

| Target | Action |
|---|---|
| `all` | `controllerhf.so` + `fpga` |
| `app` | `controllerhf.so` (`make -C src clean all`) |
| `fpga` | `red_pitaya.bit` (from `fpga/`) and `fpga.bit.bin` (bootgen) |
| `target/lock_in+pid` | staging of the installable folder (also copies `upload_app.sh`, `resources/`, README, CHANGELOG; sets the version in `info.json` and in `index.html`; removes `__pycache__`/`*.pyc`; `fpga.sh` 755) |
| `zip`, `tar` | packages in `../archive/` |
| `clean`, `clean_app`, `clean_fpga`, `clean_target` | clean all / C (`src`, `*.so`, target) / FPGA / target |
| `upload`, `upload_bit`, `upload_html`, `upload_py` | copy to the board by SSH (need `RPIP`, on the command line or in `../_settings.env`; `check_rpip` stops if it is empty). They make the file system writable with the `rw` script of the OS (`/opt/redpitaya/sbin/rw` with `PATH_REDPITAYA` exported on 2.0, `/boot/sbin/rw` on 0.9x); `upload` keeps `fpga.sh` at 755; `upload_html` sends the `index.html` of `target/` (with the version). Never run by the build |

Since v2.2.5 only the App is built: the `_DEBUG` and `_RELOAD` flavours of the 0.2.x series were removed.

`_settings.env` (root, not versioned), read by both Makefiles:

```make
RPIP=rp-XXXXXX.local
RPOPTS=-l root -p 22
RPSCP=-P 22
```

## C controller (`controllerhf.so`)

- Sources in `lock_in+pid/src/`; `src/Makefile`: `$(CROSS_COMPILE)gcc`, `-Wall -Werror -g -fPIC`, linked with
  `-shared -lm -lpthread`; `VERSION` and `REVISION` come from `info/info.json` and the build number through `CFLAGS`.
- Build: `make -C lock_in+pid app` (with `settings.sh` loaded). The builds of v2.2.5/2.2.6 give 0 gcc warnings.
- Debug output (`TRACE`) is enabled by uncommenting `#define DEBUG 1` in `src/main.h`; it goes to the nginx error log.
- To install a new `.so` on a running board: copy it and **stop + start the App** (`/bazaar?stop=lock_in+pid` then
  `/bazaar?start=lock_in+pid`), so that nginx loads the new library.

## FPGA (Vivado 2020.1)

`lock_in+pid/fpga/` follows the structure of [RedPitaya-FPGA](https://github.com/RedPitaya/RedPitaya-FPGA)
(project `v0.94`, model `Z10`) with the `lock` module of the App; it was taken from lock_in+pid_harmonic v2.3.17
(`79e19eb`) in v2.2.5, with `prj/v0.94/rtl/lock.v` + `lock/` of this App. Details: `fpga/README.md`.

```bash
cd rp_lock-in_pid/lock_in+pid/fpga
make            # prj/v0.94/out/red_pitaya.bit + prj/v0.94/out/fpga.bit.bin (bootgen)
make bit        # only the bitstream
make bin        # only fpga.bit.bin from an existing red_pitaya.bit
make project    # create prj/v0.94/build/redpitaya.xpr and open it in the Vivado GUI (no synthesis)
make clean      # remove the build products of PRJ
make help
```

Variables: `VIVADO_SETTINGS` (default `/tools/Xilinx/Vivado/2020.1/settings64.sh`), `PRJ` (`v0.94`), `MODEL`
(`Z10`), `DEFINES`. Any change in `rtl/`, `prj/v0.94/{rtl,ip,sdc}`, `sdc/`, `brd/` or the tcl rebuilds the bitstream.
After a build `synCheck.sh` writes a report (timing, critical warnings) to `prj/v0.94/out/`; the log is
`prj/v0.94/out/vivado.log` (v2.2.6: 0 ERROR, 54 CRITICAL WARNING, the same as lock_in+pid_harmonic). From the App folder,
`make fpga` builds through this Makefile and copies `red_pitaya.bit` and `fpga.bit.bin` to the App. On Ecosystem
2.0 only `fpga.bit.bin` is used (by `fpga.sh`).

Where to change things:

| What | File |
|---|---|
| Lock module (registers, muxers, lock-ins, outputs) | `prj/v0.94/rtl/lock.v` (bus decoder and declarations generated by `config_tool.py`) |
| Submodules (PID, filters, generators, ramp, lock control) | `prj/v0.94/rtl/lock/*.v`; ROM tables of `gen_mod2` in `lock/data_*_ss.dat` (`resources/code_helpers/gen_sin_cos.py`) |
| Connections to ADC/DAC/scope/PWM/DIO | `prj/v0.94/rtl/red_pitaya_top.sv` |
| Scope (decimation, `osc_ctrl_i`, bus read) | `rtl/rtl/classic/rp_scope_com.v`, `rp_scope_cfg.v`, `rp_decim.v` |
| Constraints | `sdc/red_pitaya.xdc` (pins), `prj/v0.94/sdc/red_pitaya.xdc` (timing, multicycle of `i_lock/sys_rdata`) |

Timing since v2.2.8: almost closes (WNS −1.794 ns, TNS −469 ns, 1234 endpoints; v2.2.9 −1.689 ns, `devAgent.md`):
pipeline registers in the long chains of the loop ([`lock_latency.md`](../lock_in+pid/doc/lock_latency.md)). The rest
of this paragraph is the state of v2.2.6.

Timing did not close, as in the 2015.2 design (WNS −14.749 ns): v2.2.6 build 14 WNS −11.721 ns, TNS −12069 ns,
5431 failing endpoints; the worst paths are the long combinational paths of the loop (reference ROM / lock-in →
PID, scope muxes −11.5 ns, DAC −9.5 ns); the bus read meets timing (`sys_rdata` +0.264 ns) with the 2-cycle multicycle
constraint. In `i_lock_ctrl` 15 endpoints still fail (14 `signal_now_reg` −9.833 ns, 1 `ramp_trigger_r` −2.057 ns):
the path is in the lock-in chain before them; registering the output of `LP_filter2/3` would fix it but adds 1-2
clocks of latency to X/Y/F (proposed, not applied; `devAgent.md` problem 58). **A confirmar** whether this affects the
Level trigger on the board. If you add a register to the read mux of `lock.v`, keep it a register of `adc_clk` held
during `sys_ren` (as the `*_rd` copies), or the multicycle constraint is no longer valid.

## Web interface (`index.html`)

- Everything (HTML, CSS overrides, JavaScript) is in `index.html`; it uses jQuery, Bootstrap and Flot from the
  Ecosystem (`../assets/`) and `js/jquery.mousewheel.js`, `js/js.cookie.min.js` of the App.
- The version shown is set when packaging (`var app_version = 'VERSION'` is replaced in `target/`): test with the
  file from `target/`.
- To try a change on the board without rebuilding the rest: `make -C lock_in+pid upload_html RPIP=…` (or
  `upload_app.sh -w <host>` from a package) and reload the page; `nginx.conf` serves `index.html` with
  `Cache-Control: no-cache`.
- Syntax check: extract the scripts and run `node --check`, and run the node simulations of `test/`, which load the
  functions of `index.html`. Blocks marked with comments like `[LOCK CAPTURE BEGIN]` / `[TRIG FROM GRAPH BEGIN]` are
  used by the simulations: keep the markers.
- The comments "v2.3.x" in the JavaScript refer to the versions of lock_in+pid_harmonic from which the code was
  ported (the `index.html` of v2.2.6 was merged with `git merge-file` from lock_in+pid_harmonic v2.3.11 → v2.3.17;
  `devAgent.md` 2026-10-10 08:30).

## Python scripts (`py/`)

`hugo.py` (register tables + mmap), `lock.py`, `osc.py`, `osc_get_ch.py`, `osc_trig.py`, `data_dump.py`,
`lock_from_registers.py`. They run on the board with Python 3 (see [Remote.md](Remote.md)). Upload only them with
`make -C lock_in+pid upload_py RPIP=…`. The register table of `hugo.py` (`# [REGSET DOCK]`) is generated by
`config_tool.py`.

## Registers and `config_tool.py`

`resources/config_tool.py` keeps the list of the lock registers (name, width, sign, reset value, range,
description, UI widget) and regenerates the code between "dock" markers:

| Output | Docks |
|---|---|
| `fpga/prj/v0.94/rtl/lock.v` | `[WIREREG DOCK]`, `[FPGA MEMORY DOCK]` (with the `*_rd` copies in the read mux since v2.2.5) |
| `src/lock.c`, `src/fpga_lock.c`, `src/fpga_lock.h`, `src/main.c`, `src/main.h` | `[FPGAUPDATE DOCK]`, `[PARAMSUPDATE DOCK]`, register struct, parameter table, `[MAINDEFH DOCK]` |
| `index.html` | fields and selectors |
| `py/hugo.py` | `# [REGSET DOCK]` |

Usage: from inside `rp_lock-in_pid/` (it finds the root from `$PWD`), `python3 resources/config_tool.py`. It has no
command line options: the outputs are chosen with `do_verilog`, `do_main`, `do_html`, `do_py` at the top of the file
(all `True`). Each run renames the modified files to `name_YYYYMMDD_HHmmss.ext` backups. Hand-written blocks inside a
dock (e.g. the block of `lock_control` in `[FPGAUPDATE DOCK]`) are kept in the table of the tool. In v2.2.6 devAgent
checked with a harness that the docks of `lock.c`, `fpga_lock.c/.h`, `main.c` and `lock.v` generated by the tool are
identical to the sources (one blank line differs in `main.h`); the **`html` output was not checked** (a confirmar):
review the diff of `index.html` before keeping it. After adding or changing a register: run the tool, rebuild FPGA +
controller, and update [FPGA.md](FPGA.md).

## Simulations and tests (`test/`)

| Test | Command | What it checks |
|---|---|---|
| `lock_ctrl_tb.v` | `test/lock_ctrl_sim.sh [work_dir]` (Vivado 2020.1 xsim) | the lock state machine `lock_ctrl.v` (time trigger in the same clock, level trigger +1 clock); prints `TB RESULT: PASS` |
| `lock_bus_read_tb.sv` | `test/lock_bus_read_sim.sh [work_dir [lock.v]]` (xsim) | bus reads of `lock.v` through `sys_bus_cdc` with asynchronous clocks (in1 0xF8, in2 0xFC, oscA 0x118, pidA_kp 0x164, lock_trig_time 0x34, lock_control 0x28 = 1148, lock_status 0x2C = 28 after reset) |
| `lock_ctrl_ui_sim.js` | `node test/lock_ctrl_ui_sim.js` | UI ↔ controller ↔ FPGA model of the lock control |
| `lock_capture_ui_sim.js` | `node test/lock_capture_ui_sim.js` | Capture Lock, Fire on click, restore, AUTO |
| `trig_from_graph_sim.js` | `node test/trig_from_graph_sim.js` | click → time conversion of *Choose from graph* |
| `trig_input_units_sim.js` | `node test/trig_input_units_sim.js [--old]` | Time / Level trigger fields with units, empty fields not sent |
| `config_load_window_sim.js` | `node test/config_load_window_sim.js [--old]` | Config → load of the time window |
| `auto_set_c_sim/` | `test/auto_set_c_sim/run.sh [src dir]` | the real C controller compiled for the PC with fake `/dev/mem`: AUTO after a capture, forceX; since v2.2.9 also a model of the circular scope buffer and of the lock pulse (slow windows, Capture Lock with history, time trigger after a stopped ramp) |
| `lock_latency_tb.sv` | `test/lock_latency_sim.sh [work_dir [old_ref]]` (xsim) | `lock.v` of the working tree side by side with the one of v2.2.7: every signal is the old one delayed by the latency of [`lock_latency.md`](../lock_in+pid/doc/lock_latency.md) (v2.2.8); prints `TB RESULT: PASS` |
| `minor_ui_sim.js` | `node test/minor_ui_sim.js [index.html]` | wheel → τ/f text, X+ up to 68.72 s, labels (v2.2.7) |
| `ramp_mod_period_tb.v` | `test/ramp_mod_period_sim.sh [work_dir]` (xsim) | periods of the ramp floor/ceil triggers and of the harmonic and square modulation triggers on the RTL, the formulas used by Reset zoom (v2.2.9); prints `TB RESULT: PASS` |
| `reset_zoom_sim.js` | `node test/reset_zoom_sim.js [index.html] [--old]` | the real `resetZoom()` against a model of the time range code of `src/main.c`, incl. Square mod. (v2.2.9) |
| `plot_wheel_sim.js` | `node test/plot_wheel_sim.js [index.html]` | mouse wheel on the plot: no key / SHIFT / ALT (one Y axis), limits, debounce, Capture Lock (v2.2.9) |
| `osc_presets_sim.js` | `node test/osc_presets_sim.js [index.html]` | the OscA\|OscB presets, the `usr` dialog and the Ext Trig → Trigger panel rule (v2.2.10) |

Run them from `lock_in+pid/`. All exit with code 1 on failure. Results of v2.2.6 (`devAgent.md` 2026-10-10 08:30 and
09:14, `build_logs/rp_lock-in_pid_20261010_0914_v226b_sim.txt`): `lock_ctrl_sim` 35/35, `lock_bus_read_sim` PASS,
`lock_ctrl_ui_sim` 28/28, `lock_capture_ui_sim` 63/63, `trig_input_units_sim` 38/38, `config_load_window_sim` 21/21,
`trig_from_graph_sim` 0 failures, `auto_set_c_sim` 14/14. Counts reported in the CHANGELOG for later versions:
`lock_latency_sim` 418 checks (v2.2.8); `reset_zoom_sim` 36, `plot_wheel_sim` 59, `ramp_mod_period_sim` 14,
`lock_capture_ui_sim` 79, `auto_set_c_sim` 44, `lock_ctrl_sim` 46 (v2.2.9); `osc_presets_sim` 37 (v2.2.10). Node tests
run by devAgent on 2.2.10 (`build_logs/rp_lock-in_pid_20261016_1635_v2210_sim.txt`): `osc_presets` 37/37,
`config_load_window` 21/21, `lock_capture_ui` 79/79, `lock_ctrl_ui` 28/28, `minor_ui` 7/7, `plot_wheel` 59/59,
`reset_zoom` 36/36, `trig_input_units` 38/38, `trig_from_graph` 0 failures (2.2.10 only changed the web page).

On the board the tests of each version are in `reportes/lock-in_pid.md` (Apps root). The LOCK MODE procedure of
`test_files/lock_test.md` (used for lock_in+pid_harmonic) does not apply to this App, which adds no modulation to OUT1;
a test bench for a real lock with this App is pending (to be defined by the user).

## Installing on the board

From a package (`archive/*.tar.gz` or `.zip`, or a GitHub release):

```bash
tar -xzf lock_in+pid-2.2.10-<build>-devbuild.tar.gz
./upload_app.sh rp-XXXXXX.local          # -p <ssh port>; -w uploads only index.html, js, css
```

`upload_app.sh` creates and installs an SSH key if needed, makes the file system writable, replaces
`/opt/redpitaya/www/apps/lock_in+pid/` and copies the App. By hand: copy the folder `lock_in+pid/` of the package
(not the source folder) to `/opt/redpitaya/www/apps/` with the file system in read-write mode, keeping `fpga.sh`
executable (755). From the sources: `make -C lock_in+pid upload RPIP=rp-XXXXXX.local`.

After installing: open the App page, or stop + start it (`/bazaar?stop=lock_in+pid`, `/bazaar?start=lock_in+pid`)
if an older version was running. If `nginx.conf` changed, restart nginx (`systemctl restart redpitaya_nginx`).

Notes for Ecosystem 2.0 (`testAgent.md`):

- In a non-interactive SSH, `rw` needs `PATH_REDPITAYA`: `export PATH_REDPITAYA=/opt/redpitaya; /opt/redpitaya/sbin/rw`
  (the `upload*` targets do so, and `upload_app.sh` since v2.2.7: `/opt/redpitaya/sbin/rw` on Ecosystem 2.0,
  `/boot/sbin/rw` on 0.9x; its `-w` option removed `{index.html,js.css}` up to v2.2.6, now `{index.html,js,css}`).
- Each `POST /data` leaves an open connection in the nginx of the board; after long sessions restart it with
  `systemctl restart redpitaya_nginx` (then start the App again).
- Close any tab with the main menu of the board before testing: it can relaunch the main menu and unload the App.

## Versioning and packages

- Version: `lock_in+pid/info/info.json` (`"version": "2.2.10-BUILD_NUMBER"`), `CHANGELOG.md`, `README.md` ("Current
  version"). Since v2.2.8 the build writes the version of `info.json` in `<title>` and in the page title of
  `target/…/index.html`; the title in the source `index.html` does not matter. Build number: `_build_number`.
  Revision: `REVISION` (default `devbuild`).
- Package name: `lock_in+pid-<VER>-<BUILD_NUMBER>-<REVISION>.{zip,tar.gz}` in `archive/` (v2.2.10: build 23).
- Branches: since 2026-10-15 `master` is the 2.2.x line (FPGA Vivado 2020.1, Ecosystem 2.0); the 0.2.x series (FPGA
  Vivado 2015.2, Ecosystems 0.9x / 1.0) stays in the tags `v0.2.1`, `v0.2.3`, `v0.2.4`. Tags `v2.2.5` .. `v2.2.10`.
  `devel2.0` is left as it was and is no longer used. pid 2.2.6 = `_h` 2.3.10-2.3.17, 2.2.7 = 2.3.18, 2.2.8 = 2.3.19
  (+ the reference delay of 2.3.20), 2.2.9 = 2.3.21-2.3.23, 2.2.10 = 2.3.24.
