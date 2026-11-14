# RP Lock-in+PID — documentation

Documentation of `lock_in+pid` **v2.2.16** (package 2.2.16-32, branch `master`, Ecosystem 2.0, FPGA built with
Vivado 2020.1; the FPGA is the one of v2.2.9 … v2.2.15 and the C sources those of v2.2.15: v2.2.16 changes only the web
page). Back to the [project README](../README.md) · [CHANGELOG](../CHANGELOG.md). The published documentation of the
App (concepts, applications, the 0.x versions) is at https://marceluda.github.io/rp_lock-in_pid/

New in v2.2.16 (the Ramp Controller of `lock_in+pid_plus` 2.2.0, as in `lock_in+pid_harmonic` 2.3.31): the *Ramp
Controller* of the web page sets the ramp by period (steps, or the whole period in `s` / `ms`) or by frequency /
amplitude / offset, and *Lock osc. screen* shows the rising half of the triangle and turns a time zoom of the scope into
new ramp limits: [Usage.md](Usage.md#ramp-controller), formulas in [App.md](App.md#ramp-generator-scan). *Reset zoom*
with Scan floor alternates whole period / rising half ([Usage.md](Usage.md#reset-zoom-whole-period--rising-half)); the
*Force X* of the server is applied once, and the X window of the page survives a POST that timed out and was retried
([Structure.md](Structure.md#time-window-of-the-plot-and-force-x)).

| Document | Contents |
|---|---|
| [App.md](App.md) | The instruments of the App and their technical data: frequencies, filters, gains, ranges, time spans |
| [Usage.md](Usage.md) | The web interface panel by panel, and the procedures: scan, error signal, close and check a lock, configs |
| [Structure.md](Structure.md) | How the web page, the server (nginx + `controllerhf.so`) and the FPGA work together; block diagrams of the FPGA |
| [FPGA.md](FPGA.md) | Register map of the lock module and of the oscilloscope, bit fields and selector values |
| [Remote.md](Remote.md) | Control from a program: Python scripts on the board (`py/`), the deprecated SSH client `control_hugo.py`; there is no HTTP API |
| [Devel.md](Devel.md) | Source tree, requirements, building (C, FPGA), tests, installation |

Design notes kept with the sources (`lock_in+pid/doc/`):

- [`lock_control.md`](../lock_in+pid/doc/lock_control.md): the lock control (since v2.2.6; `lock_control` /
  `lock_status`, state machine in the FPGA, locking from Python).
- [`lock_capture.md`](../lock_in+pid/doc/lock_capture.md): *Capture Lock* and *Fire on click*.

Screenshots of the web interface are in the hidden folder `.Usage/`.
